package io.github.aborgatin.familyapp.notifications;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FakePushGateway;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.SyncRequests;
import io.github.aborgatin.familyapp.TestClock;
import io.github.aborgatin.familyapp.family.PasswordResets;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Push subscriptions (spec #104 "Subscriptions"; ticket #107): a device registers its browser
 * subscription for the Member logged in on it, and pushes to that Member reach it while the session
 * that registered it lasts. Pushes are observed on the fake gateway.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({PostgresTestcontainer.class, TestClock.Config.class, FakePushGateway.Config.class})
class PushSubscriptionsTest {

  static final String PHONE = "https://web.push.apple.com/anna-phone";
  static final String TABLET = "https://web.push.apple.com/anna-tablet";
  // A real P-256 point (uncompressed, 65 bytes) and 16 random bytes, base64url.
  static final String P256DH =
      "BOpIBL_-gmK6UO5_nWwbtShTId4qzCcIjN7zQH2zqrdzn35vWekEuDeE-lbSdxbiWVc_QNJuYUSKvNisAEAkdgc";
  static final String AUTH = "8eDyX_uCN0XRhSbY5hs7Hg";

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired FakePushGateway gateway;
  @Autowired TestClock clock;
  @Autowired Pushes pushes;
  @Autowired PasswordResets passwordResets;

  Browser anna;
  UUID annaId;

  @BeforeEach
  void annaIsLoggedInWithNotificationsOn() throws Exception {
    FreshInstallation.reset(jdbc);
    gateway.reset();
    clock.set(Instant.now());
    anna = SyncRequests.bootstrapAnna(mvc);
    annaId = UUID.fromString(SyncRequests.memberId(anna));
    switchNotifications(anna, true);
  }

  @Test
  void aLoggedInMemberGetsTheVapidPublicKey() throws Exception {
    anna.get("/api/push/vapid-public-key")
        .andExpect(status().isOk())
        .andExpect(
            jsonPath("$.publicKey")
                .value(
                    "BP_oubxAs6sub1HkjCbUTZNvXtO_gsTH-5Wsi5uheB0zE705d6mRvAQizx205aARQazMqdr4XbRZS8cg5pPefxs"));

    Browser stranger = new Browser(mvc);
    stranger.openApp();
    stranger
        .get("/api/push/vapid-public-key")
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("auth.required"));
  }

  @Test
  void aPushToAMemberReachesEachOfTheirSubscribedDevices() throws Exception {
    subscribe(anna, PHONE).andExpect(status().isNoContent());
    Browser tablet = logIn("anna@example.com", "secret123");
    subscribe(tablet, TABLET).andExpect(status().isNoContent());

    pushes.sendTo(annaId, "{\"type\":\"reminder\"}", Duration.ofHours(24), Urgency.HIGH);

    assertThat(gateway.pushes())
        .extracting(FakePushGateway.Push::endpoint)
        .containsExactlyInAnyOrder(PHONE, TABLET);
    FakePushGateway.Push push = gateway.pushes().get(0);
    assertThat(push.subscription().p256dh()).isEqualTo(P256DH);
    assertThat(push.subscription().auth()).isEqualTo(AUTH);
    assertThat(push.payload()).isEqualTo("{\"type\":\"reminder\"}");
    assertThat(push.ttl()).isEqualTo(Duration.ofHours(24));
    assertThat(push.urgency()).isEqualTo(Urgency.HIGH);
  }

  @Test
  void subscribingAgainIsIdempotent() throws Exception {
    subscribe(anna, PHONE).andExpect(status().isNoContent());
    subscribe(anna, PHONE).andExpect(status().isNoContent());

    send(annaId);

    assertThat(gateway.endpoints()).containsExactly(PHONE);
  }

  @Test
  void aMemberWithTheSwitchOffGetsNothingButKeepsTheSubscriptions() throws Exception {
    subscribe(anna, PHONE).andExpect(status().isNoContent());

    switchNotifications(anna, false);
    send(annaId);
    assertThat(gateway.pushes()).isEmpty();

    switchNotifications(anna, true);
    send(annaId);
    assertThat(gateway.endpoints()).containsExactly(PHONE);
  }

  @Test
  void subscribingNeedsASession() throws Exception {
    Browser stranger = new Browser(mvc);
    stranger.openApp();

    subscribe(stranger, PHONE)
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("auth.required"));
  }

  @Test
  void badSubscriptionsGetFieldCodes() throws Exception {
    anna.postJson("/api/push/subscriptions", "{}")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("validation.failed"))
        .andExpect(jsonPath("$.params.errors[?(@.field=='endpoint')].code").value("required"))
        .andExpect(jsonPath("$.params.errors[?(@.field=='keys.p256dh')].code").value("required"))
        .andExpect(jsonPath("$.params.errors[?(@.field=='keys.auth')].code").value("required"));

    anna.postJson(
            "/api/push/subscriptions",
            """
            {"endpoint":"http://push.example.com/x","keys":{"p256dh":"bm90IGEga2V5","auth":"!!"}}
            """)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.params.errors[?(@.field=='endpoint')].code").value("value.invalid"))
        .andExpect(
            jsonPath("$.params.errors[?(@.field=='keys.p256dh')].code").value("value.invalid"))
        .andExpect(
            jsonPath("$.params.errors[?(@.field=='keys.auth')].code").value("value.invalid"));

    anna.postJson(
            "/api/push/subscriptions",
            subscription("https://web.push.apple.com/" + "x".repeat(2048)))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.params.errors[?(@.field=='endpoint')].code").value("too_long"));

    anna.deleteJson("/api/push/subscriptions", "{\"endpoint\":\"\"}")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.params.errors[?(@.field=='endpoint')].code").value("required"));

    send(annaId);
    assertThat(gateway.pushes()).isEmpty();
  }

  @Test
  void aDeviceSubscribedByOneMemberMovesToTheOtherWhoSubscribesIt() throws Exception {
    subscribe(anna, PHONE).andExpect(status().isNoContent());
    Browser boris = SyncRequests.loginBoris(mvc, jdbc);
    UUID borisId = UUID.fromString(SyncRequests.memberId(boris));
    switchNotifications(boris, true);

    subscribe(boris, PHONE).andExpect(status().isNoContent());

    send(annaId);
    assertThat(gateway.pushes()).isEmpty();
    send(borisId);
    assertThat(gateway.endpoints()).containsExactly(PHONE);
  }

  @Test
  void aDeviceLoggedInAsTheOtherMemberNoLongerGetsTheFirstOnesPushes() throws Exception {
    subscribe(anna, PHONE).andExpect(status().isNoContent());
    SyncRequests.loginBoris(mvc, jdbc);

    // Boris logs in on Anna's phone without logging her out first (the session row stays).
    anna.postJson(
            "/api/auth/login", "{\"email\":\"boris@example.com\",\"password\":\"boris-pass\"}")
        .andExpect(status().isOk());

    send(annaId);
    assertThat(gateway.pushes()).isEmpty();
  }

  @Test
  void aMemberUnsubscribesOnlyTheirOwnDevice() throws Exception {
    subscribe(anna, PHONE).andExpect(status().isNoContent());
    Browser tablet = logIn("anna@example.com", "secret123");
    subscribe(tablet, TABLET).andExpect(status().isNoContent());
    Browser boris = SyncRequests.loginBoris(mvc, jdbc);

    // Boris cannot remove Anna's device; an unknown endpoint is a no-op.
    boris
        .deleteJson("/api/push/subscriptions", "{\"endpoint\":\"" + PHONE + "\"}")
        .andExpect(status().isNoContent());
    anna.deleteJson("/api/push/subscriptions", "{\"endpoint\":\"https://push.example.com/none\"}")
        .andExpect(status().isNoContent());
    send(annaId);
    assertThat(gateway.endpoints()).containsExactlyInAnyOrder(PHONE, TABLET);

    gateway.reset();
    anna.deleteJson("/api/push/subscriptions", "{\"endpoint\":\"" + PHONE + "\"}")
        .andExpect(status().isNoContent());
    send(annaId);
    assertThat(gateway.endpoints()).containsExactly(TABLET);
  }

  @Test
  void loggingOutDeletesThatDevicesSubscriptionOnly() throws Exception {
    subscribe(anna, PHONE).andExpect(status().isNoContent());
    Browser tablet = logIn("anna@example.com", "secret123");
    subscribe(tablet, TABLET).andExpect(status().isNoContent());

    anna.post("/api/auth/logout").andExpect(status().isNoContent());

    send(annaId);
    assertThat(gateway.endpoints()).containsExactly(TABLET);
    // Logging in again on the phone does not bring it back: the app subscribes again.
    gateway.reset();
    Browser phoneAgain = logIn("anna@example.com", "secret123");
    send(annaId);
    assertThat(gateway.endpoints()).containsExactly(TABLET);
    subscribe(phoneAgain, PHONE).andExpect(status().isNoContent());
    gateway.reset();
    send(annaId);
    assertThat(gateway.endpoints()).containsExactlyInAnyOrder(PHONE, TABLET);
  }

  @Test
  void aPasswordResetEndingEverySessionDeletesEverySubscription() throws Exception {
    subscribe(anna, PHONE).andExpect(status().isNoContent());
    Browser tablet = logIn("anna@example.com", "secret123");
    subscribe(tablet, TABLET).andExpect(status().isNoContent());
    String url = passwordResets.createForEmail("anna@example.com").orElseThrow().url();
    String token = url.substring(url.lastIndexOf('/') + 1);

    Browser laptop = new Browser(mvc);
    laptop.openApp();
    laptop
        .postJson(
            "/api/password-resets/by-token/" + token + "/complete",
            "{\"newPassword\":\"brand-new-secret\"}")
        .andExpect(status().isOk());

    send(annaId);
    assertThat(gateway.pushes()).isEmpty();
  }

  @Test
  void aSubscriptionEndsWhenItsSessionExpires() throws Exception {
    subscribe(anna, PHONE).andExpect(status().isNoContent());

    // SESSION_TIMEOUT is 180 days without a request (sessions keep their own clock, the real one).
    clock.set(Instant.now().plus(Duration.ofDays(179)));
    send(annaId);
    assertThat(gateway.endpoints()).containsExactly(PHONE);

    gateway.reset();
    clock.set(Instant.now().plus(Duration.ofDays(181)));
    send(annaId);
    assertThat(gateway.pushes()).isEmpty();
  }

  @Test
  void aGoneSubscriptionIsDeletedAndAFailedOneKept() throws Exception {
    subscribe(anna, PHONE).andExpect(status().isNoContent());
    Browser tablet = logIn("anna@example.com", "secret123");
    subscribe(tablet, TABLET).andExpect(status().isNoContent());
    gateway.answer(PHONE, PushResult.GONE);
    gateway.answer(TABLET, PushResult.FAILED);

    send(annaId);
    assertThat(gateway.endpoints()).containsExactlyInAnyOrder(PHONE, TABLET);

    gateway.reset();
    send(annaId);
    assertThat(gateway.endpoints()).containsExactly(TABLET);
  }

  // --- helpers ---

  static String subscription(String endpoint) {
    return """
        {"endpoint":"%s","expirationTime":null,"keys":{"p256dh":"%s","auth":"%s"}}
        """
        .formatted(endpoint, P256DH, AUTH);
  }

  static org.springframework.test.web.servlet.ResultActions subscribe(
      Browser device, String endpoint) throws Exception {
    return device.postJson("/api/push/subscriptions", subscription(endpoint));
  }

  static void switchNotifications(Browser device, boolean on) throws Exception {
    device
        .patchJson("/api/members/me", "{\"notificationsEnabled\":" + on + "}")
        .andExpect(status().isOk());
  }

  void send(UUID memberId) {
    pushes.sendTo(memberId, "{}", Duration.ofHours(24), Urgency.NORMAL);
  }

  Browser logIn(String email, String password) throws Exception {
    Browser device = new Browser(mvc);
    device.openApp();
    device
        .postJson(
            "/api/auth/login", "{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password))
        .andExpect(status().isOk());
    return device;
  }
}

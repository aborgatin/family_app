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

  // --- helpers
  // ------------------------------------------------------------------------------------

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

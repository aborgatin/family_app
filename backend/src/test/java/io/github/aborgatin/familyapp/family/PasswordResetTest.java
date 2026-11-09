package io.github.aborgatin.familyapp.family;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Opening and completing a password reset link (spec #5 stories 22–23; ticket #21). Links come from
 * the family module's {@link PasswordResets} API, which the operator's command uses.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class PasswordResetTest {

  private static final String ANNA_PASSWORD = "secret123";

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired PasswordResets passwordResets;

  @BeforeEach
  void annaIsRegistered() throws Exception {
    FreshInstallation.reset(jdbc);
    Browser setup = new Browser(mvc);
    setup.openApp();
    setup
        .postJson(
            "/api/auth/bootstrap",
            """
            {"email":"anna@example.com","password":"secret123","displayName":"Анна",
             "grammaticalGender":"FEMININE"}
            """)
        .andExpect(status().isCreated());
  }

  @Test
  void linkSetsANewPasswordLogsInHereAndLogsOutEveryOtherDevice() throws Exception {
    Browser phone = loggedInAsAnna();
    Browser laptop = loggedInAsAnna();
    String token = newResetForAnna();

    Browser borrowed = new Browser(mvc);
    borrowed.openApp();
    String sessionBefore = borrowed.cookie("SESSION");
    borrowed
        .postJson(complete(token), newPassword("brand-new-secret"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.email").value("anna@example.com"))
        .andExpect(jsonPath("$.displayName").value("Анна"))
        .andExpect(jsonPath("$.passwordHash").doesNotExist());

    assertThat(borrowed.cookie("SESSION")).isNotNull().isNotEqualTo(sessionBefore);
    borrowed.openApp().andExpect(jsonPath("$.member.email").value("anna@example.com"));
    phone.openApp().andExpect(jsonPath("$.member").isEmpty());
    laptop.openApp().andExpect(jsonPath("$.member").isEmpty());

    Browser next = new Browser(mvc);
    next.openApp();
    next.postJson("/api/auth/login", LoginTest.login("anna@example.com", ANNA_PASSWORD))
        .andExpect(status().isUnauthorized());
    next.postJson("/api/auth/login", LoginTest.login("anna@example.com", "brand-new-secret"))
        .andExpect(status().isOk());
  }

  @Test
  void aDeviceAlreadyLoggedInAsTheMemberGetsAFreshSession() throws Exception {
    Browser phone = loggedInAsAnna();
    String sessionBefore = phone.cookie("SESSION");

    phone
        .postJson(complete(newResetForAnna()), newPassword("brand-new-secret"))
        .andExpect(status().isOk());

    assertThat(phone.cookie("SESSION")).isNotNull().isNotEqualTo(sessionBefore);
    phone.openApp().andExpect(jsonPath("$.member.email").value("anna@example.com"));
    Browser replay = new Browser(mvc);
    replay.setCookie("SESSION", sessionBefore);
    replay.openApp().andExpect(jsonPath("$.member").isEmpty());
  }

  @Test
  void ifEndingTheOldSessionsFailsNothingChanges() throws Exception {
    Browser phone = loggedInAsAnna();
    String token = newResetForAnna();
    failing(
        "CREATE TRIGGER test_fail BEFORE DELETE ON spring_session"
            + " FOR EACH ROW EXECUTE FUNCTION test_fail()",
        () -> completeFailsAndNothingChanged(phone, token));
  }

  @Test
  void ifSavingTheNewPasswordFailsAfterTheSessionsWereEndedNothingChanges() throws Exception {
    Browser phone = loggedInAsAnna();
    String token = newResetForAnna();
    // Raised at commit, so after the old sessions have been deleted.
    failing(
        "CREATE CONSTRAINT TRIGGER test_fail AFTER UPDATE ON member"
            + " DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION test_fail()",
        () -> completeFailsAndNothingChanged(phone, token));
  }

  private void completeFailsAndNothingChanged(Browser phone, String token) throws Exception {
    Browser borrowed = new Browser(mvc);
    borrowed.openApp();
    borrowed
        .postJson(complete(token), newPassword("brand-new-secret"))
        .andExpect(status().isInternalServerError());

    phone.openApp().andExpect(jsonPath("$.member.email").value("anna@example.com"));
    borrowed.get("/api/password-resets/by-token/" + token).andExpect(status().isOk());
    Browser next = new Browser(mvc);
    next.openApp();
    next.postJson("/api/auth/login", LoginTest.login("anna@example.com", ANNA_PASSWORD))
        .andExpect(status().isOk());
  }

  /** Runs {@code check} while the database refuses the write that {@code trigger} guards. */
  private void failing(String trigger, ThrowingRunnable check) throws Exception {
    jdbc.execute(
        """
        CREATE FUNCTION test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'failing on purpose'; END $$
        """);
    try {
      jdbc.execute(trigger);
      check.run();
    } finally {
      jdbc.execute("DROP FUNCTION test_fail() CASCADE");
    }
  }

  @FunctionalInterface
  private interface ThrowingRunnable {
    void run() throws Exception;
  }

  @Test
  void openingAWorkingLinkTellsWhenItExpires() throws Exception {
    Browser phone = new Browser(mvc);

    phone
        .get("/api/password-resets/by-token/" + newResetForAnna())
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.expiresAt").isString());
  }

  @Test
  void theLinkWorksOnce() throws Exception {
    String token = newResetForAnna();
    Browser phone = new Browser(mvc);
    phone.openApp();
    phone.postJson(complete(token), newPassword("brand-new-secret")).andExpect(status().isOk());

    Browser other = new Browser(mvc);
    other.openApp();
    other
        .postJson(complete(token), newPassword("attacker-password"))
        .andExpect(status().isGone())
        .andExpect(jsonPath("$.code").value("password_reset.used"));
    other
        .get("/api/password-resets/by-token/" + token)
        .andExpect(status().isGone())
        .andExpect(jsonPath("$.code").value("password_reset.used"));
    other
        .postJson("/api/auth/login", LoginTest.login("anna@example.com", "attacker-password"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void anExpiredLinkFails() throws Exception {
    String token = newResetForAnna();
    // Fixture: the link's hour has passed.
    jdbc.update("UPDATE password_reset SET expires_at = now() - interval '1 second'");
    Browser phone = new Browser(mvc);
    phone.openApp();

    phone
        .get("/api/password-resets/by-token/" + token)
        .andExpect(status().isGone())
        .andExpect(jsonPath("$.code").value("password_reset.expired"));
    phone
        .postJson(complete(token), newPassword("brand-new-secret"))
        .andExpect(status().isGone())
        .andExpect(jsonPath("$.code").value("password_reset.expired"));
    phone
        .postJson("/api/auth/login", LoginTest.login("anna@example.com", ANNA_PASSWORD))
        .andExpect(status().isOk());
  }

  @Test
  void aNewerResetInvalidatesAnOlderUnusedOne() throws Exception {
    String older = newResetForAnna();
    String newer = newResetForAnna();
    Browser phone = new Browser(mvc);
    phone.openApp();

    phone
        .postJson(complete(older), newPassword("brand-new-secret"))
        .andExpect(status().isGone())
        .andExpect(jsonPath("$.code").value("password_reset.expired"));
    phone.get("/api/password-resets/by-token/" + newer).andExpect(status().isOk());
  }

  @Test
  void anUnknownLinkIsNotFound() throws Exception {
    Browser phone = new Browser(mvc);
    phone.openApp();

    phone
        .get("/api/password-resets/by-token/not-a-real-token")
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("password_reset.not_found"));
    phone
        .postJson(complete("not-a-real-token"), newPassword("brand-new-secret"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("password_reset.not_found"));
  }

  @Test
  void aTooShortPasswordIsRefusedAndTheLinkStillWorks() throws Exception {
    String token = newResetForAnna();
    Browser phone = new Browser(mvc);
    phone.openApp();

    phone
        .postJson(complete(token), newPassword("short"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("validation.failed"))
        .andExpect(jsonPath("$.params.errors[0].field").value("newPassword"))
        .andExpect(jsonPath("$.params.errors[0].code").value("password.too_short"));
    phone.postJson(complete(token), "{}").andExpect(status().isBadRequest());

    phone.get("/api/password-resets/by-token/" + token).andExpect(status().isOk());
  }

  @Test
  void completingNeedsTheCsrfToken() throws Exception {
    String token = newResetForAnna();
    Browser phone = new Browser(mvc);

    phone
        .postJson(complete(token), newPassword("brand-new-secret"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("auth.csrf_invalid"));
  }

  private Browser loggedInAsAnna() throws Exception {
    Browser device = new Browser(mvc);
    device.openApp();
    device
        .postJson("/api/auth/login", LoginTest.login("anna@example.com", ANNA_PASSWORD))
        .andExpect(status().isOk());
    return device;
  }

  private String newResetForAnna() {
    String url = passwordResets.createForEmail("anna@example.com").orElseThrow().url();
    return url.substring(url.lastIndexOf('/') + 1);
  }

  private static String complete(String token) {
    return "/api/password-resets/by-token/" + token + "/complete";
  }

  private static String newPassword(String password) {
    return "{\"newPassword\":\"%s\"}".formatted(password);
  }
}

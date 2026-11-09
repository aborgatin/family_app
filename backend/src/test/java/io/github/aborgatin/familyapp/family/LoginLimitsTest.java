package io.github.aborgatin.familyapp.family;

import static io.github.aborgatin.familyapp.family.LoginTest.login;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.lessThanOrEqualTo;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Repeated failed logins are slowed down (spec #5 story 20, Brute-force protection; ticket #15).
 * The counters are in memory and outlive a single test, so every test uses its own emails and
 * client IPs.
 */
class LoginLimitsTest {

  private static final String PASSWORD = "secret123";

  @Nested
  @SpringBootTest(
      properties = {"LOGIN_LIMIT_PER_EMAIL=3", "LOGIN_LIMIT_PER_IP=5", "LOGIN_LIMIT_WINDOW=15m"})
  @AutoConfigureMockMvc
  @Import(PostgresTestcontainer.class)
  class WithConfiguredLimits {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void freshInstallation() {
      FreshInstallation.reset(jdbc);
    }

    @Test
    void tooManyFailuresForOneEmailBlockItEvenWithTheRightPassword() throws Exception {
      String email = register(mvc);
      for (int i = 0; i < 3; i++) {
        failLogin(new Browser(mvc), email);
      }

      Browser phone = new Browser(mvc);
      phone.openApp();
      expectTooManyAttempts(phone.postJson("/api/auth/login", login(email, PASSWORD)), 900);
      phone.openApp().andExpect(jsonPath("$.member").isEmpty());
    }

    @Test
    void theEmailLimitIgnoresHowTheEmailIsWritten() throws Exception {
      String email = register(mvc);
      for (int i = 0; i < 3; i++) {
        failLogin(new Browser(mvc), "  " + email.toUpperCase(java.util.Locale.ROOT));
      }

      Browser phone = new Browser(mvc);
      phone.openApp();
      expectTooManyAttempts(phone.postJson("/api/auth/login", login(email, PASSWORD)), 900);
    }

    @Test
    void tooManyFailuresFromOneIpBlockThatIpOnly() throws Exception {
      String email = register(mvc);
      String ip = Browser.newDeviceIp();
      for (int i = 0; i < 5; i++) {
        failLogin(new Browser(mvc, ip), "guess" + i + "@example.com");
      }

      Browser sameNetwork = new Browser(mvc, ip);
      sameNetwork.openApp();
      expectTooManyAttempts(sameNetwork.postJson("/api/auth/login", login(email, PASSWORD)), 900);

      Browser elsewhere = new Browser(mvc);
      elsewhere.openApp();
      elsewhere.postJson("/api/auth/login", login(email, PASSWORD)).andExpect(status().isOk());
    }

    @Test
    void aSuccessfulLoginResetsTheEmailCounter() throws Exception {
      String email = register(mvc);
      for (int round = 0; round < 3; round++) {
        failLogin(new Browser(mvc), email);
        failLogin(new Browser(mvc), email);
        Browser phone = new Browser(mvc);
        phone.openApp();
        phone.postJson("/api/auth/login", login(email, PASSWORD)).andExpect(status().isOk());
      }
    }

    @Test
    void existingSessionsAreNotAffected() throws Exception {
      String email = register(mvc);
      Browser laptop = new Browser(mvc);
      laptop.openApp();
      laptop.postJson("/api/auth/login", login(email, PASSWORD)).andExpect(status().isOk());

      for (int i = 0; i < 3; i++) {
        failLogin(new Browser(mvc, laptop.ip()), email);
      }

      laptop.openApp().andExpect(jsonPath("$.member.email").value(email));
      laptop.get("/api/no-such-thing").andExpect(status().isNotFound());
    }
  }

  @Nested
  @SpringBootTest(
      properties = {"LOGIN_LIMIT_PER_EMAIL=2", "LOGIN_LIMIT_PER_IP=100", "LOGIN_LIMIT_WINDOW=2s"})
  @AutoConfigureMockMvc
  @Import(PostgresTestcontainer.class)
  class WithAShortWindow {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void freshInstallation() {
      FreshInstallation.reset(jdbc);
    }

    @Test
    void failuresOlderThanTheWindowNoLongerCount() throws Exception {
      String email = register(mvc);
      failLogin(new Browser(mvc), email);
      failLogin(new Browser(mvc), email);
      Browser phone = new Browser(mvc);
      phone.openApp();
      expectTooManyAttempts(phone.postJson("/api/auth/login", login(email, PASSWORD)), 2);

      Thread.sleep(2_100);

      phone.postJson("/api/auth/login", login(email, PASSWORD)).andExpect(status().isOk());
    }
  }

  @Nested
  @SpringBootTest
  @AutoConfigureMockMvc
  @Import(PostgresTestcontainer.class)
  class WithDefaultLimits {

    @Autowired MockMvc mvc;

    @Test
    void tenFailuresPerEmail() throws Exception {
      String email = "nobody-" + UUID.randomUUID() + "@example.com";
      for (int i = 0; i < 10; i++) {
        failLogin(new Browser(mvc), email);
      }

      Browser phone = new Browser(mvc);
      phone.openApp();
      expectTooManyAttempts(phone.postJson("/api/auth/login", login(email, PASSWORD)), 900);
    }

    @Test
    void twentyFailuresPerIp() throws Exception {
      String ip = Browser.newDeviceIp();
      for (int i = 0; i < 20; i++) {
        failLogin(new Browser(mvc, ip), "nobody-" + UUID.randomUUID() + "@example.com");
      }

      Browser phone = new Browser(mvc, ip);
      phone.openApp();
      expectTooManyAttempts(
          phone.postJson("/api/auth/login", login("someone@example.com", PASSWORD)), 900);
    }
  }

  /** Registers a Member with a unique email through the API and returns that email. */
  private static String register(MockMvc mvc) throws Exception {
    String email = "member-" + UUID.randomUUID() + "@example.com";
    Browser setup = new Browser(mvc);
    setup.openApp();
    setup
        .postJson(
            "/api/auth/bootstrap",
            """
            {"email":"%s","password":"%s","displayName":"Анна","grammaticalGender":"FEMININE"}
            """
                .formatted(email, PASSWORD))
        .andExpect(status().isCreated());
    return email;
  }

  private static void failLogin(Browser browser, String email) throws Exception {
    browser.openApp();
    browser
        .postJson("/api/auth/login", login(email, "wrong-password"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("auth.invalid_credentials"));
  }

  private static void expectTooManyAttempts(ResultActions result, int windowSeconds)
      throws Exception {
    result
        .andExpect(status().isTooManyRequests())
        .andExpect(jsonPath("$.code").value("auth.too_many_attempts"))
        .andExpect(
            jsonPath("$.params.retryAfterSeconds")
                .value(allOf(greaterThan(0), lessThanOrEqualTo(windowSeconds))))
        .andExpect(header().exists("Retry-After"))
        .andExpect(cookie().doesNotExist("SESSION"));
  }
}

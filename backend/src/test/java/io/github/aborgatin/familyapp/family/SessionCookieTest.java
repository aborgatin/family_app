package io.github.aborgatin.familyapp.family;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.aborgatin.familyapp.PostgresTestcontainer;
import java.time.Duration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/** The session cookie (spec #5, Authentication & session; stories 16–17). */
class SessionCookieTest {

  private static final String ANNA =
      """
      {"email":"anna@example.com","password":"secret123","displayName":"Анна",
       "grammaticalGender":"FEMININE"}
      """;

  @Nested
  @SpringBootTest
  @AutoConfigureMockMvc
  @Import(PostgresTestcontainer.class)
  class WithDefaultLifetime {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void freshInstallation() {
      FreshInstallation.reset(jdbc);
    }

    @Test
    void bootstrapSetsAHardenedLongLivedCookie() throws Exception {
      Browser browser = new Browser(mvc);
      browser.openApp();

      browser
          .postJson("/api/auth/bootstrap", ANNA)
          .andExpect(status().isCreated())
          .andExpect(cookie().httpOnly("SESSION", true))
          .andExpect(cookie().secure("SESSION", true))
          .andExpect(cookie().sameSite("SESSION", "Lax"))
          .andExpect(cookie().path("SESSION", "/"))
          .andExpect(cookie().maxAge("SESSION", (int) Duration.ofDays(180).toSeconds()));
    }

    @Test
    void everyRequestWithTheSessionRenewsTheCookie() throws Exception {
      Browser browser = new Browser(mvc);
      browser.openApp();
      browser.postJson("/api/auth/bootstrap", ANNA).andExpect(status().isCreated());
      String session = browser.cookie("SESSION");

      browser
          .openApp()
          .andExpect(jsonPath("$.member.email").value("anna@example.com"))
          .andExpect(cookie().value("SESSION", session))
          .andExpect(cookie().httpOnly("SESSION", true))
          .andExpect(cookie().secure("SESSION", true))
          .andExpect(cookie().sameSite("SESSION", "Lax"))
          .andExpect(cookie().maxAge("SESSION", (int) Duration.ofDays(180).toSeconds()));
    }

    @Test
    void anonymousVisitsDoNotStartSessions() throws Exception {
      new Browser(mvc).openApp().andExpect(cookie().doesNotExist("SESSION"));
    }
  }

  @Nested
  @SpringBootTest(properties = "SESSION_TIMEOUT=2h")
  @AutoConfigureMockMvc
  @Import(PostgresTestcontainer.class)
  class WithLifetimeFromEnvironment {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void freshInstallation() {
      FreshInstallation.reset(jdbc);
    }

    @Test
    void lifetimeComesFromSessionTimeout() throws Exception {
      Browser browser = new Browser(mvc);
      browser.openApp();

      browser
          .postJson("/api/auth/bootstrap", ANNA)
          .andExpect(status().isCreated())
          .andExpect(cookie().maxAge("SESSION", (int) Duration.ofHours(2).toSeconds()));
      browser.openApp().andExpect(jsonPath("$.member.email").value("anna@example.com"));
    }
  }
}

package io.github.aborgatin.familyapp.family;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.aborgatin.familyapp.PostgresTestcontainer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/** Login and logout (spec #5 stories 15–21; ticket #15). */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class LoginTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

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
  void memberLogsInOnANewDevice() throws Exception {
    Browser phone = new Browser(mvc);
    phone.openApp().andExpect(jsonPath("$.member").isEmpty());

    phone
        .postJson("/api/auth/login", login(" Anna@Example.com ", "secret123"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.email").value("anna@example.com"))
        .andExpect(jsonPath("$.displayName").value("Анна"))
        .andExpect(jsonPath("$.grammaticalGender").value("FEMININE"))
        .andExpect(jsonPath("$.passwordHash").doesNotExist());

    phone.openApp().andExpect(jsonPath("$.member.email").value("anna@example.com"));
  }

  @Test
  void wrongPasswordAndUnknownEmailGetTheSameGenericError() throws Exception {
    Browser phone = new Browser(mvc);
    phone.openApp();

    for (String body :
        new String[] {
          login("anna@example.com", "wrong-password"),
          login("nobody@example.com", "secret123"),
          "{}"
        }) {
      phone
          .postJson("/api/auth/login", body)
          .andExpect(status().isUnauthorized())
          .andExpect(jsonPath("$.code").value("auth.invalid_credentials"))
          .andExpect(jsonPath("$.params").isEmpty())
          .andExpect(cookie().doesNotExist("SESSION"));
    }
    phone.openApp().andExpect(jsonPath("$.member").isEmpty());
  }

  @Test
  void loginStartsANewSessionInsteadOfReusingTheOneSent() throws Exception {
    Browser phone = new Browser(mvc);
    phone.openApp();
    phone.postJson("/api/auth/login", login("anna@example.com", "secret123"));
    String before = phone.cookie("SESSION");

    phone
        .postJson("/api/auth/login", login("anna@example.com", "secret123"))
        .andExpect(status().isOk());

    assertThat(phone.cookie("SESSION")).isNotNull().isNotEqualTo(before);
    phone.openApp().andExpect(jsonPath("$.member.email").value("anna@example.com"));
  }

  @Test
  void logoutEndsOnlyThisDevicesSession() throws Exception {
    Browser phone = new Browser(mvc);
    phone.openApp();
    phone.postJson("/api/auth/login", login("anna@example.com", "secret123"));
    Browser laptop = new Browser(mvc);
    laptop.openApp();
    laptop.postJson("/api/auth/login", login("anna@example.com", "secret123"));
    String phoneSession = phone.cookie("SESSION");

    phone.post("/api/auth/logout").andExpect(status().isNoContent());

    phone.openApp().andExpect(jsonPath("$.member").isEmpty());
    laptop.openApp().andExpect(jsonPath("$.member.email").value("anna@example.com"));

    // The old cookie, replayed, no longer works either.
    Browser replay = new Browser(mvc);
    replay.setCookie("SESSION", phoneSession);
    replay.get("/api/members").andExpect(status().isUnauthorized());
  }

  @Test
  void logoutNeedsASession() throws Exception {
    Browser phone = new Browser(mvc);
    phone.openApp();

    phone
        .post("/api/auth/logout")
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("auth.required"));
  }

  static String login(String email, String password) {
    return """
        {"email":"%s","password":"%s"}
        """
        .formatted(email, password);
  }
}

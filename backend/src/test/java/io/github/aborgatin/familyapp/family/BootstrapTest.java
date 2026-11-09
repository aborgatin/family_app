package io.github.aborgatin.familyapp.family;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/** First Member registration (spec #5 stories 9–14; ticket #12). */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class BootstrapTest {

  private static final String ANNA =
      """
      {"email":"Anna@Example.COM","password":"secret123","displayName":"  Анна  ",
       "grammaticalGender":"FEMININE"}
      """;

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  @BeforeEach
  void freshInstallation() {
    FreshInstallation.reset(jdbc);
  }

  @Test
  void firstMemberRegistersAndIsLoggedIn() throws Exception {
    Browser browser = new Browser(mvc);
    browser.openApp();

    browser
        .postJson("/api/auth/bootstrap", ANNA)
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.id").isString())
        .andExpect(jsonPath("$.email").value("anna@example.com"))
        .andExpect(jsonPath("$.displayName").value("Анна"))
        .andExpect(jsonPath("$.grammaticalGender").value("FEMININE"))
        .andExpect(jsonPath("$.version").value(greaterThan(0)))
        .andExpect(jsonPath("$.updatedAt").isString())
        .andExpect(jsonPath("$.passwordHash").doesNotExist())
        .andExpect(jsonPath("$.password").doesNotExist());

    browser
        .openApp()
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.bootstrapRequired").value(false))
        .andExpect(jsonPath("$.member.email").value("anna@example.com"))
        .andExpect(jsonPath("$.member.displayName").value("Анна"));
  }

  @Test
  void bootstrapIsClosedOnceAMemberExists() throws Exception {
    Browser first = new Browser(mvc);
    first.openApp();
    first.postJson("/api/auth/bootstrap", ANNA).andExpect(status().isCreated());

    Browser stranger = new Browser(mvc);
    stranger.openApp().andExpect(jsonPath("$.bootstrapRequired").value(false));
    stranger
        .postJson(
            "/api/auth/bootstrap",
            """
            {"email":"mallory@example.com","password":"secret123","displayName":"M",
             "grammaticalGender":"MASCULINE"}
            """)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("auth.bootstrap_closed"))
        .andExpect(jsonPath("$.params").isMap());
    stranger.openApp().andExpect(jsonPath("$.member").isEmpty());
  }

  @Test
  void concurrentBootstrapRequestsYieldExactlyOneMember() throws Exception {
    int requests = 8;
    List<Callable<Integer>> attempts = new ArrayList<>();
    for (int i = 0; i < requests; i++) {
      Browser browser = new Browser(mvc);
      browser.openApp();
      String body =
          """
          {"email":"member%d@example.com","password":"secret123","displayName":"M%d",
           "grammaticalGender":"MASCULINE"}
          """
              .formatted(i, i);
      attempts.add(
          () ->
              browser.postJson("/api/auth/bootstrap", body).andReturn().getResponse().getStatus());
    }

    List<Integer> statuses = new ArrayList<>();
    ExecutorService pool = Executors.newFixedThreadPool(requests);
    try {
      for (Future<Integer> status : pool.invokeAll(attempts)) {
        statuses.add(status.get());
      }
    } finally {
      pool.shutdownNow();
    }

    assertThat(statuses).containsOnly(201, 409).filteredOn(s -> s == 201).hasSize(1);
  }

  @Test
  void missingFieldsAreReportedAsRequired() throws Exception {
    Browser browser = new Browser(mvc);
    browser.openApp();

    browser
        .postJson("/api/auth/bootstrap", "{\"displayName\":\"   \"}")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("validation.failed"))
        .andExpect(jsonPath("$.params.errors", hasSize(4)))
        .andExpect(
            jsonPath("$.params.errors[*].field")
                .value(containsInAnyOrder("email", "password", "displayName", "grammaticalGender")))
        .andExpect(
            jsonPath("$.params.errors[*].code")
                .value(containsInAnyOrder("required", "required", "required", "required")));
    browser.openApp().andExpect(jsonPath("$.bootstrapRequired").value(true));
  }

  @Test
  void invalidValuesGetTheirFieldCodes() throws Exception {
    Browser browser = new Browser(mvc);
    browser.openApp();

    browser
        .postJson(
            "/api/auth/bootstrap",
            """
            {"email":"not-an-email","password":"short12","displayName":"%s",
             "grammaticalGender":"NEUTER"}
            """
                .formatted("я".repeat(101)))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("validation.failed"))
        .andExpect(jsonPath("$.params.errors[?(@.field=='email')].code").value("email.invalid"))
        .andExpect(
            jsonPath("$.params.errors[?(@.field=='password')].code").value("password.too_short"))
        .andExpect(jsonPath("$.params.errors[?(@.field=='displayName')].code").value("too_long"))
        .andExpect(
            jsonPath("$.params.errors[?(@.field=='grammaticalGender')].code")
                .value("value.invalid"));
  }

  @Test
  void overlongEmailIsTooLong() throws Exception {
    Browser browser = new Browser(mvc);
    browser.openApp();

    browser
        .postJson(
            "/api/auth/bootstrap",
            """
            {"email":"%s@example.com","password":"secret123","displayName":"Анна",
             "grammaticalGender":"FEMININE"}
            """
                .formatted("a".repeat(250)))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.params.errors[0].field").value("email"))
        .andExpect(jsonPath("$.params.errors[0].code").value("too_long"));
  }

  @Test
  void passwordOfEightCharactersIsAccepted() throws Exception {
    Browser browser = new Browser(mvc);
    browser.openApp();

    browser
        .postJson(
            "/api/auth/bootstrap",
            """
            {"email":"anna@example.com","password":"12345678","displayName":"Анна",
             "grammaticalGender":"FEMININE"}
            """)
        .andExpect(status().isCreated());
  }

  @Test
  void bootstrapStartsANewSessionInsteadOfReusingTheOneSent() throws Exception {
    // A session that already exists on the server (left over from an earlier Member).
    Browser browser = new Browser(mvc);
    browser.openApp();
    browser.postJson("/api/auth/bootstrap", ANNA).andExpect(status().isCreated());
    String oldSession = browser.cookie("SESSION");
    FreshInstallation.removeMembersOnly(jdbc);

    browser
        .postJson("/api/auth/bootstrap", ANNA)
        .andExpect(status().isCreated())
        .andExpect(cookie().exists("SESSION"));

    assertThat(browser.cookie("SESSION")).isNotNull().isNotEqualTo(oldSession);
  }
}

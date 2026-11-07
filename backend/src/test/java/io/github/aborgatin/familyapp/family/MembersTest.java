package io.github.aborgatin.familyapp.family;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.greaterThan;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/** Members in Settings: the list, the own profile and the own password (spec #5 stories 36–39). */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class MembersTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  Browser anna;

  @BeforeEach
  void annaAndBorisAreMembers() throws Exception {
    FreshInstallation.reset(jdbc);
    anna = new Browser(mvc);
    anna.openApp();
    anna.postJson(
            "/api/auth/bootstrap",
            """
            {"email":"anna@example.com","password":"secret123","displayName":"Анна",
             "grammaticalGender":"FEMININE"}
            """)
        .andExpect(status().isCreated());
    // Invites arrive in a later ticket; until then the second Member is set up directly.
    FreshInstallation.addMember(jdbc, "boris@example.com", "boris-pass", "Борис", "MASCULINE");
  }

  @Test
  void memberSeesAllMembersWithoutPasswordHashes() throws Exception {
    anna.get("/api/members")
        .andExpect(status().isOk())
        .andExpect(
            jsonPath("$[*].email", containsInAnyOrder("anna@example.com", "boris@example.com")))
        .andExpect(jsonPath("$[*].displayName", containsInAnyOrder("Анна", "Борис")))
        .andExpect(jsonPath("$[*].grammaticalGender", containsInAnyOrder("FEMININE", "MASCULINE")))
        .andExpect(jsonPath("$[0].id").isString())
        .andExpect(jsonPath("$[0].version").isNumber())
        .andExpect(jsonPath("$[0].updatedAt").isString())
        .andExpect(jsonPath("$[*].passwordHash").isEmpty());
  }

  @Test
  void membersAreListedByDisplayName() throws Exception {
    FreshInstallation.addMember(jdbc, "vera@example.com", "vera-pass1", "Вера", "FEMININE");

    anna.get("/api/members")
        .andExpect(jsonPath("$[*].displayName", contains("Анна", "Борис", "Вера")));
  }

  @Test
  void membersNeedASession() throws Exception {
    Browser stranger = new Browser(mvc);
    stranger.openApp();

    stranger
        .get("/api/members")
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("auth.required"));
  }

  @Test
  void memberRenamesThemselvesAndOnlyTheNameChanges() throws Exception {
    int before = myVersion();

    anna.patchJson(
            "/api/members/me",
            """
            {"displayName":"  Аня  "}
            """)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.email").value("anna@example.com"))
        .andExpect(jsonPath("$.displayName").value("Аня"))
        .andExpect(jsonPath("$.grammaticalGender").value("FEMININE"))
        .andExpect(jsonPath("$.version").value(greaterThan(before)))
        .andExpect(jsonPath("$.passwordHash").doesNotExist());

    Browser boris = logIn("boris@example.com", "boris-pass");
    boris
        .get("/api/members")
        .andExpect(jsonPath("$[*].displayName", containsInAnyOrder("Аня", "Борис")));
  }

  @Test
  void memberChangesTheirGrammaticalGenderAndOnlyThatChanges() throws Exception {
    anna.patchJson(
            "/api/members/me",
            """
            {"grammaticalGender":"MASCULINE"}
            """)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.displayName").value("Анна"))
        .andExpect(jsonPath("$.grammaticalGender").value("MASCULINE"));

    anna.openApp().andExpect(jsonPath("$.member.grammaticalGender").value("MASCULINE"));
  }

  @Test
  void invalidProfileChangesAreRefusedAndChangeNothing() throws Exception {
    anna.patchJson(
            "/api/members/me",
            """
            {"displayName":"   ","grammaticalGender":"NEUTER"}
            """)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("validation.failed"))
        .andExpect(jsonPath("$.params.errors[?(@.field=='displayName')].code").value("required"))
        .andExpect(
            jsonPath("$.params.errors[?(@.field=='grammaticalGender')].code")
                .value("value.invalid"));

    anna.patchJson(
            "/api/members/me",
            """
            {"displayName":"%s","grammaticalGender":null}
            """
                .formatted("Я".repeat(101)))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.params.errors[?(@.field=='displayName')].code").value("too_long"))
        .andExpect(
            jsonPath("$.params.errors[?(@.field=='grammaticalGender')].code").value("required"));

    anna.openApp()
        .andExpect(jsonPath("$.member.displayName").value("Анна"))
        .andExpect(jsonPath("$.member.grammaticalGender").value("FEMININE"));
  }

  @Test
  void profileChangesNeedASession() throws Exception {
    Browser stranger = new Browser(mvc);
    stranger.openApp();

    stranger
        .patchJson(
            "/api/members/me",
            """
            {"displayName":"Кто-то"}
            """)
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("auth.required"));
  }

  @Test
  void memberChangesTheirPasswordThenOnlyTheNewOneWorks() throws Exception {
    anna.postJson(
            "/api/members/me/password",
            """
            {"currentPassword":"secret123","newPassword":"brand-new-pass"}
            """)
        .andExpect(status().isNoContent());

    Browser phone = new Browser(mvc);
    phone.openApp();
    phone
        .postJson("/api/auth/login", LoginTest.login("anna@example.com", "secret123"))
        .andExpect(status().isUnauthorized());
    phone
        .postJson("/api/auth/login", LoginTest.login("anna@example.com", "brand-new-pass"))
        .andExpect(status().isOk());
    // This device stays logged in.
    anna.openApp().andExpect(jsonPath("$.member.email").value("anna@example.com"));
  }

  @Test
  void wrongCurrentPasswordIsRefusedAndKeepsTheOldPassword() throws Exception {
    anna.postJson(
            "/api/members/me/password",
            """
            {"currentPassword":"not-my-password","newPassword":"brand-new-pass"}
            """)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("auth.invalid_credentials"));

    logIn("anna@example.com", "secret123");
  }

  @Test
  void invalidPasswordChangesAreRefused() throws Exception {
    anna.postJson(
            "/api/members/me/password",
            """
            {"newPassword":"short"}
            """)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("validation.failed"))
        .andExpect(
            jsonPath("$.params.errors[?(@.field=='currentPassword')].code").value("required"))
        .andExpect(
            jsonPath("$.params.errors[?(@.field=='newPassword')].code")
                .value("password.too_short"));

    logIn("anna@example.com", "secret123");
  }

  @Test
  void passwordChangesNeedASession() throws Exception {
    Browser stranger = new Browser(mvc);
    stranger.openApp();

    stranger
        .postJson(
            "/api/members/me/password",
            """
            {"currentPassword":"secret123","newPassword":"brand-new-pass"}
            """)
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("auth.required"));
  }

  private int myVersion() throws Exception {
    String body = anna.openApp().andReturn().getResponse().getContentAsString();
    return JsonPath.read(body, "$.member.version");
  }

  private Browser logIn(String email, String password) throws Exception {
    Browser browser = new Browser(mvc);
    browser.openApp();
    browser
        .postJson("/api/auth/login", LoginTest.login(email, password))
        .andExpect(status().isOk());
    return browser;
  }
}

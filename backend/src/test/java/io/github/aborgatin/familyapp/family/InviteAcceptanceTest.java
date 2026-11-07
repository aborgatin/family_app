package io.github.aborgatin.familyapp.family;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
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
import org.springframework.test.web.servlet.MvcResult;

/**
 * Opening and accepting an Invite link: the invited adult registers and is logged in (spec #5
 * stories 29, 31–35).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class InviteAcceptanceTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  Browser anna;

  @BeforeEach
  void annaIsRegistered() throws Exception {
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
  }

  @Test
  void openingAWorkingLinkTellsWhenItExpires() throws Exception {
    Browser phone = new Browser(mvc);

    phone
        .get("/api/invites/by-token/" + newInvite())
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.expiresAt").isString());
  }

  @Test
  void acceptingRegistersTheMemberAndLogsThemInWithANewSession() throws Exception {
    String token = newInvite();
    Browser boris = new Browser(mvc);
    boris.openApp();
    String sessionBefore = boris.cookie("SESSION");

    boris
        .postJson(accept(token), registration("  Boris@Example.com ", "MASCULINE"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.id").isString())
        .andExpect(jsonPath("$.email").value("boris@example.com"))
        .andExpect(jsonPath("$.displayName").value("Борис"))
        .andExpect(jsonPath("$.grammaticalGender").value("MASCULINE"))
        .andExpect(jsonPath("$.passwordHash").doesNotExist());

    assertThat(boris.cookie("SESSION")).isNotNull().isNotEqualTo(sessionBefore);
    boris.openApp().andExpect(jsonPath("$.member.email").value("boris@example.com"));
    anna.get("/api/members")
        .andExpect(
            jsonPath("$[*].email", containsInAnyOrder("anna@example.com", "boris@example.com")));
    Browser laptop = new Browser(mvc);
    laptop.openApp();
    laptop
        .postJson("/api/auth/login", LoginTest.login("boris@example.com", "boris-pass"))
        .andExpect(status().isOk());
  }

  @Test
  void theLinkWorksOnce() throws Exception {
    String token = newInvite();
    Browser boris = new Browser(mvc);
    boris.openApp();
    boris
        .postJson(accept(token), registration("boris@example.com", "MASCULINE"))
        .andExpect(status().isCreated());

    Browser other = new Browser(mvc);
    other.openApp();
    other
        .postJson(accept(token), registration("vera@example.com", "FEMININE"))
        .andExpect(status().isGone())
        .andExpect(jsonPath("$.code").value("invite.used"));
    other
        .get("/api/invites/by-token/" + token)
        .andExpect(status().isGone())
        .andExpect(jsonPath("$.code").value("invite.used"));
    other.openApp().andExpect(jsonPath("$.member").isEmpty());
  }

  @Test
  void anExpiredLinkFails() throws Exception {
    String token = newInvite();
    // Fixture: the Invite's week has passed.
    jdbc.update("UPDATE invite SET expires_at = now() - interval '1 second'");
    Browser boris = new Browser(mvc);
    boris.openApp();

    boris
        .get("/api/invites/by-token/" + token)
        .andExpect(status().isGone())
        .andExpect(jsonPath("$.code").value("invite.expired"));
    boris
        .postJson(accept(token), registration("boris@example.com", "MASCULINE"))
        .andExpect(status().isGone())
        .andExpect(jsonPath("$.code").value("invite.expired"));
    anna.get("/api/members")
        .andExpect(jsonPath("$[*].email", containsInAnyOrder("anna@example.com")));
  }

  @Test
  void aRevokedLinkFails() throws Exception {
    String url = newInviteUrlAndRevoke();
    String token = InvitesTest.token(url);
    Browser boris = new Browser(mvc);
    boris.openApp();

    boris
        .get("/api/invites/by-token/" + token)
        .andExpect(status().isGone())
        .andExpect(jsonPath("$.code").value("invite.revoked"));
    boris
        .postJson(accept(token), registration("boris@example.com", "MASCULINE"))
        .andExpect(status().isGone())
        .andExpect(jsonPath("$.code").value("invite.revoked"));
  }

  @Test
  void anUnknownLinkIsNotFound() throws Exception {
    Browser boris = new Browser(mvc);
    boris.openApp();

    boris
        .get("/api/invites/by-token/not-a-real-token")
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("invite.not_found"));
    boris
        .postJson(accept("not-a-real-token"), registration("boris@example.com", "MASCULINE"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("invite.not_found"));
  }

  @Test
  void anEmailThatBelongsToAMemberIsRefusedAndTheLinkStillWorks() throws Exception {
    String token = newInvite();
    Browser boris = new Browser(mvc);
    boris.openApp();

    boris
        .postJson(accept(token), registration("ANNA@example.com", "MASCULINE"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("member.email_taken"));

    boris.openApp().andExpect(jsonPath("$.member").isEmpty());
    boris.get("/api/invites/by-token/" + token).andExpect(status().isOk());
    boris
        .postJson(accept(token), registration("boris@example.com", "MASCULINE"))
        .andExpect(status().isCreated());
  }

  @Test
  void aRegistrationWithoutGrammaticalGenderOrWithAnUnknownOneIsRefused() throws Exception {
    String token = newInvite();
    Browser boris = new Browser(mvc);
    boris.openApp();

    boris
        .postJson(
            accept(token),
            """
            {"email":"boris@example.com","password":"boris-pass","displayName":"Борис"}
            """)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("validation.failed"))
        .andExpect(jsonPath("$.params.errors[0].field").value("grammaticalGender"))
        .andExpect(jsonPath("$.params.errors[0].code").value("required"));
    boris
        .postJson(accept(token), registration("boris@example.com", "NEUTER"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.params.errors[0].field").value("grammaticalGender"))
        .andExpect(jsonPath("$.params.errors[0].code").value("value.invalid"));

    boris.get("/api/invites/by-token/" + token).andExpect(status().isOk());
  }

  @Test
  void acceptingNeedsTheCsrfToken() throws Exception {
    String token = newInvite();
    Browser boris = new Browser(mvc);

    boris
        .postJson(accept(token), registration("boris@example.com", "MASCULINE"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("auth.csrf_invalid"));
  }

  private String newInvite() throws Exception {
    MvcResult created = anna.post("/api/invites").andExpect(status().isCreated()).andReturn();
    return InvitesTest.token(JsonPath.read(created.getResponse().getContentAsString(), "$.url"));
  }

  private String newInviteUrlAndRevoke() throws Exception {
    MvcResult created = anna.post("/api/invites").andExpect(status().isCreated()).andReturn();
    String body = created.getResponse().getContentAsString();
    anna.delete("/api/invites/" + JsonPath.read(body, "$.id")).andExpect(status().isNoContent());
    return JsonPath.read(body, "$.url");
  }

  static String accept(String token) {
    return "/api/invites/by-token/" + token + "/accept";
  }

  /** A registration with password {@code boris-pass} and display name «Борис». */
  static String registration(String email, String grammaticalGender) {
    return """
        {"email":"%s","password":"boris-pass","displayName":"Борис","grammaticalGender":"%s"}
        """
        .formatted(email, grammaticalGender);
  }
}

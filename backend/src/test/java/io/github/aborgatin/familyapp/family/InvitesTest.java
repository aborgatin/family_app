package io.github.aborgatin.familyapp.family;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
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
import org.springframework.test.web.servlet.MvcResult;

/** Invites: creating, listing and revoking them in Settings (spec #5 stories 27–30). */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class InvitesTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  Browser anna;
  String annaId;

  @BeforeEach
  void annaIsRegistered() throws Exception {
    FreshInstallation.reset(jdbc);
    anna = new Browser(mvc);
    anna.openApp();
    MvcResult registered =
        anna.postJson(
                "/api/auth/bootstrap",
                """
                {"email":"anna@example.com","password":"secret123","displayName":"Анна",
                 "grammaticalGender":"FEMININE"}
                """)
            .andExpect(status().isCreated())
            .andReturn();
    annaId = JsonPath.read(registered.getResponse().getContentAsString(), "$.id");
  }

  @Test
  void aMemberCreatesAnInviteLinkThatLastsSevenDays() throws Exception {
    Instant before = Instant.now();

    MvcResult created =
        anna.post("/api/invites")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").isString())
            .andExpect(jsonPath("$.createdBy").value(annaId))
            .andExpect(jsonPath("$.createdAt").isString())
            // 32 random bytes in base64url without padding are 43 characters.
            .andExpect(
                jsonPath("$.url")
                    .value(matchesPattern("https://localhost/invite/[A-Za-z0-9_-]{43}")))
            .andReturn();

    Instant expiresAt =
        Instant.parse(JsonPath.read(created.getResponse().getContentAsString(), "$.expiresAt"));
    assertThat(expiresAt)
        .isBetween(before.plus(Duration.ofDays(7)), Instant.now().plus(Duration.ofDays(7)));
  }

  @Test
  void eachInviteHasItsOwnLink() throws Exception {
    assertThat(newInviteUrl()).isNotEqualTo(newInviteUrl());
  }

  @Test
  void theListShowsActiveInvitesNewestFirstWithoutTheirLinks() throws Exception {
    String older = newInviteId();
    String newer = newInviteId();

    anna.get("/api/invites")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[*].id", contains(newer, older)))
        .andExpect(jsonPath("$[0].createdBy").value(annaId))
        .andExpect(jsonPath("$[0].createdAt").isString())
        .andExpect(jsonPath("$[0].expiresAt").isString())
        .andExpect(jsonPath("$[*].url").isEmpty());
  }

  @Test
  void anyMemberSeesAndRevokesInvitesOfTheOther() throws Exception {
    String annasInvite = newInviteId();
    FreshInstallation.addMember(jdbc, "boris@example.com", "boris-pass", "Борис", "MASCULINE");
    Browser boris = new Browser(mvc);
    boris.openApp();
    boris
        .postJson("/api/auth/login", LoginTest.login("boris@example.com", "boris-pass"))
        .andExpect(status().isOk());

    boris.get("/api/invites").andExpect(jsonPath("$[*].id", contains(annasInvite)));
    boris.delete("/api/invites/" + annasInvite).andExpect(status().isNoContent());

    anna.get("/api/invites").andExpect(jsonPath("$").isEmpty());
  }

  @Test
  void revokedExpiredAndAcceptedInvitesLeaveTheList() throws Exception {
    String revoked = newInviteId();
    String expired = newInviteId();
    String accepted = newInviteUrl();
    String active = newInviteId();
    anna.delete("/api/invites/" + revoked).andExpect(status().isNoContent());
    // Fixture: this Invite's week has passed.
    jdbc.update(
        "UPDATE invite SET expires_at = now() - interval '1 second' WHERE id = ?::uuid", expired);
    Browser vera = new Browser(mvc);
    vera.openApp();
    vera.postJson(
            InviteAcceptanceTest.accept(token(accepted)),
            InviteAcceptanceTest.registration("vera@example.com", "FEMININE"))
        .andExpect(status().isCreated());

    anna.get("/api/invites").andExpect(jsonPath("$[*].id", contains(active)));
  }

  @Test
  void revokingIsIdempotent() throws Exception {
    String id = newInviteId();

    anna.delete("/api/invites/" + id).andExpect(status().isNoContent());
    anna.delete("/api/invites/" + id).andExpect(status().isNoContent());
  }

  @Test
  void revokingAnUnknownInviteIsNotFound() throws Exception {
    anna.delete("/api/invites/" + UUID.randomUUID())
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("invite.not_found"));
    anna.delete("/api/invites/not-a-uuid")
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("invite.not_found"));
  }

  @Test
  void managingInvitesNeedsASession() throws Exception {
    String id = newInviteId();
    Browser stranger = new Browser(mvc);
    stranger.openApp();

    stranger
        .post("/api/invites")
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("auth.required"));
    stranger.get("/api/invites").andExpect(status().isUnauthorized());
    stranger.delete("/api/invites/" + id).andExpect(status().isUnauthorized());
    anna.get("/api/invites").andExpect(jsonPath("$[*].id", contains(id)));
  }

  private String newInviteUrl() throws Exception {
    MvcResult created = anna.post("/api/invites").andExpect(status().isCreated()).andReturn();
    return JsonPath.read(created.getResponse().getContentAsString(), "$.url");
  }

  private String newInviteId() throws Exception {
    MvcResult created = anna.post("/api/invites").andExpect(status().isCreated()).andReturn();
    return JsonPath.read(created.getResponse().getContentAsString(), "$.id");
  }

  static String token(String url) {
    return url.substring(url.lastIndexOf('/') + 1);
  }
}

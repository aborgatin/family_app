package io.github.aborgatin.familyapp.family;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
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
}

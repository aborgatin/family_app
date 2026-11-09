package io.github.aborgatin.familyapp.family;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import java.util.List;
import java.util.Map;
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
 * Members in the sync pull (spec #3 "Read path"; ticket #52): pull-only, with what the client shows
 * and never a secret. Their own changes stay online-only REST and reach the other device through
 * the pull.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class MembersSyncTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  Browser anna;
  Browser boris;

  @BeforeEach
  void annaAndBorisAreLoggedIn() throws Exception {
    FreshInstallation.reset(jdbc);
    anna = Sync.bootstrapAnna(mvc);
    boris = Sync.loginBoris(mvc, jdbc);
  }

  @Test
  void aFirstPullHasEveryMemberWithOnlyIdDisplayNameAndGrammaticalGender() throws Exception {
    String body = Sync.pull(anna, 0).andReturn().getResponse().getContentAsString();

    List<Map<String, Object>> members = JsonPath.read(body, "$.changes[?(@.table=='member')]");
    assertThat(members).hasSize(2);
    for (Map<String, Object> member : members) {
      assertThat(member).containsEntry("deleted", false);
      @SuppressWarnings("unchecked") // JsonPath returns the JSON object as a Map.
      Map<String, Object> fields = (Map<String, Object>) member.get("fields");
      assertThat(fields).containsOnlyKeys("displayName", "grammaticalGender");
    }
    assertThat(JsonPath.<List<String>>read(body, "$.changes[*].fields.displayName"))
        .containsExactlyInAnyOrder("Анна", "Борис");
    assertThat(body).doesNotContain("password", "email", "@example.com", "{bcrypt}");
  }

  @Test
  void aProfileChangeReachesTheOtherDeviceThroughThePull() throws Exception {
    long highWater = Sync.version(Sync.pull(boris, 0));

    anna.patchJson("/api/members/me", "{\"displayName\":\"Аня\"}").andExpect(status().isOk());

    Sync.pull(boris, highWater)
        .andExpect(jsonPath("$.changes[*].table", containsInAnyOrder("member")))
        .andExpect(jsonPath("$.changes[0].fields.displayName").value("Аня"));
  }

  @Test
  void aPasswordChangeTakesAVersionButSendsNoSecret() throws Exception {
    long highWater = Sync.version(Sync.pull(boris, 0));

    anna.postJson(
            "/api/members/me/password",
            "{\"currentPassword\":\"secret123\",\"newPassword\":\"new-secret-456\"}")
        .andExpect(status().isNoContent());

    String body = Sync.pull(boris, highWater).andReturn().getResponse().getContentAsString();
    assertThat(JsonPath.<List<String>>read(body, "$.changes[*].fields.displayName"))
        .containsExactly("Анна");
    assertThat(body).doesNotContain("password", "{bcrypt}");
  }

  @Test
  void membersArePullOnly() throws Exception {
    Sync.push(
            anna,
            Sync.upsert("member", UUID.randomUUID(), "{\"displayName\":\"Аня\"}"),
            Sync.delete("member", UUID.randomUUID()))
        .andExpect(jsonPath("$.results[0].code").value("sync.read_only"))
        .andExpect(jsonPath("$.results[1].code").value("sync.read_only"));
  }
}

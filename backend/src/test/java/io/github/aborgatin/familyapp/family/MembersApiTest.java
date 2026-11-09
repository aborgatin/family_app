package io.github.aborgatin.familyapp.family;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.error.ApiException;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The {@code family} module's public Member API (spec #5, Modules): the current Member of an
 * authenticated request, and Member lookup by id. {@link AnotherModule} stands in for a later
 * module's controller that uses it.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({PostgresTestcontainer.class, MembersApiTest.AnotherModule.class})
class MembersApiTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired Members members;

  Browser anna;
  UUID annaId;

  @BeforeEach
  void annaIsLoggedIn() throws Exception {
    FreshInstallation.reset(jdbc);
    anna = new Browser(mvc);
    anna.openApp();
    String body =
        anna.postJson(
                "/api/auth/bootstrap",
                """
                {"email":"anna@example.com","password":"secret123","displayName":"Анна",
                 "grammaticalGender":"FEMININE"}
                """)
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    annaId = UUID.fromString(JsonPath.read(body, "$.id"));
  }

  @Test
  void theCurrentMemberIsTheOneTheRequestIsLoggedInAs() throws Exception {
    anna.get("/api/test/current-member")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(annaId.toString()))
        .andExpect(jsonPath("$.displayName").value("Анна"));
  }

  @Test
  void theCurrentMemberSeesARenameAtOnce() throws Exception {
    anna.patchJson("/api/members/me", "{\"displayName\":\"Аня\"}").andExpect(status().isOk());

    anna.get("/api/test/current-member").andExpect(jsonPath("$.displayName").value("Аня"));
  }

  @Test
  void aSessionWhoseMemberWasRemovedHasNoCurrentMember() throws Exception {
    jdbc.update("UPDATE member SET deleted = TRUE WHERE id = ?", annaId);

    anna.get("/api/test/current-member")
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("auth.required"));
  }

  @Test
  void outsideAnAuthenticatedRequestThereIsNoCurrentMember() {
    assertThatThrownBy(members::current)
        .isInstanceOfSatisfying(
            ApiException.class, e -> assertThat(e.error().code()).isEqualTo("auth.required"));
  }

  @Test
  void aMemberIsFoundById() {
    assertThat(members.byId(annaId)).contains(new MemberSummary(annaId, "Анна"));
  }

  @Test
  void unknownAndRemovedMembersAreNotFound() {
    jdbc.update("UPDATE member SET deleted = TRUE WHERE id = ?", annaId);

    assertThat(members.byId(annaId)).isEmpty();
    assertThat(members.byId(UUID.randomUUID())).isEmpty();
  }

  /** A controller of some later module, using only {@code family}'s public API. */
  @TestConfiguration
  @RestController
  static class AnotherModule {

    private final Members members;

    AnotherModule(Members members) {
      this.members = members;
    }

    @GetMapping("/api/test/current-member")
    MemberSummary currentMember() {
      return members.current();
    }
  }
}

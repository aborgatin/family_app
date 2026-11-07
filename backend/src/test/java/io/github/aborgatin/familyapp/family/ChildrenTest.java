package io.github.aborgatin.familyapp.family;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.lang.Nullable;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Children in Settings (spec #5 stories 40–45, API contract "Children"). */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class ChildrenTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  Browser anna;

  @BeforeEach
  void annaIsAMember() throws Exception {
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
  void memberAddsAChildWithAClientGeneratedId() throws Exception {
    UUID id = UUID.randomUUID();

    anna.putJson(
            "/api/children/" + id,
            """
            {"name":"  Маша  ","color":"coral","birthday":"2019-04-12"}
            """)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(id.toString()))
        .andExpect(jsonPath("$.name").value("Маша"))
        .andExpect(jsonPath("$.color").value("coral"))
        .andExpect(jsonPath("$.birthday").value("2019-04-12"))
        .andExpect(jsonPath("$.version").isNumber())
        .andExpect(jsonPath("$.updatedAt").isString());

    anna.get("/api/children")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].id").value(id.toString()))
        .andExpect(jsonPath("$[0].name").value("Маша"))
        .andExpect(jsonPath("$[0].birthday").value("2019-04-12"));
  }

  @Test
  void repeatingTheSamePutLeavesOneChildInTheSameState() throws Exception {
    UUID id = UUID.randomUUID();
    String body =
        """
        {"name":"Маша","color":"coral","birthday":"2019-04-12"}
        """;

    anna.putJson("/api/children/" + id, body).andExpect(status().isOk());
    anna.putJson("/api/children/" + id, body).andExpect(status().isOk());

    anna.get("/api/children")
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].id").value(id.toString()))
        .andExpect(jsonPath("$[0].name").value("Маша"))
        .andExpect(jsonPath("$[0].color").value("coral"))
        .andExpect(jsonPath("$[0].birthday").value("2019-04-12"));
  }

  @Test
  void putReplacesEveryFieldIncludingClearingTheBirthday() throws Exception {
    UUID id = UUID.randomUUID();
    anna.putJson(
        "/api/children/" + id,
        """
        {"name":"Маша","color":"coral","birthday":"2019-04-12"}
        """);

    anna.putJson(
            "/api/children/" + id,
            """
            {"name":"Мария","color":"teal","birthday":null}
            """)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("Мария"))
        .andExpect(jsonPath("$.color").value("teal"))
        .andExpect(jsonPath("$.birthday").value(nullValue()));

    anna.get("/api/children")
        .andExpect(jsonPath("$[0].name").value("Мария"))
        .andExpect(jsonPath("$[0].birthday").value(nullValue()));
  }

  @Test
  void everyWriteGetsAHigherVersionThanAnyBefore() throws Exception {
    UUID masha = UUID.randomUUID();
    UUID petya = UUID.randomUUID();

    long created = version(put(masha, "Маша", "coral", null));
    long other = version(put(petya, "Петя", "blue", null));
    long edited = version(put(masha, "Мария", "coral", null));
    anna.delete("/api/children/" + petya).andExpect(status().isNoContent());
    long afterDelete = version(put(masha, "Маруся", "coral", null));

    assertThat(other).isGreaterThan(created);
    assertThat(edited).isGreaterThan(other);
    // The soft delete in between took a Version too.
    assertThat(afterDelete).isGreaterThan(edited + 1);
  }

  @Test
  void childrenAreListedOldestFirstThenByNameWithoutBirthdayLast() throws Exception {
    put(UUID.randomUUID(), "Без даты Б", "pink", null);
    put(UUID.randomUUID(), "Младшая", "coral", "2022-01-05");
    put(UUID.randomUUID(), "Без даты А", "blue", null);
    put(UUID.randomUUID(), "Старший", "green", "2017-09-30");
    put(UUID.randomUUID(), "Близнец Б", "teal", "2019-04-12");
    put(UUID.randomUUID(), "Близнец А", "teal", "2019-04-12");

    anna.get("/api/children")
        .andExpect(
            jsonPath(
                "$[*].name",
                contains(
                    "Старший", "Близнец А", "Близнец Б", "Младшая", "Без даты А", "Без даты Б")));
  }

  @Test
  void deletedChildDisappearsAndRepeatedDeleteStillSucceeds() throws Exception {
    UUID masha = UUID.randomUUID();
    UUID petya = UUID.randomUUID();
    put(masha, "Маша", "coral", null);
    put(petya, "Петя", "blue", null);

    anna.delete("/api/children/" + masha).andExpect(status().isNoContent());
    anna.delete("/api/children/" + masha).andExpect(status().isNoContent());

    anna.get("/api/children").andExpect(jsonPath("$[*].name", contains("Петя")));
  }

  @Test
  void deletingAnUnknownChildSucceeds() throws Exception {
    anna.delete("/api/children/" + UUID.randomUUID()).andExpect(status().isNoContent());
  }

  @Test
  void putAfterDeleteIsAConflictAndDoesNotBringTheChildBack() throws Exception {
    UUID masha = UUID.randomUUID();
    put(masha, "Маша", "coral", null);
    anna.delete("/api/children/" + masha);

    anna.putJson(
            "/api/children/" + masha,
            """
            {"name":"Маша","color":"coral","birthday":null}
            """)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("child.deleted"))
        .andExpect(jsonPath("$.params").isEmpty());

    anna.get("/api/children").andExpect(jsonPath("$").isEmpty());
  }

  @Test
  void missingFieldsAreRequired() throws Exception {
    anna.putJson("/api/children/" + UUID.randomUUID(), "{\"name\":\"   \"}")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("validation.failed"))
        .andExpect(jsonPath("$.params.errors[?(@.field=='name')].code").value("required"))
        .andExpect(jsonPath("$.params.errors[?(@.field=='color')].code").value("required"))
        .andExpect(jsonPath("$.params.errors[?(@.field=='birthday')]").isEmpty());

    anna.get("/api/children").andExpect(jsonPath("$").isEmpty());
  }

  @Test
  void badValuesAreRefusedWithTheirFieldCodes() throws Exception {
    anna.putJson(
            "/api/children/" + UUID.randomUUID(),
            """
            {"name":"%s","color":"#ff0000","birthday":"12.04.2019"}
            """
                .formatted("Я".repeat(101)))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("validation.failed"))
        .andExpect(jsonPath("$.params.errors[?(@.field=='name')].code").value("too_long"))
        .andExpect(jsonPath("$.params.errors[?(@.field=='color')].code").value("color.invalid"))
        .andExpect(jsonPath("$.params.errors[?(@.field=='birthday')].code").value("value.invalid"));

    anna.get("/api/children").andExpect(jsonPath("$").isEmpty());
  }

  @Test
  void everyPaletteColorIsAccepted() throws Exception {
    for (String color :
        List.of("coral", "orange", "yellow", "green", "teal", "blue", "purple", "pink")) {
      put(UUID.randomUUID(), "Ребёнок " + color, color, null);
    }

    anna.get("/api/children").andExpect(jsonPath("$.length()").value(8));
  }

  @Test
  void anIdThatIsNotAUuidIsABadRequest() throws Exception {
    anna.putJson(
            "/api/children/not-a-uuid",
            """
            {"name":"Маша","color":"coral","birthday":null}
            """)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("request.invalid"));
  }

  @Test
  void childrenNeedASession() throws Exception {
    Browser stranger = new Browser(mvc);
    stranger.openApp();

    stranger
        .get("/api/children")
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("auth.required"));
    stranger
        .putJson(
            "/api/children/" + UUID.randomUUID(),
            """
            {"name":"Маша","color":"coral","birthday":null}
            """)
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("auth.required"));
    stranger
        .delete("/api/children/" + UUID.randomUUID())
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("auth.required"));
  }

  @Test
  void theOtherMemberSeesTheChanges() throws Exception {
    FreshInstallation.addMember(jdbc, "boris@example.com", "boris-pass", "Борис", "MASCULINE");
    Browser boris = new Browser(mvc);
    boris.openApp();
    boris
        .postJson("/api/auth/login", LoginTest.login("boris@example.com", "boris-pass"))
        .andExpect(status().isOk());

    put(UUID.randomUUID(), "Маша", "coral", "2019-04-12");

    boris.get("/api/children").andExpect(jsonPath("$[*].name", contains("Маша")));
  }

  private ResultActions put(UUID id, String name, String color, @Nullable String birthday)
      throws Exception {
    return anna.putJson(
            "/api/children/" + id,
            """
            {"name":"%s","color":"%s","birthday":%s}
            """
                .formatted(name, color, birthday == null ? "null" : "\"" + birthday + "\""))
        .andExpect(status().isOk());
  }

  private static long version(ResultActions result) throws Exception {
    Number version =
        JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.version");
    return version.longValue();
  }
}

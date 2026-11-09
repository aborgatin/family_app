package io.github.aborgatin.familyapp.family;

import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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

/**
 * The Children list in the server's order (spec #5 stories 40–45, API contract "Children").
 * Children are written through the sync push ({@code ChildrenSyncTest}).
 */
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
  void namesAreOrderedTheRussianWayWithYoNextToYe() throws Exception {
    for (String name : List.of("Жора", "Ёлка", "Ежевика", "Арина", "Ёжик", "Елена", "Ева")) {
      put(UUID.randomUUID(), name, "teal", null);
    }

    // The same order the web app's Intl.Collator('ru') gives (spec #5, Ordering).
    anna.get("/api/children")
        .andExpect(
            jsonPath(
                "$[*].name", contains("Арина", "Ева", "Ежевика", "Ёжик", "Елена", "Ёлка", "Жора")));
  }

  @Test
  void badValuesAreRefusedWithTheirFieldCodes() throws Exception {
    Sync.push(
            anna,
            Sync.upsert(
                "child",
                UUID.randomUUID(),
                """
                {"name":"%s","color":"#ff0000","birthday":"12.04.2019"}
                """
                    .formatted("Я".repeat(101))))
        .andExpect(jsonPath("$.results[0].status").value("rejected"))
        .andExpect(jsonPath("$.results[0].code").value("validation.failed"))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='name')].code").value("too_long"))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='color')].code").value("color.invalid"))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='birthday')].code")
                .value("value.invalid"));

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
  void childrenNeedASession() throws Exception {
    Browser stranger = new Browser(mvc);
    stranger.openApp();

    stranger
        .get("/api/children")
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("auth.required"));
  }

  private void put(UUID id, String name, String color, @Nullable String birthday) throws Exception {
    Sync.push(
            anna,
            Sync.upsert(
                "child",
                id,
                """
                {"name":"%s","color":"%s","birthday":%s}
                """
                    .formatted(name, color, birthday == null ? "null" : "\"" + birthday + "\"")))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));
  }
}

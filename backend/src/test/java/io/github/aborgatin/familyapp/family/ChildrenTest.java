package io.github.aborgatin.familyapp.family;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.Sync;
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
 * The values a Child accepts (spec #5 stories 40–45). Children are written through the sync push
 * and read through the pull ({@code ChildrenSyncTest}); the web app orders them.
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

    anna.get("/api/sync/pull?since=0")
        .andExpect(jsonPath("$.changes[?(@.table=='child')]").isEmpty());
  }

  @Test
  void everyPaletteColorIsAccepted() throws Exception {
    for (String color :
        List.of("coral", "orange", "yellow", "green", "teal", "blue", "purple", "pink")) {
      put(UUID.randomUUID(), "Ребёнок " + color, color, null);
    }

    anna.get("/api/sync/pull?since=0")
        .andExpect(jsonPath("$.changes[?(@.table=='child')].fields.color", hasSize(8)));
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

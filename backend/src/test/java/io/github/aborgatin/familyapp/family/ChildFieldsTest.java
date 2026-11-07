package io.github.aborgatin.familyapp.family;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import java.sql.Connection;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Child fields in Settings (spec #5 stories 47–52, API contract "Child fields", ADR-0007). The
 * Defaults on a fresh installation are covered by {@code ChildFieldDefaultsTest}; these tests start
 * without any Child field.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class ChildFieldsTest {

  static final String SHOE_SIZE = "00000000-0000-4000-8000-00000000000a";
  static final String ALLERGIES = "00000000-0000-4000-8000-00000000000b";
  static final String TEACHER = "00000000-0000-4000-8000-00000000000c";

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired DataSource dataSource;

  Browser anna;

  @BeforeEach
  void annaIsAMemberAndThereAreNoChildFields() throws Exception {
    FreshInstallation.reset(jdbc);
    FreshInstallation.removeChildFields(jdbc);
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
  void memberAddsAChildFieldWithTheIdTheClientChose() throws Exception {
    put(SHOE_SIZE, "  Размер обуви  ", "TEXT", 1)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(SHOE_SIZE))
        .andExpect(jsonPath("$.name").value("Размер обуви"))
        .andExpect(jsonPath("$.valueType").value("TEXT"))
        .andExpect(jsonPath("$.position").value(1.0))
        .andExpect(jsonPath("$.version").isNumber())
        .andExpect(jsonPath("$.updatedAt").isString());

    anna.get("/api/child-fields")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(1)))
        .andExpect(jsonPath("$[0].id").value(SHOE_SIZE))
        .andExpect(jsonPath("$[0].name").value("Размер обуви"));
  }

  @Test
  void puttingTheSameFieldTwiceLeavesOneField() throws Exception {
    put(SHOE_SIZE, "Размер обуви", "TEXT", 1).andExpect(status().isOk());
    put(SHOE_SIZE, "Размер обуви", "TEXT", 1).andExpect(status().isOk());

    anna.get("/api/child-fields").andExpect(jsonPath("$[*].id", contains(SHOE_SIZE)));
  }

  @Test
  void memberRenamesAChildField() throws Exception {
    long before = version(put(SHOE_SIZE, "Размер обуви", "TEXT", 1));

    put(SHOE_SIZE, "Размер ноги", "TEXT", 1)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("Размер ноги"))
        .andExpect(jsonPath("$.version").value(greaterThan((int) before)));

    anna.get("/api/child-fields").andExpect(jsonPath("$[*].name", contains("Размер ноги")));
  }

  @Test
  void childFieldsAreListedByPositionWithTiesBrokenById() throws Exception {
    put(TEACHER, "Учитель", "TEXT", 2);
    put(ALLERGIES, "Аллергии", "TEXT", 1);
    put(SHOE_SIZE, "Размер обуви", "TEXT", 1);

    anna.get("/api/child-fields")
        .andExpect(jsonPath("$[*].id", contains(SHOE_SIZE, ALLERGIES, TEACHER)));
  }

  @Test
  void movingAFieldBetweenTwoOthersGivesItTheMidpointAndLeavesTheOthersAlone() throws Exception {
    long shoeVersion = version(put(SHOE_SIZE, "Размер обуви", "TEXT", 1));
    long allergiesVersion = version(put(ALLERGIES, "Аллергии", "TEXT", 2));
    put(TEACHER, "Учитель", "TEXT", 3);

    put(TEACHER, "Учитель", "TEXT", 1.5).andExpect(status().isOk());

    anna.get("/api/child-fields")
        .andExpect(jsonPath("$[*].id", contains(SHOE_SIZE, TEACHER, ALLERGIES)))
        .andExpect(jsonPath("$[*].position", contains(1.0, 1.5, 2.0)))
        .andExpect(jsonPath("$[0].version").value((int) shoeVersion))
        .andExpect(jsonPath("$[2].version").value((int) allergiesVersion));
  }

  @Test
  void everyWriteGetsAHigherVersion() throws Exception {
    long created = version(put(SHOE_SIZE, "Размер обуви", "TEXT", 1));
    long other = version(put(ALLERGIES, "Аллергии", "TEXT", 2));
    long renamed = version(put(SHOE_SIZE, "Обувь", "TEXT", 1));

    assertThat(other).isGreaterThan(created);
    assertThat(renamed).isGreaterThan(other);
  }

  @Test
  void removedFieldsDisappearAndRemovingAgainIsFine() throws Exception {
    put(SHOE_SIZE, "Размер обуви", "TEXT", 1);
    put(ALLERGIES, "Аллергии", "TEXT", 2);

    anna.delete("/api/child-fields/" + SHOE_SIZE).andExpect(status().isNoContent());
    anna.delete("/api/child-fields/" + SHOE_SIZE).andExpect(status().isNoContent());

    anna.get("/api/child-fields").andExpect(jsonPath("$[*].id", contains(ALLERGIES)));
  }

  @Test
  void removingAnUnknownFieldIsFine() throws Exception {
    anna.delete("/api/child-fields/" + TEACHER).andExpect(status().isNoContent());
  }

  @Test
  void removingAFieldWaitsForOtherWritesToTheFamily() throws Exception {
    put(SHOE_SIZE, "Размер обуви", "TEXT", 1);
    ExecutorService pool = Executors.newSingleThreadExecutor();
    try (Connection otherWrite = dataSource.getConnection()) {
      otherWrite.setAutoCommit(false);
      // Another write holding the Family lock, the way every PUT and DELETE takes it.
      otherWrite.createStatement().execute("SELECT id FROM family FOR UPDATE");

      Future<ResultActions> removal =
          pool.submit(() -> anna.delete("/api/child-fields/" + SHOE_SIZE));

      assertThatThrownBy(() -> removal.get(500, TimeUnit.MILLISECONDS))
          .isInstanceOf(TimeoutException.class);
      otherWrite.rollback();
      removal.get(10, TimeUnit.SECONDS).andExpect(status().isNoContent());
    } finally {
      pool.shutdownNow();
    }
    anna.get("/api/child-fields").andExpect(jsonPath("$", hasSize(0)));
  }

  @Test
  void aRemovedFieldIsNotBroughtBackByAPut() throws Exception {
    put(SHOE_SIZE, "Размер обуви", "TEXT", 1);
    anna.delete("/api/child-fields/" + SHOE_SIZE);

    put(SHOE_SIZE, "Размер обуви", "TEXT", 1)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("child_field.deleted"));

    anna.get("/api/child-fields").andExpect(jsonPath("$", hasSize(0)));
  }

  @Test
  void theValueTypeCannotChangeAfterCreation() throws Exception {
    put(SHOE_SIZE, "Размер обуви", "TEXT", 1);

    put(SHOE_SIZE, "Размер обуви", "DATE", 1)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("child_field.value_type_immutable"));

    anna.get("/api/child-fields").andExpect(jsonPath("$[0].valueType").value("TEXT"));
  }

  @Test
  void aDateFieldKeepsItsValueType() throws Exception {
    put(TEACHER, "Последний визит к врачу", "DATE", 1)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.valueType").value("DATE"));
  }

  @Test
  void everyFieldOfTheBodyIsRequired() throws Exception {
    anna.putJson("/api/child-fields/" + SHOE_SIZE, "{\"name\":\"   \"}")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("validation.failed"))
        .andExpect(jsonPath("$.params.errors[?(@.field=='name')].code").value("required"))
        .andExpect(jsonPath("$.params.errors[?(@.field=='valueType')].code").value("required"))
        .andExpect(jsonPath("$.params.errors[?(@.field=='position')].code").value("required"));

    anna.get("/api/child-fields").andExpect(jsonPath("$", hasSize(0)));
  }

  @Test
  void unknownValueTypesAndLongNamesAreRefused() throws Exception {
    anna.putJson(
            "/api/child-fields/" + SHOE_SIZE,
            """
            {"name":"%s","valueType":"NUMBER","position":1}
            """
                .formatted("Я".repeat(101)))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.params.errors[?(@.field=='name')].code").value("too_long"))
        .andExpect(
            jsonPath("$.params.errors[?(@.field=='valueType')].code").value("value.invalid"));
  }

  @Test
  void validationComesBeforeConflicts() throws Exception {
    put(SHOE_SIZE, "Размер обуви", "TEXT", 1);
    anna.delete("/api/child-fields/" + SHOE_SIZE);

    put(SHOE_SIZE, "", "TEXT", 1)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("validation.failed"));
  }

  @Test
  void childFieldsNeedASession() throws Exception {
    Browser stranger = new Browser(mvc);
    stranger.openApp();

    stranger
        .get("/api/child-fields")
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("auth.required"));
    stranger
        .putJson(
            "/api/child-fields/" + SHOE_SIZE,
            """
            {"name":"Размер обуви","valueType":"TEXT","position":1}
            """)
        .andExpect(status().isUnauthorized());
    stranger.delete("/api/child-fields/" + SHOE_SIZE).andExpect(status().isUnauthorized());
  }

  private ResultActions put(String id, String name, String valueType, double position)
      throws Exception {
    return anna.putJson(
        "/api/child-fields/" + id,
        """
        {"name":"%s","valueType":"%s","position":%s}
        """
            .formatted(name, valueType, position));
  }

  private static long version(ResultActions result) throws Exception {
    Number version =
        JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.version");
    return version.longValue();
  }
}

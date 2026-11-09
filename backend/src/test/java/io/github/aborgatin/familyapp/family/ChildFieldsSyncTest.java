package io.github.aborgatin.familyapp.family;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.SyncRequests;
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
 * Child fields through the sync push and pull (spec #3 "Write path", ticket #53; spec #5 Child
 * fields in Settings; ADR-0007). The Defaults on a fresh installation are covered by {@code
 * ChildFieldDefaultsTest}; these tests start without any Child field. Two {@code Browser}s play two
 * devices: Anna's phone and Boris's phone.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class ChildFieldsSyncTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  Browser anna;
  Browser boris;

  @BeforeEach
  void annaAndBorisAreLoggedInAndThereAreNoChildFields() throws Exception {
    FreshInstallation.reset(jdbc);
    FreshInstallation.removeChildFields(jdbc);
    anna = SyncRequests.bootstrapAnna(mvc);
    boris = SyncRequests.loginBoris(mvc, jdbc);
  }

  @Test
  void aChildFieldPushedByOneDeviceArrivesThroughTheOthersPull() throws Exception {
    UUID shoeSize = UUID.randomUUID();

    SyncRequests.push(
            anna,
            SyncRequests.upsert(
                "child_field",
                shoeSize,
                "{\"name\":\"  Размер обуви  \",\"valueType\":\"TEXT\",\"position\":1}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(SyncRequests.fields(boris, "child_field", shoeSize))
        .containsEntry("name", "Размер обуви")
        .containsEntry("valueType", "TEXT")
        .containsEntry("position", 1.0);
  }

  @Test
  void anUpsertOfAKnownChildFieldChangesOnlyTheFieldsItCarries() throws Exception {
    UUID shoeSize = add("Размер обуви", "DATE", 2);

    SyncRequests.push(boris, SyncRequests.upsert("child_field", shoeSize, "{\"name\":\"Обувь\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(SyncRequests.fields(anna, "child_field", shoeSize))
        .containsEntry("name", "Обувь")
        .containsEntry("valueType", "DATE")
        .containsEntry("position", 2.0);
  }

  @Test
  void aReorderChangesOnlyThePositionOfTheMovedField() throws Exception {
    UUID shoeSize = add("Размер обуви", "TEXT", 1);
    UUID allergies = add("Аллергии", "TEXT", 2);
    UUID teacher = add("Учитель", "TEXT", 3);
    long before = SyncRequests.version(SyncRequests.pull(boris, 0));

    SyncRequests.push(anna, SyncRequests.upsert("child_field", teacher, "{\"position\":1.5}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    SyncRequests.pull(boris, before)
        .andExpect(jsonPath("$.changes[*].id", contains(teacher.toString())))
        .andExpect(jsonPath("$.changes[0].fields.position").value(1.5))
        .andExpect(jsonPath("$.changes[0].fields.name").value("Учитель"));
    assertThat(SyncRequests.fields(boris, "child_field", shoeSize)).containsEntry("position", 1.0);
    assertThat(SyncRequests.fields(boris, "child_field", allergies)).containsEntry("position", 2.0);
  }

  @Test
  void theValueTypeCannotChangeAfterCreation() throws Exception {
    UUID shoeSize = add("Размер обуви", "TEXT", 1);

    SyncRequests.push(
            boris,
            SyncRequests.upsert(
                "child_field", shoeSize, "{\"valueType\":\"DATE\",\"name\":\"Обувь\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("rejected")))
        .andExpect(jsonPath("$.results[0].code").value("child_field.value_type_immutable"));

    // The rejected operation changed nothing, not even the name it carried.
    assertThat(SyncRequests.fields(anna, "child_field", shoeSize))
        .containsEntry("valueType", "TEXT")
        .containsEntry("name", "Размер обуви");
  }

  @Test
  void deleteWinsOverALaterChangeAndADeleteOfNothingIsIgnored() throws Exception {
    UUID shoeSize = add("Размер обуви", "TEXT", 1);
    long before = SyncRequests.version(SyncRequests.pull(boris, 0));

    SyncRequests.push(
            anna,
            SyncRequests.delete("child_field", shoeSize),
            SyncRequests.upsert(
                "child_field",
                shoeSize,
                "{\"name\":\"Размер обуви\",\"valueType\":\"TEXT\",\"position\":1}"),
            SyncRequests.delete("child_field", shoeSize),
            SyncRequests.delete("child_field", UUID.randomUUID()))
        .andExpect(
            jsonPath("$.results[*].status", contains("applied", "ignored", "ignored", "ignored")));

    Map<String, Object> tombstone = SyncRequests.change(boris, before, "child_field", shoeSize);
    assertThat(tombstone).containsEntry("deleted", true).doesNotContainKey("fields");
    assertThat(SyncRequests.change(boris, 0, "child_field", shoeSize)).isNull();
  }

  @Test
  void aNewChildFieldNeedsEveryFieldAndValidOnes() throws Exception {
    UUID nameless = UUID.randomUUID();
    UUID tooLong = UUID.randomUUID();
    UUID textPosition = UUID.randomUUID();

    SyncRequests.push(
            anna,
            SyncRequests.upsert("child_field", nameless, "{\"name\":\"   \"}"),
            SyncRequests.upsert(
                "child_field",
                tooLong,
                "{\"name\":\"%s\",\"valueType\":\"NUMBER\",\"position\":1}"
                    .formatted("Я".repeat(101))),
            SyncRequests.upsert(
                "child_field",
                textPosition,
                "{\"name\":\"Рост\",\"valueType\":\"TEXT\",\"position\":\"first\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "rejected", "rejected")))
        .andExpect(jsonPath("$.results[0].code").value("validation.failed"))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='name')].code").value("required"))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='valueType')].code").value("required"))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='position')].code").value("required"))
        .andExpect(
            jsonPath("$.results[1].params.errors[?(@.field=='name')].code").value("too_long"))
        .andExpect(
            jsonPath("$.results[1].params.errors[?(@.field=='valueType')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[2].params.errors[?(@.field=='position')].code")
                .value("value.invalid"));

    assertThat(SyncRequests.fields(boris, "child_field", nameless)).isNull();
    assertThat(SyncRequests.fields(boris, "child_field", tooLong)).isNull();
    assertThat(SyncRequests.fields(boris, "child_field", textPosition)).isNull();
  }

  @Test
  void repeatingAWholePushLeavesTheSameState() throws Exception {
    UUID shoeSize = UUID.randomUUID();
    UUID teacher = UUID.randomUUID();
    String[] push = {
      SyncRequests.upsert(
          "child_field",
          shoeSize,
          "{\"name\":\"Размер обуви\",\"valueType\":\"TEXT\",\"position\":1}"),
      SyncRequests.upsert(
          "child_field", teacher, "{\"name\":\"Учитель\",\"valueType\":\"TEXT\",\"position\":2}"),
      SyncRequests.upsert("child_field", shoeSize, "{\"position\":3}"),
      SyncRequests.delete("child_field", teacher)
    };

    SyncRequests.push(anna, push)
        .andExpect(
            jsonPath("$.results[*].status", contains("applied", "applied", "applied", "applied")));
    SyncRequests.push(anna, push)
        .andExpect(
            jsonPath("$.results[*].status", contains("applied", "ignored", "applied", "ignored")));

    assertThat(SyncRequests.fields(boris, "child_field", shoeSize))
        .containsEntry("name", "Размер обуви")
        .containsEntry("position", 3.0);
    assertThat(SyncRequests.fields(boris, "child_field", teacher)).isNull();
  }

  @Test
  void theOldChildFieldEndpointsAreGoneThePullAndPushReplaceThem() throws Exception {
    anna.get("/api/child-fields").andExpect(status().is4xxClientError());
    anna.putJson(
            "/api/child-fields/" + UUID.randomUUID(),
            "{\"name\":\"Рост\",\"valueType\":\"TEXT\",\"position\":1}")
        .andExpect(status().is4xxClientError());
    anna.delete("/api/child-fields/" + UUID.randomUUID()).andExpect(status().is4xxClientError());
  }

  private UUID add(String name, String valueType, double position) throws Exception {
    UUID id = UUID.randomUUID();
    SyncRequests.push(
            anna,
            SyncRequests.upsert(
                "child_field",
                id,
                "{\"name\":\"%s\",\"valueType\":\"%s\",\"position\":%s}"
                    .formatted(name, valueType, position)))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));
    return id;
  }
}

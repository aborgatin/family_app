package io.github.aborgatin.familyapp.family;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.SyncRequests;
import java.time.Instant;
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
 * Child field values through the sync push and pull (spec #81, ticket #91; ADR-0007): each save
 * appends an entry to the value's timeline. Two {@code Browser}s play two devices: Anna's phone and
 * Boris's phone. Every test starts with the Child Маша and the Child fields «Размер обуви» (text)
 * and «Последний визит к врачу» (date).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class ChildFieldValuesSyncTest {

  private static final String TABLE = "child_field_value";

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  Browser anna;
  Browser boris;
  UUID masha;
  UUID shoeSize;
  UUID lastVisit;

  @BeforeEach
  void annaAndBorisHaveMashaAndTwoChildFields() throws Exception {
    FreshInstallation.reset(jdbc);
    FreshInstallation.removeChildFields(jdbc);
    anna = SyncRequests.bootstrapAnna(mvc);
    boris = SyncRequests.loginBoris(mvc, jdbc);
    masha = UUID.randomUUID();
    shoeSize = UUID.randomUUID();
    lastVisit = UUID.randomUUID();
    SyncRequests.push(
            anna,
            SyncRequests.upsert("child", masha, "{\"name\":\"Маша\",\"color\":\"coral\"}"),
            SyncRequests.upsert(
                "child_field",
                shoeSize,
                "{\"name\":\"Размер обуви\",\"valueType\":\"TEXT\",\"position\":1}"),
            SyncRequests.upsert(
                "child_field",
                lastVisit,
                "{\"name\":\"Последний визит к врачу\",\"valueType\":\"DATE\",\"position\":2}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "applied", "applied")));
  }

  @Test
  void aValueSavedOnOneDeviceArrivesThroughTheOthersPullWithWhenItWasRecorded() throws Exception {
    UUID entry = UUID.randomUUID();
    Instant before = Instant.now();

    SyncRequests.push(anna, SyncRequests.upsert(TABLE, entry, value(masha, shoeSize, "  31  ")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    Map<String, Object> fields = SyncRequests.fields(boris, TABLE, entry);
    assertThat(fields)
        .containsEntry("childId", masha.toString())
        .containsEntry("childFieldId", shoeSize.toString())
        .containsEntry("value", "31");
    assertThat(Instant.parse((String) fields.get("recordedAt")))
        .isBetween(before.minusSeconds(1), Instant.now().plusSeconds(1));
  }

  @Test
  void aTextValueMayBeUpToAThousandCodePointsAndADateValueIsWrittenYearMonthDay() throws Exception {
    UUID longest = UUID.randomUUID();
    UUID tooLong = UUID.randomUUID();
    UUID date = UUID.randomUUID();
    UUID notADate = UUID.randomUUID();
    UUID noSuchDay = UUID.randomUUID();
    UUID russianDate = UUID.randomUUID();

    SyncRequests.push(
            anna,
            SyncRequests.upsert(TABLE, longest, value(masha, shoeSize, "😀".repeat(1000))),
            SyncRequests.upsert(TABLE, tooLong, value(masha, shoeSize, "я".repeat(1001))),
            SyncRequests.upsert(TABLE, date, value(masha, lastVisit, "2026-10-03")),
            SyncRequests.upsert(TABLE, notADate, value(masha, lastVisit, "в октябре")),
            SyncRequests.upsert(TABLE, noSuchDay, value(masha, lastVisit, "2026-02-30")),
            SyncRequests.upsert(TABLE, russianDate, value(masha, lastVisit, "03.10.2026")))
        .andExpect(
            jsonPath(
                "$.results[*].status",
                contains("applied", "rejected", "applied", "rejected", "rejected", "rejected")))
        .andExpect(jsonPath("$.results[1].code").value("validation.failed"))
        .andExpect(
            jsonPath("$.results[1].params.errors[?(@.field=='value')].code").value("too_long"))
        .andExpect(
            jsonPath("$.results[3].params.errors[?(@.field=='value')].code").value("value.invalid"))
        .andExpect(
            jsonPath("$.results[4].params.errors[?(@.field=='value')].code").value("value.invalid"))
        .andExpect(
            jsonPath("$.results[5].params.errors[?(@.field=='value')].code")
                .value("value.invalid"));

    assertThat(SyncRequests.fields(boris, TABLE, longest))
        .containsEntry("value", "😀".repeat(1000));
    assertThat(SyncRequests.fields(boris, TABLE, date)).containsEntry("value", "2026-10-03");
    assertThat(SyncRequests.fields(boris, TABLE, tooLong)).isNull();
    assertThat(SyncRequests.fields(boris, TABLE, notADate)).isNull();
    assertThat(SyncRequests.fields(boris, TABLE, noSuchDay)).isNull();
    assertThat(SyncRequests.fields(boris, TABLE, russianDate)).isNull();
  }

  @Test
  void aClearedValueIsAnEntryWithAnEmptyValueForEitherValueType() throws Exception {
    UUID text = UUID.randomUUID();
    UUID date = UUID.randomUUID();

    SyncRequests.push(
            anna,
            SyncRequests.upsert(TABLE, text, value(masha, shoeSize, "   ")),
            SyncRequests.upsert(TABLE, date, value(masha, lastVisit, "")))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "applied")));

    assertThat(SyncRequests.fields(boris, TABLE, text)).containsEntry("value", "");
    assertThat(SyncRequests.fields(boris, TABLE, date)).containsEntry("value", "");
  }

  @Test
  void aNewEntryNeedsItsChildItsChildFieldAndAValue() throws Exception {
    UUID empty = UUID.randomUUID();
    UUID badIds = UUID.randomUUID();
    UUID noValue = UUID.randomUUID();

    SyncRequests.push(
            anna,
            SyncRequests.upsert(TABLE, empty, "{}"),
            SyncRequests.upsert(
                TABLE, badIds, "{\"childId\":\"Маша\",\"childFieldId\":\"7\",\"value\":\"31\"}"),
            SyncRequests.upsert(
                TABLE,
                noValue,
                "{\"childId\":\"%s\",\"childFieldId\":\"%s\",\"value\":null}"
                    .formatted(masha, shoeSize)))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "rejected", "rejected")))
        .andExpect(jsonPath("$.results[0].code").value("validation.failed"))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='childId')].code").value("required"))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='childFieldId')].code")
                .value("required"))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='value')].code").value("required"))
        .andExpect(
            jsonPath("$.results[1].params.errors[?(@.field=='childId')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[1].params.errors[?(@.field=='childFieldId')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[2].params.errors[?(@.field=='value')].code").value("required"));

    assertThat(SyncRequests.fields(boris, TABLE, empty)).isNull();
    assertThat(SyncRequests.fields(boris, TABLE, badIds)).isNull();
    assertThat(SyncRequests.fields(boris, TABLE, noValue)).isNull();
  }

  @Test
  void anEntryForADeletedChildOrChildFieldIsIgnored() throws Exception {
    UUID petya = UUID.randomUUID();
    UUID teacher = UUID.randomUUID();
    SyncRequests.push(
            boris,
            SyncRequests.upsert("child", petya, "{\"name\":\"Петя\",\"color\":\"blue\"}"),
            SyncRequests.upsert(
                "child_field",
                teacher,
                "{\"name\":\"Учитель\",\"valueType\":\"TEXT\",\"position\":3}"),
            SyncRequests.delete("child", petya),
            SyncRequests.delete("child_field", teacher))
        .andExpect(
            jsonPath("$.results[*].status", contains("applied", "applied", "applied", "applied")));
    UUID ofDeletedChild = UUID.randomUUID();
    UUID ofDeletedField = UUID.randomUUID();

    // Anna's phone had not pulled the deletes yet. Even a value the field would refuse is ignored.
    SyncRequests.push(
            anna,
            SyncRequests.upsert(TABLE, ofDeletedChild, value(petya, lastVisit, "вчера")),
            SyncRequests.upsert(TABLE, ofDeletedField, value(masha, teacher, "Анна Ивановна")))
        .andExpect(jsonPath("$.results[*].status", contains("ignored", "ignored")));

    assertThat(SyncRequests.fields(boris, TABLE, ofDeletedChild)).isNull();
    assertThat(SyncRequests.fields(boris, TABLE, ofDeletedField)).isNull();
  }

  @Test
  void anEntryForAChildOrChildFieldThatNeverExistedIsRejected() throws Exception {
    UUID nobody = UUID.randomUUID();
    UUID nothing = UUID.randomUUID();
    UUID ofNobody = UUID.randomUUID();
    UUID ofNothing = UUID.randomUUID();

    SyncRequests.push(
            anna,
            SyncRequests.upsert(TABLE, ofNobody, value(nobody, shoeSize, "31")),
            SyncRequests.upsert(TABLE, ofNothing, value(masha, nothing, "31")))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "rejected")))
        .andExpect(jsonPath("$.results[0].code").value("child.not_found"))
        .andExpect(jsonPath("$.results[0].params.childId").value(nobody.toString()))
        .andExpect(jsonPath("$.results[1].code").value("child_field.not_found"))
        .andExpect(jsonPath("$.results[1].params.childFieldId").value(nothing.toString()));

    assertThat(SyncRequests.fields(boris, TABLE, ofNobody)).isNull();
    assertThat(SyncRequests.fields(boris, TABLE, ofNothing)).isNull();
  }

  @Test
  void twoDevicesSavingTheSameValueKeepBothEntriesAndTheLaterArrivalHasTheHigherVersion()
      throws Exception {
    UUID annas = UUID.randomUUID();
    UUID boriss = UUID.randomUUID();

    SyncRequests.push(anna, SyncRequests.upsert(TABLE, annas, value(masha, shoeSize, "31")))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));
    SyncRequests.push(boris, SyncRequests.upsert(TABLE, boriss, value(masha, shoeSize, "32")))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    // Both phones pull the same two entries, Boris's last: it is the latest for both.
    for (Browser device : List.of(anna, boris)) {
      SyncRequests.pull(device, 0)
          .andExpect(
              jsonPath(
                  "$.changes[?(@.table=='child_field_value')].id",
                  contains(annas.toString(), boriss.toString())))
          .andExpect(
              jsonPath(
                  "$.changes[?(@.table=='child_field_value')].fields.value", contains("31", "32")));
    }
    assertThat(version(anna, boriss)).isGreaterThan(version(anna, annas));
  }

  @Test
  void anEntryNeverChangesSoRepeatingAPushLeavesTheSameState() throws Exception {
    UUID entry = UUID.randomUUID();
    String push = SyncRequests.upsert(TABLE, entry, value(masha, shoeSize, "31"));
    SyncRequests.push(anna, push).andExpect(jsonPath("$.results[*].status", contains("applied")));
    Map<String, Object> first = SyncRequests.change(boris, 0, TABLE, entry);

    SyncRequests.push(
            anna, push, SyncRequests.upsert(TABLE, entry, value(masha, shoeSize, "another")))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "applied")));

    // Not even a new Version or another time: the entry is as it was recorded.
    assertThat(SyncRequests.change(boris, 0, TABLE, entry)).isEqualTo(first);
  }

  @Test
  void deletingAChildDeletesItsValuesAndLeavesTheOtherChildrens() throws Exception {
    UUID petya = UUID.randomUUID();
    UUID mashasShoes = UUID.randomUUID();
    UUID mashasVisit = UUID.randomUUID();
    UUID petyasShoes = UUID.randomUUID();
    SyncRequests.push(
            anna,
            SyncRequests.upsert("child", petya, "{\"name\":\"Петя\",\"color\":\"blue\"}"),
            SyncRequests.upsert(TABLE, mashasShoes, value(masha, shoeSize, "31")),
            SyncRequests.upsert(TABLE, mashasVisit, value(masha, lastVisit, "2026-10-03")),
            SyncRequests.upsert(TABLE, petyasShoes, value(petya, shoeSize, "27")))
        .andExpect(
            jsonPath("$.results[*].status", contains("applied", "applied", "applied", "applied")));
    long before = SyncRequests.version(SyncRequests.pull(boris, 0));

    // The same push: later operations see the Child's values deleted.
    SyncRequests.push(
            anna, SyncRequests.delete("child", masha), SyncRequests.delete(TABLE, mashasShoes))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "ignored")));

    assertThat(SyncRequests.change(boris, before, TABLE, mashasShoes))
        .containsEntry("deleted", true)
        .doesNotContainKey("fields");
    assertThat(SyncRequests.change(boris, before, TABLE, mashasVisit))
        .containsEntry("deleted", true);
    assertThat(SyncRequests.change(boris, before, TABLE, petyasShoes)).isNull();
    assertThat(SyncRequests.fields(boris, TABLE, mashasShoes)).isNull();
    assertThat(SyncRequests.fields(boris, TABLE, petyasShoes)).containsEntry("value", "27");
  }

  @Test
  void deletingAChildFieldDeletesItsValuesForEveryChildAndLeavesTheOtherFields() throws Exception {
    UUID petya = UUID.randomUUID();
    UUID mashasShoes = UUID.randomUUID();
    UUID petyasShoes = UUID.randomUUID();
    UUID mashasVisit = UUID.randomUUID();
    SyncRequests.push(
            anna,
            SyncRequests.upsert("child", petya, "{\"name\":\"Петя\",\"color\":\"blue\"}"),
            SyncRequests.upsert(TABLE, mashasShoes, value(masha, shoeSize, "31")),
            SyncRequests.upsert(TABLE, petyasShoes, value(petya, shoeSize, "27")),
            SyncRequests.upsert(TABLE, mashasVisit, value(masha, lastVisit, "2026-10-03")))
        .andExpect(
            jsonPath("$.results[*].status", contains("applied", "applied", "applied", "applied")));
    long before = SyncRequests.version(SyncRequests.pull(anna, 0));

    SyncRequests.push(
            boris,
            SyncRequests.delete("child_field", shoeSize),
            SyncRequests.delete(TABLE, petyasShoes))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "ignored")));

    assertThat(SyncRequests.change(anna, before, TABLE, mashasShoes))
        .containsEntry("deleted", true)
        .doesNotContainKey("fields");
    assertThat(SyncRequests.change(anna, before, TABLE, petyasShoes))
        .containsEntry("deleted", true);
    assertThat(SyncRequests.change(anna, before, TABLE, mashasVisit)).isNull();
    assertThat(SyncRequests.fields(anna, TABLE, mashasVisit)).containsEntry("value", "2026-10-03");
  }

  @Test
  void deleteWinsOverALaterUpsertOfTheSameEntry() throws Exception {
    UUID entry = UUID.randomUUID();
    long before = SyncRequests.version(SyncRequests.pull(boris, 0));

    SyncRequests.push(
            anna,
            SyncRequests.upsert(TABLE, entry, value(masha, shoeSize, "31")),
            SyncRequests.delete(TABLE, entry),
            SyncRequests.upsert(TABLE, entry, value(masha, shoeSize, "31")),
            SyncRequests.delete(TABLE, UUID.randomUUID()))
        .andExpect(
            jsonPath("$.results[*].status", contains("applied", "applied", "ignored", "ignored")));

    assertThat(SyncRequests.change(boris, before, TABLE, entry)).containsEntry("deleted", true);
    assertThat(SyncRequests.fields(boris, TABLE, entry)).isNull();
  }

  /** The Version the device pulls the entry with. */
  private static long version(Browser device, UUID entry) throws Exception {
    return ((Number) SyncRequests.change(device, 0, TABLE, entry).get("version")).longValue();
  }

  /** The fields of an entry: this Child's value for this Child field. */
  private static String value(UUID child, UUID childField, String value) {
    return "{\"childId\":\"%s\",\"childFieldId\":\"%s\",\"value\":\"%s\"}"
        .formatted(child, childField, value);
  }
}

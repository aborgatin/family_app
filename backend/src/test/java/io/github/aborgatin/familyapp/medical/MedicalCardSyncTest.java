package io.github.aborgatin.familyapp.medical;

import static io.github.aborgatin.familyapp.SyncRequests.pushApplied;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.SyncRequests;
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
 * Medical cards through the sync push and pull (spec #128, ticket #129): the {@code illness} and
 * {@code illness_event} tables. Two {@code Browser}s play Anna's phone and Boris's phone; every
 * test starts with the Child Маша.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class MedicalCardSyncTest {

  static final String ILLNESS = "illness";
  static final String EVENT = "illness_event";

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  Browser anna;
  Browser boris;
  String annaId;
  final UUID masha = UUID.randomUUID();

  @BeforeEach
  void annaAndBorisHaveMasha() throws Exception {
    FreshInstallation.reset(jdbc);
    anna = SyncRequests.bootstrapAnna(mvc);
    boris = SyncRequests.loginBoris(mvc, jdbc);
    annaId = SyncRequests.memberId(anna);
    pushApplied(
        anna, SyncRequests.upsert("child", masha, "{\"name\":\"Маша\",\"color\":\"coral\"}"));
  }

  @Test
  void aTemperatureOnAMembersOwnCardReachesOnlyThatMember() throws Exception {
    UUID illness = UUID.randomUUID();
    UUID event = UUID.randomUUID();
    long before = SyncRequests.version(SyncRequests.pull(boris, 0));

    pushApplied(
        anna,
        illnessOf("memberId", annaId, illness, "Болезнь 2 декабря 2026"),
        temperature(event, illness, "2026-12-02", "22:00", 38.5));

    assertThat(SyncRequests.fields(anna, ILLNESS, illness))
        .containsEntry("memberId", annaId)
        .containsEntry("childId", null)
        .containsEntry("kind", "ILLNESS")
        .containsEntry("name", "Болезнь 2 декабря 2026")
        .containsEntry("description", null)
        .containsEntry("ended", false)
        .containsEntry("position", null)
        .containsKey("createdAt");
    assertThat(SyncRequests.fields(anna, EVENT, event))
        .containsEntry("illnessId", illness.toString())
        .containsEntry("kind", "TEMPERATURE")
        .containsEntry("date", "2026-12-02")
        .containsEntry("time", "22:00")
        .containsEntry("temperature", 38.5)
        .containsEntry("medicineId", null)
        .containsEntry("amount", null)
        .containsEntry("title", null)
        .containsEntry("description", null);
    assertThat(SyncRequests.change(boris, before, ILLNESS, illness)).isNull();
    assertThat(SyncRequests.change(boris, before, EVENT, event)).isNull();
    assertThat(SyncRequests.change(boris, 0, EVENT, event)).isNull();
  }

  @Test
  void aChildsCardReachesBothMembers() throws Exception {
    UUID illness = UUID.randomUUID();
    UUID event = UUID.randomUUID();

    pushApplied(
        boris,
        illnessOf("childId", masha, illness, "Болезнь 2 декабря 2026"),
        temperature(event, illness, "2026-12-02", null, 37.2));

    for (Browser member : new Browser[] {anna, boris}) {
      assertThat(SyncRequests.fields(member, ILLNESS, illness))
          .containsEntry("childId", masha.toString())
          .containsEntry("memberId", null);
      assertThat(SyncRequests.fields(member, EVENT, event))
          .containsEntry("temperature", 37.2)
          .containsEntry("time", null);
    }
  }

  @Test
  void anotherMembersCardIsNotFound() throws Exception {
    UUID annas = UUID.randomUUID();
    UUID annasEvent = UUID.randomUUID();
    pushApplied(
        anna,
        illnessOf("memberId", annaId, annas, "ОРВИ"),
        temperature(annasEvent, annas, "2026-12-02", "08:00", 38.0));
    UUID onAnnasCard = UUID.randomUUID();
    UUID intoAnnas = UUID.randomUUID();

    SyncRequests.push(
            boris,
            illnessOf("memberId", annaId, onAnnasCard, "Чужая"),
            temperature(intoAnnas, annas, "2026-12-02", "09:00", 37.0),
            SyncRequests.upsert(ILLNESS, annas, "{\"name\":\"Моя\"}"),
            SyncRequests.delete(ILLNESS, annas),
            SyncRequests.delete(EVENT, annasEvent))
        .andExpect(
            jsonPath(
                "$.results[*].status",
                contains("rejected", "rejected", "rejected", "rejected", "rejected")))
        .andExpect(
            jsonPath(
                "$.results[*].code",
                contains(
                    "medical.not_found",
                    "medical.not_found",
                    "medical.not_found",
                    "medical.not_found",
                    "medical.not_found")));

    assertThat(SyncRequests.fields(anna, ILLNESS, annas)).containsEntry("name", "ОРВИ");
    assertThat(SyncRequests.fields(anna, EVENT, annasEvent)).isNotNull();
    assertThat(SyncRequests.fields(anna, ILLNESS, onAnnasCard)).isNull();
    assertThat(SyncRequests.fields(anna, EVENT, intoAnnas)).isNull();
  }

  @Test
  void anIllnessNeedsExactlyOnePersonAKindAndAName() throws Exception {
    SyncRequests.push(
            anna,
            SyncRequests.upsert(
                ILLNESS, UUID.randomUUID(), "{\"kind\":\"ILLNESS\",\"name\":\"А\"}"),
            SyncRequests.upsert(
                ILLNESS,
                UUID.randomUUID(),
                "{\"memberId\":\"%s\",\"childId\":\"%s\",\"kind\":\"ILLNESS\",\"name\":\"А\"}"
                    .formatted(annaId, masha)),
            SyncRequests.upsert(
                ILLNESS,
                UUID.randomUUID(),
                "{\"childId\":\"%s\",\"kind\":\"FLU\",\"name\":\"  \"}".formatted(masha)),
            illnessOf("childId", UUID.randomUUID(), UUID.randomUUID(), "Ничья"))
        .andExpect(
            jsonPath(
                "$.results[*].code",
                contains(
                    "validation.failed",
                    "validation.failed",
                    "validation.failed",
                    "child.not_found")))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='memberId')].code").value("required"))
        .andExpect(
            jsonPath("$.results[1].params.errors[?(@.field=='childId')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[2].params.errors[?(@.field=='kind')].code").value("value.invalid"))
        .andExpect(
            jsonPath("$.results[2].params.errors[?(@.field=='name')].code").value("required"));
  }

  @Test
  void anEventNeedsWhatItsKindRecords() throws Exception {
    UUID illness = UUID.randomUUID();
    pushApplied(anna, illnessOf("childId", masha, illness, "ОРВИ"));
    String base = "\"illnessId\":\"%s\",\"date\":\"2026-12-02\"".formatted(illness);

    SyncRequests.push(
            anna,
            SyncRequests.upsert(
                EVENT, UUID.randomUUID(), "{" + base + ",\"kind\":\"TEMPERATURE\"}"),
            temperature(UUID.randomUUID(), illness, "2026-12-02", null, 33.9),
            temperature(UUID.randomUUID(), illness, "2026-12-02", null, 43.1),
            temperature(UUID.randomUUID(), illness, "2026-12-02", null, 38.55),
            SyncRequests.upsert(EVENT, UUID.randomUUID(), "{" + base + ",\"kind\":\"NOTE\"}"),
            SyncRequests.upsert(
                EVENT, UUID.randomUUID(), "{" + base + ",\"kind\":\"MEDICINE_DOSE\"}"),
            temperature(UUID.randomUUID(), illness, "2026-12-02", "25:00", 37.0),
            temperature(UUID.randomUUID(), illness, "2026-12-02", "07:30", 34.0),
            temperature(UUID.randomUUID(), illness, "2026-12-02", "07:31", 43.0),
            SyncRequests.upsert(
                EVENT,
                UUID.randomUUID(),
                "{" + base + ",\"kind\":\"NOTE\",\"title\":\" Вырвало \"}"))
        .andExpect(
            jsonPath(
                "$.results[*].status",
                contains(
                    "rejected",
                    "rejected",
                    "rejected",
                    "rejected",
                    "rejected",
                    "rejected",
                    "rejected",
                    "applied",
                    "applied",
                    "applied")))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='temperature')].code")
                .value("required"))
        .andExpect(
            jsonPath("$.results[1].params.errors[?(@.field=='temperature')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[2].params.errors[?(@.field=='temperature')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[3].params.errors[?(@.field=='temperature')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[4].params.errors[?(@.field=='title')].code").value("required"))
        .andExpect(
            jsonPath("$.results[5].params.errors[?(@.field=='medicineId')].code").value("required"))
        .andExpect(
            jsonPath("$.results[6].params.errors[?(@.field=='time')].code").value("value.invalid"));
  }

  @Test
  void deletingAnIllnessDeletesItsEvents() throws Exception {
    UUID illness = UUID.randomUUID();
    UUID event = UUID.randomUUID();
    pushApplied(
        anna,
        illnessOf("memberId", annaId, illness, "ОРВИ"),
        temperature(event, illness, "2026-12-02", "08:00", 38.0));
    long before = SyncRequests.version(SyncRequests.pull(anna, 0));

    pushApplied(anna, SyncRequests.delete(ILLNESS, illness));

    assertThat(SyncRequests.change(anna, before, ILLNESS, illness)).containsEntry("deleted", true);
    assertThat(SyncRequests.change(anna, before, EVENT, event)).containsEntry("deleted", true);
    SyncRequests.push(anna, temperature(UUID.randomUUID(), illness, "2026-12-03", null, 37.0))
        .andExpect(jsonPath("$.results[*].status", contains("ignored")));
  }

  @Test
  void deletingAChildDeletesTheirIllnessesAndEvents() throws Exception {
    UUID illness = UUID.randomUUID();
    UUID event = UUID.randomUUID();
    UUID annas = UUID.randomUUID();
    UUID annasEvent = UUID.randomUUID();
    pushApplied(
        anna,
        illnessOf("childId", masha, illness, "ОРВИ"),
        temperature(event, illness, "2026-12-02", "08:00", 38.0),
        illnessOf("memberId", annaId, annas, "Простуда"),
        temperature(annasEvent, annas, "2026-12-02", "08:00", 37.5));
    long before = SyncRequests.version(SyncRequests.pull(boris, 0));

    pushApplied(anna, SyncRequests.delete("child", masha));

    assertThat(SyncRequests.change(boris, before, ILLNESS, illness)).containsEntry("deleted", true);
    assertThat(SyncRequests.change(boris, before, EVENT, event)).containsEntry("deleted", true);
    assertThat(SyncRequests.fields(anna, EVENT, annasEvent)).isNotNull();
    // Logged offline before the delete arrived: a new Illness with its first event goes too.
    UUID late = UUID.randomUUID();
    SyncRequests.push(
            boris,
            illnessOf("childId", masha, late, "Поздно"),
            temperature(UUID.randomUUID(), late, "2026-12-03", null, 37.0))
        .andExpect(jsonPath("$.results[*].status", contains("ignored", "ignored")));
  }

  static String illnessOf(String personField, Object person, UUID id, String name) {
    return SyncRequests.upsert(
        ILLNESS,
        id,
        "{\"%s\":\"%s\",\"kind\":\"ILLNESS\",\"name\":\"%s\"}"
            .formatted(personField, person, name));
  }

  static String temperature(UUID id, UUID illness, String date, String time, double value) {
    return SyncRequests.upsert(
        EVENT,
        id,
        "{\"illnessId\":\"%s\",\"kind\":\"TEMPERATURE\",\"date\":\"%s\",\"time\":%s,\"temperature\":%s}"
            .formatted(illness, date, time == null ? "null" : "\"" + time + "\"", value));
  }
}

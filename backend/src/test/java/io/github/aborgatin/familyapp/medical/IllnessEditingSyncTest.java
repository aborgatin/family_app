package io.github.aborgatin.familyapp.medical;

import static io.github.aborgatin.familyapp.MedicalOperations.dose;
import static io.github.aborgatin.familyapp.MedicalOperations.illnessOf;
import static io.github.aborgatin.familyapp.MedicalOperations.medicine;
import static io.github.aborgatin.familyapp.MedicalOperations.temperature;
import static io.github.aborgatin.familyapp.SyncRequests.pushApplied;
import static io.github.aborgatin.familyapp.medical.MedicalCardSyncTest.EVENT;
import static io.github.aborgatin.familyapp.medical.MedicalCardSyncTest.ILLNESS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.is;
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
 * Working inside an Illness through the sync push and pull (spec #128, ticket #131): editing an
 * Illness and its events, and moving an event to another Illness on the same card. Anna and Boris
 * have the Child Маша, with the Illness «ОРВИ» on her card.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class IllnessEditingSyncTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  Browser anna;
  Browser boris;
  String annaId;
  final UUID masha = UUID.randomUUID();
  final UUID orvi = UUID.randomUUID();

  @BeforeEach
  void mashaHasOrvi() throws Exception {
    FreshInstallation.reset(jdbc);
    anna = SyncRequests.bootstrapAnna(mvc);
    boris = SyncRequests.loginBoris(mvc, jdbc);
    annaId = SyncRequests.memberId(anna);
    pushApplied(
        anna,
        SyncRequests.upsert("child", masha, "{\"name\":\"Маша\",\"color\":\"coral\"}"),
        illnessOf("childId", masha, orvi, "ОРВИ"));
  }

  @Test
  void anIllnessIsRenamedAndDescribed() throws Exception {
    pushApplied(
        boris,
        SyncRequests.upsert(ILLNESS, orvi, "{\"name\":\" Грипп \",\"description\":\"Тип А\"}"));
    assertThat(SyncRequests.fields(anna, ILLNESS, orvi))
        .containsEntry("name", "Грипп")
        .containsEntry("description", "Тип А")
        .containsEntry("kind", "ILLNESS")
        .containsEntry("childId", masha.toString());

    pushApplied(anna, SyncRequests.upsert(ILLNESS, orvi, "{\"description\":\"  \"}"));
    assertThat(SyncRequests.fields(boris, ILLNESS, orvi))
        .containsEntry("name", "Грипп")
        .containsEntry("description", null);

    SyncRequests.push(anna, SyncRequests.upsert(ILLNESS, orvi, "{\"name\":\" \"}"))
        .andExpect(jsonPath("$.results[0].code").value("validation.failed"))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='name')].code").value("required"));
  }

  @Test
  void aConditionIsEndedResumedAndMoved() throws Exception {
    UUID vision = UUID.randomUUID();
    pushApplied(
        anna,
        SyncRequests.upsert(
            ILLNESS,
            vision,
            "{\"childId\":\"%s\",\"kind\":\"CONDITION\",\"name\":\"Зрение\",\"position\":1}"
                .formatted(masha)));
    assertThat(SyncRequests.fields(boris, ILLNESS, vision))
        .containsEntry("kind", "CONDITION")
        .containsEntry("position", 1.0)
        .containsEntry("ended", false);

    pushApplied(
        boris,
        SyncRequests.upsert(ILLNESS, vision, "{\"ended\":true,\"position\":0.5}"),
        SyncRequests.upsert(ILLNESS, orvi, "{\"ended\":true}"));
    assertThat(SyncRequests.fields(anna, ILLNESS, vision))
        .containsEntry("ended", true)
        .containsEntry("kind", "CONDITION")
        .containsEntry("position", 0.5);
    assertThat(SyncRequests.fields(anna, ILLNESS, orvi))
        .containsEntry("ended", true)
        .containsEntry("kind", "ILLNESS");

    pushApplied(anna, SyncRequests.upsert(ILLNESS, vision, "{\"ended\":false}"));
    assertThat(SyncRequests.fields(boris, ILLNESS, vision)).containsEntry("ended", false);

    SyncRequests.push(
            anna,
            SyncRequests.upsert(ILLNESS, orvi, "{\"ended\":null}"),
            SyncRequests.upsert(ILLNESS, orvi, "{\"position\":\"top\"}"))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='ended')].code").value("required"))
        .andExpect(
            jsonPath("$.results[1].params.errors[?(@.field=='position')].code")
                .value("value.invalid"));
  }

  @Test
  void itsKindNeverChanges() throws Exception {
    UUID vision = UUID.randomUUID();
    pushApplied(
        anna,
        SyncRequests.upsert(
            ILLNESS,
            vision,
            "{\"childId\":\"%s\",\"kind\":\"CONDITION\",\"name\":\"Зрение\"}".formatted(masha)));

    pushApplied(
        boris, SyncRequests.upsert(ILLNESS, orvi, "{\"kind\":\"ILLNESS\",\"name\":\"Грипп\"}"));
    SyncRequests.push(
            boris,
            SyncRequests.upsert(ILLNESS, orvi, "{\"kind\":\"CONDITION\",\"position\":0.5}"),
            SyncRequests.upsert(ILLNESS, vision, "{\"kind\":\"ILLNESS\"}"),
            SyncRequests.upsert(ILLNESS, orvi, "{\"kind\":\"TOPIC\"}"))
        .andExpect(jsonPath("$.results[*].code", everyItem(is("validation.failed"))))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='kind')].code").value("value.invalid"))
        .andExpect(
            jsonPath("$.results[1].params.errors[?(@.field=='kind')].code").value("value.invalid"))
        .andExpect(
            jsonPath("$.results[2].params.errors[?(@.field=='kind')].code").value("value.invalid"));

    assertThat(SyncRequests.fields(anna, ILLNESS, orvi))
        .containsEntry("kind", "ILLNESS")
        .containsEntry("name", "Грипп");
    assertThat(SyncRequests.fields(anna, ILLNESS, vision)).containsEntry("kind", "CONDITION");
  }

  @Test
  void aConditionTakesNotesOnly() throws Exception {
    UUID vision = UUID.randomUUID();
    UUID medicine = UUID.randomUUID();
    UUID note = UUID.randomUUID();
    UUID event = UUID.randomUUID();
    pushApplied(
        anna,
        SyncRequests.upsert(
            ILLNESS,
            vision,
            "{\"childId\":\"%s\",\"kind\":\"CONDITION\",\"name\":\"Зрение\"}".formatted(masha)),
        medicine(medicine, "Ибупрофен"),
        temperature(event, orvi, "2026-12-02", "22:00", 38.5),
        SyncRequests.upsert(
            EVENT,
            note,
            "{\"illnessId\":\"%s\",\"kind\":\"NOTE\",\"date\":\"2026-12-02\",\"title\":\"Врач\"}"
                .formatted(orvi)));

    SyncRequests.push(
            boris,
            temperature(UUID.randomUUID(), vision, "2026-12-02", "22:00", 38.5),
            dose(UUID.randomUUID(), vision, medicine, "5 мл", null),
            SyncRequests.upsert(EVENT, event, "{\"illnessId\":\"%s\"}".formatted(vision)))
        .andExpect(jsonPath("$.results[*].status", everyItem(is("rejected"))))
        .andExpect(
            jsonPath("$.results[*].code", everyItem(is("illness.condition_takes_notes_only"))));
    assertThat(SyncRequests.fields(anna, EVENT, event)).containsEntry("illnessId", orvi.toString());

    pushApplied(
        boris, SyncRequests.upsert(EVENT, note, "{\"illnessId\":\"%s\"}".formatted(vision)));
    assertThat(SyncRequests.fields(anna, EVENT, note))
        .containsEntry("illnessId", vision.toString());
  }

  @Test
  void anEditChangesOnlyTheFieldsItCarries() throws Exception {
    UUID event = UUID.randomUUID();
    UUID note = UUID.randomUUID();
    pushApplied(
        anna,
        temperature(event, orvi, "2026-12-02", "22:00", 38.5),
        SyncRequests.upsert(
            EVENT,
            note,
            "{\"illnessId\":\"%s\",\"kind\":\"NOTE\",\"date\":\"2026-12-02\",\"title\":\"Врач\"}"
                .formatted(orvi)));

    pushApplied(
        boris,
        SyncRequests.upsert(
            EVENT,
            event,
            "{\"date\":\"2026-12-03\",\"time\":null,\"temperature\":37.2,"
                + "\"description\":\"После сна\"}"),
        SyncRequests.upsert(EVENT, note, "{\"title\":\"Сходили к доктору\",\"time\":\"10:15\"}"));

    assertThat(SyncRequests.fields(anna, EVENT, event))
        .containsEntry("illnessId", orvi.toString())
        .containsEntry("kind", "TEMPERATURE")
        .containsEntry("date", "2026-12-03")
        .containsEntry("time", null)
        .containsEntry("temperature", 37.2)
        .containsEntry("description", "После сна");
    assertThat(SyncRequests.fields(anna, EVENT, note))
        .containsEntry("title", "Сходили к доктору")
        .containsEntry("time", "10:15")
        .containsEntry("date", "2026-12-02");

    SyncRequests.push(
            anna,
            SyncRequests.upsert(EVENT, event, "{\"temperature\":null}"),
            SyncRequests.upsert(EVENT, note, "{\"title\":\"\"}"),
            SyncRequests.upsert(EVENT, note, "{\"kind\":\"TEMPERATURE\"}"))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='temperature')].code")
                .value("required"))
        .andExpect(
            jsonPath("$.results[1].params.errors[?(@.field=='title')].code").value("required"))
        .andExpect(
            jsonPath("$.results[2].params.errors[?(@.field=='kind')].code").value("value.invalid"));
  }

  @Test
  void anEventMovesToAnotherIllnessOnTheSameCard() throws Exception {
    UUID event = UUID.randomUUID();
    UUID flu = UUID.randomUUID();
    pushApplied(
        anna,
        temperature(event, orvi, "2026-12-02", "22:00", 38.5),
        illnessOf("childId", masha, flu, "Грипп"));

    pushApplied(boris, SyncRequests.upsert(EVENT, event, "{\"illnessId\":\"%s\"}".formatted(flu)));

    assertThat(SyncRequests.fields(anna, EVENT, event))
        .containsEntry("illnessId", flu.toString())
        .containsEntry("temperature", 38.5);
  }

  @Test
  void aMoveToADeletedIllnessIsIgnored() throws Exception {
    UUID event = UUID.randomUUID();
    UUID flu = UUID.randomUUID();
    pushApplied(
        anna,
        temperature(event, orvi, "2026-12-02", "22:00", 38.5),
        illnessOf("childId", masha, flu, "Грипп"));
    pushApplied(anna, SyncRequests.delete(ILLNESS, flu));

    SyncRequests.push(
            boris, SyncRequests.upsert(EVENT, event, "{\"illnessId\":\"%s\"}".formatted(flu)))
        .andExpect(jsonPath("$.results[0].status").value("ignored"));

    assertThat(SyncRequests.fields(anna, EVENT, event)).containsEntry("illnessId", orvi.toString());
  }

  @Test
  void anEventDoesNotMoveToAnotherPersonsCard() throws Exception {
    UUID event = UUID.randomUUID();
    UUID annas = UUID.randomUUID();
    UUID borisOwn = UUID.randomUUID();
    UUID sasha = UUID.randomUUID();
    UUID sashas = UUID.randomUUID();
    pushApplied(
        anna,
        temperature(event, orvi, "2026-12-02", "22:00", 38.5),
        illnessOf("memberId", annaId, annas, "Простуда"),
        SyncRequests.upsert("child", sasha, "{\"name\":\"Саша\",\"color\":\"blue\"}"),
        illnessOf("childId", sasha, sashas, "Ветрянка"));
    pushApplied(boris, illnessOf("memberId", SyncRequests.memberId(boris), borisOwn, "Мигрень"));

    SyncRequests.push(
            boris,
            SyncRequests.upsert(EVENT, event, "{\"illnessId\":\"%s\"}".formatted(annas)),
            SyncRequests.upsert(EVENT, event, "{\"illnessId\":\"%s\"}".formatted(borisOwn)),
            SyncRequests.upsert(EVENT, event, "{\"illnessId\":\"%s\"}".formatted(sashas)),
            SyncRequests.upsert(
                EVENT, event, "{\"illnessId\":\"%s\"}".formatted(UUID.randomUUID())))
        .andExpect(
            jsonPath(
                "$.results[*].code",
                contains(
                    "medical.not_found",
                    "medical.not_found",
                    "medical.not_found",
                    "medical.not_found")));

    assertThat(SyncRequests.fields(anna, EVENT, event)).containsEntry("illnessId", orvi.toString());
  }
}

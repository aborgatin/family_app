package io.github.aborgatin.familyapp.medical;

import static io.github.aborgatin.familyapp.SyncRequests.pushApplied;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.InstanceOfAssertFactories.MAP;
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
 * The Family's Medicines through the sync push and pull (spec #128, ticket #130): the {@code
 * medicine} table, and Medicine doses that name one. Anna's phone and Boris's phone; every test
 * starts with the Child Маша and an Illness on her card.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class MedicineSyncTest {

  static final String MEDICINE = "medicine";
  static final String EVENT = "illness_event";

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  Browser anna;
  Browser boris;
  final UUID masha = UUID.randomUUID();
  final UUID cold = UUID.randomUUID();

  @BeforeEach
  void annaAndBorisHaveMashaWithACold() throws Exception {
    FreshInstallation.reset(jdbc);
    anna = SyncRequests.bootstrapAnna(mvc);
    boris = SyncRequests.loginBoris(mvc, jdbc);
    pushApplied(
        anna,
        SyncRequests.upsert("child", masha, "{\"name\":\"Маша\",\"color\":\"coral\"}"),
        MedicalCardSyncTest.illnessOf("childId", masha, cold, "ОРВИ"));
  }

  @Test
  void aMedicineReachesEveryMemberWithItsNameTrimmed() throws Exception {
    UUID ibuprofen = UUID.randomUUID();

    pushApplied(anna, medicine(ibuprofen, "  Ибупрофен 20 мг/мл "));

    for (Browser member : new Browser[] {anna, boris}) {
      assertThat(SyncRequests.fields(member, MEDICINE, ibuprofen))
          .containsEntry("name", "Ибупрофен 20 мг/мл")
          .containsEntry("deleted", false);
    }
  }

  @Test
  void aMedicineNeedsAName() throws Exception {
    SyncRequests.push(anna, medicine(UUID.randomUUID(), "   "))
        .andExpect(jsonPath("$.results[0].code").value("validation.failed"))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='name')].code").value("required"));
  }

  @Test
  void aNameIsUniqueIgnoringCaseAmongMedicinesThatArentDeleted() throws Exception {
    UUID ibuprofen = UUID.randomUUID();
    UUID paracetamol = UUID.randomUUID();
    pushApplied(anna, medicine(ibuprofen, "Ибупрофен"), medicine(paracetamol, "Парацетамол"));

    SyncRequests.push(
            boris,
            medicine(UUID.randomUUID(), " ибупрофен "),
            SyncRequests.upsert(MEDICINE, paracetamol, "{\"name\":\"ИБУПРОФЕН\"}"),
            SyncRequests.upsert(MEDICINE, ibuprofen, "{\"name\":\"ибупрофен\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "rejected", "applied")))
        .andExpect(jsonPath("$.results[0].code").value("medicine.duplicate"))
        .andExpect(jsonPath("$.results[1].code").value("medicine.duplicate"));
    assertThat(SyncRequests.fields(anna, MEDICINE, paracetamol))
        .containsEntry("name", "Парацетамол");
    assertThat(SyncRequests.fields(anna, MEDICINE, ibuprofen)).containsEntry("name", "ибупрофен");

    // Deleted, the name is free again.
    UUID again = UUID.randomUUID();
    pushApplied(anna, SyncRequests.delete(MEDICINE, ibuprofen), medicine(again, "Ибупрофен"));
    assertThat(SyncRequests.fields(boris, MEDICINE, again)).containsEntry("name", "Ибупрофен");
  }

  @Test
  void aRenameReachesEveryMemberAndEveryDose() throws Exception {
    UUID ibuprofen = UUID.randomUUID();
    UUID dose = UUID.randomUUID();
    pushApplied(anna, medicine(ibuprofen, "Ибупрофен"), dose(dose, ibuprofen, "5 мл", 38.5));
    long before = SyncRequests.version(SyncRequests.pull(boris, 0));

    pushApplied(
        boris, SyncRequests.upsert(MEDICINE, ibuprofen, "{\"name\":\"Ибупрофен 20 мг/мл\"}"));

    assertThat(SyncRequests.change(anna, before, MEDICINE, ibuprofen))
        .extractingByKey("fields")
        .asInstanceOf(MAP)
        .containsEntry("name", "Ибупрофен 20 мг/мл");
    assertThat(SyncRequests.fields(anna, EVENT, dose))
        .containsEntry("kind", "MEDICINE_DOSE")
        .containsEntry("medicineId", ibuprofen.toString())
        .containsEntry("amount", "5 мл")
        .containsEntry("temperature", 38.5);
  }

  @Test
  void deletingAMedicineKeepsItsNameForTheDosesThatNameIt() throws Exception {
    UUID ibuprofen = UUID.randomUUID();
    UUID dose = UUID.randomUUID();
    pushApplied(anna, medicine(ibuprofen, "Ибупрофен"), dose(dose, ibuprofen, "5 мл", null));
    long before = SyncRequests.version(SyncRequests.pull(boris, 0));

    pushApplied(anna, SyncRequests.delete(MEDICINE, ibuprofen));

    // Not a tombstone: the row comes with its name, marked deleted, in every pull.
    assertThat(SyncRequests.change(boris, before, MEDICINE, ibuprofen))
        .containsEntry("deleted", false)
        .extractingByKey("fields")
        .asInstanceOf(MAP)
        .containsEntry("name", "Ибупрофен")
        .containsEntry("deleted", true);
    assertThat(SyncRequests.fields(boris, MEDICINE, ibuprofen))
        .containsEntry("name", "Ибупрофен")
        .containsEntry("deleted", true);
    assertThat(SyncRequests.fields(boris, EVENT, dose))
        .containsEntry("medicineId", ibuprofen.toString());
    // A dose logged offline before the delete arrived still names it; a rename is ignored.
    SyncRequests.push(
            boris,
            dose(UUID.randomUUID(), ibuprofen, "5 мл", null),
            SyncRequests.upsert(MEDICINE, ibuprofen, "{\"name\":\"Нурофен\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "ignored")));
  }

  @Test
  void aDoseNeedsAMedicineThatExists() throws Exception {
    UUID unknown = UUID.randomUUID();

    SyncRequests.push(anna, dose(UUID.randomUUID(), unknown, "5 мл", null))
        .andExpect(jsonPath("$.results[0].code").value("medical.not_found"))
        .andExpect(jsonPath("$.results[0].params.medicineId").value(unknown.toString()));
  }

  static String medicine(UUID id, String name) {
    return SyncRequests.upsert(MEDICINE, id, "{\"name\":\"%s\"}".formatted(name));
  }

  String dose(UUID id, UUID medicine, String amount, Double temperature) {
    return SyncRequests.upsert(
        EVENT,
        id,
        ("{\"illnessId\":\"%s\",\"kind\":\"MEDICINE_DOSE\",\"date\":\"2026-12-02\","
                + "\"time\":\"22:00\",\"medicineId\":\"%s\",\"amount\":\"%s\",\"temperature\":%s}")
            .formatted(cold, medicine, amount, temperature));
  }
}

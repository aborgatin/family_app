package io.github.aborgatin.familyapp.notifications;

import static io.github.aborgatin.familyapp.MedicalOperations.dose;
import static io.github.aborgatin.familyapp.MedicalOperations.illnessOf;
import static io.github.aborgatin.familyapp.MedicalOperations.medicine;
import static io.github.aborgatin.familyapp.MedicalOperations.temperature;
import static io.github.aborgatin.familyapp.SyncRequests.pushApplied;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FakePushGateway;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.SyncRequests;
import java.time.Duration;
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
 * The dose Notification (spec #128 "Notification", ticket #136): a Medicine dose a Member logs on a
 * Child's card is pushed to the other Member at once, naming no medicine. Members act through the
 * sync push; pushes are observed on the fake gateway. Anna and Boris both have the switch on and a
 * phone each; the Child Маша has an Illness, and there is one Medicine.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({PostgresTestcontainer.class, FakePushGateway.Config.class})
class DoseNotificationTest {

  static final String ANNA_PHONE = "https://web.push.apple.com/anna-phone";
  static final String BORIS_PHONE = "https://web.push.apple.com/boris-phone";

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired FakePushGateway gateway;

  Browser anna;
  Browser boris;
  final UUID masha = UUID.randomUUID();
  final UUID cold = UUID.randomUUID();
  final UUID ibuprofen = UUID.randomUUID();

  @BeforeEach
  void annaAndBorisLookAfterMashasCold() throws Exception {
    FreshInstallation.reset(jdbc);
    anna = SyncRequests.bootstrapAnna(mvc);
    boris = SyncRequests.loginBoris(mvc, jdbc);
    for (Browser device : new Browser[] {anna, boris}) {
      PushSubscriptionsTest.switchNotifications(device, true);
    }
    PushSubscriptionsTest.subscribe(anna, ANNA_PHONE).andExpect(status().isNoContent());
    PushSubscriptionsTest.subscribe(boris, BORIS_PHONE).andExpect(status().isNoContent());
    pushApplied(
        anna,
        SyncRequests.upsert("child", masha, "{\"name\":\"Маша\",\"color\":\"coral\"}"),
        illnessOf("childId", masha, cold, "ОРВИ"),
        medicine(ibuprofen, "Ибупрофен 20 мг/мл"));
    gateway.reset();
  }

  @Test
  void aDoseOnAChildsCardIsPushedToTheOtherMemberAtOnceNamingNoMedicine() throws Exception {
    pushApplied(boris, dose(UUID.randomUUID(), cold, ibuprofen, "5 мл", null));

    assertThat(gateway.endpoints()).containsExactly(ANNA_PHONE);
    FakePushGateway.Push sent = gateway.pushes().get(0);
    assertThat(sent.payloadJson())
        .isEqualTo(
            FakePushGateway.json(
                """
                {"type":"dose","actorName":"Борис","actorGrammaticalGender":"MASCULINE",\
                "childName":"Маша","url":"/children/%s/medical/illnesses/%s"}"""
                    .formatted(masha, cold)));
    assertThat(sent.payload()).doesNotContain("Ибупрофен", "5 мл", ibuprofen.toString());
    assertThat(sent.ttl()).isEqualTo(Duration.ofHours(24));
    assertThat(sent.urgency()).isEqualTo(Urgency.NORMAL);
  }

  @Test
  void annasDoseIsPushedToBorisWithHerGender() throws Exception {
    pushApplied(anna, dose(UUID.randomUUID(), cold, ibuprofen, "5 мл", 38.2));

    assertThat(gateway.endpoints()).containsExactly(BORIS_PHONE);
    assertThat(gateway.pushes().get(0).payloadJson().get("actorName").asText()).isEqualTo("Анна");
    assertThat(gateway.pushes().get(0).payloadJson().get("actorGrammaticalGender").asText())
        .isEqualTo("FEMININE");
  }

  @Test
  void eachDoseIsItsOwnNotification() throws Exception {
    pushApplied(
        boris,
        dose(UUID.randomUUID(), cold, ibuprofen, "5 мл", null),
        dose(UUID.randomUUID(), cold, ibuprofen, "5 мл", null));

    assertThat(gateway.endpoints()).containsExactly(ANNA_PHONE, ANNA_PHONE);
  }

  @Test
  void aDoseOnAMembersOwnCardSendsNothing() throws Exception {
    UUID borisCold = UUID.randomUUID();
    pushApplied(
        boris,
        illnessOf("memberId", SyncRequests.memberId(boris), borisCold, "ОРВИ"),
        dose(UUID.randomUUID(), borisCold, ibuprofen, "5 мл", null));

    assertThat(gateway.pushes()).isEmpty();
  }

  @Test
  void anEditOfADoseSendsNothing() throws Exception {
    UUID given = UUID.randomUUID();
    pushApplied(boris, dose(given, cold, ibuprofen, "5 мл", null));
    gateway.reset();

    pushApplied(boris, dose(given, cold, ibuprofen, "7,5 мл", null));
    pushApplied(anna, dose(given, cold, ibuprofen, "7,5 мл", null));

    assertThat(gateway.pushes()).isEmpty();
  }

  @Test
  void aTemperatureSendsNothing() throws Exception {
    pushApplied(boris, temperature(UUID.randomUUID(), cold, "2026-12-02", "22:00", 38.5));

    assertThat(gateway.pushes()).isEmpty();
  }

  @Test
  void theNotificationsSwitchOffSilencesIt() throws Exception {
    PushSubscriptionsTest.switchNotifications(anna, false);

    pushApplied(boris, dose(UUID.randomUUID(), cold, ibuprofen, "5 мл", null));

    assertThat(gateway.pushes()).isEmpty();
  }

  @Test
  void aDoseIgnoredForADeletedIllnessSendsNothing() throws Exception {
    pushApplied(anna, SyncRequests.delete("illness", cold));

    SyncRequests.push(boris, dose(UUID.randomUUID(), cold, ibuprofen, "5 мл", null))
        .andExpect(jsonPath("$.results[0].status").value("ignored"));

    assertThat(gateway.pushes()).isEmpty();
  }
}

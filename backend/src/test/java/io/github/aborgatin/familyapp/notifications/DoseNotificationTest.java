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
import io.github.aborgatin.familyapp.notifications.push.PushPayloads;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
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
 * Child's card is pushed to the other Member at once, naming no medicine, off the sync request's
 * thread. Members act through the sync push; pushes are observed on the fake gateway. Anna and
 * Boris both have the switch on and a phone each; the Child Маша has two Illnesses, and there is
 * one Medicine. Doses go out one at a time in the order logged, so {@link #sentBefore()} logs a
 * marker dose last and waits for it: every push before it has then been sent.
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
  final UUID marker = UUID.randomUUID();
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
        illnessOf("childId", masha, marker, "Отит"),
        medicine(ibuprofen, "Ибупрофен 20 мг/мл"));
    gateway.reset();
  }

  @Test
  void aDoseOnAChildsCardIsPushedToTheOtherMemberAtOnceNamingNoMedicine() throws Exception {
    pushApplied(boris, dose(UUID.randomUUID(), cold, ibuprofen, "5 мл", null));

    List<FakePushGateway.Push> sent = sentBefore();
    assertThat(sent).extracting(FakePushGateway.Push::endpoint).containsExactly(ANNA_PHONE);
    assertThat(sent.get(0).payloadJson())
        .isEqualTo(
            FakePushGateway.json(
                """
                {"type":"dose","actorName":"Борис","actorGrammaticalGender":"MASCULINE",\
                "childName":"Маша","url":"/children/%s/medical/illnesses/%s"}"""
                    .formatted(masha, cold)));
    assertThat(sent.get(0).payload()).doesNotContain("Ибупрофен", "5 мл", ibuprofen.toString());
    assertThat(sent.get(0).ttl()).isEqualTo(Duration.ofHours(24));
    assertThat(sent.get(0).urgency()).isEqualTo(Urgency.NORMAL);
  }

  @Test
  void aSlowPushServiceDoesNotDelayTheSyncAnswer() throws Exception {
    gateway.holdSends();

    Instant start = Instant.now();
    pushApplied(boris, dose(UUID.randomUUID(), cold, ibuprofen, "5 мл", null));
    Duration answeredIn = Duration.between(start, Instant.now());
    gateway.releaseSends();

    assertThat(answeredIn).isLessThan(FakePushGateway.PATIENCE.dividedBy(2));
    assertThat(sentBefore()).extracting(FakePushGateway.Push::endpoint).containsExactly(ANNA_PHONE);
  }

  @Test
  void annasDoseIsPushedToBorisWithHerGender() throws Exception {
    pushApplied(anna, dose(UUID.randomUUID(), cold, ibuprofen, "5 мл", 38.2));

    List<FakePushGateway.Push> sent = sentBefore();
    assertThat(sent).extracting(FakePushGateway.Push::endpoint).containsExactly(BORIS_PHONE);
    assertThat(sent.get(0).payloadJson().get("actorName").asText()).isEqualTo("Анна");
    assertThat(sent.get(0).payloadJson().get("actorGrammaticalGender").asText())
        .isEqualTo("FEMININE");
  }

  @Test
  void eachDoseIsItsOwnNotification() throws Exception {
    pushApplied(
        boris,
        dose(UUID.randomUUID(), cold, ibuprofen, "5 мл", null),
        dose(UUID.randomUUID(), cold, ibuprofen, "5 мл", null));

    assertThat(sentBefore())
        .extracting(FakePushGateway.Push::endpoint)
        .containsExactly(ANNA_PHONE, ANNA_PHONE);
  }

  @Test
  void aDoseOnAMembersOwnCardSendsNothing() throws Exception {
    UUID borisCold = UUID.randomUUID();
    pushApplied(
        boris,
        illnessOf("memberId", SyncRequests.memberId(boris), borisCold, "ОРВИ"),
        dose(UUID.randomUUID(), borisCold, ibuprofen, "5 мл", null));

    assertThat(sentBefore()).isEmpty();
  }

  @Test
  void anEditOrAMoveOfADoseSendsNothing() throws Exception {
    UUID given = UUID.randomUUID();
    UUID flu = UUID.randomUUID();
    pushApplied(boris, dose(given, cold, ibuprofen, "5 мл", null));
    pushApplied(anna, illnessOf("childId", masha, flu, "Грипп"));
    sentBefore();
    gateway.reset();

    pushApplied(boris, dose(given, cold, ibuprofen, "7,5 мл", null));
    pushApplied(anna, dose(given, flu, ibuprofen, "7,5 мл", null));

    assertThat(sentBefore()).isEmpty();
  }

  @Test
  void aTemperatureSendsNothing() throws Exception {
    pushApplied(boris, temperature(UUID.randomUUID(), cold, "2026-12-02", "22:00", 38.5));

    assertThat(sentBefore()).isEmpty();
  }

  @Test
  void theNotificationsSwitchOffSilencesIt() throws Exception {
    PushSubscriptionsTest.switchNotifications(anna, false);

    pushApplied(boris, dose(UUID.randomUUID(), cold, ibuprofen, "5 мл", null));

    assertThat(sentBefore()).isEmpty();
  }

  @Test
  void aDoseIgnoredForADeletedIllnessSendsNothing() throws Exception {
    pushApplied(anna, SyncRequests.delete("illness", cold));

    SyncRequests.push(boris, dose(UUID.randomUUID(), cold, ibuprofen, "5 мл", null))
        .andExpect(jsonPath("$.results[0].status").value("ignored"));

    assertThat(sentBefore()).isEmpty();
  }

  /**
   * The pushes sent for what the test did, once they all have been: Anna logs a dose on the marker
   * Illness, and its push to Boris, sent after every earlier one, is waited for and left out.
   */
  private List<FakePushGateway.Push> sentBefore() throws Exception {
    pushApplied(anna, dose(UUID.randomUUID(), marker, ibuprofen, "5 мл", null));
    String markerUrl = PushPayloads.childIllnessUrl(masha, marker);
    FakePushGateway.Push markerPush =
        gateway.awaitPush(push -> push.payloadJson().get("url").asText().equals(markerUrl));
    List<FakePushGateway.Push> all = gateway.pushes();
    assertThat(all).last().isEqualTo(markerPush);
    return all.subList(0, all.size() - 1);
  }
}

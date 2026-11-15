package io.github.aborgatin.familyapp.notifications;

import static io.github.aborgatin.familyapp.FakePushGateway.json;
import static io.github.aborgatin.familyapp.ListOperations.add;
import static io.github.aborgatin.familyapp.ListOperations.list;
import static io.github.aborgatin.familyapp.SyncRequests.push;
import static io.github.aborgatin.familyapp.SyncRequests.pushApplied;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FakePushGateway;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.ListOperations;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.SyncRequests;
import io.github.aborgatin.familyapp.TestClock;
import io.github.aborgatin.familyapp.lists.ItemAssigned;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Notifications (spec #104 "Pending Batches", "Sending a Batch"; ticket #109): a Member's changes
 * to a List are gathered into one Batch, sent by the scheduler step once they paused for 2 minutes
 * or 10 minutes after the first one, to every other Member who sees the List. Members act through
 * the sync push; pushes are observed on the fake gateway.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({
  PostgresTestcontainer.class,
  TestClock.Config.class,
  FakePushGateway.Config.class,
  BatchesTest.FailingCommits.class
})
class BatchesTest {

  static final String ANNA_PHONE = "https://web.push.apple.com/anna-phone";
  static final String BORIS_PHONE = "https://web.push.apple.com/boris-phone";

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired FakePushGateway gateway;
  @Autowired TestClock clock;
  @Autowired SchedulerStep step;
  @Autowired FailingCommits failingCommits;

  Browser anna;
  Browser boris;
  final UUID home = UUID.randomUUID();

  @BeforeEach
  void annaAndBorisShareATodoList() throws Exception {
    FreshInstallation.reset(jdbc);
    gateway.reset();
    clock.set(Instant.now());
    anna = SyncRequests.bootstrapAnna(mvc);
    boris = SyncRequests.loginBoris(mvc, jdbc);
    for (Browser device : new Browser[] {anna, boris}) {
      PushSubscriptionsTest.switchNotifications(device, true);
    }
    PushSubscriptionsTest.subscribe(anna, ANNA_PHONE).andExpect(status().isNoContent());
    PushSubscriptionsTest.subscribe(boris, BORIS_PHONE).andExpect(status().isNoContent());
    pushApplied(anna, list(home, "Дом", "TODO", "SHARED"));
    step.run(); // nothing is pending yet
  }

  @Test
  void anItemAddedByTheOtherMemberIsSentOnceTheyPausedForTwoMinutes() throws Exception {
    pushApplied(boris, add(UUID.randomUUID(), home, "Починить кран"));

    later(Duration.ofSeconds(119));
    assertThat(gateway.pushes()).isEmpty();

    later(Duration.ofSeconds(1));
    assertThat(gateway.pushes()).hasSize(1);
    FakePushGateway.Push sent = gateway.pushes().get(0);
    assertThat(sent.endpoint()).isEqualTo(ANNA_PHONE);
    assertThat(sent.payloadJson())
        .isEqualTo(
            json(
                """
            {"type":"notification","actorName":"Борис","actorGrammaticalGender":"MASCULINE",\
            "listName":"Дом","listKind":"TODO","itemNames":["Починить кран"],"addedCount":1,\
            "assignedCount":0,"assignedItemName":null,"url":"/lists/%s"}"""
                    .formatted(home)));
    assertThat(sent.ttl()).isEqualTo(Duration.ofHours(24));
    assertThat(sent.urgency()).isEqualTo(Urgency.NORMAL);

    later(Duration.ofMinutes(5));
    assertThat(gateway.pushes()).hasSize(1);
  }

  @Test
  void aBusyMemberIsStillSentTenMinutesAfterTheirFirstChange() throws Exception {
    for (int i = 1; i <= 6; i++) {
      pushApplied(boris, add(UUID.randomUUID(), home, "Дело " + i));
      later(Duration.ofSeconds(90));
    }
    assertThat(gateway.pushes()).isEmpty(); // 9 minutes in, never quiet for 2

    pushApplied(boris, add(UUID.randomUUID(), home, "Дело 7"));
    later(Duration.ofSeconds(60));

    assertThat(gateway.pushes()).hasSize(1);
    assertThat(payload(0).get("addedCount").asInt()).isEqualTo(7);
  }

  @Test
  void manyItemsAddedInARowAreOneNotificationNamingTheFirstThree() throws Exception {
    pushApplied(
        boris,
        add(UUID.randomUUID(), home, "Молоко"),
        add(UUID.randomUUID(), home, "Хлеб"),
        add(UUID.randomUUID(), home, "Сыр"));
    later(Duration.ofSeconds(60));
    pushApplied(boris, add(UUID.randomUUID(), home, "Масло"), add(UUID.randomUUID(), home, "Яйца"));

    later(Duration.ofMinutes(2));

    assertThat(gateway.endpoints()).containsExactly(ANNA_PHONE);
    assertThat(payload(0).get("itemNames")).isEqualTo(json("[\"Молоко\",\"Хлеб\",\"Сыр\"]"));
    assertThat(payload(0).get("addedCount").asInt()).isEqualTo(5);
  }

  @Test
  void ownChangesNeverNotifyTheActor() throws Exception {
    pushApplied(anna, add(UUID.randomUUID(), home, "Полить цветы"));

    later(Duration.ofMinutes(2));

    assertThat(gateway.endpoints()).containsExactly(BORIS_PHONE);
    assertThat(payload(0).get("actorName").asText()).isEqualTo("Анна");
    assertThat(payload(0).get("actorGrammaticalGender").asText()).isEqualTo("FEMININE");
  }

  @Test
  void nothingIsSentForAPrivateList() throws Exception {
    UUID mine = UUID.randomUUID();
    pushApplied(
        boris, list(mine, "Моё", "TODO", "PRIVATE"), add(UUID.randomUUID(), mine, "Секрет"));
    // Boris adds to Anna's Shared list, and she makes it Private before it is sent.
    pushApplied(boris, add(UUID.randomUUID(), home, "Починить кран"));
    pushApplied(anna, SyncRequests.upsert("list", home, "{\"visibility\":\"PRIVATE\"}"));

    later(Duration.ofMinutes(2));

    assertThat(gateway.pushes()).isEmpty();
  }

  @Test
  void aChildListCountsAsShared() throws Exception {
    UUID masha = UUID.randomUUID();
    UUID school = UUID.randomUUID();
    pushApplied(
        anna,
        SyncRequests.upsert("child", masha, "{\"name\":\"Маша\",\"color\":\"coral\"}"),
        SyncRequests.upsert(
            "list",
            school,
            "{\"name\":\"Школа\",\"kind\":\"TODO\",\"visibility\":\"SHARED\",\"childId\":\"%s\"}"
                .formatted(masha)));

    pushApplied(boris, add(UUID.randomUUID(), school, "Купить тетради"));
    later(Duration.ofMinutes(2));

    assertThat(gateway.endpoints()).containsExactly(ANNA_PHONE);
    assertThat(payload(0).get("listName").asText()).isEqualTo("Школа");
  }

  @Test
  void itemsDeletedBeforeSendingAreLeftOutAndNothingIsSentWhenAllAreGone() throws Exception {
    UUID milk = UUID.randomUUID();
    UUID bread = UUID.randomUUID();
    UUID cheese = UUID.randomUUID();
    pushApplied(
        boris,
        add(milk, home, "Молоко"),
        add(bread, home, "Хлеб"),
        add(cheese, home, "Сыр"),
        ListOperations.done(cheese, true),
        SyncRequests.delete("item", bread));

    later(Duration.ofMinutes(2));

    assertThat(payload(0).get("itemNames")).isEqualTo(json("[\"Молоко\",\"Сыр\"]"));
    assertThat(payload(0).get("addedCount").asInt()).isEqualTo(2);

    gateway.reset();
    UUID typo = UUID.randomUUID();
    pushApplied(boris, add(typo, home, "Мролоко"), SyncRequests.delete("item", typo));
    later(Duration.ofMinutes(2));
    assertThat(gateway.pushes()).isEmpty();
  }

  @Test
  void assigningAnItemToTheOtherMemberNotifiesThem() throws Exception {
    UUID tap = UUID.randomUUID();
    pushApplied(anna, add(tap, home, "Починить кран"));
    later(Duration.ofMinutes(2));
    gateway.reset();

    pushApplied(boris, assign(tap, annaId()));
    later(Duration.ofMinutes(2));

    assertThat(gateway.endpoints()).containsExactly(ANNA_PHONE);
    assertThat(payload(0).get("itemNames")).isEqualTo(json("[]"));
    assertThat(payload(0).get("addedCount").asInt()).isZero();
    assertThat(payload(0).get("assignedCount").asInt()).isEqualTo(1);
    assertThat(payload(0).get("assignedItemName").asText()).isEqualTo("Починить кран");
  }

  @Test
  void itemsAddedAndAssignedInOneGoAreOneNotification() throws Exception {
    pushApplied(
        boris,
        add(UUID.randomUUID(), home, "Купить подарок"),
        SyncRequests.upsert(
            "item",
            UUID.randomUUID(),
            "{\"listId\":\"%s\",\"text\":\"Позвонить маме\",\"assigneeId\":\"%s\"}"
                .formatted(home, annaId())),
        SyncRequests.upsert(
            "item",
            UUID.randomUUID(),
            "{\"listId\":\"%s\",\"text\":\"Записаться к врачу\",\"assigneeId\":\"%s\"}"
                .formatted(home, annaId())));

    later(Duration.ofMinutes(2));

    assertThat(gateway.endpoints()).containsExactly(ANNA_PHONE);
    assertThat(payload(0).get("addedCount").asInt()).isEqualTo(3);
    assertThat(payload(0).get("assignedCount").asInt()).isEqualTo(2);
    assertThat(payload(0).get("assignedItemName").isNull()).isTrue();
  }

  @Test
  void anAssignmentMovedAwayBeforeSendingIsLeftOut() throws Exception {
    UUID tap = UUID.randomUUID();
    UUID gift = UUID.randomUUID();
    pushApplied(anna, add(tap, home, "Починить кран"), add(gift, home, "Купить подарок"));
    later(Duration.ofMinutes(2));
    gateway.reset();

    pushApplied(boris, assign(tap, annaId()), assign(gift, annaId()));
    pushApplied(boris, assign(tap, null), assign(gift, borisId()));
    later(Duration.ofMinutes(2));

    assertThat(gateway.pushes()).isEmpty();
  }

  @Test
  void anAssignmentPushedAgainIsNotSentAgain() throws Exception {
    UUID tap = UUID.randomUUID();
    pushApplied(anna, add(tap, home, "Починить кран"));
    later(Duration.ofMinutes(2));
    pushApplied(boris, assign(tap, annaId()));
    later(Duration.ofMinutes(2));
    gateway.reset();

    // Boris's device sends the same operation again (S3): the Assignee doesn't change.
    pushApplied(boris, assign(tap, annaId()));
    later(Duration.ofMinutes(2));

    assertThat(gateway.pushes()).isEmpty();
  }

  @Test
  void assigningYourselfIsNeverRecorded() throws Exception {
    UUID tap = UUID.randomUUID();
    pushApplied(anna, add(tap, home, "Починить кран"));
    later(Duration.ofMinutes(2));
    gateway.reset();

    pushApplied(boris, add(UUID.randomUUID(), home, "Купить лампочку"));
    later(Duration.ofSeconds(100));
    pushApplied(boris, assign(tap, borisId())); // not a change: the Batch stays quiet
    later(Duration.ofSeconds(20));

    assertThat(gateway.endpoints()).containsExactly(ANNA_PHONE);
    assertThat(payload(0).get("addedCount").asInt()).isEqualTo(1);
    assertThat(payload(0).get("assignedCount").asInt()).isZero();
  }

  @Test
  void aMemberWithTheSwitchOffGetsNothing() throws Exception {
    PushSubscriptionsTest.switchNotifications(anna, false);

    pushApplied(boris, add(UUID.randomUUID(), home, "Починить кран"));
    later(Duration.ofMinutes(2));

    assertThat(gateway.pushes()).isEmpty();
  }

  @Test
  void severalDueBatchesAreSeparatePushes() throws Exception {
    UUID shop = UUID.randomUUID();
    pushApplied(anna, list(shop, "Супермаркет", "SHOPPING", "SHARED"));
    later(Duration.ofMinutes(2));

    pushApplied(boris, add(UUID.randomUUID(), home, "Починить кран"));
    pushApplied(boris, add(UUID.randomUUID(), shop, "Молоко"));
    later(Duration.ofMinutes(2));

    assertThat(gateway.endpoints()).containsExactly(ANNA_PHONE, ANNA_PHONE);
    assertThat(
            List.of(
                payload(0).get("listName").asText() + " " + payload(0).get("listKind").asText(),
                payload(1).get("listName").asText() + " " + payload(1).get("listKind").asText()))
        .containsExactlyInAnyOrder("Дом TODO", "Супермаркет SHOPPING");
  }

  @Test
  void everyDeviceOfTheRecipientGetsItAndAGoneOneIsForgotten() throws Exception {
    String tablet = "https://web.push.apple.com/anna-tablet";
    Browser annaTablet = new Browser(mvc);
    annaTablet.openApp();
    annaTablet
        .postJson("/api/auth/login", "{\"email\":\"anna@example.com\",\"password\":\"secret123\"}")
        .andExpect(status().isOk());
    PushSubscriptionsTest.subscribe(annaTablet, tablet).andExpect(status().isNoContent());
    gateway.answer(tablet, PushResult.GONE);
    gateway.answer(ANNA_PHONE, PushResult.FAILED);

    pushApplied(boris, add(UUID.randomUUID(), home, "Починить кран"));
    later(Duration.ofMinutes(2));
    assertThat(gateway.endpoints()).containsExactlyInAnyOrder(ANNA_PHONE, tablet);

    gateway.reset();
    pushApplied(boris, add(UUID.randomUUID(), home, "Купить лампочку"));
    later(Duration.ofMinutes(2));
    // The failed push is not retried; the gone device gets nothing more.
    assertThat(gateway.endpoints()).containsExactly(ANNA_PHONE);
  }

  @Test
  void theNextOccurrenceOfARepeatingItemIsNeitherAddedNorAssigned() throws Exception {
    UUID trash = UUID.randomUUID();
    pushApplied(
        anna,
        SyncRequests.upsert(
            "item",
            trash,
            ("{\"listId\":\"%s\",\"text\":\"Вынести мусор\",\"dueDate\":\"%s\","
                    + "\"repeat\":\"WEEKLY\",\"assigneeId\":\"%s\"}")
                .formatted(home, LocalDate.ofInstant(clock.instant(), clock.getZone()), annaId())));
    later(Duration.ofMinutes(2));
    gateway.reset();

    pushApplied(boris, ListOperations.done(trash, true));
    later(Duration.ofMinutes(2));

    assertThat(gateway.pushes()).isEmpty();
  }

  @Test
  void anOperationRejectedForItsOwnInputRecordsNothing() throws Exception {
    push(
            boris,
            SyncRequests.upsert(
                "item",
                UUID.randomUUID(),
                "{\"listId\":\"%s\",\"text\":\"Починить кран\",\"assigneeId\":\"%s\"}"
                    .formatted(home, UUID.randomUUID())))
        .andExpect(jsonPath("$.results[0].status").value("rejected"));

    later(Duration.ofMinutes(10));

    assertThat(gateway.pushes()).isEmpty();
  }

  @Test
  void aPushRolledBackAfterItsEventWasRecordedRecordsNothing() throws Exception {
    UUID tap = UUID.randomUUID();
    pushApplied(anna, add(tap, home, "Починить кран"));
    later(Duration.ofMinutes(2));
    gateway.reset();

    pushApplied(boris, add(UUID.randomUUID(), home, "Купить лампочку"));
    later(Duration.ofSeconds(100));
    // The push fails as it commits, after the assignment was announced and recorded: the recording
    // rolls back with it, so the Batch stays quiet and is sent on time, without the assignment.
    failingCommits.failAssignments = true;
    push(boris, assign(tap, annaId())).andExpect(status().isInternalServerError());
    failingCommits.failAssignments = false;
    later(Duration.ofSeconds(20));

    assertThat(gateway.endpoints()).containsExactly(ANNA_PHONE);
    assertThat(payload(0).get("addedCount").asInt()).isEqualTo(1);
    assertThat(payload(0).get("assignedCount").asInt()).isZero();
  }

  /**
   * Stands for a server fault that rolls a push back as it commits (a lost connection, a failed
   * constraint): when on, every push that assigns an Item fails.
   */
  @TestConfiguration(proxyBeanMethods = false)
  static class FailingCommits {

    volatile boolean failAssignments;

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    void onItemAssigned(ItemAssigned event) {
      if (failAssignments) {
        throw new IllegalStateException("The push fails as it commits");
      }
    }
  }

  // --- helpers ---

  static String assign(UUID item, UUID assigneeId) {
    return SyncRequests.upsert(
        "item",
        item,
        assigneeId == null
            ? "{\"assigneeId\":null}"
            : "{\"assigneeId\":\"%s\"}".formatted(assigneeId));
  }

  UUID annaId() throws Exception {
    return UUID.fromString(SyncRequests.memberId(anna));
  }

  UUID borisId() throws Exception {
    return UUID.fromString(SyncRequests.memberId(boris));
  }

  /** The payload of the {@code n}th push. */
  JsonNode payload(int n) {
    return gateway.pushes().get(n).payloadJson();
  }

  /** Moves the clock on and runs the scheduler step, as the schedule would. */
  void later(Duration duration) {
    clock.set(clock.instant().plus(duration));
    step.run();
  }
}

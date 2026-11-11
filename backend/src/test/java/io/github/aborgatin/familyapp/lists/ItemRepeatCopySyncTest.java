package io.github.aborgatin.familyapp.lists;

import static io.github.aborgatin.familyapp.ListOperations.done;
import static io.github.aborgatin.familyapp.ListOperations.list;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import com.jayway.jsonpath.JsonPath;
import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.SyncRequests;
import io.github.aborgatin.familyapp.TestClock;
import java.time.Instant;
import java.time.LocalDate;
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
 * Marking a repeating todo item Done (spec #81, ticket #87, ADR-0009): the item stays Done without
 * its Repeat, and the server adds the next occurrence as a new open Item. Due dates are relative to
 * today, the server's date in the installation's time zone (the JVM's default zone, from {@code
 * TZ}), fixed by a {@link TestClock}. Two {@code Browser}s play Anna's phone and Boris's phone.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({PostgresTestcontainer.class, TestClock.Config.class})
class ItemRepeatCopySyncTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired TestClock clock;

  Browser anna;
  Browser boris;
  String annaId;
  String borisId;
  UUID chores;
  LocalDate today;

  @BeforeEach
  void annaAndBorisShareATodoList() throws Exception {
    FreshInstallation.reset(jdbc);
    anna = SyncRequests.bootstrapAnna(mvc);
    boris = SyncRequests.loginBoris(mvc, jdbc);
    annaId = SyncRequests.memberId(anna);
    borisId = SyncRequests.memberId(boris);
    chores = UUID.randomUUID();
    SyncRequests.push(anna, list(chores, "Дела по дому", "TODO", "SHARED"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));
    today = clock.setToday(LocalDate.of(2026, 3, 10));
  }

  @Test
  void tickingARepeatingItemKeepsItDoneAndAddsTheNextOccurrenceForBothMembers() throws Exception {
    UUID nursery = UUID.randomUUID();
    SyncRequests.push(
            anna,
            SyncRequests.upsert(
                "item",
                nursery,
                """
                {"listId":"%s","text":"Оплатить садик","description":"Счёт в приложении",
                 "dueDate":"%s","dueTime":"15:00","repeat":"WEEKLY","assigneeId":"%s"}
                """
                    .formatted(chores, today, borisId)))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));
    Instant tickedAt = clock.instant().plusSeconds(3600);
    clock.set(tickedAt);

    SyncRequests.push(boris, done(nursery, true))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    for (Browser device : List.of(anna, boris)) {
      assertThat(SyncRequests.fields(device, "item", nursery))
          .containsEntry("done", true)
          .containsEntry("doneById", borisId)
          .containsEntry("dueDate", today.toString())
          .containsEntry("repeat", null);
      List<Map<String, Object>> copies = copiesOf(device, nursery);
      assertThat(copies).hasSize(1);
      Map<String, Object> copy = copies.get(0);
      assertThat(UUID.fromString((String) copy.get("id"))).isNotEqualTo(nursery);
      @SuppressWarnings("unchecked") // JsonPath returns the JSON object as a Map.
      Map<String, Object> fields = (Map<String, Object>) copy.get("fields");
      assertThat(fields)
          .containsEntry("listId", chores.toString())
          .containsEntry("text", "Оплатить садик")
          .containsEntry("description", "Счёт в приложении")
          .containsEntry("dueDate", today.plusDays(7).toString())
          .containsEntry("dueTime", "15:00")
          .containsEntry("repeat", "WEEKLY")
          .containsEntry("assigneeId", borisId)
          .containsEntry("creatorId", annaId)
          .containsEntry("done", false)
          .containsEntry("doneById", null)
          .containsEntry("doneAt", null);
      assertThat(Instant.parse((String) fields.get("createdAt"))).isEqualTo(tickedAt);
    }
  }

  @Test
  void theNextDueDateIsCountedFromTheOldOneToTheFirstDayAfterToday() throws Exception {
    UUID daily = UUID.randomUUID();
    UUID weekly = UUID.randomUUID();
    UUID monthly = UUID.randomUUID();
    UUID yearly = UUID.randomUUID();
    UUID mondays = UUID.randomUUID();
    UUID longOverdue = UUID.randomUUID();
    UUID early = UUID.randomUUID();
    // The 15th of the month before last: every month has it.
    LocalDate fifteenth = today.minusMonths(2).withDayOfMonth(15);

    tick(daily, today, "DAILY");
    tick(weekly, today, "WEEKLY");
    tick(monthly, fifteenth, "MONTHLY");
    tick(yearly, today.minusYears(3).withDayOfMonth(15), "YEARLY");
    tick(mondays, today.minusDays(3), "WEEKLY");
    tick(longOverdue, today.minusDays(400), "DAILY");
    tick(early, today.plusDays(5), "DAILY");

    assertThat(nextDueDate(daily)).isEqualTo(today.plusDays(1).toString());
    assertThat(nextDueDate(weekly)).isEqualTo(today.plusDays(7).toString());
    LocalDate monthlyNext = today.getDayOfMonth() < 15 ? today : today.plusMonths(1);
    assertThat(nextDueDate(monthly)).isEqualTo(monthlyNext.withDayOfMonth(15).toString());
    LocalDate thisYears = today.withDayOfMonth(15);
    assertThat(nextDueDate(yearly))
        .isEqualTo((thisYears.isAfter(today) ? thisYears : thisYears.plusYears(1)).toString());
    // Ticked three days late: still on the same weekday, not a week from the tick.
    assertThat(nextDueDate(mondays)).isEqualTo(today.plusDays(4).toString());
    // One next occurrence however overdue, not one per missed day.
    assertThat(nextDueDate(longOverdue)).isEqualTo(today.plusDays(1).toString());
    // Ticked before it was due: one step on.
    assertThat(nextDueDate(early)).isEqualTo(today.plusDays(6).toString());
  }

  @Test
  void monthAndYearStepsLandOnTheMonthsLastDayAndGoOnFromThere() throws Exception {
    UUID monthly = UUID.randomUUID();
    UUID yearly = UUID.randomUUID();

    // 31 Jan 2025 → 28 Feb 2025 → 28 Mar 2025 → … : the 28th from then on.
    tick(monthly, LocalDate.of(2025, 1, 31), "MONTHLY");
    // 29 Feb 2024 → 28 Feb 2025 → 28 Feb 2026 → …
    tick(yearly, LocalDate.of(2024, 2, 29), "YEARLY");

    LocalDate twentyEighth = today.getDayOfMonth() < 28 ? today : today.plusMonths(1);
    assertThat(nextDueDate(monthly)).isEqualTo(twentyEighth.withDayOfMonth(28).toString());
    LocalDate february = LocalDate.of(today.getYear(), 2, 28);
    assertThat(nextDueDate(yearly))
        .isEqualTo((february.isAfter(today) ? february : february.plusYears(1)).toString());
  }

  @Test
  void anItemCreatedAlreadyDoneWithARepeatAddsTheNextOccurrence() throws Exception {
    UUID rubbish = UUID.randomUUID();

    SyncRequests.push(
            anna,
            SyncRequests.upsert(
                "item",
                rubbish,
                "{\"listId\":\"%s\",\"text\":\"Вынести мусор\",\"dueDate\":\"%s\",\"repeat\":\"WEEKLY\",\"done\":true}"
                    .formatted(chores, today)))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(SyncRequests.fields(boris, "item", rubbish))
        .containsEntry("done", true)
        .containsEntry("doneById", annaId)
        .containsEntry("repeat", null);
    assertThat(nextDueDate(rubbish)).isEqualTo(today.plusDays(7).toString());
  }

  @Test
  void aSecondTickFromTheOtherDeviceAddsNoSecondOccurrence() throws Exception {
    UUID rubbish = UUID.randomUUID();
    SyncRequests.push(
        anna,
        SyncRequests.upsert(
            "item",
            rubbish,
            "{\"listId\":\"%s\",\"text\":\"Вынести мусор\",\"dueDate\":\"%s\",\"repeat\":\"WEEKLY\"}"
                .formatted(chores, today)));

    // Both ticked it offline; Anna's phone syncs first.
    SyncRequests.push(anna, done(rubbish, true))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));
    SyncRequests.push(boris, done(rubbish, true))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(copiesOf(boris, rubbish)).hasSize(1);
    assertThat(SyncRequests.fields(boris, "item", rubbish))
        .containsEntry("done", true)
        .containsEntry("doneById", annaId)
        .containsEntry("repeat", null);
  }

  @Test
  void aRepeatGivenToADoneItemAddsNoOccurrenceWhenDoneIsSentAgain() throws Exception {
    UUID rubbish = UUID.randomUUID();
    tick(rubbish, today, "WEEKLY");

    // The server does not lock a Done item's Repeat; Done sent again is still no change.
    SyncRequests.push(
            boris, SyncRequests.upsert("item", rubbish, "{\"repeat\":\"DAILY\",\"done\":true}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(copiesOf(anna, rubbish)).hasSize(1);
    assertThat(SyncRequests.fields(anna, "item", rubbish)).containsEntry("repeat", "DAILY");
  }

  @Test
  void untickingGivesAnOrdinaryOpenItemAndTheNextOccurrenceStays() throws Exception {
    UUID rubbish = UUID.randomUUID();
    tick(rubbish, today, "WEEKLY");

    SyncRequests.push(anna, done(rubbish, false))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(SyncRequests.fields(boris, "item", rubbish))
        .containsEntry("done", false)
        .containsEntry("dueDate", today.toString())
        .containsEntry("repeat", null);
    assertThat(nextDueDate(rubbish)).isEqualTo(today.plusDays(7).toString());

    // Ticked again, it is an ordinary item: no further occurrence.
    SyncRequests.push(boris, done(rubbish, true));
    assertThat(copiesOf(anna, rubbish)).hasSize(1);
  }

  /** The Item (its text is its id) created with this Due date and Repeat, then ticked by Anna. */
  void tick(UUID id, LocalDate dueDate, String repeat) throws Exception {
    SyncRequests.push(
            anna,
            SyncRequests.upsert(
                "item",
                id,
                "{\"listId\":\"%s\",\"text\":\"%s\",\"dueDate\":\"%s\",\"repeat\":\"%s\"}"
                    .formatted(chores, id, dueDate, repeat)),
            done(id, true))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "applied")));
  }

  /** The Due date of the one next occurrence of {@code id} that Boris's pull returns. */
  @SuppressWarnings("unchecked") // JsonPath returns the JSON object as a Map.
  String nextDueDate(UUID id) throws Exception {
    List<Map<String, Object>> copies = copiesOf(boris, id);
    assertThat(copies).hasSize(1);
    return (String) ((Map<String, Object>) copies.get(0).get("fields")).get("dueDate");
  }

  /**
   * Every live Item of the list, other than {@code original}, with its text, that a first pull
   * returns.
   */
  List<Map<String, Object>> copiesOf(Browser device, UUID original) throws Exception {
    Object text = SyncRequests.fields(device, "item", original).get("text");
    String body = SyncRequests.pull(device, 0).andReturn().getResponse().getContentAsString();
    return JsonPath.read(
        body,
        "$.changes[?(@.table=='item' && @.id!='%s' && @.fields.listId=='%s' && @.fields.text=='%s')]"
            .formatted(original, chores, text));
  }
}

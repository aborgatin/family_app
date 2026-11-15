package io.github.aborgatin.familyapp.notifications;

import static io.github.aborgatin.familyapp.ListOperations.list;
import static io.github.aborgatin.familyapp.SyncRequests.pushApplied;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FakePushGateway;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.ListOperations;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.SyncRequests;
import io.github.aborgatin.familyapp.TestClock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.TimeZone;
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
 * Reminders (spec #104 "Reminders by a scheduler step"; ticket #110): a todo item's Due date
 * reminds the right Member when its moment comes, at its time or at {@code REMINDER_MORNING_TIME} on
 * the day without one (08:30 here, not the default 09:00, so the setting is seen to be read).
 * Members act through the sync push; the scheduler step runs as the schedule would, every minute;
 * pushes are observed on the fake gateway.
 */
@SpringBootTest(properties = "REMINDER_MORNING_TIME=08:30")
@AutoConfigureMockMvc
@Import({PostgresTestcontainer.class, TestClock.Config.class, FakePushGateway.Config.class})
class RemindersTest {

  static final String ANNA_PHONE = "https://web.push.apple.com/anna-phone";
  static final String BORIS_PHONE = "https://web.push.apple.com/boris-phone";

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired FakePushGateway gateway;
  @Autowired TestClock clock;
  @Autowired SchedulerStep step;

  Browser anna;
  Browser boris;
  final UUID home = UUID.randomUUID();
  LocalDate today;

  @BeforeEach
  void annaAndBorisShareATodoListAtSevenInTheMorning() throws Exception {
    FreshInstallation.reset(jdbc);
    gateway.reset();
    today = LocalDate.now(clock.getZone());
    clock.set(at(today, "07:00"));
    anna = SyncRequests.bootstrapAnna(mvc);
    boris = SyncRequests.loginBoris(mvc, jdbc);
    for (Browser device : new Browser[] {anna, boris}) {
      PushSubscriptionsTest.switchNotifications(device, true);
    }
    PushSubscriptionsTest.subscribe(anna, ANNA_PHONE).andExpect(status().isNoContent());
    PushSubscriptionsTest.subscribe(boris, BORIS_PHONE).andExpect(status().isNoContent());
    pushApplied(anna, list(home, "Дом", "TODO", "SHARED"));
    step.run(); // the previous step, at 07:00
  }

  @Test
  void anUnassignedItemOnASharedListRemindsBothMembersAtItsTime() throws Exception {
    UUID tap = due(home, "Починить кран", today, "18:00");

    runEveryMinuteUntil(at(today, "17:59"));
    assertThat(reminders()).isEmpty();

    runEveryMinuteUntil(at(today, "18:00"));
    assertThat(endpoints(reminders())).containsExactlyInAnyOrder(ANNA_PHONE, BORIS_PHONE);
    for (FakePushGateway.Push sent : reminders()) {
      assertThat(json(sent.payload()))
          .isEqualTo(
              json(
                  """
              {"type":"reminder","itemName":"Починить кран","listName":"Дом",\
              "dueDate":"%s","dueTime":"18:00","url":"/lists/%s/items/%s"}"""
                      .formatted(today, home, tap)));
      assertThat(sent.ttl()).isEqualTo(Duration.ofHours(24));
      assertThat(sent.urgency()).isEqualTo(Urgency.HIGH);
    }
  }

  @Test
  void aDueDateWithoutATimeRemindsAtTheConfiguredMorningTime() throws Exception {
    due(home, "Позвонить маме", today, null);

    runEveryMinuteUntil(at(today, "08:29"));
    assertThat(reminders()).isEmpty();

    runEveryMinuteUntil(at(today, "08:30"));
    assertThat(endpoints(reminders())).containsExactlyInAnyOrder(ANNA_PHONE, BORIS_PHONE);
    assertThat(payload(reminders().get(0)).get("dueDate").asText()).isEqualTo(today.toString());
    assertThat(payload(reminders().get(0)).get("dueTime").isNull()).isTrue();
  }

  @Test
  void anAssignedItemRemindsTheAssigneeAlone() throws Exception {
    pushApplied(
        anna,
        SyncRequests.upsert(
            "item",
            UUID.randomUUID(),
            dueFields(home, "Забрать посылку", today, "10:00")
                .replace("}", ",\"assigneeId\":\"%s\"}".formatted(SyncRequests.memberId(boris)))));

    stepAt(at(today, "10:00"));

    assertThat(endpoints(reminders())).containsExactly(BORIS_PHONE);
  }

  @Test
  void aPrivateListRemindsItsOwnerAlone() throws Exception {
    UUID mine = UUID.randomUUID();
    UUID secret = UUID.randomUUID();
    pushApplied(
        boris,
        list(mine, "Моё", "TODO", "PRIVATE"),
        SyncRequests.upsert("item", secret, dueFields(mine, "Подарок Анне", today, "10:00")));

    stepAt(at(today, "10:00"));

    assertThat(endpoints(reminders())).containsExactly(BORIS_PHONE);
    assertThat(payload(reminders().get(0)).get("listName").asText()).isEqualTo("Моё");
  }

  @Test
  void aMemberWithTheSwitchOffGetsNoReminders() throws Exception {
    PushSubscriptionsTest.switchNotifications(anna, false);
    due(home, "Починить кран", today, "10:00");

    stepAt(at(today, "10:00"));

    assertThat(endpoints(reminders())).containsExactly(BORIS_PHONE);
  }

  @Test
  void aDueDateRemindsOnceAndAgainWhenMovedToALaterMoment() throws Exception {
    UUID tap = due(home, "Починить кран", today, "10:00");
    UUID gift = due(home, "Купить подарок", today, "11:00");
    // Moved before its moment: it reminds at the new one only.
    pushApplied(anna, SyncRequests.upsert("item", gift, "{\"dueTime\":\"13:00\"}"));

    runEveryMinuteUntil(at(today, "12:00"));
    assertThat(endpoints(reminders())).containsExactlyInAnyOrder(ANNA_PHONE, BORIS_PHONE);
    assertThat(payload(reminders().get(0)).get("itemName").asText()).isEqualTo("Починить кран");

    // Moved after it reminded: it reminds again at the new moment.
    gateway.reset();
    pushApplied(anna, SyncRequests.upsert("item", tap, "{\"dueTime\":\"14:00\"}"));
    runEveryMinuteUntil(at(today, "13:00"));
    assertThat(endpoints(reminders())).containsExactlyInAnyOrder(ANNA_PHONE, BORIS_PHONE);
    assertThat(payload(reminders().get(0)).get("itemName").asText()).isEqualTo("Купить подарок");

    gateway.reset();
    runEveryMinuteUntil(at(today, "14:00"));
    assertThat(endpoints(reminders())).containsExactlyInAnyOrder(ANNA_PHONE, BORIS_PHONE);
    assertThat(payload(reminders().get(0)).get("dueTime").asText()).isEqualTo("14:00");

    gateway.reset();
    runEveryMinuteUntil(at(today, "16:00"));
    assertThat(reminders()).isEmpty();
  }

  @Test
  void anItemDoneBeforeItsMomentGetsNoReminder() throws Exception {
    UUID tap = due(home, "Починить кран", today, "10:00");
    stepAt(at(today, "09:30"));
    pushApplied(boris, ListOperations.done(tap, true));

    stepAt(at(today, "10:00"));

    assertThat(reminders()).isEmpty();
  }

  @Test
  void aDueDateSetToAMomentAlreadyPastGetsNoReminder() throws Exception {
    stepAt(at(today, "10:00"));
    due(home, "Сегодня утром", today, null); // 08:30
    due(home, "В восемь", today, "08:00");
    due(home, "Вчера", today.minusDays(1), "18:00");
    UUID later = due(home, "Позже", today, "11:00");
    pushApplied(anna, SyncRequests.upsert("item", later, "{\"dueTime\":\"09:30\"}"));

    runEveryMinuteUntil(at(today, "23:59"));

    assertThat(reminders()).isEmpty();
  }

  @Test
  void theNextOccurrenceOfARepeatingItemRemindsAtItsOwnDueDate() throws Exception {
    UUID trash = UUID.randomUUID();
    pushApplied(
        anna,
        SyncRequests.upsert(
            "item",
            trash,
            dueFields(home, "Вынести мусор", today, "10:00")
                .replace("}", ",\"repeat\":\"DAILY\"}")));
    stepAt(at(today, "10:00"));
    pushApplied(anna, ListOperations.done(trash, true));
    gateway.reset();

    LocalDate tomorrow = today.plusDays(1);
    stepAt(at(tomorrow, "09:59"));
    assertThat(reminders()).isEmpty();
    stepAt(at(tomorrow, "10:00"));

    assertThat(endpoints(reminders())).containsExactlyInAnyOrder(ANNA_PHONE, BORIS_PHONE);
    JsonNode copy = payload(reminders().get(0));
    assertThat(copy.get("itemName").asText()).isEqualTo("Вынести мусор");
    assertThat(copy.get("dueDate").asText()).isEqualTo(tomorrow.toString());
    assertThat(copy.get("url").asText())
        .startsWith("/lists/%s/items/".formatted(home))
        .doesNotContain(trash.toString());
  }

  @Test
  void afterDowntimeRemindersOfTheLast24HoursAreSentAndOlderOnesDropped() throws Exception {
    due(home, "Больше суток назад", today, "10:00");
    UUID done = due(home, "Уже сделано", today, "13:00");
    due(home, "Меньше суток назад", today, "14:00");
    due(home, "Сегодня утром", today.plusDays(1), null);
    pushApplied(boris, ListOperations.done(done, true));

    // The server is down from 07:00 until 11:30 the next day.
    stepAt(at(today.plusDays(1), "11:30"));

    assertThat(
            reminders().stream()
                .map(sent -> payload(sent).get("itemName").asText())
                .distinct()
                .toList())
        .containsExactlyInAnyOrder("Меньше суток назад", "Сегодня утром");
    assertThat(reminders()).hasSize(4);
  }

  @Test
  void dueMomentsAreInTheInstallationsTimeZone() throws Exception {
    // TZ sets the JVM's default zone (deployment.md); one far from any test machine's.
    ZoneId kiritimati = ZoneId.of("Pacific/Kiritimati");
    TimeZone installation = TimeZone.getDefault();
    TimeZone.setDefault(TimeZone.getTimeZone(kiritimati));
    try {
      LocalDateTime threeHoursOn =
          LocalDateTime.ofInstant(clock.instant().plus(Duration.ofHours(3)), kiritimati);
      due(
          home,
          "Починить кран",
          threeHoursOn.toLocalDate(),
          threeHoursOn.toLocalTime().format(DateTimeFormatter.ofPattern("HH:mm")));
      Instant moment = threeHoursOn.atZone(kiritimati).toInstant();

      stepAt(moment.minus(Duration.ofMinutes(1)));
      assertThat(reminders()).isEmpty();
      stepAt(moment);

      assertThat(endpoints(reminders())).containsExactlyInAnyOrder(ANNA_PHONE, BORIS_PHONE);
    } finally {
      TimeZone.setDefault(installation);
    }
  }

  @Test
  void noRemindersAreSentBeforeTheFirstStepEverRan() throws Exception {
    // A new database, or the first start after V17: no step has run yet.
    FreshInstallation.neverRanTheSchedulerStep(jdbc);
    due(home, "Ещё до первого шага", today, "06:30");

    stepAt(at(today, "07:01"));
    assertThat(reminders()).isEmpty();

    // From then on the window starts at the first step.
    due(home, "После первого шага", today, "07:30");
    stepAt(at(today, "07:30"));
    assertThat(reminders())
        .extracting(sent -> payload(sent).get("itemName").asText())
        .containsOnly("После первого шага");
  }

  // --- helpers ---

  /** Moves the clock to {@code at} and runs the step once, as the first run after a pause. */
  void stepAt(Instant at) {
    clock.set(at);
    step.run();
  }

  static JsonNode payload(FakePushGateway.Push sent) {
    try {
      return json(sent.payload());
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  /** The Reminders pushed so far (the Notifications about Anna's additions left out). */
  List<FakePushGateway.Push> reminders() throws Exception {
    List<FakePushGateway.Push> reminders = new ArrayList<>();
    for (FakePushGateway.Push sent : gateway.pushes()) {
      if (json(sent.payload()).get("type").asText().equals("reminder")) {
        reminders.add(sent);
      }
    }
    return reminders;
  }

  static List<String> endpoints(List<FakePushGateway.Push> pushes) {
    return pushes.stream().map(FakePushGateway.Push::endpoint).toList();
  }

  /** Adds an open item to the List, due on {@code day} at {@code time} ({@code null}: no time). */
  UUID due(UUID listId, String text, LocalDate day, String time) throws Exception {
    UUID id = UUID.randomUUID();
    pushApplied(anna, SyncRequests.upsert("item", id, dueFields(listId, text, day, time)));
    return id;
  }

  static String dueFields(UUID listId, String text, LocalDate day, String time) {
    String dueTime = time == null ? "" : ",\"dueTime\":\"%s\"".formatted(time);
    return "{\"listId\":\"%s\",\"text\":\"%s\",\"dueDate\":\"%s\"%s}"
        .formatted(listId, text, day, dueTime);
  }

  /** Moves the clock on a minute at a time up to {@code until}, running the step each minute. */
  void runEveryMinuteUntil(Instant until) {
    while (clock.instant().isBefore(until)) {
      Instant next = clock.instant().plus(Duration.ofMinutes(1));
      clock.set(next.isAfter(until) ? until : next);
      step.run();
    }
  }

  Instant at(LocalDate day, String time) {
    return LocalDateTime.of(day, LocalTime.parse(time)).atZone(clock.getZone()).toInstant();
  }

  static JsonNode json(String text) throws Exception {
    return new ObjectMapper().readTree(text);
  }
}

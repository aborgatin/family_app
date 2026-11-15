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
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.SyncRequests;
import io.github.aborgatin.familyapp.TestClock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
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
 * Reminders (spec #104 "Reminders by a scheduler step"; ticket #110): a todo item's Due date
 * reminds the right Member when its moment comes, at its time or at 09:00 on the day without one.
 * Members act through the sync push; the scheduler step runs as the schedule would, every minute;
 * pushes are observed on the fake gateway.
 */
@SpringBootTest
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

  // --- helpers ---

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

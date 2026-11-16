package io.github.aborgatin.familyapp.notifications;

import io.github.aborgatin.familyapp.notifications.announcement.Announcements;
import io.github.aborgatin.familyapp.notifications.batch.Batches;
import io.github.aborgatin.familyapp.notifications.reminder.Reminders;
import io.github.aborgatin.familyapp.notifications.schedule.StepRuns;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The scheduler step (spec #104 "One scheduler step"): sends the due Batches as Notifications, the
 * due Reminders and the new Announcements (spec #120). A Spring schedule runs it every minute in
 * production ({@code SchedulerConfig}); tests call {@link #run()} directly with a {@code
 * TestClock}.
 */
@Service
public class SchedulerStep {

  private static final Logger log = LoggerFactory.getLogger(SchedulerStep.class);

  private final Batches batches;
  private final Reminders reminders;
  private final Announcements announcements;
  private final StepRuns runs;
  private final Pushes pushes;
  private final TransactionTemplate transaction;
  private final Clock clock;

  SchedulerStep(
      Batches batches,
      Reminders reminders,
      Announcements announcements,
      StepRuns runs,
      Pushes pushes,
      TransactionTemplate transaction,
      Clock clock) {
    this.batches = batches;
    this.reminders = reminders;
    this.announcements = announcements;
    this.runs = runs;
    this.pushes = pushes;
    this.transaction = transaction;
    this.clock = clock;
  }

  /**
   * Runs one step: in one transaction, records this run's time, takes the due Batches out of the
   * database, finds the Reminders due since the previous run (none before the first run ever, so a
   * new database or an upgrade sends no old ones) and records the catalog's new Announcements (on
   * the first run ever, recorded but not sent); then sends them outside it, Notifications first,
   * then Reminders, then Announcements in catalog order, one push per recipient and message.
   */
  public void run() {
    Instant now = clock.instant();
    List<PushMessage> due =
        transaction.execute(
            status -> {
              Optional<Instant> previous = runs.replaceLastRun(now);
              List<PushMessage> messages = new ArrayList<>(batches.takeDue(now));
              previous.ifPresent(after -> messages.addAll(reminders.due(after, now)));
              List<PushMessage> announcementPushes = announcements.takeNew(now);
              if (previous.isPresent()) {
                messages.addAll(announcementPushes);
              }
              return messages;
            });
    for (PushMessage message : due) {
      send(message);
    }
  }

  /** One push; a failure costs only this one, logged and not retried. */
  private void send(PushMessage message) {
    try {
      pushes.sendTo(message.recipientId(), message.payload(), message.ttl(), message.urgency());
    } catch (RuntimeException e) {
      log.warn("A push to Member {} failed; it is not retried", message.recipientId(), e);
    }
  }
}

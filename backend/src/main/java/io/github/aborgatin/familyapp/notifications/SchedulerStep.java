package io.github.aborgatin.familyapp.notifications;

import io.github.aborgatin.familyapp.notifications.batch.Batches;
import io.github.aborgatin.familyapp.notifications.reminder.Reminders;
import io.github.aborgatin.familyapp.notifications.schedule.StepRuns;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The scheduler step (spec #104 "One scheduler step"): sends the due Batches as Notifications and
 * the due Reminders. A Spring schedule runs it every minute in production ({@code
 * SchedulerConfig}); tests call {@link #run()} directly with a {@code TestClock}.
 */
@Service
public class SchedulerStep {

  private static final Logger log = LoggerFactory.getLogger(SchedulerStep.class);

  /** How long a push service keeps a Notification or Reminder for a device that is offline. */
  static final Duration TTL = Duration.ofHours(24);

  private final Batches batches;
  private final Reminders reminders;
  private final StepRuns runs;
  private final Pushes pushes;
  private final TransactionTemplate transaction;
  private final Clock clock;

  SchedulerStep(
      Batches batches,
      Reminders reminders,
      StepRuns runs,
      Pushes pushes,
      TransactionTemplate transaction,
      Clock clock) {
    this.batches = batches;
    this.reminders = reminders;
    this.runs = runs;
    this.pushes = pushes;
    this.transaction = transaction;
    this.clock = clock;
  }

  /**
   * Runs one step: in one transaction, records this run's time, takes the due Batches out of the
   * database and finds the Reminders due since the previous run (none before the first run ever, so
   * a new database or an upgrade sends no old ones); then sends them outside it, Notifications
   * first, one push per recipient and Batch or Reminder.
   */
  public void run() {
    Instant now = clock.instant();
    List<PushMessage> due =
        transaction.execute(
            status -> {
              Optional<Instant> previous = runs.replaceLastRun(now);
              List<PushMessage> messages = new ArrayList<>(batches.takeDue(now));
              previous.ifPresent(after -> messages.addAll(reminders.due(after, now)));
              return messages;
            });
    for (PushMessage message : due) {
      send(message);
    }
  }

  /** One push; a failure costs only this one, logged and not retried. */
  private void send(PushMessage message) {
    try {
      pushes.sendTo(message.recipientId(), message.payload(), TTL, message.urgency());
    } catch (RuntimeException e) {
      log.warn("A push to Member {} failed; it is not retried", message.recipientId(), e);
    }
  }
}

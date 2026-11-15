package io.github.aborgatin.familyapp.notifications;

import io.github.aborgatin.familyapp.notifications.batch.Batches;
import io.github.aborgatin.familyapp.notifications.schedule.StepRuns;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The scheduler step (spec #104 "One scheduler step"): sends the due Batches as Notifications. A
 * Spring schedule runs it every minute in production ({@code SchedulerConfig}); tests call {@link
 * #run()} directly with a {@code TestClock}.
 */
@Service
public class SchedulerStep {

  /** How long a push service keeps a Notification for a device that is offline. */
  static final Duration TTL = Duration.ofHours(24);

  private final Batches batches;
  private final StepRuns runs;
  private final Pushes pushes;
  private final TransactionTemplate transaction;
  private final Clock clock;

  SchedulerStep(
      Batches batches, StepRuns runs, Pushes pushes, TransactionTemplate transaction, Clock clock) {
    this.batches = batches;
    this.runs = runs;
    this.pushes = pushes;
    this.transaction = transaction;
    this.clock = clock;
  }

  /**
   * Runs one step: takes the due Batches out of the database and records this run's time in one
   * transaction, then sends, one push per recipient and Batch, outside it.
   */
  public void run() {
    Instant now = clock.instant();
    List<Batches.Notification> notifications =
        transaction.execute(
            status -> {
              runs.ranAt(now);
              return batches.takeDue(now);
            });
    for (Batches.Notification notification : notifications) {
      pushes.sendTo(notification.recipientId(), notification.payload(), TTL, Urgency.NORMAL);
    }
  }
}

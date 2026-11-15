package io.github.aborgatin.familyapp.notifications.batch;

import io.github.aborgatin.familyapp.lists.ItemAdded;
import io.github.aborgatin.familyapp.lists.ItemAssigned;
import io.github.aborgatin.familyapp.lists.ItemSummary;
import io.github.aborgatin.familyapp.lists.Lists;
import java.time.Clock;
import java.util.Objects;
import java.util.Set;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Records the {@code lists} events into the pending Batch of (actor, List), synchronously, inside
 * the push operation: a rejected or rolled-back operation records nothing (spec #104).
 */
@Component
class BatchRecorder {

  private final PendingBatches batches;
  private final Lists lists;
  private final Clock clock;

  BatchRecorder(PendingBatches batches, Lists lists, Clock clock) {
    this.batches = batches;
    this.lists = lists;
    this.clock = clock;
  }

  @EventListener
  void onItemAdded(ItemAdded event) {
    batches.record(
        event.byMemberId(),
        event.listId(),
        new PendingBatches.Entry(event.itemId(), true, null),
        clock.instant());
  }

  /** Assigning yourself is never recorded. */
  @EventListener
  void onItemAssigned(ItemAssigned event) {
    if (event.assigneeId().equals(event.byMemberId())) {
      return;
    }
    // The Item was just saved by the same operation.
    ItemSummary item =
        Objects.requireNonNull(lists.items(Set.of(event.itemId())).get(event.itemId()));
    batches.record(
        event.byMemberId(),
        item.listId(),
        new PendingBatches.Entry(event.itemId(), false, event.assigneeId()),
        clock.instant());
  }
}

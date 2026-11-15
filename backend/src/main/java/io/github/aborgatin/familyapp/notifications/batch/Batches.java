package io.github.aborgatin.familyapp.notifications.batch;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.github.aborgatin.familyapp.family.MemberSummary;
import io.github.aborgatin.familyapp.family.Members;
import io.github.aborgatin.familyapp.lists.ItemSummary;
import io.github.aborgatin.familyapp.lists.ListKind;
import io.github.aborgatin.familyapp.lists.ListSummary;
import io.github.aborgatin.familyapp.lists.Lists;
import io.github.aborgatin.familyapp.lists.Visibility;
import io.github.aborgatin.familyapp.notifications.push.PushPayloads;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Turns the due pending Batches into Notifications (spec #104 "Sending a Batch"). Everything is
 * decided now, at send time: who sees the List, which Items still exist, who is still their
 * Assignee.
 */
@Service
public class Batches {

  /** How many added Items a Notification names. */
  static final int NAMED_ITEMS = 3;

  /** A Notification for one recipient: the push payload, JSON. */
  public record Notification(UUID recipientId, String payload) {}

  /**
   * The push payload of a Notification, as the service worker reads it ({@code pushPayload.ts}).
   */
  record NotificationPayload(
      String actorName,
      String actorGrammaticalGender,
      String listName,
      ListKind listKind,
      List<String> itemNames,
      int addedCount,
      int assignedCount,
      @Nullable String assignedItemName,
      String url) {

    @JsonProperty
    String type() {
      return "notification";
    }
  }

  private final PendingBatches batches;
  private final Lists lists;
  private final Members members;
  private final PushPayloads payloads;

  Batches(PendingBatches batches, Lists lists, Members members, PushPayloads payloads) {
    this.batches = batches;
    this.lists = lists;
    this.members = members;
    this.payloads = payloads;
  }

  /**
   * Takes the Batches due at {@code now} out of the pending ones and returns their Notifications,
   * one per recipient and Batch, in the caller's transaction (the sending happens after it).
   */
  @Transactional(propagation = Propagation.MANDATORY)
  public List<Notification> takeDue(Instant now) {
    List<Notification> notifications = new ArrayList<>();
    for (PendingBatches.Batch batch : batches.takeDue(now)) {
      notifications.addAll(notifications(batch));
    }
    return notifications;
  }

  private List<Notification> notifications(PendingBatches.Batch batch) {
    Optional<ListSummary> found = lists.find(batch.listId());
    Optional<MemberSummary> actor = members.byId(batch.actorId());
    if (found.isEmpty() || actor.isEmpty() || found.get().visibility() == Visibility.PRIVATE) {
      return List.of();
    }
    ListSummary list = found.get();
    Map<UUID, ItemSummary> items =
        lists.items(batch.items().stream().map(PendingBatches.Entry::itemId).toList());
    List<String> added =
        batch.items().stream()
            .filter(entry -> entry.added() && items.containsKey(entry.itemId()))
            .map(entry -> items.get(entry.itemId()).name())
            .toList();
    List<Notification> notifications = new ArrayList<>();
    for (UUID recipient : list.seenBy()) {
      if (recipient.equals(batch.actorId())) {
        continue;
      }
      List<String> assigned =
          batch.items().stream()
              .filter(entry -> recipient.equals(entry.assigneeId()))
              .map(entry -> items.get(entry.itemId()))
              .filter(item -> item != null && recipient.equals(item.assigneeId()))
              .map(ItemSummary::name)
              .toList();
      if (added.isEmpty() && assigned.isEmpty()) {
        continue;
      }
      NotificationPayload payload =
          new NotificationPayload(
              actor.get().displayName(),
              actor.get().grammaticalGender(),
              list.name(),
              list.kind(),
              added.stream().limit(NAMED_ITEMS).toList(),
              added.size(),
              assigned.size(),
              assigned.size() == 1 ? assigned.get(0) : null,
              "/lists/" + list.id());
      notifications.add(new Notification(recipient, payloads.write(payload)));
    }
    return notifications;
  }
}

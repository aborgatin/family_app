package io.github.aborgatin.familyapp.notifications.reminder;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.aborgatin.familyapp.lists.DueItem;
import io.github.aborgatin.familyapp.lists.ListSummary;
import io.github.aborgatin.familyapp.lists.Lists;
import io.github.aborgatin.familyapp.notifications.push.NotificationsProperties;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Reminders due in a scheduler step's window (spec #104 "Reminders by a scheduler step"): the
 * open todo items whose due moment is after the previous step and at or before now. There are no
 * per-Item jobs, so each Due date falls into exactly one window: a moved one fires again at its new
 * moment, and one set to a moment already past never fires.
 */
@Service
public class Reminders {

  /** How far back a step reaches after downtime: older Reminders are dropped. */
  static final Duration CATCH_UP = Duration.ofHours(24);

  private static final DateTimeFormatter HOURS_MINUTES = DateTimeFormatter.ofPattern("HH:mm");

  /** A Reminder for one recipient: the push payload, JSON. */
  public record Reminder(UUID recipientId, String payload) {}

  /** The push payload of a Reminder, as the service worker reads it ({@code pushPayload.ts}). */
  record ReminderPayload(
      String type,
      String itemName,
      String listName,
      String dueDate,
      @Nullable String dueTime,
      String url) {}

  private final Lists lists;
  private final NotificationsProperties properties;
  private final ObjectMapper json;

  Reminders(Lists lists, NotificationsProperties properties, ObjectMapper json) {
    this.lists = lists;
    this.properties = properties;
    this.json = json;
  }

  /**
   * The Reminders whose moment came after the previous step (at most {@link #CATCH_UP} before
   * {@code now}) and at or before {@code now}, one per recipient and item, in the caller's
   * transaction. Nothing before the first step ever ran.
   */
  @Transactional(propagation = Propagation.MANDATORY)
  public List<Reminder> due(Optional<Instant> previousStep, Instant now) {
    if (previousStep.isEmpty()) {
      return List.of();
    }
    Instant oldest = now.minus(CATCH_UP);
    Instant after = previousStep.get().isBefore(oldest) ? oldest : previousStep.get();
    List<Reminder> reminders = new ArrayList<>();
    for (DueItem item : lists.dueBetween(after, now, properties.reminderMorningTime())) {
      Optional<ListSummary> list = lists.find(item.listId());
      if (list.isEmpty()) {
        continue;
      }
      String payload = write(payload(item, list.get()));
      for (UUID recipient : recipients(item, list.get())) {
        reminders.add(new Reminder(recipient, payload));
      }
    }
    return reminders;
  }

  /** The Assignee alone, otherwise everyone who sees the List. */
  private static List<UUID> recipients(DueItem item, ListSummary list) {
    return item.assigneeId() != null ? List.of(item.assigneeId()) : list.seenBy();
  }

  private static ReminderPayload payload(DueItem item, ListSummary list) {
    return new ReminderPayload(
        "reminder",
        item.name(),
        list.name(),
        item.dueDate().toString(),
        item.dueTime() == null ? null : item.dueTime().format(HOURS_MINUTES),
        "/lists/" + list.id() + "/items/" + item.itemId());
  }

  private String write(ReminderPayload payload) {
    try {
      return json.writeValueAsString(payload);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("A Reminder payload is always JSON", e);
    }
  }
}

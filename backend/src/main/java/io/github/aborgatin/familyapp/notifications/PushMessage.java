package io.github.aborgatin.familyapp.notifications;

import java.time.Duration;
import java.util.UUID;

/**
 * A push message for one recipient (GLOSSARY): a Notification, a Reminder or an Announcement, its
 * payload the JSON the service worker reads ({@code pushPayload.ts}), with the Web Push urgency and
 * the TTL (how long a push service keeps it for a device that is offline) it is sent with.
 */
public record PushMessage(UUID recipientId, String payload, Urgency urgency, Duration ttl) {

  /** The TTL of a Notification or a Reminder: news a day old is no longer worth showing. */
  static final Duration TTL_DAY = Duration.ofHours(24);

  /** The TTL of an Announcement: a phone off for a few days still gets it. */
  static final Duration TTL_WEEK = Duration.ofDays(7);

  /** A Notification: a Batch of another Member's changes. */
  public static PushMessage notification(UUID recipientId, String payload) {
    return new PushMessage(recipientId, payload, Urgency.NORMAL, TTL_DAY);
  }

  /** A Reminder: a todo item's Due date has come. */
  public static PushMessage reminder(UUID recipientId, String payload) {
    return new PushMessage(recipientId, payload, Urgency.HIGH, TTL_DAY);
  }

  /** An Announcement: an entry of the catalog, new in the app. */
  public static PushMessage announcement(UUID recipientId, String payload) {
    return new PushMessage(recipientId, payload, Urgency.NORMAL, TTL_WEEK);
  }
}

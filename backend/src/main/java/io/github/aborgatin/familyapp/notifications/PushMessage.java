package io.github.aborgatin.familyapp.notifications;

import java.util.UUID;

/**
 * A push message for one recipient (GLOSSARY): a Notification ({@link Urgency#NORMAL}) or a
 * Reminder ({@link Urgency#HIGH}), its payload the JSON the service worker reads ({@code
 * pushPayload.ts}).
 */
public record PushMessage(UUID recipientId, String payload, Urgency urgency) {

  /** A Notification: a Batch of another Member's changes. */
  public static PushMessage notification(UUID recipientId, String payload) {
    return new PushMessage(recipientId, payload, Urgency.NORMAL);
  }

  /** A Reminder: a todo item's Due date has come. */
  public static PushMessage reminder(UUID recipientId, String payload) {
    return new PushMessage(recipientId, payload, Urgency.HIGH);
  }
}

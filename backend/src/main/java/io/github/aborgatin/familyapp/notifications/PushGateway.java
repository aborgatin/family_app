package io.github.aborgatin.familyapp.notifications;

import java.time.Duration;

/**
 * Sends one push message to one browser subscription (spec #104, "Push gateway"). The real one
 * talks Web Push with VAPID to the browser's push service; tests put a fake in its place.
 */
public interface PushGateway {

  /**
   * Sends {@code payload} (JSON) to the subscription, kept by the push service for at most {@code
   * ttl}. {@code GONE}: the subscription no longer exists (404/410) and should be forgotten; {@code
   * FAILED}: anything else that went wrong. Never throws.
   */
  PushResult send(PushSubscription subscription, String payload, Duration ttl, Urgency urgency);
}

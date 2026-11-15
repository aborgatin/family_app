package io.github.aborgatin.familyapp.notifications;

/**
 * A browser's push subscription, as {@code PushSubscription.toJSON()} gives it: the push service
 * URL and the two keys (base64url) the payload is encrypted with.
 */
public record PushSubscription(String endpoint, String p256dh, String auth) {}

package io.github.aborgatin.familyapp.notifications.push;

import io.github.aborgatin.familyapp.error.FieldErrors;
import io.github.aborgatin.familyapp.notifications.PushSubscription;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.Base64;
import java.util.Locale;
import org.springframework.lang.Nullable;

/**
 * The body of {@code POST} and {@code DELETE /api/push/subscriptions}: the browser's {@code
 * PushSubscription.toJSON()}, {@code {endpoint, expirationTime, keys: {p256dh, auth}}} ({@code
 * expirationTime} is ignored). Field codes: {@code required}, {@code too_long}, {@code
 * value.invalid} on {@code endpoint}, {@code keys.p256dh} and {@code keys.auth}.
 */
record SubscriptionRequest(@Nullable String endpoint, @Nullable Keys keys) {

  static final int MAX_ENDPOINT_LENGTH = 2048;
  private static final int P256DH_BYTES = 65; // an uncompressed P-256 point: 0x04, x, y
  private static final int AUTH_BYTES = 16;

  record Keys(@Nullable String p256dh, @Nullable String auth) {}

  /** The whole subscription, for {@code POST}, or {@code 400 validation.failed}. */
  PushSubscription validate() {
    FieldErrors errors = new FieldErrors();
    String validEndpoint = checkEndpoint(errors);
    String p256dh = keys == null ? null : keys.p256dh();
    String auth = keys == null ? null : keys.auth();
    if (required("keys.p256dh", p256dh, errors)) {
      byte[] point = base64Url(p256dh);
      if (point == null || point.length != P256DH_BYTES || point[0] != 0x04) {
        errors.add("keys.p256dh", FieldErrors.VALUE_INVALID);
      }
    }
    if (required("keys.auth", auth, errors)) {
      byte[] secret = base64Url(auth);
      if (secret == null || secret.length != AUTH_BYTES) {
        errors.add("keys.auth", FieldErrors.VALUE_INVALID);
      }
    }
    errors.throwIfAny();
    return new PushSubscription(validEndpoint, p256dh, auth);
  }

  /** Only the endpoint, for {@code DELETE}, or {@code 400 validation.failed}. */
  String validateEndpoint() {
    FieldErrors errors = new FieldErrors();
    String validEndpoint = checkEndpoint(errors);
    errors.throwIfAny();
    return validEndpoint;
  }

  /** An absolute {@code https} URL with a host: the server sends requests to it. */
  @Nullable
  private String checkEndpoint(FieldErrors errors) {
    if (!required("endpoint", endpoint, errors)) {
      return null;
    }
    if (endpoint.length() > MAX_ENDPOINT_LENGTH) {
      errors.add("endpoint", FieldErrors.TOO_LONG);
      return null;
    }
    try {
      URI uri = new URI(endpoint);
      if (uri.getScheme() != null
          && uri.getScheme().toLowerCase(Locale.ROOT).equals("https")
          && uri.getHost() != null) {
        return endpoint;
      }
    } catch (URISyntaxException e) {
      // value.invalid below
    }
    errors.add("endpoint", FieldErrors.VALUE_INVALID);
    return null;
  }

  private static boolean required(String field, @Nullable String value, FieldErrors errors) {
    if (value == null || value.isBlank()) {
      errors.add(field, FieldErrors.REQUIRED);
      return false;
    }
    return true;
  }

  /** Base64url with or without padding, as browsers give it; {@code null} when it is not. */
  @Nullable
  private static byte[] base64Url(String value) {
    try {
      return Base64.getUrlDecoder().decode(value);
    } catch (IllegalArgumentException e) {
      return null;
    }
  }
}

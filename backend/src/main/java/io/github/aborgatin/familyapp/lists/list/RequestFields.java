package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.error.FieldErrors;
import io.github.aborgatin.familyapp.sync.Operation;
import java.util.Objects;
import java.util.UUID;
import org.springframework.lang.Nullable;

/**
 * The field checks the Lists, Categories and Items share: a name, an ordering key, and the ids an
 * operation names. Each adds its field code to {@code validation.failed}.
 */
final class RequestFields {

  /** A List's or a Category's name: 1–100 code points after trim. */
  private static final int MAX_NAME_LENGTH = 100;

  private RequestFields() {}

  /** The name trimmed: {@code required} when blank, {@code too_long} over 100 code points. */
  static String name(String field, @Nullable String value, FieldErrors errors) {
    String trimmed = value == null ? "" : value.trim();
    if (trimmed.isEmpty()) {
      errors.add(field, FieldErrors.REQUIRED);
    } else if (trimmed.codePointCount(0, trimmed.length()) > MAX_NAME_LENGTH) {
      errors.add(field, FieldErrors.TOO_LONG);
    }
    return trimmed;
  }

  /** An ordering key: {@code required} when missing, {@code value.invalid} when not finite. */
  static double position(String field, @Nullable Double value, FieldErrors errors) {
    if (value == null) {
      errors.add(field, FieldErrors.REQUIRED);
      return 0;
    }
    if (!Double.isFinite(value)) {
      errors.add(field, FieldErrors.VALUE_INVALID);
    }
    return value;
  }

  /**
   * The operation's {@code field} as a UUID, {@code null} when absent or {@code null}; anything
   * else that isn't one is {@code validation.failed} ({@code value.invalid}).
   */
  @Nullable
  static UUID uuid(Operation operation, String field) {
    String value = operation.text(field);
    if (value == null) {
      return null;
    }
    try {
      return UUID.fromString(value);
    } catch (IllegalArgumentException e) {
      new FieldErrors().add(field, FieldErrors.VALUE_INVALID).throwIfAny();
      throw e;
    }
  }

  /** The operation's {@code listId}: required, a UUID ({@code validation.failed} otherwise). */
  static UUID listId(Operation operation) {
    String value = operation.text("listId");
    if (value == null || value.isBlank()) {
      new FieldErrors().add("listId", FieldErrors.REQUIRED).throwIfAny();
    }
    return Objects.requireNonNull(uuid(operation, "listId"));
  }

  /** {@code validation.failed} when an upsert of a known row names another List than its own. */
  static void sameList(Operation operation, UUID listId) {
    if (operation.has("listId") && !listId.equals(listId(operation))) {
      new FieldErrors().add("listId", FieldErrors.VALUE_INVALID).throwIfAny();
    }
  }
}

package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.error.FieldErrors;
import java.util.Arrays;
import org.springframework.lang.Nullable;

/**
 * A List's fields as an upsert leaves them: {@code {name, kind, visibility}}. Fields are read as
 * plain strings so that a missing or unknown value becomes a field code, not a parse error.
 */
record ListRequest(@Nullable String name, @Nullable String kind, @Nullable String visibility) {

  /** The same limits as a Child's name: 1–100 code points after trim. */
  private static final int MAX_NAME_LENGTH = 100;

  /**
   * Returns the normalized fields (name trimmed), or throws {@code 400 validation.failed} listing
   * every bad field.
   */
  ListDetails validate() {
    FieldErrors errors = new FieldErrors();
    String trimmedName = name == null ? "" : name.trim();
    if (trimmedName.isEmpty()) {
      errors.add("name", FieldErrors.REQUIRED);
    } else if (trimmedName.codePointCount(0, trimmedName.length()) > MAX_NAME_LENGTH) {
      errors.add("name", FieldErrors.TOO_LONG);
    }
    ListKind checkedKind = choice("kind", kind, ListKind.values(), errors);
    Visibility checkedVisibility = choice("visibility", visibility, Visibility.values(), errors);
    errors.throwIfAny();
    return new ListDetails(trimmedName, checkedKind, checkedVisibility);
  }

  /** One of {@code values} by its exact name: {@code required} when missing, else invalid. */
  @Nullable
  private static <E extends Enum<E>> E choice(
      String field, @Nullable String value, E[] values, FieldErrors errors) {
    if (value == null || value.isBlank()) {
      errors.add(field, FieldErrors.REQUIRED);
      return null;
    }
    return Arrays.stream(values)
        .filter(candidate -> candidate.name().equals(value))
        .findFirst()
        .orElseGet(
            () -> {
              errors.add(field, FieldErrors.VALUE_INVALID);
              return null;
            });
  }
}

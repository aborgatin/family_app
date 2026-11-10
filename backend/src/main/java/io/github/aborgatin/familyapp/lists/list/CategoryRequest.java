package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.error.FieldErrors;
import org.springframework.lang.Nullable;

/**
 * A Category's fields as an upsert leaves them: {@code {name, position}}. The List is checked by
 * {@code CategoryService}, since it is set once, on create.
 */
record CategoryRequest(@Nullable String name, @Nullable Double position) {

  /** The same limits as a List's name: 1–100 code points after trim; duplicates are allowed. */
  private static final int MAX_NAME_LENGTH = 100;

  /** Returns the normalized fields (name trimmed), or throws {@code 400 validation.failed}. */
  CategoryDetails validate() {
    FieldErrors errors = new FieldErrors();
    String trimmedName = name == null ? "" : name.trim();
    if (trimmedName.isEmpty()) {
      errors.add("name", FieldErrors.REQUIRED);
    } else if (trimmedName.codePointCount(0, trimmedName.length()) > MAX_NAME_LENGTH) {
      errors.add("name", FieldErrors.TOO_LONG);
    }
    if (position == null) {
      errors.add("position", FieldErrors.REQUIRED);
    } else if (!Double.isFinite(position)) {
      errors.add("position", FieldErrors.VALUE_INVALID);
    }
    errors.throwIfAny();
    return new CategoryDetails(trimmedName, position == null ? 0 : position);
  }
}

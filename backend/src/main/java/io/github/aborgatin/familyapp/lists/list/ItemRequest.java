package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.error.FieldErrors;
import org.springframework.lang.Nullable;

/**
 * An Item's fields as an upsert leaves them: {@code {text, description}}. The List is checked by
 * {@code ItemService}, since it is set once, on create.
 */
record ItemRequest(@Nullable String text, @Nullable String description) {

  /** An Item's text: 1–1000 code points after trim. */
  private static final int MAX_TEXT_LENGTH = 1000;

  /** A Description: up to 10000 code points; blank is none. */
  private static final int MAX_DESCRIPTION_LENGTH = 10_000;

  /** Returns the normalized fields, or throws {@code 400 validation.failed}. */
  ItemDetails validate() {
    FieldErrors errors = new FieldErrors();
    String trimmedText = text == null ? "" : text.trim();
    if (trimmedText.isEmpty()) {
      errors.add("text", FieldErrors.REQUIRED);
    } else if (length(trimmedText) > MAX_TEXT_LENGTH) {
      errors.add("text", FieldErrors.TOO_LONG);
    }
    String checkedDescription = description == null || description.isBlank() ? null : description;
    if (checkedDescription != null && length(checkedDescription) > MAX_DESCRIPTION_LENGTH) {
      errors.add("description", FieldErrors.TOO_LONG);
    }
    errors.throwIfAny();
    return new ItemDetails(trimmedText, checkedDescription);
  }

  private static int length(String value) {
    return value.codePointCount(0, value.length());
  }
}

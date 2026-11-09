package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.error.FieldErrors;
import org.springframework.lang.Nullable;

/**
 * An Item's fields as an upsert leaves them: {@code {text, note}}. The List is checked by {@code
 * ItemService}, since it is set once, on create.
 */
record ItemRequest(@Nullable String text, @Nullable String note) {

  /** An Item's text: 1–1000 code points after trim. */
  private static final int MAX_TEXT_LENGTH = 1000;

  /** A note: up to 10000 code points; blank is no note. */
  private static final int MAX_NOTE_LENGTH = 10_000;

  /** Returns the normalized fields, or throws {@code 400 validation.failed}. */
  ItemDetails validate() {
    FieldErrors errors = new FieldErrors();
    String trimmedText = text == null ? "" : text.trim();
    if (trimmedText.isEmpty()) {
      errors.add("text", FieldErrors.REQUIRED);
    } else if (length(trimmedText) > MAX_TEXT_LENGTH) {
      errors.add("text", FieldErrors.TOO_LONG);
    }
    String checkedNote = note == null || note.isBlank() ? null : note;
    if (checkedNote != null && length(checkedNote) > MAX_NOTE_LENGTH) {
      errors.add("note", FieldErrors.TOO_LONG);
    }
    errors.throwIfAny();
    return new ItemDetails(trimmedText, checkedNote);
  }

  private static int length(String value) {
    return value.codePointCount(0, value.length());
  }
}

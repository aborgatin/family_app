package io.github.aborgatin.familyapp.family.child;

import io.github.aborgatin.familyapp.error.FieldErrors;
import io.github.aborgatin.familyapp.family.member.RegistrationRequest;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import org.springframework.lang.Nullable;

/**
 * The body of {@code PUT /api/children/{id}}: {@code {name, color, birthday | null}}. Fields are
 * read as plain strings so that a missing or bad value becomes a field code, not a parse error.
 */
record ChildRequest(@Nullable String name, @Nullable String color, @Nullable String birthday) {

  /**
   * Returns the normalized body (name trimmed, birthday parsed), or throws {@code 400
   * validation.failed} listing every bad field (spec #5, Validation). The color must be a code from
   * the palette.
   */
  ChildDetails validate(ChildColorPalette palette) {
    FieldErrors errors = new FieldErrors();
    String trimmedName = RegistrationRequest.checkDisplayName("name", name, errors);
    String checkedColor = color == null ? "" : color;
    if (checkedColor.isBlank()) {
      errors.add("color", FieldErrors.REQUIRED);
    } else if (!palette.contains(checkedColor)) {
      errors.add("color", FieldErrors.COLOR_INVALID);
    }
    LocalDate parsedBirthday = parseBirthday(errors);
    errors.throwIfAny();
    return new ChildDetails(trimmedName, checkedColor, parsedBirthday);
  }

  /** {@code YYYY-MM-DD}; {@code null} or absent means the birthday is unknown. */
  @Nullable
  private LocalDate parseBirthday(FieldErrors errors) {
    if (birthday == null) {
      return null;
    }
    try {
      return LocalDate.parse(birthday);
    } catch (DateTimeParseException e) {
      errors.add("birthday", FieldErrors.VALUE_INVALID);
      return null;
    }
  }
}

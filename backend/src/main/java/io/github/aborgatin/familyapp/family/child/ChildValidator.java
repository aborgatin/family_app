package io.github.aborgatin.familyapp.family.child;

import io.github.aborgatin.familyapp.error.FieldErrors;
import io.github.aborgatin.familyapp.family.member.RegistrationRequest;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Component;

/** Validates a {@link ChildRequest} (spec #5, Validation), or throws {@code validation.failed}. */
@Component
class ChildValidator {

  private final ChildColorPalette palette;

  ChildValidator(ChildColorPalette palette) {
    this.palette = palette;
  }

  ChildDetails validate(ChildRequest request) {
    FieldErrors errors = new FieldErrors();
    String name = RegistrationRequest.checkDisplayName("name", request.name(), errors);
    String color = request.color() == null ? "" : request.color();
    if (color.isBlank()) {
      errors.add("color", FieldErrors.REQUIRED);
    } else if (!palette.contains(color)) {
      errors.add("color", FieldErrors.COLOR_INVALID);
    }
    LocalDate birthday = parseBirthday(request.birthday(), errors);
    errors.throwIfAny();
    return new ChildDetails(name, color, birthday);
  }

  /** {@code YYYY-MM-DD}; {@code null} or absent means the birthday is unknown. */
  @Nullable
  private static LocalDate parseBirthday(@Nullable String birthday, FieldErrors errors) {
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

package io.github.aborgatin.familyapp.family.child;

import io.github.aborgatin.familyapp.error.FieldErrors;
import io.github.aborgatin.familyapp.family.member.RegistrationRequest;
import java.time.LocalDate;
import org.springframework.lang.Nullable;

/**
 * A Child's fields as an upsert leaves them: {@code {name, color, birthday | null, avatar | null}}.
 * Fields are read as plain strings so that a missing or bad value becomes a field code, not a parse
 * error.
 */
record ChildRequest(
    @Nullable String name,
    @Nullable String color,
    @Nullable String birthday,
    @Nullable String avatar) {

  /**
   * Returns the normalized body (name trimmed, birthday parsed), or throws {@code 400
   * validation.failed} listing every bad field (spec #5, Validation). The color must be a code from
   * the palette; the avatar, when there is one, a code from the Avatar set.
   */
  ChildDetails validate(ChildColorPalette palette, ChildAvatarSet avatars) {
    FieldErrors errors = new FieldErrors();
    String trimmedName = RegistrationRequest.checkDisplayName("name", name, errors);
    String checkedColor = color == null ? "" : color;
    if (checkedColor.isBlank()) {
      errors.add("color", FieldErrors.REQUIRED);
    } else if (!palette.contains(checkedColor)) {
      errors.add("color", FieldErrors.COLOR_INVALID);
    }
    if (avatar != null && !avatars.contains(avatar)) {
      errors.add("avatar", FieldErrors.AVATAR_INVALID);
    }
    // YYYY-MM-DD; null or absent means the birthday is unknown.
    LocalDate parsedBirthday = errors.date("birthday", birthday);
    errors.throwIfAny();
    return new ChildDetails(trimmedName, checkedColor, parsedBirthday, avatar);
  }
}

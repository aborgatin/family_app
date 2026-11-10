package io.github.aborgatin.familyapp.family.childfield;

import io.github.aborgatin.familyapp.error.FieldErrors;
import io.github.aborgatin.familyapp.family.member.RegistrationRequest;
import org.springframework.lang.Nullable;

/**
 * A Child field's fields as an upsert leaves them: {@code {name, valueType, position}}, all
 * required. Fields are read as nullable so that a missing or unknown value becomes a field code,
 * not a parse error.
 */
record ChildFieldRequest(
    @Nullable String name, @Nullable String valueType, @Nullable Double position) {

  /**
   * Returns the normalized body (name trimmed), or throws {@code 400 validation.failed} listing
   * every bad field.
   */
  Valid validate() {
    FieldErrors errors = new FieldErrors();
    // Same rule as a display name: 1–100 characters after trimming (spec #5, Validation).
    String trimmedName = RegistrationRequest.checkDisplayName("name", name, errors);
    ValueType type = errors.requiredChoice("valueType", valueType, ValueType.values());
    if (position == null) {
      errors.add("position", FieldErrors.REQUIRED);
    }
    errors.throwIfAny();
    return new Valid(trimmedName, type, position);
  }

  /** A body that passed validation. */
  record Valid(String name, ValueType valueType, double position) {}
}

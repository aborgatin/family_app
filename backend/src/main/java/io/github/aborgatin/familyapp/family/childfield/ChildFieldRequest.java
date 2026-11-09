package io.github.aborgatin.familyapp.family.childfield;

import io.github.aborgatin.familyapp.error.FieldErrors;
import io.github.aborgatin.familyapp.family.member.RegistrationRequest;
import java.util.Arrays;
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
    ValueType type = checkValueType(errors);
    if (position == null) {
      errors.add("position", FieldErrors.REQUIRED);
    }
    errors.throwIfAny();
    return new Valid(trimmedName, type, position);
  }

  @Nullable
  private ValueType checkValueType(FieldErrors errors) {
    if (valueType == null || valueType.isBlank()) {
      errors.add("valueType", FieldErrors.REQUIRED);
      return null;
    }
    ValueType type =
        Arrays.stream(ValueType.values())
            .filter(value -> value.name().equals(valueType))
            .findFirst()
            .orElse(null);
    if (type == null) {
      errors.add("valueType", FieldErrors.VALUE_INVALID);
    }
    return type;
  }

  /** A body that passed validation. */
  record Valid(String name, ValueType valueType, double position) {}
}

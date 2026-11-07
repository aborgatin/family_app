package io.github.aborgatin.familyapp.family.childfield;

import java.time.Instant;
import java.util.UUID;

/** The API's {@code ChildField} shape (spec #5, API contract). */
record ChildFieldResponse(
    UUID id, String name, ValueType valueType, double position, long version, Instant updatedAt) {

  static ChildFieldResponse of(ChildField field) {
    return new ChildFieldResponse(
        field.id(),
        field.name(),
        field.valueType(),
        field.position(),
        field.version(),
        field.updatedAt());
  }
}

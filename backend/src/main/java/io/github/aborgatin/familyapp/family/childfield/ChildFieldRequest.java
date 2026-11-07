package io.github.aborgatin.familyapp.family.childfield;

import org.springframework.lang.Nullable;

/**
 * The body of {@code PUT /api/child-fields/{id}}: {@code {name, valueType, position}}. Fields are
 * read as nullable so that a missing or unknown value becomes a field code, not a parse error.
 */
record ChildFieldRequest(
    @Nullable String name, @Nullable String valueType, @Nullable Double position) {

  Valid validate() {
    return new Valid(name.trim(), ValueType.valueOf(valueType), position);
  }

  /** A body that passed validation. */
  record Valid(String name, ValueType valueType, double position) {}
}

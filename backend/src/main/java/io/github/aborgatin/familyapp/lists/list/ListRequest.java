package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.error.FieldErrors;
import java.util.Arrays;
import org.springframework.lang.Nullable;

/**
 * A List's fields as an upsert leaves them: {@code {name, kind, visibility,
 * unnamedCategoryPosition}}. Fields are read as plain strings so that a missing or unknown value
 * becomes a field code, not a parse error.
 */
record ListRequest(
    @Nullable String name,
    @Nullable String kind,
    @Nullable String visibility,
    @Nullable Double unnamedCategoryPosition) {

  /**
   * Returns the normalized fields (name trimmed: 1–100 code points, the same limits as a Child's
   * name), or throws {@code 400 validation.failed} listing every bad field.
   */
  ListDetails validate() {
    FieldErrors errors = new FieldErrors();
    String checkedName = RequestFields.name("name", name, errors);
    ListKind checkedKind = choice("kind", kind, ListKind.values(), errors);
    Visibility checkedVisibility = choice("visibility", visibility, Visibility.values(), errors);
    double checkedPosition =
        RequestFields.position("unnamedCategoryPosition", unnamedCategoryPosition, errors);
    errors.throwIfAny();
    return new ListDetails(checkedName, checkedKind, checkedVisibility, checkedPosition);
  }

  /** One of {@code values} by its exact name: {@code required} when missing, else invalid. */
  @Nullable
  private static <E extends Enum<E>> E choice(
      String field, @Nullable String value, E[] values, FieldErrors errors) {
    if (value == null || value.isBlank()) {
      errors.add(field, FieldErrors.REQUIRED);
      return null;
    }
    return Arrays.stream(values)
        .filter(candidate -> candidate.name().equals(value))
        .findFirst()
        .orElseGet(
            () -> {
              errors.add(field, FieldErrors.VALUE_INVALID);
              return null;
            });
  }
}

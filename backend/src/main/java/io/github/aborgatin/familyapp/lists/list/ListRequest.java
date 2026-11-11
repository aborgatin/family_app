package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.error.FieldErrors;
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
    ListKind checkedKind = errors.requiredChoice("kind", kind, ListKind.values());
    Visibility checkedVisibility =
        errors.requiredChoice("visibility", visibility, Visibility.values());
    double checkedPosition =
        RequestFields.position("unnamedCategoryPosition", unnamedCategoryPosition, errors);
    errors.throwIfAny();
    return new ListDetails(checkedName, checkedKind, checkedVisibility, checkedPosition);
  }
}

package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.error.FieldErrors;
import org.springframework.lang.Nullable;

/**
 * A Category's fields as an upsert leaves them: {@code {name, position}}. The List is checked by
 * {@code CategoryService}, since it is set once, on create.
 */
record CategoryRequest(@Nullable String name, @Nullable Double position) {

  /**
   * Returns the normalized fields (name trimmed), or throws {@code 400 validation.failed}. The name
   * has a List's limits (duplicates are allowed); the position must be a finite number.
   */
  CategoryDetails validate() {
    FieldErrors errors = new FieldErrors();
    String checkedName = RequestFields.name("name", name, errors);
    double checkedPosition = RequestFields.position("position", position, errors);
    errors.throwIfAny();
    return new CategoryDetails(checkedName, checkedPosition);
  }
}

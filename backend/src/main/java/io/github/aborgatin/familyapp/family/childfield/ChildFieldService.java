package io.github.aborgatin.familyapp.family.childfield;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.family.FamilyLock;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Family's Child fields (spec #5, Child fields in Settings). Writes are idempotent upserts by
 * the client's id (S3), so M2's sync push can reuse {@link #put} and {@link #delete} unchanged.
 */
@Service
class ChildFieldService {

  private final ChildFieldRepository childFields;
  private final FamilyLock familyLock;

  ChildFieldService(ChildFieldRepository childFields, FamilyLock familyLock) {
    this.childFields = childFields;
    this.familyLock = familyLock;
  }

  /** Every Child field in display order: by position, ties broken by id. */
  @Transactional(readOnly = true)
  List<ChildField> list() {
    return childFields.findByDeletedFalseOrderByPositionAscIdAsc();
  }

  /**
   * Creates the Child field with this id, or fully replaces it. Validation comes first ({@code 400
   * validation.failed}); then a deleted id is {@code 409 child_field.deleted} (it is not brought
   * back), and a different value type for an existing field is {@code 409
   * child_field.value_type_immutable} (ADR-0007).
   */
  @Transactional
  ChildField put(UUID id, ChildFieldRequest request) {
    ChildFieldRequest.Valid valid = request.validate();
    // Serializes writes, so two concurrent creates of the same id can't both insert.
    UUID familyId = familyLock.lockFamily();
    ChildField field = childFields.findById(id).orElse(null);
    if (field == null) {
      field = new ChildField(id, familyId, valid.name(), valid.valueType(), valid.position());
    } else if (field.deleted()) {
      throw new ApiException(HttpStatus.CONFLICT, "child_field.deleted");
    } else if (field.valueType() != valid.valueType()) {
      throw new ApiException(HttpStatus.CONFLICT, "child_field.value_type_immutable");
    } else {
      field.replace(valid.name(), valid.position());
    }
    return childFields.saveAndFlush(field);
  }

  /** Soft-deletes the Child field; nothing happens when it is already deleted or unknown. */
  @Transactional
  void delete(UUID id) {
    familyLock.lockFamily();
    childFields
        .findById(id)
        .filter(field -> !field.deleted())
        .ifPresent(
            field -> {
              field.markDeleted();
              childFields.saveAndFlush(field);
            });
  }
}

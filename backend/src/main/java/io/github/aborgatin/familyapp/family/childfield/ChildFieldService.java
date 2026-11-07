package io.github.aborgatin.familyapp.family.childfield;

import io.github.aborgatin.familyapp.family.member.FamilyLock;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Family's Child fields (spec #5, Child fields in Settings). Writes are idempotent upserts by
 * the client's id (S3), so M2's sync push can reuse {@link #put} unchanged.
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

  /** Creates the Child field with this id, or fully replaces it. */
  @Transactional
  ChildField put(UUID id, ChildFieldRequest request) {
    ChildFieldRequest.Valid valid = request.validate();
    // Serializes writes, so two concurrent creates of the same id can't both insert.
    UUID familyId = familyLock.lock();
    ChildField field =
        childFields
            .findById(id)
            .map(
                existing -> {
                  existing.replace(valid.name(), valid.position());
                  return existing;
                })
            .orElseGet(
                () ->
                    new ChildField(
                        id, familyId, valid.name(), valid.valueType(), valid.position()));
    return childFields.saveAndFlush(field);
  }

  /** Soft-deletes the Child field; nothing happens when it is already deleted or unknown. */
  @Transactional
  void delete(UUID id) {
    childFields
        .findById(id)
        .filter(field -> !field.deleted())
        .ifPresent(
            field -> {
              field.delete();
              childFields.saveAndFlush(field);
            });
  }
}

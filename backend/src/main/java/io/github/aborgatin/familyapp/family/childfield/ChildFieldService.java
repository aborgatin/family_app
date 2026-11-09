package io.github.aborgatin.familyapp.family.childfield;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.family.FamilyLock;
import io.github.aborgatin.familyapp.sync.Operation;
import io.github.aborgatin.familyapp.sync.Outcome;
import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * The Family's Child fields (spec #5, Child fields in Settings), and the {@code child_field} table
 * of the sync push and pull (spec #3). Writes arrive only as Outbox operations; they are idempotent
 * by the client's id (S3). The client orders the fields (by position, ties by id); a reorder sends
 * only the moved field's new position.
 */
@Service
class ChildFieldService implements SyncableTable {

  private final ChildFieldRepository childFields;
  private final FamilyLock familyLock;

  ChildFieldService(ChildFieldRepository childFields, FamilyLock familyLock) {
    this.childFields = childFields;
    this.familyLock = familyLock;
  }

  @Override
  public String name() {
    return "child_field";
  }

  /**
   * An upsert creates the Child field (name, value type and position required) or changes only the
   * fields it carries; a delete soft-deletes. Delete wins: anything on a deleted Child field, and
   * deleting an unknown one, is ignored. Validation comes first; then a different value type for an
   * existing field is rejected with {@code child_field.value_type_immutable} (ADR-0007).
   */
  @Override
  public Outcome apply(Operation operation) {
    Optional<ChildField> existing = childFields.findById(operation.id());
    if (existing.isPresent() && existing.get().deleted()) {
      return Outcome.IGNORED;
    }
    return switch (operation.type()) {
      case UPSERT -> upsert(operation, existing);
      case DELETE -> delete(existing);
    };
  }

  private Outcome upsert(Operation operation, Optional<ChildField> existing) {
    ChildFieldRequest.Valid valid = changed(operation, existing).validate();
    // Inside the push the lock is already held; this only reads the Family id.
    UUID familyId = familyLock.lockFamily();
    ChildField field;
    if (existing.isEmpty()) {
      field =
          new ChildField(
              operation.id(), familyId, valid.name(), valid.valueType(), valid.position());
    } else {
      field = existing.get();
      if (field.valueType() != valid.valueType()) {
        throw new ApiException(HttpStatus.CONFLICT, "child_field.value_type_immutable");
      }
      field.replace(valid.name(), valid.position());
    }
    childFields.saveAndFlush(field);
    return Outcome.APPLIED;
  }

  /** The Child field's fields after the operation: the carried ones over what is stored. */
  private static ChildFieldRequest changed(Operation operation, Optional<ChildField> existing) {
    return new ChildFieldRequest(
        operation.has("name")
            ? operation.text("name")
            : existing.map(ChildField::name).orElse(null),
        operation.has("valueType")
            ? operation.text("valueType")
            : existing.map(field -> field.valueType().name()).orElse(null),
        operation.has("position")
            ? operation.number("position")
            : existing.map(ChildField::position).orElse(null));
  }

  private Outcome delete(Optional<ChildField> existing) {
    if (existing.isEmpty()) {
      return Outcome.IGNORED;
    }
    ChildField field = existing.get();
    field.markDeleted();
    childFields.saveAndFlush(field);
    return Outcome.APPLIED;
  }

  @Override
  public List<SyncRow> changesSince(long version, UUID memberId) {
    return childFields.findByVersionGreaterThan(version).stream()
        .map(
            field -> {
              if (field.deleted()) {
                return SyncRow.tombstone(field.id(), field.version());
              }
              Map<String, Object> fields = new LinkedHashMap<>();
              fields.put("name", field.name());
              fields.put("valueType", field.valueType().name());
              fields.put("position", field.position());
              return SyncRow.of(field.id(), field.version(), fields);
            })
        .toList();
  }
}

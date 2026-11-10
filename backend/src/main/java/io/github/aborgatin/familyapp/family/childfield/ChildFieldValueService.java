package io.github.aborgatin.familyapp.family.childfield;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.family.ChildDeleted;
import io.github.aborgatin.familyapp.family.child.Children;
import io.github.aborgatin.familyapp.sync.Operation;
import io.github.aborgatin.familyapp.sync.Outcome;
import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import io.github.aborgatin.familyapp.sync.SyncedRecord;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * The timeline of each Child's value for each Child field (spec #81, ticket #91; ADR-0007), and the
 * {@code child_field_value} table of the sync push and pull. Saving a value appends an entry; the
 * Child profile shows the latest one, which is the entry with the highest Version (the one the
 * server received last), so two devices saving the same value keep both entries and agree.
 */
@Service
class ChildFieldValueService implements SyncableTable {

  private final ChildFieldValueRepository values;
  private final ChildFieldRepository childFields;
  private final Children children;
  private final Clock clock = Clock.systemUTC();

  ChildFieldValueService(
      ChildFieldValueRepository values, ChildFieldRepository childFields, Children children) {
    this.values = values;
    this.childFields = childFields;
    this.children = children;
  }

  @Override
  public String name() {
    return "child_field_value";
  }

  /**
   * An upsert of an unknown id appends an entry ({@code childId}, {@code childFieldId} and {@code
   * value} required; the value is checked by the field's Value type); {@code recordedAt} is now. An
   * entry never changes: an upsert of a known one leaves it as it is. A delete soft-deletes (the
   * app sends none yet). Delete wins: anything on a deleted entry, deleting an unknown one, and an
   * entry for a deleted Child or Child field, is ignored. An entry for a Child or Child field that
   * never existed is {@code child.not_found} / {@code child_field.not_found}.
   */
  @Override
  public Outcome apply(Operation operation) {
    return Outcome.deleteWins(
        operation, values.findById(operation.id()), this::upsert, this::delete);
  }

  private Outcome upsert(Operation operation, Optional<ChildFieldValue> existing) {
    if (existing.isPresent()) {
      // Already recorded (a repeated push, S3): an entry never changes.
      return Outcome.APPLIED;
    }
    ChildFieldValueRequest.Valid valid =
        new ChildFieldValueRequest(
                operation.text("childId"), operation.text("childFieldId"), operation.text("value"))
            .validate();
    SyncedRecord child =
        children
            .find(valid.childId())
            .orElseThrow(() -> notFound("child.not_found", "childId", valid.childId()));
    ChildField field =
        childFields
            .findById(valid.childFieldId())
            .orElseThrow(
                () -> notFound("child_field.not_found", "childFieldId", valid.childFieldId()));
    if (child.deleted() || field.deleted()) {
      return Outcome.IGNORED;
    }
    String value = valid.valueOf(field.valueType());
    values.saveAndFlush(
        new ChildFieldValue(
            operation.id(), valid.childId(), valid.childFieldId(), value, clock.instant()));
    return Outcome.APPLIED;
  }

  private static ApiException notFound(String code, String param, UUID id) {
    return new ApiException(HttpStatus.NOT_FOUND, code, Map.of(param, id.toString()));
  }

  private Outcome delete(ChildFieldValue value) {
    value.markDeleted();
    values.saveAndFlush(value);
    return Outcome.APPLIED;
  }

  /**
   * A deleted Child takes its values, in the push operation that deletes it (which holds the Family
   * lock).
   */
  @EventListener
  void on(ChildDeleted event) {
    values.markDeletedOfChild(event.childId());
  }

  /** A deleted Child field takes its values for every Child; called by its delete operation. */
  void childFieldDeleted(UUID childFieldId) {
    values.markDeletedOfChildField(childFieldId);
  }

  @Override
  public List<SyncRow> changesSince(long version, UUID memberId) {
    return SyncRow.changes(
        values.findByVersionGreaterThan(version),
        (value, fields) -> {
          fields.put("childId", value.childId());
          fields.put("childFieldId", value.childFieldId());
          fields.put("value", value.value());
          fields.put("recordedAt", value.recordedAt());
        });
  }
}

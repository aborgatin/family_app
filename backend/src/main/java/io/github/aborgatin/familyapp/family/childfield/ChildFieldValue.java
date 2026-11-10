package io.github.aborgatin.familyapp.family.childfield;

import io.github.aborgatin.familyapp.sync.SyncedRecord;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

/**
 * One entry of the timeline of a Child's value for a Child field (ADR-0007): the value as saved at
 * {@code recordedAt}. Entries are appended and never changed, so there are no setters; the latest
 * entry of a Child and field is the one with the highest Version. Syncable (S1): the client
 * generates the id (S3); {@code version} and {@code updatedAt} are set by the database trigger.
 */
@Entity
@Table(name = "child_field_value")
class ChildFieldValue implements SyncedRecord {

  @Id private UUID id;

  @Column(nullable = false)
  private UUID childId;

  @Column(nullable = false)
  private UUID childFieldId;

  /** In the canonical format of the field's Value type; empty for a cleared value. */
  @Column(nullable = false)
  private String value;

  @Column(nullable = false)
  private Instant recordedAt;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private long version;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private Instant updatedAt;

  @Column(nullable = false)
  private boolean deleted;

  protected ChildFieldValue() {}

  ChildFieldValue(UUID id, UUID childId, UUID childFieldId, String value, Instant recordedAt) {
    this.id = id;
    this.childId = childId;
    this.childFieldId = childFieldId;
    this.value = value;
    this.recordedAt = recordedAt;
  }

  /** Soft delete (S2): the row stays and its Version advances. */
  void markDeleted() {
    this.deleted = true;
  }

  @Override
  public UUID id() {
    return id;
  }

  UUID childId() {
    return childId;
  }

  UUID childFieldId() {
    return childFieldId;
  }

  String value() {
    return value;
  }

  Instant recordedAt() {
    return recordedAt;
  }

  @Override
  public long version() {
    return version;
  }

  Instant updatedAt() {
    return updatedAt;
  }

  @Override
  public boolean deleted() {
    return deleted;
  }
}

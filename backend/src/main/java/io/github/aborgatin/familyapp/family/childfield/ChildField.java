package io.github.aborgatin.familyapp.family.childfield;

import io.github.aborgatin.familyapp.sync.SyncedRecord;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

/**
 * A Child field («Поле профиля»). Syncable (S1): the client generates the id (S3); {@code version}
 * and {@code updatedAt} are set by the database trigger on every write (S2). The value type is
 * fixed at creation (ADR-0007), so it has no setter.
 */
@Entity
@Table(name = "child_field")
class ChildField implements SyncedRecord {

  @Id private UUID id;

  @Column(nullable = false)
  private UUID familyId;

  @Column(nullable = false)
  private String name;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private ValueType valueType;

  @Column(nullable = false)
  private double position;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private long version;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private Instant updatedAt;

  @Column(nullable = false)
  private boolean deleted;

  protected ChildField() {}

  ChildField(UUID id, UUID familyId, String name, ValueType valueType, double position) {
    this.id = id;
    this.familyId = familyId;
    this.name = name;
    this.valueType = valueType;
    this.position = position;
  }

  void replace(String name, double position) {
    this.name = name;
    this.position = position;
  }

  /** Soft delete (S2): the row stays, hidden from lists, and its Version advances. */
  void markDeleted() {
    this.deleted = true;
  }

  @Override
  public UUID id() {
    return id;
  }

  String name() {
    return name;
  }

  ValueType valueType() {
    return valueType;
  }

  double position() {
    return position;
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

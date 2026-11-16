package io.github.aborgatin.familyapp.medical;

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
import org.springframework.lang.Nullable;

/**
 * An Illness or a Condition on a Medical card (GLOSSARY), holding Illness events. Syncable (S1):
 * the client generates the id (S3); {@code version} and {@code updatedAt} are set by the database
 * trigger. Its person never changes.
 */
@Entity
@Table(name = "illness")
class Illness implements SyncedRecord {

  /** An Illness, or a Condition («Диагноз/наблюдение»). */
  enum Kind {
    ILLNESS,
    CONDITION
  }

  @Id private UUID id;

  @Nullable private UUID memberId;

  @Nullable private UUID childId;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private Kind kind;

  @Column(nullable = false)
  private String name;

  @Nullable private String description;

  @Column(nullable = false)
  private boolean ended;

  @Nullable private Double position;

  @Column(nullable = false)
  private Instant createdAt;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private long version;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private Instant updatedAt;

  @Column(nullable = false)
  private boolean deleted;

  protected Illness() {}

  Illness(
      UUID id,
      Person person,
      Kind kind,
      String name,
      @Nullable String description,
      @Nullable Double position,
      Instant createdAt) {
    this.id = id;
    this.memberId = person.memberId();
    this.childId = person.childId();
    this.kind = kind;
    this.name = name;
    this.description = description;
    this.position = position;
    this.createdAt = createdAt;
  }

  void rename(String name) {
    this.name = name;
  }

  void describe(@Nullable String description) {
    this.description = description;
  }

  /** Switches it between an Illness and a Condition. */
  void changeKind(Kind kind) {
    this.kind = kind;
  }

  /** Ends it («Завершить»), or resumes it («Возобновить») with {@code false}. */
  void end(boolean ended) {
    this.ended = ended;
  }

  /** Its place among the card's Conditions. */
  void moveTo(@Nullable Double position) {
    this.position = position;
  }

  /** Soft delete (S2): the row stays and its Version advances. */
  void markDeleted() {
    this.deleted = true;
  }

  @Override
  public UUID id() {
    return id;
  }

  Person person() {
    return new Person(memberId, childId);
  }

  Kind kind() {
    return kind;
  }

  String name() {
    return name;
  }

  @Nullable
  String description() {
    return description;
  }

  boolean ended() {
    return ended;
  }

  @Nullable
  Double position() {
    return position;
  }

  Instant createdAt() {
    return createdAt;
  }

  @Override
  public long version() {
    return version;
  }

  @Override
  public boolean deleted() {
    return deleted;
  }
}

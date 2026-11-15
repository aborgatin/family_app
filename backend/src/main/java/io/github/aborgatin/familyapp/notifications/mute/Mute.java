package io.github.aborgatin.familyapp.notifications.mute;

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
 * A Member's Mute of one Shared list (spec #104): «Без уведомлений», no Notifications about Items
 * added there. A Mute never changes: it is created, then deleted (unmuting, or with its List).
 * Syncable (S1): the client generates the id (S3); {@code version} and {@code updatedAt} are set by
 * the database trigger.
 */
@Entity
@Table(name = "mute")
class Mute implements SyncedRecord {

  @Id private UUID id;

  @Column(nullable = false)
  private UUID listId;

  @Column(nullable = false)
  private UUID memberId;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private long version;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private Instant updatedAt;

  @Column(nullable = false)
  private boolean deleted;

  protected Mute() {}

  Mute(UUID id, UUID listId, UUID memberId) {
    this.id = id;
    this.listId = listId;
    this.memberId = memberId;
  }

  /** Soft delete (S2): the row stays and its Version advances. */
  void markDeleted() {
    this.deleted = true;
  }

  @Override
  public UUID id() {
    return id;
  }

  UUID listId() {
    return listId;
  }

  UUID memberId() {
    return memberId;
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

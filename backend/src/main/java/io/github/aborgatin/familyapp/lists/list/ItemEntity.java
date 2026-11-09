package io.github.aborgatin.familyapp.lists.list;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;
import org.springframework.lang.Nullable;

/**
 * An Item (GLOSSARY): one entry in a List. Syncable (S1): the client generates the id (S3), and
 * {@code version} and {@code updatedAt} are set by the database trigger on every INSERT and UPDATE
 * (S2). Its List, the Creator and created at are set once, by the server; Done by and done at are
 * set by the server when Done changes.
 */
@Entity
@Table(name = "item")
class ItemEntity {

  @Id private UUID id;

  @Column(nullable = false, updatable = false)
  private UUID listId;

  @Column(nullable = false)
  private String text;

  @Nullable private String note;

  @Column(nullable = false)
  private boolean done;

  @Nullable private UUID doneById;

  @Nullable private Instant doneAt;

  @Column(nullable = false, updatable = false)
  private UUID creatorId;

  @Column(nullable = false, updatable = false)
  private Instant createdAt;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private long version;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private Instant updatedAt;

  @Column(nullable = false)
  private boolean deleted;

  protected ItemEntity() {}

  ItemEntity(UUID id, UUID listId, UUID creatorId, Instant createdAt, ItemDetails details) {
    this.id = id;
    this.listId = listId;
    this.creatorId = creatorId;
    this.createdAt = createdAt;
    replace(details);
  }

  /** Sets the fields an operation may change. */
  void replace(ItemDetails details) {
    this.text = details.text();
    this.note = details.note();
  }

  /**
   * Sets Done. When it turns true, {@code memberId} becomes done by and {@code at} done at; when it
   * turns false both are cleared. Setting Done to its current value changes nothing (S3).
   */
  void markDone(boolean done, UUID memberId, Instant at) {
    if (done == this.done) {
      return;
    }
    this.done = done;
    this.doneById = done ? memberId : null;
    this.doneAt = done ? at : null;
  }

  /** Soft delete (S2): the row stays and its Version advances. */
  void markDeleted() {
    this.deleted = true;
  }

  UUID id() {
    return id;
  }

  UUID listId() {
    return listId;
  }

  String text() {
    return text;
  }

  @Nullable
  String note() {
    return note;
  }

  boolean done() {
    return done;
  }

  @Nullable
  UUID doneById() {
    return doneById;
  }

  @Nullable
  Instant doneAt() {
    return doneAt;
  }

  UUID creatorId() {
    return creatorId;
  }

  Instant createdAt() {
    return createdAt;
  }

  long version() {
    return version;
  }

  boolean deleted() {
    return deleted;
  }
}

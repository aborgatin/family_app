package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.sync.SyncedRecord;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Objects;
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
class ItemEntity implements SyncedRecord {

  @Id private UUID id;

  @Column(nullable = false, updatable = false)
  private UUID listId;

  @Column(nullable = false)
  private String text;

  /** The Item's Category; {@code null} is the Unnamed category. */
  @Nullable private UUID categoryId;

  @Nullable private String description;

  @Column(nullable = false)
  private boolean done;

  @Nullable private UUID doneById;

  @Nullable private Instant doneAt;

  /** The Due date's day; {@code null} is no Due date. Only on a Todo list. */
  @Nullable private LocalDate dueDate;

  /** The Due date's time of day; only with a day. */
  @Nullable private LocalTime dueTime;

  /** The Repeat; {@code null} is none. Only with a Due date. */
  @Enumerated(EnumType.STRING)
  @Nullable
  private Repeat repeat;

  /** The Assignee: the Member responsible; {@code null} is nobody. Only on a Shared Todo list. */
  @Nullable private UUID assigneeId;

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
    this.description = details.description();
  }

  /** Puts the Item in this Category of its List; {@code null} is the Unnamed category. */
  void moveTo(@Nullable UUID categoryId) {
    this.categoryId = categoryId;
  }

  /** Sets the Due date; {@link DueDate#NONE} removes it. */
  void due(DueDate dueDate) {
    this.dueDate = dueDate.day();
    this.dueTime = dueDate.time();
  }

  /** Sets the Repeat; {@code null} removes it. */
  void repeat(@Nullable Repeat repeat) {
    this.repeat = repeat;
  }

  /** Makes this Member the Assignee; {@code null} is nobody. */
  void assignTo(@Nullable UUID assigneeId) {
    this.assigneeId = assigneeId;
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

  /**
   * Hands this repeating Item's Repeat on to its next occurrence (ADR-0009): returns a new open
   * Item {@code id} in the same List with the same text, Description, Assignee, Repeat, time of day
   * and Creator, created {@code at}, due on the next occurrence after {@code today}; this Item
   * keeps no Repeat.
   */
  ItemEntity nextOccurrence(UUID id, Instant at, LocalDate today) {
    Repeat handedOn = Objects.requireNonNull(repeat, "only a repeating Item has a next occurrence");
    LocalDate day = Objects.requireNonNull(dueDate, "a Repeat is only with a Due date");
    ItemEntity next = new ItemEntity(id, listId, creatorId, at, new ItemDetails(text, description));
    next.due(new DueDate(handedOn.next(day, today), dueTime));
    next.repeat(handedOn);
    next.assignTo(assigneeId);
    this.repeat = null;
    return next;
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

  String text() {
    return text;
  }

  @Nullable
  UUID categoryId() {
    return categoryId;
  }

  @Nullable
  String description() {
    return description;
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

  DueDate dueDate() {
    return new DueDate(dueDate, dueTime);
  }

  @Nullable
  Repeat repeat() {
    return repeat;
  }

  @Nullable
  UUID assigneeId() {
    return assigneeId;
  }

  UUID creatorId() {
    return creatorId;
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

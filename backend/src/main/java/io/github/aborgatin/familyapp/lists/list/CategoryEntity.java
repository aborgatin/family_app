package io.github.aborgatin.familyapp.lists.list;

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
 * A Category (GLOSSARY) of a Shopping list: a named group of its Items, in walking order. Syncable
 * (S1): the client generates the id (S3), and {@code version} and {@code updatedAt} are set by the
 * database trigger on every INSERT and UPDATE (S2). Its List is set once, on create.
 */
@Entity
@Table(name = "category")
class CategoryEntity implements SyncedRecord {

  @Id private UUID id;

  @Column(nullable = false, updatable = false)
  private UUID listId;

  @Column(nullable = false)
  private String name;

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

  protected CategoryEntity() {}

  CategoryEntity(UUID id, UUID listId, CategoryDetails details) {
    this.id = id;
    this.listId = listId;
    replace(details);
  }

  /** Sets the fields an operation may change. */
  void replace(CategoryDetails details) {
    this.name = details.name();
    this.position = details.position();
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

  String name() {
    return name;
  }

  double position() {
    return position;
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

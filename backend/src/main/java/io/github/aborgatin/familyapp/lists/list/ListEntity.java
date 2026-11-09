package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.sync.SyncedRecord;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;
import org.springframework.http.HttpStatus;

/**
 * A List (GLOSSARY): a Shopping list, Todo list or Wish list, Private or Shared. Named {@code
 * ListEntity} only so that it doesn't shadow {@code java.util.List}. Syncable (S1): the client
 * generates the id (S3), and {@code version} and {@code updatedAt} are set by the database trigger
 * on every INSERT and UPDATE (S2). The Owner and created at are set once, by the server.
 */
@Entity
@Table(name = "list")
class ListEntity implements SyncedRecord {

  @Id private UUID id;

  @Column(nullable = false)
  private String name;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private ListKind kind;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private Visibility visibility;

  @Column(nullable = false, updatable = false)
  private UUID ownerId;

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

  protected ListEntity() {}

  ListEntity(UUID id, UUID ownerId, Instant createdAt, ListDetails details) {
    this.id = id;
    this.ownerId = ownerId;
    this.createdAt = createdAt;
    this.kind = details.kind();
    replace(details);
  }

  /** Sets the fields that may change after creation; the kind never does. */
  void replace(ListDetails details) {
    this.name = details.name();
    this.visibility = details.visibility();
  }

  /** Soft delete (S2): the row stays and its Version advances. */
  void markDeleted() {
    this.deleted = true;
  }

  /**
   * {@code list.not_found} for {@code listId}: the List is unknown, or another Member's Private one
   * (A1), which is treated as unknown.
   */
  static ApiException notFound(UUID listId) {
    return new ApiException(
        HttpStatus.NOT_FOUND, "list.not_found", Map.of("listId", listId.toString()));
  }

  /** Whether this Member may see the List: every Shared List, and their own Private ones (A1). */
  boolean visibleTo(UUID memberId) {
    return visibility == Visibility.SHARED || ownerId.equals(memberId);
  }

  @Override
  public UUID id() {
    return id;
  }

  String name() {
    return name;
  }

  ListKind kind() {
    return kind;
  }

  Visibility visibility() {
    return visibility;
  }

  UUID ownerId() {
    return ownerId;
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

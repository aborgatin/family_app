package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.sync.SyncedRecord;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

/**
 * One name of a Shopping list's Item history (GLOSSARY): one row per List and normalised name
 * (trimmed, lower-cased), with the latest spelling and when it was last used. Syncable for the pull
 * (S1); the server makes the id and writes the row, and {@code version} and {@code updatedAt} are
 * set by the database trigger (S2).
 */
@Entity
@Table(name = "item_history")
class ItemHistoryEntity implements SyncedRecord {

  @Id private UUID id;

  @Column(nullable = false, updatable = false)
  private UUID listId;

  @Column(nullable = false, updatable = false)
  private String normalizedName;

  @Column(nullable = false)
  private String name;

  @Column(nullable = false)
  private Instant lastUsedAt;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private long version;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private Instant updatedAt;

  @Column(nullable = false)
  private boolean deleted;

  protected ItemHistoryEntity() {}

  ItemHistoryEntity(UUID listId, String name, Instant at) {
    this.id = UUID.randomUUID();
    this.listId = listId;
    this.normalizedName = normalize(name);
    used(name, at);
  }

  /** The key of a name in the history: trimmed and lower-cased. */
  static String normalize(String name) {
    return name.strip().toLowerCase(Locale.ROOT);
  }

  /**
   * The name was used again: its latest spelling is shown from now on, and a removed name comes
   * back (a later use beats an earlier delete, ticket #78).
   */
  void used(String name, Instant at) {
    this.name = name.strip();
    this.lastUsedAt = at;
    this.deleted = false;
  }

  /** A Member removed the name (a typo); the next use revives it ({@link #used}). */
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

  Instant lastUsedAt() {
    return lastUsedAt;
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

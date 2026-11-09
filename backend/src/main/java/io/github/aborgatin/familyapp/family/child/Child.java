package io.github.aborgatin.familyapp.family.child;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;
import org.springframework.lang.Nullable;

/**
 * A Child of the Family. Syncable (S1): the client generates the id (S3), and {@code version} and
 * {@code updatedAt} are set by the database trigger on every INSERT and UPDATE (S2).
 */
@Entity
@Table(name = "child")
class Child {

  @Id private UUID id;

  @Column(nullable = false)
  private UUID familyId;

  @Column(nullable = false)
  private String name;

  @Column(nullable = false)
  private String color;

  @Nullable private LocalDate birthday;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private long version;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private Instant updatedAt;

  @Column(nullable = false)
  private boolean deleted;

  protected Child() {}

  Child(UUID id, UUID familyId, ChildDetails details) {
    this.id = id;
    this.familyId = familyId;
    replace(details);
  }

  /** Sets every client-editable field (an upsert merges its fields over the stored ones first). */
  void replace(ChildDetails details) {
    this.name = details.name();
    this.color = details.color();
    this.birthday = details.birthday();
  }

  /** Soft delete (S2): the row stays, hidden from lists, and its Version advances. */
  void markDeleted() {
    this.deleted = true;
  }

  UUID id() {
    return id;
  }

  String name() {
    return name;
  }

  String color() {
    return color;
  }

  @Nullable
  LocalDate birthday() {
    return birthday;
  }

  long version() {
    return version;
  }

  Instant updatedAt() {
    return updatedAt;
  }

  boolean deleted() {
    return deleted;
  }
}

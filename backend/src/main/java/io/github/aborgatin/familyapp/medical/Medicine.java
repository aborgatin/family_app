package io.github.aborgatin.familyapp.medical;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.sync.SyncedRecord;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;
import org.springframework.http.HttpStatus;
import org.springframework.lang.Nullable;

/**
 * A Medicine (GLOSSARY): one line of the Family's list, its name with its strength. Syncable (S1):
 * the client generates the id (S3); {@code version} and {@code updatedAt} are set by the database
 * trigger. Deleted, it stays, so the doses that name it keep its name.
 */
@Entity
@Table(name = "medicine")
class Medicine implements SyncedRecord {

  @Id private UUID id;

  @Column(nullable = false)
  private String name;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private long version;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private Instant updatedAt;

  @Column(nullable = false)
  private boolean deleted;

  /** The Medicine this one was merged into (see {@link #mergeInto}); {@code null} if none. */
  @Nullable private UUID mergedInto;

  protected Medicine() {}

  Medicine(UUID id, String name) {
    this.id = id;
    this.name = name;
  }

  /** The rejection of a dose naming a Medicine that never existed (a deleted one is fine). */
  static ApiException notFound(UUID id) {
    return new ApiException(
        HttpStatus.NOT_FOUND, "medical.not_found", Map.of("medicineId", id.toString()));
  }

  void rename(String name) {
    this.name = name;
  }

  /**
   * Kept deleted, with its name, because {@code survivor} already has it: the doses naming this
   * Medicine name {@code survivor} instead.
   */
  void mergeInto(UUID survivor) {
    this.mergedInto = survivor;
    markDeleted();
  }

  /** The Medicine a dose naming this one names: the one it was merged into, else itself. */
  UUID forDose() {
    return mergedInto == null ? id : mergedInto;
  }

  /** Soft delete (S2): the row stays, with its name, and its Version advances. */
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

  @Override
  public long version() {
    return version;
  }

  @Override
  public boolean deleted() {
    return deleted;
  }
}

package io.github.aborgatin.familyapp.medical;

import io.github.aborgatin.familyapp.sync.SyncedRecord;
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
 * A Document on a Medical card (GLOSSARY): one file's metadata. The file is an object in the {@link
 * FileStore} under {@link #objectKey(UUID)}, never in the database. Syncable (S1): the client
 * generates the id (S3), the upload creates the row; {@code version} and {@code updatedAt} are set
 * by the database trigger. Its person, Illness event, type and size never change.
 */
@Entity
@Table(name = "document")
class Document implements SyncedRecord {

  @Id private UUID id;

  @Nullable private UUID memberId;

  @Nullable private UUID childId;

  @Nullable private UUID illnessEventId;

  @Column(nullable = false)
  private String title;

  @Column(nullable = false)
  private LocalDate date;

  @Nullable private String description;

  @Column(nullable = false)
  private String contentType;

  @Column(nullable = false)
  private long size;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private long version;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private Instant updatedAt;

  @Column(nullable = false)
  private boolean deleted;

  protected Document() {}

  Document(
      UUID id,
      Person person,
      @Nullable UUID illnessEventId,
      Details details,
      String contentType,
      long size) {
    this.id = id;
    this.memberId = person.memberId();
    this.childId = person.childId();
    this.illnessEventId = illnessEventId;
    this.contentType = contentType;
    this.size = size;
    change(details);
  }

  /** What a Member writes about the file: its title, the date it is from, a description. */
  record Details(String title, LocalDate date, @Nullable String description) {}

  /** The object key of a Document's file in the {@link FileStore}. */
  static String objectKey(UUID id) {
    return "documents/" + id;
  }

  void change(Details details) {
    this.title = details.title();
    this.date = details.date();
    this.description = details.description();
  }

  /** Soft delete (S2): the row stays and its Version advances; the file goes after the commit. */
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

  @Nullable
  UUID illnessEventId() {
    return illnessEventId;
  }

  Details details() {
    return new Details(title, date, description);
  }

  String contentType() {
    return contentType;
  }

  long size() {
    return size;
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

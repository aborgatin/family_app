package io.github.aborgatin.familyapp.medical;

import io.github.aborgatin.familyapp.sync.SyncedRecord;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;
import org.springframework.lang.Nullable;

/**
 * An Illness event (GLOSSARY): a Medicine dose, a Temperature or a Note event in an Illness or
 * Condition. Its date and optional time are wall-clock values as written. Syncable (S1), like
 * {@link Illness}.
 */
@Entity
@Table(name = "illness_event")
class IllnessEvent implements SyncedRecord {

  /** What the event records; fixed when it is created. */
  enum Kind {
    MEDICINE_DOSE,
    TEMPERATURE,
    NOTE
  }

  /** The fields an event is created with. */
  record Details(
      Kind kind,
      LocalDate date,
      @Nullable LocalTime time,
      @Nullable UUID medicineId,
      @Nullable String amount,
      @Nullable BigDecimal temperature,
      @Nullable String title,
      @Nullable String description) {}

  @Id private UUID id;

  @Column(nullable = false)
  private UUID illnessId;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private Kind kind;

  @Column(nullable = false)
  private LocalDate date;

  @Nullable private LocalTime time;

  @Nullable private UUID medicineId;

  @Nullable private String amount;

  @Nullable private BigDecimal temperature;

  @Nullable private String title;

  @Nullable private String description;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private long version;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private Instant updatedAt;

  @Column(nullable = false)
  private boolean deleted;

  protected IllnessEvent() {}

  IllnessEvent(UUID id, UUID illnessId, Details details) {
    this.id = id;
    this.illnessId = illnessId;
    this.kind = details.kind();
    this.date = details.date();
    this.time = details.time();
    this.medicineId = details.medicineId();
    this.amount = details.amount();
    this.temperature = details.temperature();
    this.title = details.title();
    this.description = details.description();
  }

  /** An edit: every field but the kind, which never changes; a new Illness moves it. */
  void change(UUID illnessId, Details details) {
    this.illnessId = illnessId;
    this.date = details.date();
    this.time = details.time();
    this.medicineId = details.medicineId();
    this.amount = details.amount();
    this.temperature = details.temperature();
    this.title = details.title();
    this.description = details.description();
  }

  /** Soft delete (S2): the row stays and its Version advances. */
  void markDeleted() {
    this.deleted = true;
  }

  @Override
  public UUID id() {
    return id;
  }

  UUID illnessId() {
    return illnessId;
  }

  Details details() {
    return new Details(kind, date, time, medicineId, amount, temperature, title, description);
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

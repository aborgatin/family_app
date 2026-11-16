package io.github.aborgatin.familyapp.medical;

import io.github.aborgatin.familyapp.error.FieldErrors;
import io.github.aborgatin.familyapp.sync.Operation;
import io.github.aborgatin.familyapp.sync.Outcome;
import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;

/** The {@code illness_event} table of the sync push and pull (spec #128, ticket #129). */
@Service
class IllnessEventService implements SyncableTable {

  private final IllnessEventRepository events;
  private final IllnessRepository illnesses;
  private final MedicineService medicines;

  IllnessEventService(
      IllnessEventRepository events, IllnessRepository illnesses, MedicineService medicines) {
    this.events = events;
    this.illnesses = illnesses;
    this.medicines = medicines;
  }

  @Override
  public String name() {
    return "illness_event";
  }

  /**
   * An upsert of an unknown id adds an event to the Illness it carries ({@code illnessId}, {@code
   * kind} and {@code date} required). An upsert of a known one changes nothing yet. A delete
   * deletes it. Delete wins: an event for a deleted Illness is ignored. An Illness that never
   * existed, or is on another Member's card, and an event on such a card, is {@code
   * medical.not_found}; so is a dose of a Medicine that never existed (a deleted one is fine).
   */
  @Override
  public Outcome apply(Operation operation) {
    Optional<IllnessEvent> existing = events.findById(operation.id());
    if (existing.isPresent() && !visible(existing.get().illnessId(), operation.memberId())) {
      throw Person.notFound("illnessEventId", operation.id());
    }
    return Outcome.deleteWins(operation, existing, this::upsert, this::delete);
  }

  private boolean visible(UUID illnessId, UUID memberId) {
    return illnesses
        .findById(illnessId)
        .map(illness -> illness.person().visibleTo(memberId))
        .orElse(false);
  }

  private Outcome upsert(Operation operation, Optional<IllnessEvent> existing) {
    if (existing.isPresent()) {
      return Outcome.APPLIED;
    }
    FieldErrors errors = new FieldErrors();
    UUID illnessId = errors.requiredUuid("illnessId", operation.text("illnessId"));
    IllnessEvent.Kind kind =
        errors.requiredChoice("kind", operation.text("kind"), IllnessEvent.Kind.values());
    LocalDate date = errors.requiredParsed("date", operation.text("date"), LocalDate::parse);
    LocalTime time = errors.time("time", operation.text("time"));
    BigDecimal temperature = temperature(errors, operation.number("temperature"));
    UUID medicineId = errors.uuid("medicineId", operation.text("medicineId"));
    String title = operation.trimmedText("title");
    if (kind == IllnessEvent.Kind.TEMPERATURE
        && temperature == null
        && !errors.has("temperature")) {
      errors.add("temperature", FieldErrors.REQUIRED);
    }
    if (kind == IllnessEvent.Kind.NOTE && title == null) {
      errors.add("title", FieldErrors.REQUIRED);
    }
    if (kind == IllnessEvent.Kind.MEDICINE_DOSE
        && medicineId == null
        && !errors.has("medicineId")) {
      errors.add("medicineId", FieldErrors.REQUIRED);
    }
    errors.throwIfAny();
    Illness illness =
        illnesses
            .findById(illnessId)
            .filter(found -> found.person().visibleTo(operation.memberId()))
            .orElseThrow(() -> Person.notFound("illnessId", illnessId));
    if (illness.deleted()) {
      return Outcome.IGNORED;
    }
    if (medicineId != null && !medicines.exists(medicineId)) {
      throw Medicine.notFound(medicineId);
    }
    events.saveAndFlush(
        new IllnessEvent(
            operation.id(),
            illnessId,
            new IllnessEvent.Details(
                kind,
                date,
                time,
                medicineId,
                operation.trimmedText("amount"),
                temperature,
                title,
                operation.trimmedText("description"))));
    return Outcome.APPLIED;
  }

  private Outcome delete(IllnessEvent event) {
    event.markDeleted();
    events.saveAndFlush(event);
    return Outcome.APPLIED;
  }

  private static final BigDecimal LOWEST = new BigDecimal("34.0");
  private static final BigDecimal HIGHEST = new BigDecimal("43.0");

  /** A body temperature: 34.0–43.0 °C, at most one decimal place ({@code value.invalid} else). */
  @Nullable
  private static BigDecimal temperature(FieldErrors errors, @Nullable Double value) {
    if (value == null) {
      return null;
    }
    BigDecimal temperature = BigDecimal.valueOf(value);
    if (temperature.compareTo(LOWEST) < 0
        || temperature.compareTo(HIGHEST) > 0
        || temperature.stripTrailingZeros().scale() > 1) {
      errors.add("temperature", FieldErrors.VALUE_INVALID);
      return null;
    }
    return temperature.setScale(1);
  }

  /** Only the events on cards the Member sees: the others are left out, not even tombstoned. */
  @Override
  public List<SyncRow> changesSince(long version, UUID memberId) {
    List<IllnessEvent> changed = events.findByVersionGreaterThan(version);
    Map<UUID, Person> persons =
        illnesses
            .findByIdIn(changed.stream().map(IllnessEvent::illnessId).collect(Collectors.toSet()))
            .stream()
            .collect(Collectors.toMap(Illness::id, Illness::person));
    return SyncRow.changes(
        changed.stream()
            .filter(event -> persons.get(event.illnessId()).visibleTo(memberId))
            .toList(),
        (event, fields) -> {
          IllnessEvent.Details details = event.details();
          fields.put("illnessId", event.illnessId());
          fields.put("kind", details.kind().name());
          fields.put("date", details.date().toString());
          fields.put(
              "time",
              details.time() == null ? null : FieldErrors.TIME_OF_DAY.format(details.time()));
          fields.put("medicineId", details.medicineId());
          fields.put("amount", details.amount());
          fields.put("temperature", details.temperature());
          fields.put("title", details.title());
          fields.put("description", details.description());
        });
  }
}

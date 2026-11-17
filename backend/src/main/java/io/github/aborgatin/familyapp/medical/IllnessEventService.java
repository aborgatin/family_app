package io.github.aborgatin.familyapp.medical;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.error.FieldErrors;
import io.github.aborgatin.familyapp.sync.Operation;
import io.github.aborgatin.familyapp.sync.Outcome;
import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import io.github.aborgatin.familyapp.sync.TimeOfDay;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;

/** The {@code illness_event} table of the sync push and pull (spec #128, ticket #129). */
@Service
class IllnessEventService implements SyncableTable {

  private final IllnessEventRepository events;
  private final IllnessRepository illnesses;
  private final MedicineService medicines;
  private final ApplicationEventPublisher publisher;
  private final DocumentService documents;

  IllnessEventService(
      IllnessEventRepository events,
      IllnessRepository illnesses,
      MedicineService medicines,
      ApplicationEventPublisher publisher,
      DocumentService documents) {
    this.events = events;
    this.illnesses = illnesses;
    this.medicines = medicines;
    this.publisher = publisher;
    this.documents = documents;
  }

  @Override
  public String name() {
    return "illness_event";
  }

  /**
   * An upsert of an unknown id adds an event to the Illness it carries ({@code illnessId}, {@code
   * kind} and {@code date} required). An upsert of a known one edits or moves it (its Document goes
   * with it). A delete deletes it with its Document. Delete wins: an event for a deleted Illness is
   * ignored. A Condition takes Note events only ({@code illness.condition_takes_notes_only}). An
   * Illness that never existed, or is on another Member's card, and an event on such a card, is
   * {@code medical.not_found}; so is a dose of a Medicine that never existed (a deleted one is
   * fine). A new dose on a Child's card publishes {@link MedicineDoseLogged}; an edit or a move
   * publishes nothing.
   */
  @Override
  public Outcome apply(Operation operation) {
    Optional<IllnessEvent> existing = events.findById(operation.id());
    if (existing.isPresent()
        && illnessOn(existing.get().illnessId(), operation.memberId()).isEmpty()) {
      throw Person.notFound("illnessEventId", operation.id());
    }
    return Outcome.deleteWins(operation, existing, this::upsert, this::delete);
  }

  /**
   * The Illness, deleted or not, when it exists and is on a card {@code viewer} sees: the one
   * lookup of an Illness's visibility.
   */
  private Optional<Illness> illnessOn(UUID illnessId, UUID viewer) {
    return illnesses.findById(illnessId).filter(found -> found.person().visibleTo(viewer));
  }

  private Outcome upsert(Operation operation, Optional<IllnessEvent> existing) {
    if (existing.isPresent()) {
      return edit(operation, existing.get());
    }
    FieldErrors errors = new FieldErrors();
    UUID illnessId = errors.requiredUuid("illnessId", operation.text("illnessId"));
    IllnessEvent.Details details = details(operation, null, errors);
    errors.throwIfAny();
    Illness illness =
        illnessOn(illnessId, operation.memberId())
            .orElseThrow(() -> Person.notFound("illnessId", illnessId));
    if (illness.deleted()) {
      return Outcome.IGNORED;
    }
    requireConditionTakesNote(illness, details.kind());
    details = namingSurvivor(details);
    events.saveAndFlush(new IllnessEvent(operation.id(), illnessId, details));
    UUID childId = illness.person().childId();
    if (details.kind() == IllnessEvent.Kind.MEDICINE_DOSE && childId != null) {
      publisher.publishEvent(new MedicineDoseLogged(childId, illnessId, operation.memberId()));
    }
    return Outcome.APPLIED;
  }

  /**
   * Changes the fields the upsert carries, checked as a new event's are; its {@code kind} never
   * changes. A new {@code illnessId} moves it to that Illness, which must be on the same card
   * ({@code medical.not_found} else) and, unless it is a Note, not a Condition; a move to a deleted
   * one is ignored (delete wins).
   */
  private Outcome edit(Operation operation, IllnessEvent event) {
    FieldErrors errors = new FieldErrors();
    UUID illnessId =
        operation.has("illnessId")
            ? errors.requiredUuid("illnessId", operation.text("illnessId"))
            : event.illnessId();
    IllnessEvent.Details details = details(operation, event.details(), errors);
    errors.throwIfAny();
    if (!illnessId.equals(event.illnessId())) {
      Person person = illnessOn(event.illnessId(), operation.memberId()).orElseThrow().person();
      Illness target =
          illnessOn(illnessId, operation.memberId())
              .filter(found -> found.person().equals(person))
              .orElseThrow(() -> Person.notFound("illnessId", illnessId));
      if (target.deleted()) {
        return Outcome.IGNORED;
      }
      requireConditionTakesNote(target, details.kind());
    }
    event.change(illnessId, namingSurvivor(details));
    events.saveAndFlush(event);
    return Outcome.APPLIED;
  }

  /**
   * A Condition holds Note events only: a Medicine dose or a Temperature added or moved into one is
   * {@code illness.condition_takes_notes_only}.
   */
  private static void requireConditionTakesNote(Illness illness, IllnessEvent.Kind kind) {
    if (illness.kind() == Illness.Kind.CONDITION && kind != IllnessEvent.Kind.NOTE) {
      throw new ApiException(HttpStatus.CONFLICT, "illness.condition_takes_notes_only");
    }
  }

  /**
   * The details with the Medicine a dose names: a merged one's survivor ({@link
   * MedicineService#forDose}); one that never existed is {@code medical.not_found}.
   */
  private IllnessEvent.Details namingSurvivor(IllnessEvent.Details details) {
    UUID medicineId = details.medicineId();
    return medicineId == null ? details : details.naming(medicines.forDose(medicineId));
  }

  /**
   * The event's fields: those the operation carries, the {@code current} ones for the rest (a new
   * event, {@code current} {@code null}, carries all), with what its kind records required.
   */
  private static IllnessEvent.Details details(
      Operation operation, @Nullable IllnessEvent.Details current, FieldErrors errors) {
    Carried carried = new Carried(operation, current);
    IllnessEvent.Kind kind =
        carried.field(
            "kind",
            () -> errors.requiredChoice("kind", operation.text("kind"), IllnessEvent.Kind.values()),
            IllnessEvent.Details::kind);
    if (current != null && kind != null && kind != current.kind()) {
      errors.add("kind", FieldErrors.VALUE_INVALID);
    }
    LocalDate date =
        carried.field(
            "date",
            () -> errors.requiredParsed("date", operation.text("date"), LocalDate::parse),
            IllnessEvent.Details::date);
    LocalTime time =
        carried.field(
            "time",
            () -> errors.parsed("time", operation.text("time"), TimeOfDay::parse),
            IllnessEvent.Details::time);
    BigDecimal temperature =
        carried.field(
            "temperature",
            () -> temperature(errors, operation.number("temperature")),
            IllnessEvent.Details::temperature);
    UUID medicineId =
        carried.field(
            "medicineId",
            () -> errors.uuid("medicineId", operation.text("medicineId")),
            IllnessEvent.Details::medicineId);
    String amount = carried.trimmedText("amount", IllnessEvent.Details::amount);
    String title = carried.trimmedText("title", IllnessEvent.Details::title);
    String description = carried.trimmedText("description", IllnessEvent.Details::description);
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
    if (kind == IllnessEvent.Kind.MEDICINE_DOSE && amount == null) {
      errors.add("amount", FieldErrors.REQUIRED);
    }
    return new IllnessEvent.Details(
        kind, date, time, medicineId, amount, temperature, title, description);
  }

  /** A field of the event: read from the operation when it carries it (or the event is new). */
  private record Carried(Operation operation, @Nullable IllnessEvent.Details current) {

    @Nullable
    <T> T field(String name, Supplier<T> read, Function<IllnessEvent.Details, T> kept) {
      return current == null || operation.has(name) ? read.get() : kept.apply(current);
    }

    @Nullable
    String trimmedText(String name, Function<IllnessEvent.Details, String> kept) {
      return field(name, () -> operation.trimmedText(name), kept);
    }
  }

  private Outcome delete(IllnessEvent event) {
    event.markDeleted();
    events.saveAndFlush(event);
    documents.deleteOfEvent(event.id());
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
          fields.put("time", details.time() == null ? null : TimeOfDay.format(details.time()));
          fields.put("medicineId", details.medicineId());
          fields.put("amount", details.amount());
          fields.put("temperature", details.temperature());
          fields.put("title", details.title());
          fields.put("description", details.description());
        });
  }
}

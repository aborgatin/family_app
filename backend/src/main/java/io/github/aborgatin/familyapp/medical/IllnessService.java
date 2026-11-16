package io.github.aborgatin.familyapp.medical;

import io.github.aborgatin.familyapp.error.FieldErrors;
import io.github.aborgatin.familyapp.family.ChildDeleted;
import io.github.aborgatin.familyapp.family.Children;
import io.github.aborgatin.familyapp.sync.Operation;
import io.github.aborgatin.familyapp.sync.Outcome;
import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

/** The {@code illness} table of the sync push and pull (spec #128, ticket #129). */
@Service
class IllnessService implements SyncableTable {

  private final IllnessRepository illnesses;
  private final IllnessEventRepository events;
  private final Children children;
  private final Clock clock;

  IllnessService(
      IllnessRepository illnesses, IllnessEventRepository events, Children children, Clock clock) {
    this.illnesses = illnesses;
    this.events = events;
    this.children = children;
    this.clock = clock;
  }

  @Override
  public String name() {
    return "illness";
  }

  /**
   * An upsert of an unknown id creates an Illness or Condition on the card of the person it carries
   * (exactly one of {@code memberId} and {@code childId}), with {@code kind} and {@code name}
   * required. An upsert of a known one changes the {@code name} (required) and {@code description}
   * it carries; its person never changes. A delete deletes it with its events. Delete wins. Another
   * Member's card, and a row on it, is {@code medical.not_found}.
   */
  @Override
  public Outcome apply(Operation operation) {
    Optional<Illness> existing = illnesses.findById(operation.id());
    if (existing.isPresent() && !existing.get().person().visibleTo(operation.memberId())) {
      throw Person.notFound("illnessId", operation.id());
    }
    return Outcome.deleteWins(operation, existing, this::upsert, this::delete);
  }

  private Outcome upsert(Operation operation, Optional<Illness> existing) {
    if (existing.isPresent()) {
      return edit(operation, existing.get());
    }
    FieldErrors errors = new FieldErrors();
    UUID memberId = errors.uuid("memberId", operation.text("memberId"));
    UUID childId = errors.uuid("childId", operation.text("childId"));
    Illness.Kind kind =
        errors.requiredChoice("kind", operation.text("kind"), Illness.Kind.values());
    String name = operation.trimmedText("name");
    if (name == null) {
      errors.add("name", FieldErrors.REQUIRED);
    }
    if (memberId == null && childId == null && !errors.has("memberId") && !errors.has("childId")) {
      errors.add("memberId", FieldErrors.REQUIRED);
    } else if (memberId != null && childId != null) {
      errors.add("childId", FieldErrors.VALUE_INVALID);
    }
    errors.throwIfAny();
    if (memberId != null && !memberId.equals(operation.memberId())) {
      throw Person.notFound("illnessId", operation.id());
    }
    if (childId != null && !children.known(childId)) {
      throw Children.notFound(childId);
    }
    Illness illness =
        new Illness(
            operation.id(),
            new Person(memberId, childId),
            kind,
            name,
            operation.trimmedText("description"),
            operation.number("position"),
            clock.instant());
    if (childId != null && !children.present(childId)) {
      // The Child was deleted meanwhile: delete wins. Kept as deleted, so the events logged with
      // it offline (the same push) are ignored too, not medical.not_found.
      illness.markDeleted();
      illnesses.saveAndFlush(illness);
      return Outcome.IGNORED;
    }
    illnesses.saveAndFlush(illness);
    return Outcome.APPLIED;
  }

  private Outcome edit(Operation operation, Illness illness) {
    if (operation.has("name")) {
      FieldErrors errors = new FieldErrors();
      String name = operation.trimmedText("name");
      if (name == null) {
        errors.add("name", FieldErrors.REQUIRED);
      }
      errors.throwIfAny();
      illness.rename(name);
    }
    if (operation.has("description")) {
      illness.describe(operation.trimmedText("description"));
    }
    illnesses.saveAndFlush(illness);
    return Outcome.APPLIED;
  }

  private Outcome delete(Illness illness) {
    illness.markDeleted();
    illnesses.saveAndFlush(illness);
    events.markDeletedOfIllness(illness.id());
    return Outcome.APPLIED;
  }

  /**
   * A deleted Child takes their Illnesses and Conditions with their events, in the push operation
   * that deletes the Child (which holds the Family lock).
   */
  @EventListener
  void onChildDeleted(ChildDeleted event) {
    events.markDeletedOfChild(event.childId());
    illnesses.markDeletedOfChild(event.childId());
  }

  /** Only the rows of the cards the Member sees: the others are left out, not even tombstoned. */
  @Override
  public List<SyncRow> changesSince(long version, UUID memberId) {
    return SyncRow.changes(
        illnesses.findByVersionGreaterThan(version).stream()
            .filter(illness -> illness.person().visibleTo(memberId))
            .toList(),
        (illness, fields) -> {
          fields.put("memberId", illness.person().memberId());
          fields.put("childId", illness.person().childId());
          fields.put("kind", illness.kind().name());
          fields.put("name", illness.name());
          fields.put("description", illness.description());
          fields.put("ended", illness.ended());
          fields.put("position", illness.position());
          fields.put("createdAt", illness.createdAt());
        });
  }
}

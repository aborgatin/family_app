package io.github.aborgatin.familyapp.medical;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.error.FieldErrors;
import io.github.aborgatin.familyapp.family.ChildDeleted;
import io.github.aborgatin.familyapp.family.Children;
import io.github.aborgatin.familyapp.sync.Operation;
import io.github.aborgatin.familyapp.sync.Outcome;
import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.lang.Nullable;
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
   * required. An upsert of a known one changes nothing yet. A delete deletes it with its events.
   * Delete wins. Another Member's card, and a row on it, is {@code medical.not_found}.
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
      return Outcome.APPLIED;
    }
    FieldErrors errors = new FieldErrors();
    UUID memberId = errors.uuid("memberId", operation.text("memberId"));
    UUID childId = errors.uuid("childId", operation.text("childId"));
    Illness.Kind kind =
        errors.requiredChoice("kind", operation.text("kind"), Illness.Kind.values());
    String name = trimmed(operation.text("name"));
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
    if (childId != null) {
      if (!children.known(childId)) {
        throw new ApiException(
            HttpStatus.NOT_FOUND, "child.not_found", Map.of("childId", childId.toString()));
      }
      if (!children.present(childId)) {
        return Outcome.IGNORED;
      }
    }
    illnesses.saveAndFlush(
        new Illness(
            operation.id(),
            new Person(memberId, childId),
            kind,
            name,
            trimmed(operation.text("description")),
            operation.number("position"),
            clock.instant()));
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

  @Nullable
  private static String trimmed(@Nullable String text) {
    return text == null || text.isBlank() ? null : text.trim();
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

package io.github.aborgatin.familyapp.family.child;

import io.github.aborgatin.familyapp.family.FamilyLock;
import io.github.aborgatin.familyapp.sync.Operation;
import io.github.aborgatin.familyapp.sync.Outcome;
import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Family's Children (spec #5, Children in Settings), and the {@code child} table of the sync
 * push and pull (spec #3). Writes arrive only as Outbox operations; they are idempotent by the
 * client's id (S3).
 */
@Service
class ChildService implements SyncableTable {

  private final ChildRepository children;
  private final ChildColorPalette palette;
  private final FamilyLock familyLock;

  ChildService(ChildRepository children, ChildColorPalette palette, FamilyLock familyLock) {
    this.children = children;
    this.palette = palette;
    this.familyLock = familyLock;
  }

  @Transactional(readOnly = true)
  List<Child> list() {
    return children.findAllInOrder();
  }

  @Override
  public String name() {
    return "child";
  }

  /**
   * An upsert creates the Child (name and color required) or changes only the fields it carries; a
   * delete soft-deletes. Delete wins: anything on a deleted Child, and deleting an unknown one, is
   * ignored.
   */
  @Override
  public Outcome apply(Operation operation) {
    Optional<Child> existing = children.findById(operation.id());
    if (existing.isPresent() && existing.get().deleted()) {
      return Outcome.IGNORED;
    }
    return switch (operation.type()) {
      case UPSERT -> upsert(operation, existing);
      case DELETE -> delete(existing);
    };
  }

  private Outcome upsert(Operation operation, Optional<Child> existing) {
    ChildDetails details = changed(operation, existing).validate(palette);
    // Inside the push the lock is already held; this only reads the Family id.
    UUID familyId = familyLock.lockFamily();
    Child child =
        existing
            .map(
                found -> {
                  found.replace(details);
                  return found;
                })
            .orElseGet(() -> new Child(operation.id(), familyId, details));
    children.saveAndFlush(child);
    return Outcome.APPLIED;
  }

  /** The Child's fields after the operation: the carried ones over what is stored. */
  private static ChildRequest changed(Operation operation, Optional<Child> existing) {
    String name = existing.map(Child::name).orElse(null);
    String color = existing.map(Child::color).orElse(null);
    String birthday = existing.map(Child::birthday).map(java.time.LocalDate::toString).orElse(null);
    return new ChildRequest(
        operation.has("name") ? operation.text("name") : name,
        operation.has("color") ? operation.text("color") : color,
        operation.has("birthday") ? operation.text("birthday") : birthday);
  }

  private Outcome delete(Optional<Child> existing) {
    if (existing.isEmpty()) {
      return Outcome.IGNORED;
    }
    Child child = existing.get();
    child.markDeleted();
    children.saveAndFlush(child);
    return Outcome.APPLIED;
  }

  @Override
  public List<SyncRow> changesSince(long version, UUID memberId) {
    return children.findByVersionGreaterThan(version).stream()
        .map(
            child -> {
              if (child.deleted()) {
                return SyncRow.tombstone(child.id(), child.version());
              }
              Map<String, Object> fields = new LinkedHashMap<>();
              fields.put("name", child.name());
              fields.put("color", child.color());
              fields.put("birthday", child.birthday());
              return SyncRow.of(child.id(), child.version(), fields);
            })
        .toList();
  }
}

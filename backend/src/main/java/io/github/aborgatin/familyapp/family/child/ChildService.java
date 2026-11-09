package io.github.aborgatin.familyapp.family.child;

import io.github.aborgatin.familyapp.family.Family;
import io.github.aborgatin.familyapp.sync.Operation;
import io.github.aborgatin.familyapp.sync.Outcome;
import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * The Family's Children (spec #5, Children in Settings), and the {@code child} table of the sync
 * push and pull (spec #3). Writes arrive only as Outbox operations; they are idempotent by the
 * client's id (S3).
 */
@Service
class ChildService implements SyncableTable {

  private final ChildRepository children;
  private final ChildColorPalette palette;
  private final Family family;

  ChildService(ChildRepository children, ChildColorPalette palette, Family family) {
    this.children = children;
    this.palette = palette;
    this.family = family;
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
    return Outcome.deleteWins(
        operation, children.findById(operation.id()), this::upsert, this::delete);
  }

  private Outcome upsert(Operation operation, Optional<Child> existing) {
    ChildDetails details = changed(operation, existing).validate(palette);
    Child child =
        existing
            .map(
                found -> {
                  found.replace(details);
                  return found;
                })
            .orElseGet(() -> new Child(operation.id(), family.id(), details));
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

  private Outcome delete(Child child) {
    child.markDeleted();
    children.saveAndFlush(child);
    return Outcome.APPLIED;
  }

  @Override
  public List<SyncRow> changesSince(long version, UUID memberId) {
    return SyncRow.changes(
        children.findByVersionGreaterThan(version),
        (child, fields) -> {
          fields.put("name", child.name());
          fields.put("color", child.color());
          fields.put("birthday", child.birthday());
        });
  }
}

package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.sync.Operation;
import io.github.aborgatin.familyapp.sync.Outcome;
import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * The {@code list} table of the sync push and pull (spec #3; ticket #55). Writes arrive only as
 * Outbox operations and are idempotent by the client's id (S3).
 */
@Service
class ListService implements SyncableTable {

  private final Clock clock = Clock.systemUTC();
  private final ListRepository lists;
  private final ItemRepository items;

  ListService(ListRepository lists, ItemRepository items) {
    this.lists = lists;
    this.items = items;
  }

  @Override
  public String name() {
    return "list";
  }

  /**
   * An upsert creates the List (name, kind and Visibility required; the pushing Member becomes the
   * Owner) or changes only the fields it carries. Only the Owner changes Visibility or deletes the
   * List ({@code list.owner_only}). A delete soft-deletes the List and its Items. Delete wins:
   * anything on a deleted List, and deleting an unknown one, is ignored. Another Member's Private
   * List is treated as unknown: {@code list.not_found} (A1).
   */
  @Override
  public Outcome apply(Operation operation) {
    Optional<ListEntity> existing = lists.findById(operation.id());
    if (existing.isPresent()
        && !existing.get().deleted()
        && !existing.get().visibleTo(operation.memberId())) {
      throw ListEntity.notFound(operation.id());
    }
    return Outcome.deleteWins(
        operation, existing, this::upsert, list -> delete(list, operation.memberId()));
  }

  private Outcome upsert(Operation operation, Optional<ListEntity> existing) {
    ListDetails details = changed(operation, existing).validate();
    if (existing.isPresent() && existing.get().kind() != details.kind()) {
      throw new ApiException(HttpStatus.CONFLICT, "list.kind_immutable");
    }
    if (existing.isPresent()
        && existing.get().visibility() != details.visibility()
        && !existing.get().ownerId().equals(operation.memberId())) {
      throw ownerOnly();
    }
    if (details.kind() == ListKind.WISH && details.visibility() == Visibility.PRIVATE) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "list.wish_shared_only");
    }
    boolean visibilityChanged =
        existing.isPresent() && existing.get().visibility() != details.visibility();
    ListEntity list =
        existing
            .map(
                found -> {
                  found.replace(details);
                  return found;
                })
            .orElseGet(
                () ->
                    new ListEntity(operation.id(), operation.memberId(), clock.instant(), details));
    lists.saveAndFlush(list);
    if (visibilityChanged) {
      // The pull sends the Items again: with their fields to a Member who may now see the List,
      // as tombstones to one who no longer may.
      items.bumpVersionsInList(list.id());
    }
    return Outcome.APPLIED;
  }

  private Outcome delete(ListEntity list, UUID memberId) {
    if (!list.ownerId().equals(memberId)) {
      throw ownerOnly();
    }
    list.markDeleted();
    lists.saveAndFlush(list);
    items.markDeletedInList(list.id());
    return Outcome.APPLIED;
  }

  private static ApiException ownerOnly() {
    return new ApiException(HttpStatus.FORBIDDEN, "list.owner_only");
  }

  /** The List's fields after the operation: the carried ones over what is stored. */
  private static ListRequest changed(Operation operation, Optional<ListEntity> existing) {
    String name = existing.map(ListEntity::name).orElse(null);
    String kind = existing.map(list -> list.kind().name()).orElse(null);
    String visibility = existing.map(list -> list.visibility().name()).orElse(null);
    return new ListRequest(
        operation.has("name") ? operation.text("name") : name,
        operation.has("kind") ? operation.text("kind") : kind,
        operation.has("visibility") ? operation.text("visibility") : visibility);
  }

  /**
   * Lists changed since {@code version}. Another Member's Private List is never sent with its
   * content (A1): it comes as a tombstone, so a List made Private disappears from the other
   * Member's phone, and a first sync (which drops tombstones) leaves it out.
   */
  @Override
  public List<SyncRow> changesSince(long version, UUID memberId) {
    return SyncRow.changes(
        lists.findByVersionGreaterThan(version),
        list -> list.visibleTo(memberId),
        (list, fields) -> {
          fields.put("name", list.name());
          fields.put("kind", list.kind().name());
          fields.put("visibility", list.visibility().name());
          fields.put("ownerId", list.ownerId().toString());
          fields.put("createdAt", list.createdAt().toString());
        });
  }
}

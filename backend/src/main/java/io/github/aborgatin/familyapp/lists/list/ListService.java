package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.sync.Operation;
import io.github.aborgatin.familyapp.sync.Outcome;
import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

  private final ListRepository lists;

  ListService(ListRepository lists) {
    this.lists = lists;
  }

  @Override
  public String name() {
    return "list";
  }

  /**
   * An upsert creates the List (name, kind and Visibility required; the pushing Member becomes the
   * Owner) or changes only the fields it carries; a delete soft-deletes. Delete wins: anything on a
   * deleted List, and deleting an unknown one, is ignored. Another Member's Private List is treated
   * as unknown: {@code list.not_found} (A1).
   */
  @Override
  public Outcome apply(Operation operation) {
    Optional<ListEntity> existing = lists.findById(operation.id());
    if (existing.isPresent() && existing.get().deleted()) {
      return Outcome.IGNORED;
    }
    if (existing.isPresent() && !existing.get().visibleTo(operation.memberId())) {
      throw new ApiException(
          HttpStatus.NOT_FOUND, "list.not_found", Map.of("listId", operation.id().toString()));
    }
    return switch (operation.type()) {
      case UPSERT -> upsert(operation, existing);
      case DELETE -> delete(existing);
    };
  }

  private Outcome upsert(Operation operation, Optional<ListEntity> existing) {
    ListDetails details = changed(operation, existing).validate();
    if (existing.isPresent() && existing.get().kind() != details.kind()) {
      throw new ApiException(HttpStatus.CONFLICT, "list.kind_immutable");
    }
    if (details.kind() == ListKind.WISH && details.visibility() == Visibility.PRIVATE) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "list.wish_shared_only");
    }
    ListEntity list =
        existing
            .map(
                found -> {
                  found.replace(details);
                  return found;
                })
            .orElseGet(
                () -> new ListEntity(operation.id(), operation.memberId(), Instant.now(), details));
    lists.saveAndFlush(list);
    return Outcome.APPLIED;
  }

  private Outcome delete(Optional<ListEntity> existing) {
    if (existing.isEmpty()) {
      return Outcome.IGNORED;
    }
    ListEntity list = existing.get();
    list.markDeleted();
    lists.saveAndFlush(list);
    return Outcome.APPLIED;
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
    return lists.findByVersionGreaterThan(version).stream()
        .map(
            list -> {
              if (list.deleted() || !list.visibleTo(memberId)) {
                return SyncRow.tombstone(list.id(), list.version());
              }
              Map<String, Object> fields = new LinkedHashMap<>();
              fields.put("name", list.name());
              fields.put("kind", list.kind().name());
              fields.put("visibility", list.visibility().name());
              fields.put("ownerId", list.ownerId().toString());
              fields.put("createdAt", list.createdAt().toString());
              return SyncRow.of(list.id(), list.version(), fields);
            })
        .toList();
  }
}

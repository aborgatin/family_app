package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.sync.Operation;
import io.github.aborgatin.familyapp.sync.Outcome;
import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * The {@code item_history} table (spec #4; ticket #74): the names ever added to a Shopping list,
 * for autocomplete. The server keeps it as Items are written ({@link #used}); the push may only
 * delete a row (a mistyped name, ticket #78), never upsert one ({@code sync.read_only}). Seen and
 * deleted by the Members who may see its List (A1).
 */
@Service
class ItemHistoryService implements SyncableTable {

  private final ItemHistoryRepository history;
  private final VisibleLists visibleLists;

  ItemHistoryService(ItemHistoryRepository history, VisibleLists visibleLists) {
    this.history = history;
    this.visibleLists = visibleLists;
  }

  @Override
  public String name() {
    return "item_history";
  }

  /**
   * Only a delete: it soft-deletes the row, for any Member who may see its List ({@code
   * list.not_found} otherwise); deleting a deleted or unknown row is ignored. An upsert is {@code
   * sync.read_only}: only the server writes names.
   */
  @Override
  public Outcome apply(Operation operation) {
    if (operation.type() == Operation.Type.UPSERT) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "sync.read_only");
    }
    Optional<ItemHistoryEntity> existing = history.findById(operation.id());
    if (existing.isEmpty() || existing.get().deleted()) {
      return Outcome.IGNORED;
    }
    ItemHistoryEntity row = existing.get();
    visibleLists.find(row.listId(), operation.memberId());
    row.markDeleted();
    history.saveAndFlush(row);
    return Outcome.APPLIED;
  }

  /**
   * An Item of this List was given this name (created, renamed or set open again): upserts the
   * name's row with its latest spelling and {@code at}, reviving it if a Member removed it. Only
   * Shopping lists keep a history.
   */
  void used(ListEntity list, String name, Instant at) {
    if (list.kind() != ListKind.SHOPPING) {
      return;
    }
    ItemHistoryEntity row =
        history
            .findByListIdAndNormalizedName(list.id(), ItemHistoryEntity.normalize(name))
            .map(
                found -> {
                  found.used(name, at);
                  return found;
                })
            .orElseGet(() -> new ItemHistoryEntity(list.id(), name, at));
    history.saveAndFlush(row);
  }

  /**
   * History changed since {@code version}. A row of another Member's Private List is never sent
   * with its content (A1): it comes as a tombstone, like its List.
   */
  @Override
  public List<SyncRow> changesSince(long version, UUID memberId) {
    List<ItemHistoryEntity> changed = history.findByVersionGreaterThan(version);
    return SyncRow.changes(
        changed,
        visibleLists.rowsVisibleTo(memberId, changed, ItemHistoryEntity::listId),
        (row, fields) -> {
          fields.put("listId", row.listId().toString());
          fields.put("name", row.name());
          fields.put("lastUsedAt", row.lastUsedAt().toString());
        });
  }
}

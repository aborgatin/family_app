package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * The {@code item_history} table (spec #4; ticket #74): the names ever added to a Shopping list,
 * for autocomplete. The server keeps it as Items are written ({@link #used}); the push may not
 * write it ({@code sync.read_only}, the default of {@link SyncableTable#apply}). Seen by the
 * Members who may see its List (A1).
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
   * An Item of this List was given this name (created, renamed or set open again): upserts the
   * name's row with its latest spelling and {@code at}. Only Shopping lists keep a history.
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

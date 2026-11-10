package io.github.aborgatin.familyapp.lists.list;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * Privacy (A1) for the tables whose rows belong to a List (Items, Categories): a row is seen and
 * changed only by the Members who may see its List, and another Member's Private List is treated as
 * unknown ({@code list.not_found}).
 */
@Component
class VisibleLists {

  private final ListRepository lists;

  VisibleLists(ListRepository lists) {
    this.lists = lists;
  }

  /** The List, deleted or not, when this Member may see it; else {@code list.not_found} (A1). */
  ListEntity find(UUID listId, UUID memberId) {
    return lists
        .findById(listId)
        .filter(list -> list.visibleTo(memberId))
        .orElseThrow(() -> ListEntity.notFound(listId));
  }

  /**
   * For a pull: which of these rows the Member may see, by their List. Loads the Lists once ({@code
   * findAllById}); a row of an unknown List is not visible.
   */
  <R> Predicate<R> rowsVisibleTo(UUID memberId, Collection<R> rows, Function<R, UUID> listIdOfRow) {
    Map<UUID, ListEntity> listsById =
        lists.findAllById(rows.stream().map(listIdOfRow).distinct().toList()).stream()
            .collect(Collectors.toMap(ListEntity::id, Function.identity()));
    return row -> {
      ListEntity list = listsById.get(listIdOfRow.apply(row));
      return list != null && list.visibleTo(memberId);
    };
  }
}

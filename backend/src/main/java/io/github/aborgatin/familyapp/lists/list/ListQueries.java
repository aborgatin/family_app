package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.family.MemberSummary;
import io.github.aborgatin.familyapp.family.Members;
import io.github.aborgatin.familyapp.lists.DueItem;
import io.github.aborgatin.familyapp.lists.ItemSummary;
import io.github.aborgatin.familyapp.lists.ListSummary;
import io.github.aborgatin.familyapp.lists.Lists;
import io.github.aborgatin.familyapp.lists.Visibility;
import java.time.Instant;
import java.time.LocalTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The {@link Lists} query API for other modules (spec #104), on the repositories. */
@Service
@Transactional(readOnly = true)
class ListQueries implements Lists {

  private final ListRepository lists;
  private final ItemRepository items;
  private final Members members;

  ListQueries(ListRepository lists, ItemRepository items, Members members) {
    this.lists = lists;
    this.items = items;
    this.members = members;
  }

  @Override
  public Optional<ListSummary> find(UUID listId) {
    return lists.findById(listId).filter(list -> !list.deleted()).map(this::summary);
  }

  @Override
  public boolean visibleTo(UUID listId, UUID memberId) {
    return lists
        .findById(listId)
        .filter(list -> !list.deleted() && list.visibleTo(memberId))
        .isPresent();
  }

  @Override
  public Map<UUID, ItemSummary> items(Collection<UUID> itemIds) {
    return items.findAllById(itemIds).stream()
        .filter(item -> !item.deleted())
        .map(item -> new ItemSummary(item.id(), item.listId(), item.text(), item.assigneeId()))
        .collect(Collectors.toMap(ItemSummary::id, Function.identity()));
  }

  @Override
  public List<DueItem> dueBetween(Instant after, Instant until, LocalTime morningTime) {
    throw new UnsupportedOperationException("not yet");
  }

  private ListSummary summary(ListEntity list) {
    List<UUID> seenBy =
        list.visibility() == Visibility.PRIVATE
            ? List.of(list.ownerId())
            : members.all().stream().map(MemberSummary::id).toList();
    return new ListSummary(
        list.id(), list.name(), list.kind(), list.visibility(), list.ownerId(), seenBy);
  }
}

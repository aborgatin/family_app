package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.family.MemberSummary;
import io.github.aborgatin.familyapp.family.Members;
import io.github.aborgatin.familyapp.lists.DueItem;
import io.github.aborgatin.familyapp.lists.ItemSummary;
import io.github.aborgatin.familyapp.lists.ListSummary;
import io.github.aborgatin.familyapp.lists.Lists;
import io.github.aborgatin.familyapp.lists.Visibility;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
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
    return liveList(listId).map(this::summary);
  }

  @Override
  public boolean visibleTo(UUID listId, UUID memberId) {
    return liveList(listId).filter(list -> list.visibleTo(memberId)).isPresent();
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
    ZoneId zone = ZoneId.systemDefault();
    return items
        .findOpenDueBetween(LocalDate.ofInstant(after, zone), LocalDate.ofInstant(until, zone))
        .stream()
        .map(item -> Map.entry(dueMoment(item.dueDate(), morningTime, zone), item))
        .filter(due -> due.getKey().isAfter(after) && !due.getKey().isAfter(until))
        .sorted(Map.Entry.comparingByKey())
        .map(Map.Entry::getValue)
        .map(
            item ->
                new DueItem(
                    item.id(),
                    item.text(),
                    item.listId(),
                    item.assigneeId(),
                    item.dueDate().day(),
                    item.dueDate().time()))
        .toList();
  }

  /** The Due date at its time, or at {@code morningTime} without one, in {@code zone}. */
  private static Instant dueMoment(DueDate dueDate, LocalTime morningTime, ZoneId zone) {
    LocalTime time = dueDate.time() == null ? morningTime : dueDate.time();
    return dueDate.day().atTime(time).atZone(zone).toInstant();
  }

  /** The List, unless it is unknown or deleted. */
  private Optional<ListEntity> liveList(UUID listId) {
    return lists.findById(listId).filter(list -> !list.deleted());
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

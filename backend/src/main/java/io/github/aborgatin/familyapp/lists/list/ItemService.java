package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.error.FieldErrors;
import io.github.aborgatin.familyapp.sync.Operation;
import io.github.aborgatin.familyapp.sync.Outcome;
import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * The {@code item} table of the sync push and pull (spec #3; ticket #57). Writes arrive only as
 * Outbox operations and are idempotent by the client's id (S3). An Item is seen and changed only by
 * the Members who may see its List (A1).
 */
@Service
class ItemService implements SyncableTable {

  private final Clock clock = Clock.systemUTC();
  private final ItemRepository items;
  private final ListRepository lists;

  ItemService(ItemRepository items, ListRepository lists) {
    this.items = items;
    this.lists = lists;
  }

  @Override
  public String name() {
    return "item";
  }

  /**
   * An upsert creates the Item ({@code listId} and {@code text} required; the pushing Member
   * becomes the Creator) or changes only the fields it carries; the List never changes. A delete
   * soft-deletes. Delete wins: anything on a deleted Item, creating one in a deleted List, and
   * deleting an unknown one, is ignored. An Item of another Member's Private List, or in an unknown
   * List, is {@code list.not_found} (A1).
   */
  @Override
  public Outcome apply(Operation operation) {
    Optional<ItemEntity> existing = items.findById(operation.id());
    if (existing.isPresent() && !existing.get().deleted()) {
      visibleList(existing.get().listId(), operation.memberId());
    }
    return Outcome.deleteWins(
        operation,
        existing,
        (upsert, item) -> item.isPresent() ? change(upsert, item.get()) : create(upsert),
        this::delete);
  }

  private Outcome create(Operation operation) {
    UUID listId = listId(operation);
    ListEntity list = visibleList(listId, operation.memberId());
    if (list.deleted()) {
      return Outcome.IGNORED;
    }
    ItemDetails details =
        new ItemRequest(operation.text("text"), operation.text("description")).validate();
    boolean done = operation.has("done") && done(operation);
    Instant now = clock.instant();
    ItemEntity item = new ItemEntity(operation.id(), listId, operation.memberId(), now, details);
    item.markDone(done, operation.memberId(), now);
    items.saveAndFlush(item);
    return Outcome.APPLIED;
  }

  private Outcome change(Operation operation, ItemEntity item) {
    if (operation.has("listId") && !item.listId().equals(listId(operation))) {
      new FieldErrors().add("listId", FieldErrors.VALUE_INVALID).throwIfAny();
    }
    ItemDetails details =
        new ItemRequest(
                operation.has("text") ? operation.text("text") : item.text(),
                operation.has("description") ? operation.text("description") : item.description())
            .validate();
    boolean done = operation.has("done") ? done(operation) : item.done();
    item.replace(details);
    item.markDone(done, operation.memberId(), clock.instant());
    items.saveAndFlush(item);
    return Outcome.APPLIED;
  }

  private Outcome delete(ItemEntity item) {
    item.markDeleted();
    items.saveAndFlush(item);
    return Outcome.APPLIED;
  }

  /** The operation's {@code done}: a boolean, never {@code null}. */
  private static boolean done(Operation operation) {
    Boolean done = operation.bool("done");
    if (done == null) {
      new FieldErrors().add("done", FieldErrors.REQUIRED).throwIfAny();
    }
    return Boolean.TRUE.equals(done);
  }

  /** The operation's {@code listId}: required, a UUID. */
  private static UUID listId(Operation operation) {
    String value = operation.text("listId");
    FieldErrors errors = new FieldErrors();
    if (value == null || value.isBlank()) {
      errors.add("listId", FieldErrors.REQUIRED).throwIfAny();
    }
    try {
      return UUID.fromString(String.valueOf(value));
    } catch (IllegalArgumentException e) {
      errors.add("listId", FieldErrors.VALUE_INVALID).throwIfAny();
      throw e;
    }
  }

  /** The List, deleted or not, when this Member may see it; else {@code list.not_found} (A1). */
  private ListEntity visibleList(UUID listId, UUID memberId) {
    return lists
        .findById(listId)
        .filter(list -> list.visibleTo(memberId))
        .orElseThrow(() -> ListEntity.notFound(listId));
  }

  /**
   * Items changed since {@code version}. An Item of another Member's Private List is never sent
   * with its content (A1): it comes as a tombstone, like its List.
   */
  @Override
  public List<SyncRow> changesSince(long version, UUID memberId) {
    List<ItemEntity> changed = items.findByVersionGreaterThan(version);
    Map<UUID, ListEntity> listsById =
        lists.findAllById(changed.stream().map(ItemEntity::listId).distinct().toList()).stream()
            .collect(Collectors.toMap(ListEntity::id, Function.identity()));
    return SyncRow.changes(
        changed,
        item -> {
          ListEntity list = listsById.get(item.listId());
          return list != null && list.visibleTo(memberId);
        },
        (item, fields) -> {
          fields.put("listId", item.listId().toString());
          fields.put("text", item.text());
          fields.put("description", item.description());
          fields.put("done", item.done());
          fields.put("doneById", item.doneById() == null ? null : item.doneById().toString());
          fields.put("doneAt", item.doneAt() == null ? null : item.doneAt().toString());
          fields.put("creatorId", item.creatorId().toString());
          fields.put("createdAt", item.createdAt().toString());
        });
  }
}

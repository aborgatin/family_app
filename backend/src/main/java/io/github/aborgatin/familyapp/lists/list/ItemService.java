package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.error.FieldErrors;
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
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;

/**
 * The {@code item} table of the sync push and pull (spec #3; ticket #57). Writes arrive only as
 * Outbox operations and are idempotent by the client's id (S3). An Item is seen and changed only by
 * the Members who may see its List (A1).
 */
@Service
class ItemService implements SyncableTable {

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
    if (existing.isPresent()) {
      ItemEntity item = existing.get();
      if (item.deleted()) {
        return Outcome.IGNORED;
      }
      visibleList(item.listId(), operation.memberId());
      return switch (operation.type()) {
        case UPSERT -> change(operation, item);
        case DELETE -> delete(item);
      };
    }
    if (operation.type() == Operation.Type.DELETE) {
      return Outcome.IGNORED;
    }
    UUID listId = listId(operation);
    ListEntity list = visibleList(listId, operation.memberId());
    if (list.deleted()) {
      return Outcome.IGNORED;
    }
    ItemDetails details =
        new ItemRequest(operation.text("text"), operation.text("note")).validate();
    boolean done = operation.has("done") && done(operation);
    ItemEntity item =
        new ItemEntity(operation.id(), listId, operation.memberId(), Instant.now(), details);
    item.markDone(done, operation.memberId(), Instant.now());
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
                operation.has("note") ? operation.text("note") : item.note())
            .validate();
    boolean done = operation.has("done") ? done(operation) : item.done();
    item.replace(details);
    item.markDone(done, operation.memberId(), Instant.now());
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
        .orElseThrow(
            () ->
                new ApiException(
                    HttpStatus.NOT_FOUND, "list.not_found", Map.of("listId", listId.toString())));
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
    return changed.stream().map(item -> row(item, listsById.get(item.listId()), memberId)).toList();
  }

  private static SyncRow row(ItemEntity item, @Nullable ListEntity list, UUID memberId) {
    if (item.deleted() || list == null || !list.visibleTo(memberId)) {
      return SyncRow.tombstone(item.id(), item.version());
    }
    Map<String, Object> fields = new LinkedHashMap<>();
    fields.put("listId", item.listId().toString());
    fields.put("text", item.text());
    fields.put("note", item.note());
    fields.put("done", item.done());
    fields.put("doneById", item.doneById() == null ? null : item.doneById().toString());
    fields.put("doneAt", item.doneAt() == null ? null : item.doneAt().toString());
    fields.put("creatorId", item.creatorId().toString());
    fields.put("createdAt", item.createdAt().toString());
    return SyncRow.of(item.id(), item.version(), fields);
  }
}

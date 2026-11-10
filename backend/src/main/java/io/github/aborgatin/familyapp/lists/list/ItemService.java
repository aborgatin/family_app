package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.error.FieldErrors;
import io.github.aborgatin.familyapp.family.Members;
import io.github.aborgatin.familyapp.sync.Operation;
import io.github.aborgatin.familyapp.sync.Outcome;
import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
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

  /** {@code dueTime} on the wire: {@code HH:MM}, 24 hours, no seconds. */
  private static final DateTimeFormatter DUE_TIME =
      DateTimeFormatter.ofPattern("HH:mm").withResolverStyle(ResolverStyle.STRICT);

  private final Clock clock = Clock.systemUTC();
  private final ItemRepository items;
  private final CategoryRepository categories;
  private final VisibleLists visibleLists;
  private final ItemHistoryService history;
  private final Members members;

  ItemService(
      ItemRepository items,
      CategoryRepository categories,
      VisibleLists visibleLists,
      ItemHistoryService history,
      Members members) {
    this.items = items;
    this.categories = categories;
    this.visibleLists = visibleLists;
    this.history = history;
    this.members = members;
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
    // Looked up once: a change needs the List again for its Category and Item history.
    Optional<ListEntity> list =
        existing
            .filter(item -> !item.deleted())
            .map(item -> visibleLists.find(item.listId(), operation.memberId()));
    return Outcome.deleteWins(
        operation,
        existing,
        (upsert, item) ->
            item.isPresent() ? change(upsert, item.get(), list.orElseThrow()) : create(upsert),
        this::delete);
  }

  private Outcome create(Operation operation) {
    UUID listId = RequestFields.listId(operation);
    ListEntity list = visibleLists.find(listId, operation.memberId());
    if (list.deleted()) {
      return Outcome.IGNORED;
    }
    ItemDetails details =
        new ItemRequest(operation.text("text"), operation.text("description")).validate();
    boolean done = operation.has("done") && done(operation);
    UUID categoryId = operation.has("categoryId") ? categoryId(operation, list) : null;
    DueDate dueDate = dueDate(operation, DueDate.NONE, list);
    UUID assigneeId = operation.has("assigneeId") ? assigneeId(operation, list) : null;
    Instant now = clock.instant();
    ItemEntity item = new ItemEntity(operation.id(), listId, operation.memberId(), now, details);
    item.moveTo(categoryId);
    item.due(dueDate);
    item.assignTo(assigneeId);
    item.markDone(done, operation.memberId(), now);
    items.saveAndFlush(item);
    history.used(list, item.text(), now);
    return Outcome.APPLIED;
  }

  /** Changes a live Item of {@code list} (its own, checked visible by {@link #apply}). */
  private Outcome change(Operation operation, ItemEntity item, ListEntity list) {
    RequestFields.sameList(operation, item.listId());
    ItemDetails details =
        new ItemRequest(
                operation.has("text") ? operation.text("text") : item.text(),
                operation.has("description") ? operation.text("description") : item.description())
            .validate();
    boolean done = operation.has("done") ? done(operation) : item.done();
    UUID categoryId = operation.has("categoryId") ? categoryId(operation, list) : item.categoryId();
    DueDate dueDate = dueDate(operation, item.dueDate(), list);
    UUID assigneeId = operation.has("assigneeId") ? assigneeId(operation, list) : item.assigneeId();
    // The history keeps a name when it is given (a new text) or used again (Done → open).
    boolean nameUsed = !details.text().equals(item.text()) || (item.done() && !done);
    Instant now = clock.instant();
    item.replace(details);
    item.moveTo(categoryId);
    item.due(dueDate);
    item.assignTo(assigneeId);
    item.markDone(done, operation.memberId(), now);
    items.saveAndFlush(item);
    if (nameUsed) {
      history.used(list, item.text(), now);
    }
    return Outcome.APPLIED;
  }

  private Outcome delete(ItemEntity item) {
    item.markDeleted();
    items.saveAndFlush(item);
    return Outcome.APPLIED;
  }

  /**
   * The operation's {@code categoryId}: {@code null} is the Unnamed category. It must be a Category
   * of the Item's own List, which must be a Shopping list ({@code item.category_not_found}
   * otherwise). A Category deleted meanwhile gives {@code null}: the Item is kept, in the Unnamed
   * category, rather than lost (spec #4, user story 50).
   */
  @Nullable
  private UUID categoryId(Operation operation, ListEntity list) {
    UUID categoryId = RequestFields.uuid(operation, "categoryId");
    if (categoryId == null) {
      return null;
    }
    CategoryEntity category =
        categories
            .findById(categoryId)
            .filter(found -> found.listId().equals(list.id()))
            .filter(found -> list.kind() == ListKind.SHOPPING)
            .orElseThrow(
                () ->
                    new ApiException(
                        HttpStatus.NOT_FOUND,
                        "item.category_not_found",
                        Map.of("categoryId", categoryId.toString())));
    return category.deleted() ? null : categoryId;
  }

  /**
   * The Due date the operation leaves on an Item of {@code list} that had {@code stored}: {@code
   * dueDate} ({@code YYYY-MM-DD} or {@code null}) and {@code dueTime} ({@code HH:MM} or {@code
   * null}) are each their own field (Last write wins per field), and setting {@code dueDate} to
   * {@code null} removes the time too. Rejected: either field on an Item of a List that is not a
   * Todo list ({@code item.list_not_todo}), a malformed value ({@code validation.failed}, {@code
   * value.invalid}), and a time left without a day ({@code item.due_time_without_due_date}).
   */
  private static DueDate dueDate(Operation operation, DueDate stored, ListEntity list) {
    boolean carriesDay = operation.has("dueDate");
    boolean carriesTime = operation.has("dueTime");
    if (!carriesDay && !carriesTime) {
      return stored;
    }
    if (list.kind() != ListKind.TODO) {
      throw listNotTodo(list);
    }
    FieldErrors errors = new FieldErrors();
    LocalDate day =
        carriesDay ? parsed(operation, "dueDate", LocalDate::parse, errors) : stored.day();
    LocalTime time = day == null ? null : stored.time();
    if (carriesTime) {
      time = parsed(operation, "dueTime", text -> LocalTime.parse(text, DUE_TIME), errors);
    }
    errors.throwIfAny();
    if (time != null && day == null) {
      throw new ApiException(HttpStatus.CONFLICT, "item.due_time_without_due_date");
    }
    return new DueDate(day, time);
  }

  /**
   * The operation's {@code assigneeId} for an Item of {@code list}: a Member's id, or {@code null}
   * for nobody. Rejected: the field, even {@code null}, on an Item of a List that is not a Todo
   * list ({@code item.list_not_todo}); a Member on a Private list ({@code
   * item.assignee_on_private_list}); an id that names no Member ({@code item.assignee_not_found}).
   * {@code null} on a Private list is accepted and changes nothing: its Items have no Assignee, and
   * the Owner's other device may remove one while the List is being made Private.
   */
  @Nullable
  private UUID assigneeId(Operation operation, ListEntity list) {
    if (list.kind() != ListKind.TODO) {
      throw listNotTodo(list);
    }
    UUID assigneeId = RequestFields.uuid(operation, "assigneeId");
    if (assigneeId == null) {
      return null;
    }
    if (list.visibility() == Visibility.PRIVATE) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "item.assignee_on_private_list",
          Map.of("listId", list.id().toString()));
    }
    if (members.byId(assigneeId).isEmpty()) {
      throw new ApiException(
          HttpStatus.NOT_FOUND,
          "item.assignee_not_found",
          Map.of("assigneeId", assigneeId.toString()));
    }
    return assigneeId;
  }

  /** A todo field on an Item of a Shopping or Wish list. */
  private static ApiException listNotTodo(ListEntity list) {
    return new ApiException(
        HttpStatus.CONFLICT, "item.list_not_todo", Map.of("listId", list.id().toString()));
  }

  /** The operation's {@code field} parsed, {@code null} for none; {@code value.invalid} if bad. */
  @Nullable
  private static <T> T parsed(
      Operation operation, String field, Function<String, T> parse, FieldErrors errors) {
    String text = operation.text(field);
    if (text == null) {
      return null;
    }
    try {
      return parse.apply(text);
    } catch (DateTimeParseException e) {
      errors.add(field, FieldErrors.VALUE_INVALID);
      return null;
    }
  }

  /** The operation's {@code done}: a boolean, never {@code null}. */
  private static boolean done(Operation operation) {
    Boolean done = operation.bool("done");
    if (done == null) {
      new FieldErrors().add("done", FieldErrors.REQUIRED).throwIfAny();
    }
    return Boolean.TRUE.equals(done);
  }

  /**
   * Items changed since {@code version}. An Item of another Member's Private List is never sent
   * with its content (A1): it comes as a tombstone, like its List.
   */
  @Override
  public List<SyncRow> changesSince(long version, UUID memberId) {
    List<ItemEntity> changed = items.findByVersionGreaterThan(version);
    return SyncRow.changes(
        changed,
        visibleLists.rowsVisibleTo(memberId, changed, ItemEntity::listId),
        (item, fields) -> {
          fields.put("listId", item.listId().toString());
          fields.put("text", item.text());
          fields.put("categoryId", item.categoryId() == null ? null : item.categoryId().toString());
          fields.put("description", item.description());
          fields.put("dueDate", item.dueDate().dayText());
          fields.put("dueTime", item.dueDate().timeText());
          fields.put("assigneeId", Objects.toString(item.assigneeId(), null));
          fields.put("done", item.done());
          fields.put("doneById", item.doneById() == null ? null : item.doneById().toString());
          fields.put("doneAt", item.doneAt() == null ? null : item.doneAt().toString());
          fields.put("creatorId", item.creatorId().toString());
          fields.put("createdAt", item.createdAt().toString());
        });
  }
}

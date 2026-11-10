package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.sync.Operation;
import io.github.aborgatin.familyapp.sync.Outcome;
import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * The {@code category} table of the sync push and pull (spec #4; ticket #70). Writes arrive only as
 * Outbox operations and are idempotent by the client's id (S3). Any Member who may see a Shopping
 * list may create, rename, move and delete its Categories (A1 through its List). The client orders
 * them (by position, ties by id); a move sends only the moved Category's position.
 */
@Service
class CategoryService implements SyncableTable {

  private final CategoryRepository categories;
  private final ItemRepository items;
  private final VisibleLists visibleLists;

  CategoryService(CategoryRepository categories, ItemRepository items, VisibleLists visibleLists) {
    this.categories = categories;
    this.items = items;
    this.visibleLists = visibleLists;
  }

  @Override
  public String name() {
    return "category";
  }

  /**
   * An upsert creates the Category ({@code listId}, {@code name} and {@code position} required; the
   * List must be a Shopping list: {@code category.list_not_shopping}) or changes only the fields it
   * carries; the List never changes. A delete soft-deletes and moves the Category's Items, Done
   * ones included, to the Unnamed category in the same transaction. Delete wins: anything on a
   * deleted Category, creating one in a deleted List, and deleting an unknown one, is ignored. A
   * Category of another Member's Private List, or in an unknown List, is {@code list.not_found}.
   */
  @Override
  public Outcome apply(Operation operation) {
    Optional<CategoryEntity> existing = categories.findById(operation.id());
    if (existing.isPresent() && !existing.get().deleted()) {
      visibleLists.find(existing.get().listId(), operation.memberId());
    }
    return Outcome.deleteWins(
        operation,
        existing,
        (upsert, category) ->
            category.isPresent() ? change(upsert, category.get()) : create(upsert),
        this::delete);
  }

  private Outcome create(Operation operation) {
    UUID listId = VisibleLists.listId(operation);
    ListEntity list = visibleLists.find(listId, operation.memberId());
    if (list.deleted()) {
      return Outcome.IGNORED;
    }
    CategoryDetails details =
        new CategoryRequest(operation.text("name"), operation.number("position")).validate();
    if (list.kind() != ListKind.SHOPPING) {
      throw new ApiException(
          HttpStatus.CONFLICT, "category.list_not_shopping", Map.of("listId", listId.toString()));
    }
    categories.saveAndFlush(new CategoryEntity(operation.id(), listId, details));
    return Outcome.APPLIED;
  }

  private Outcome change(Operation operation, CategoryEntity category) {
    VisibleLists.sameList(operation, category.listId());
    CategoryDetails details =
        new CategoryRequest(
                operation.has("name") ? operation.text("name") : category.name(),
                operation.has("position") ? operation.number("position") : category.position())
            .validate();
    category.replace(details);
    categories.saveAndFlush(category);
    return Outcome.APPLIED;
  }

  /** Deletes the Category and moves its Items, Done ones included, to the Unnamed category. */
  private Outcome delete(CategoryEntity category) {
    category.markDeleted();
    categories.saveAndFlush(category);
    items.moveToUnnamedCategory(category.id());
    return Outcome.APPLIED;
  }

  /**
   * Categories changed since {@code version}. A Category of another Member's Private List is never
   * sent with its content (A1): it comes as a tombstone, like its List.
   */
  @Override
  public List<SyncRow> changesSince(long version, UUID memberId) {
    List<CategoryEntity> changed = categories.findByVersionGreaterThan(version);
    return SyncRow.changes(
        changed,
        visibleLists.rowsVisibleTo(memberId, changed, CategoryEntity::listId),
        (category, fields) -> {
          fields.put("listId", category.listId().toString());
          fields.put("name", category.name());
          fields.put("position", category.position());
        });
  }
}

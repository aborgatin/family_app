package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.family.ChildDeleted;
import io.github.aborgatin.familyapp.family.Children;
import io.github.aborgatin.familyapp.sync.Operation;
import io.github.aborgatin.familyapp.sync.Outcome;
import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;

/**
 * The {@code list} table of the sync push and pull (spec #3; ticket #55). Writes arrive only as
 * Outbox operations and are idempotent by the client's id (S3).
 */
@Service
class ListService implements SyncableTable {

  private final Clock clock = Clock.systemUTC();
  private final ListRepository lists;
  private final ItemRepository items;
  private final CategoryRepository categories;
  private final ItemHistoryRepository history;
  private final Children children;

  ListService(
      ListRepository lists,
      ItemRepository items,
      CategoryRepository categories,
      ItemHistoryRepository history,
      Children children) {
    this.lists = lists;
    this.items = items;
    this.categories = categories;
    this.history = history;
    this.children = children;
  }

  @Override
  public String name() {
    return "list";
  }

  /**
   * An upsert creates the List (name, kind and Visibility required; the pushing Member becomes the
   * Owner) or changes only the fields it carries. Only the Owner changes Visibility or deletes the
   * List ({@code list.owner_only}). A delete soft-deletes the List, its Items and its Categories.
   * Delete wins: anything on a deleted List, and deleting an unknown one, is ignored. Another
   * Member's Private List is treated as unknown: {@code list.not_found} (A1).
   *
   * <p>A Child list (spec #81) carries {@code childId} on create only: it never changes ({@code
   * list.child_immutable}), must name a Child ({@code list.child_not_found}; one deleted meanwhile:
   * the create is ignored), and the List must be {@code TODO} or {@code WISH} ({@code
   * list.child_not_shopping}) and stay Shared ({@code list.child_shared_only}). Owner rules are the
   * same as for any List.
   */
  @Override
  public Outcome apply(Operation operation) {
    Optional<ListEntity> existing = lists.findById(operation.id());
    if (existing.isPresent()
        && !existing.get().deleted()
        && !existing.get().visibleTo(operation.memberId())) {
      throw ListEntity.notFound(operation.id());
    }
    return Outcome.deleteWins(
        operation, existing, this::upsert, list -> delete(list, operation.memberId()));
  }

  private Outcome upsert(Operation operation, Optional<ListEntity> existing) {
    ListDetails details = changed(operation, existing).validate();
    if (existing.isPresent() && existing.get().kind() != details.kind()) {
      throw new ApiException(HttpStatus.CONFLICT, "list.kind_immutable");
    }
    if (existing.isPresent()
        && existing.get().visibility() != details.visibility()
        && !existing.get().ownerId().equals(operation.memberId())) {
      throw ownerOnly();
    }
    if (details.kind() == ListKind.WISH && details.visibility() == Visibility.PRIVATE) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "list.wish_shared_only");
    }
    UUID childId = childId(operation, existing);
    if (childId != null && !childListAllowed(childId, details, existing.isEmpty())) {
      // The Child was deleted meanwhile, and their Child lists with them: delete wins.
      return Outcome.IGNORED;
    }
    boolean visibilityChanged =
        existing.isPresent() && existing.get().visibility() != details.visibility();
    ListEntity list =
        existing
            .map(
                found -> {
                  found.replace(details);
                  return found;
                })
            .orElseGet(
                () ->
                    new ListEntity(
                        operation.id(), operation.memberId(), childId, clock.instant(), details));
    lists.saveAndFlush(list);
    if (visibilityChanged) {
      if (list.visibility() == Visibility.PRIVATE) {
        // A Private list's Items have no Assignee; making it Shared again restores none.
        items.clearAssigneesInList(list.id());
      }
      // The pull sends the Items, Categories and Item history again: with their fields to a
      // Member who may now see the List, as tombstones to one who no longer may.
      items.bumpVersionsInList(list.id());
      categories.bumpVersionsInList(list.id());
      history.bumpVersionsInList(list.id());
    }
    return Outcome.APPLIED;
  }

  /**
   * The List's Child after the operation: set by the create and never changed, so an upsert of a
   * known List may only repeat it ({@code list.child_immutable} otherwise).
   */
  @Nullable
  private static UUID childId(Operation operation, Optional<ListEntity> existing) {
    UUID carried = RequestFields.uuid(operation, "childId");
    if (existing.isEmpty()) {
      return carried;
    }
    UUID stored = existing.get().childId();
    if (operation.has("childId") && !Objects.equals(carried, stored)) {
      throw new ApiException(HttpStatus.CONFLICT, "list.child_immutable");
    }
    return stored;
  }

  /**
   * The rules of a Child list (spec #81): of kind {@code TODO} or {@code WISH}, and Shared for
   * good. Whether the create goes on: not when the Child was deleted meanwhile (delete wins); a
   * Child that never existed is {@code list.child_not_found}.
   */
  private boolean childListAllowed(UUID childId, ListDetails details, boolean creating) {
    if (details.kind() == ListKind.SHOPPING) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "list.child_not_shopping");
    }
    if (details.visibility() == Visibility.PRIVATE) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "list.child_shared_only");
    }
    if (!creating || children.present(childId)) {
      return true;
    }
    if (!children.known(childId)) {
      throw new ApiException(
          HttpStatus.NOT_FOUND, "list.child_not_found", Map.of("childId", childId.toString()));
    }
    return false;
  }

  private Outcome delete(ListEntity list, UUID memberId) {
    if (!list.ownerId().equals(memberId)) {
      throw ownerOnly();
    }
    deleteWithContent(list);
    return Outcome.APPLIED;
  }

  /**
   * Deleting a Child deletes their Child lists with their Items, whoever owns them (spec #81), in
   * the push operation that deletes the Child.
   */
  @EventListener
  void onChildDeleted(ChildDeleted event) {
    lists.findByChildIdAndDeletedFalse(event.childId()).forEach(this::deleteWithContent);
  }

  /** Soft-deletes the List, its Items, its Categories and its Item history (S2). */
  private void deleteWithContent(ListEntity list) {
    list.markDeleted();
    lists.saveAndFlush(list);
    items.markDeletedInList(list.id());
    categories.markDeletedInList(list.id());
    history.markDeletedInList(list.id());
  }

  private static ApiException ownerOnly() {
    return new ApiException(HttpStatus.FORBIDDEN, "list.owner_only");
  }

  /** The List's fields after the operation: the carried ones over what is stored. */
  private static ListRequest changed(Operation operation, Optional<ListEntity> existing) {
    String name = existing.map(ListEntity::name).orElse(null);
    String kind = existing.map(list -> list.kind().name()).orElse(null);
    String visibility = existing.map(list -> list.visibility().name()).orElse(null);
    // A new List's Unnamed category comes first (0) unless the create says otherwise.
    double unnamedCategoryPosition = existing.map(ListEntity::unnamedCategoryPosition).orElse(0.0);
    return new ListRequest(
        operation.has("name") ? operation.text("name") : name,
        operation.has("kind") ? operation.text("kind") : kind,
        operation.has("visibility") ? operation.text("visibility") : visibility,
        operation.has("unnamedCategoryPosition")
            ? operation.number("unnamedCategoryPosition")
            : Double.valueOf(unnamedCategoryPosition));
  }

  /**
   * Lists changed since {@code version}. Another Member's Private List is never sent with its
   * content (A1): it comes as a tombstone, so a List made Private disappears from the other
   * Member's phone, and a first sync (which drops tombstones) leaves it out.
   */
  @Override
  public List<SyncRow> changesSince(long version, UUID memberId) {
    return SyncRow.changes(
        lists.findByVersionGreaterThan(version),
        list -> list.visibleTo(memberId),
        (list, fields) -> {
          fields.put("name", list.name());
          fields.put("kind", list.kind().name());
          fields.put("visibility", list.visibility().name());
          fields.put("unnamedCategoryPosition", list.unnamedCategoryPosition());
          fields.put("ownerId", list.ownerId().toString());
          fields.put("childId", Objects.toString(list.childId(), null));
          fields.put("createdAt", list.createdAt().toString());
        });
  }
}

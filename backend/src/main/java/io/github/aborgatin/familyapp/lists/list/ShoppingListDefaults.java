package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.family.FirstMemberRegistered;
import java.time.Clock;
import java.util.UUID;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * The Default Shopping lists (spec #4 "Defaults"; ticket #76): Супермаркет with the Unnamed
 * category first, then «Еда» and «Бытовая химия», and Аптека with only the Unnamed category, both
 * Shared and owned by the first Member. Unlike the Child field Defaults they come from
 * registration, not a migration, because a List needs an Owner; so they are written once per
 * installation, inside the bootstrap transaction (which already holds the Family lock), and never
 * on Invite registration. Ids are made here, on the server. Afterwards they are ordinary Lists and
 * Categories.
 */
@Component
class ShoppingListDefaults {

  private final Clock clock = Clock.systemUTC();
  private final ListRepository lists;
  private final CategoryRepository categories;

  ShoppingListDefaults(ListRepository lists, CategoryRepository categories) {
    this.lists = lists;
    this.categories = categories;
  }

  @EventListener
  void onFirstMemberRegistered(FirstMemberRegistered event) {
    UUID supermarket = create(event.memberId(), "Супермаркет", 0);
    category(supermarket, "Еда", 1);
    category(supermarket, "Бытовая химия", 2);
    create(event.memberId(), "Аптека", 0);
  }

  private UUID create(UUID ownerId, String name, double unnamedCategoryPosition) {
    ListEntity list =
        new ListEntity(
            UUID.randomUUID(),
            ownerId,
            null,
            clock.instant(),
            new ListDetails(name, ListKind.SHOPPING, Visibility.SHARED, unnamedCategoryPosition));
    return lists.saveAndFlush(list).id();
  }

  private void category(UUID listId, String name, double position) {
    categories.saveAndFlush(
        new CategoryEntity(UUID.randomUUID(), listId, new CategoryDetails(name, position)));
  }
}

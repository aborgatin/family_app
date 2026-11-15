package io.github.aborgatin.familyapp.lists;

import java.util.UUID;

/**
 * A Member added an Item to a List (spec #104 "Events from lists"). Published inside the push
 * operation that creates the Item, so a listener runs in its transaction and rolls back with it.
 * Never for the next occurrence the server makes of a repeating Item.
 */
public record ItemAdded(UUID listId, UUID itemId, UUID byMemberId) {}

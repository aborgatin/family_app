package io.github.aborgatin.familyapp.lists;

import java.util.UUID;

/**
 * A Shared List stopped being Shared: deleted (by its Owner, or with its Child) or made Private
 * (ticket #111, for Mute). Published inside the push operation that does it, so a listener runs in
 * its transaction and rolls back with it.
 */
public record ListUnshared(UUID listId) {}

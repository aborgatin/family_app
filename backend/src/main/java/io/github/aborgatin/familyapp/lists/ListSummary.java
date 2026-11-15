package io.github.aborgatin.familyapp.lists;

import java.util.List;
import java.util.UUID;

/**
 * A List as other modules see it ({@link Lists#find}): its name, kind, Visibility and Owner, and
 * the Members who see it: the Owner of a Private List, every Member for a Shared one (Child lists
 * are always Shared).
 */
public record ListSummary(
    UUID id, String name, ListKind kind, Visibility visibility, UUID ownerId, List<UUID> seenBy) {}

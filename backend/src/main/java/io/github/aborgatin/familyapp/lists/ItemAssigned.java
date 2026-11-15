package io.github.aborgatin.familyapp.lists;

import java.util.UUID;

/**
 * A Member made {@code assigneeId} an Item's Assignee (spec #104 "Events from lists"): on a change
 * of Assignee, and on an Item created with one; not when the Assignee is removed or set to the one
 * it already has, and never for the next occurrence the server makes of a repeating Item. Published
 * inside the push operation, like {@link ItemAdded}. The Assignee may be the acting Member.
 */
public record ItemAssigned(UUID itemId, UUID assigneeId, UUID byMemberId) {}

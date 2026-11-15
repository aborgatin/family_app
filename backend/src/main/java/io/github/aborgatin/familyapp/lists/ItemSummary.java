package io.github.aborgatin.familyapp.lists;

import java.util.UUID;
import org.springframework.lang.Nullable;

/**
 * An Item that still exists, open or Done, as other modules see it ({@link Lists#items}): its List,
 * its name (the text) and its Assignee ({@code null} for nobody).
 */
public record ItemSummary(UUID id, UUID listId, String name, @Nullable UUID assigneeId) {}

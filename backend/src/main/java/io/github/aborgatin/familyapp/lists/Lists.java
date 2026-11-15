package io.github.aborgatin.familyapp.lists;

import java.time.Instant;
import java.time.LocalTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * What other modules may ask about Lists and Items (spec #104 "Events from lists"): read-only, as
 * of the caller's transaction. Deleted Lists and Items are left out everywhere.
 */
public interface Lists {

  /** The List, or empty when it is unknown or deleted. */
  Optional<ListSummary> find(UUID listId);

  /** Whether the List existed and was deleted (a deleted List stays deleted). */
  boolean deleted(UUID listId);

  /**
   * Whether the List exists and this Member sees it (every Shared List, their own Private ones).
   */
  boolean visibleTo(UUID listId, UUID memberId);

  /**
   * Those of these Items that still exist, open or Done, by id; unknown and deleted ones left out.
   */
  Map<UUID, ItemSummary> items(Collection<UUID> itemIds);

  /**
   * The open todo items whose due moment is after {@code after} and at or before {@code until},
   * oldest first. The due moment is the Due date at its time, or at {@code morningTime} when it has
   * none, in the installation's time zone (the JVM's default, set by {@code TZ}).
   */
  List<DueItem> dueBetween(Instant after, Instant until, LocalTime morningTime);
}

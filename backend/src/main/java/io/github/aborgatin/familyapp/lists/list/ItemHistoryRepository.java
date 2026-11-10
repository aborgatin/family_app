package io.github.aborgatin.familyapp.lists.list;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Item history. Deliberately has no delete methods: the table is syncable and deletes are soft
 * (S2).
 */
interface ItemHistoryRepository extends Repository<ItemHistoryEntity, UUID> {

  ItemHistoryEntity saveAndFlush(ItemHistoryEntity row);

  /** The List's row for this normalised name, deleted or not. */
  Optional<ItemHistoryEntity> findByListIdAndNormalizedName(UUID listId, String normalizedName);

  /** Every row written after this Version, deleted ones included (the sync pull). */
  List<ItemHistoryEntity> findByVersionGreaterThan(long version);

  /** Soft-deletes the List's history (S2), as {@code ItemRepository.markDeletedInList}. */
  @Modifying(flushAutomatically = true, clearAutomatically = true)
  @Query(
      "UPDATE ItemHistoryEntity h SET h.deleted = TRUE"
          + " WHERE h.listId = :listId AND h.deleted = FALSE")
  void markDeletedInList(@Param("listId") UUID listId);

  /**
   * Gives the List's history a new Version without changing it, so the next pull sends it again
   * after a Visibility change (as {@code ItemRepository.bumpVersionsInList}).
   */
  @Modifying(flushAutomatically = true, clearAutomatically = true)
  @Query(
      "UPDATE ItemHistoryEntity h SET h.name = h.name"
          + " WHERE h.listId = :listId AND h.deleted = FALSE")
  void bumpVersionsInList(@Param("listId") UUID listId);
}

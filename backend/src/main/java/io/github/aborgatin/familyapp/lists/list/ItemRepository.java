package io.github.aborgatin.familyapp.lists.list;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Items. Deliberately has no delete methods: Items are syncable and deletes are soft (S2). */
interface ItemRepository extends Repository<ItemEntity, UUID> {

  ItemEntity saveAndFlush(ItemEntity item);

  /** The Item with this id, deleted or not, so an operation can tell "deleted" from "new". */
  Optional<ItemEntity> findById(UUID id);

  /** Every Item written after this Version, deleted ones included (the sync pull). */
  List<ItemEntity> findByVersionGreaterThan(long version);

  /**
   * Soft-deletes the List's Items (S2): each gets a new Version from the trigger. Clears the
   * persistence context, so later operations of the same push see them deleted.
   */
  @Modifying(flushAutomatically = true, clearAutomatically = true)
  @Query("UPDATE ItemEntity i SET i.deleted = TRUE WHERE i.listId = :listId AND i.deleted = FALSE")
  void markDeletedInList(@Param("listId") UUID listId);

  /**
   * Gives the List's Items a new Version without changing them (the trigger runs on any UPDATE), so
   * the next pull sends them again: after a Visibility change they arrive with their fields on a
   * phone that may now see the List, or as tombstones on one that no longer may.
   */
  @Modifying(flushAutomatically = true, clearAutomatically = true)
  @Query("UPDATE ItemEntity i SET i.text = i.text WHERE i.listId = :listId AND i.deleted = FALSE")
  void bumpVersionsInList(@Param("listId") UUID listId);
}

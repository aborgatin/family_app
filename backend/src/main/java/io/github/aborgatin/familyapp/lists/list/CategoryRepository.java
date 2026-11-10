package io.github.aborgatin.familyapp.lists.list;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Categories. Deliberately has no delete methods: Categories are syncable and deletes are soft
 * (S2).
 */
interface CategoryRepository extends Repository<CategoryEntity, UUID> {

  CategoryEntity saveAndFlush(CategoryEntity category);

  /** The Category with this id, deleted or not, so an operation can tell "deleted" from "new". */
  Optional<CategoryEntity> findById(UUID id);

  /** Every Category written after this Version, deleted ones included (the sync pull). */
  List<CategoryEntity> findByVersionGreaterThan(long version);

  /**
   * Soft-deletes the List's Categories (S2): each gets a new Version from the trigger. Clears the
   * persistence context, so later operations of the same push see them deleted.
   */
  @Modifying(flushAutomatically = true, clearAutomatically = true)
  @Query(
      "UPDATE CategoryEntity c SET c.deleted = TRUE WHERE c.listId = :listId AND c.deleted = FALSE")
  void markDeletedInList(@Param("listId") UUID listId);

  /**
   * Gives the List's Categories a new Version without changing them, so the next pull sends them
   * again after a Visibility change (as {@code ItemRepository.bumpVersionsInList}).
   */
  @Modifying(flushAutomatically = true, clearAutomatically = true)
  @Query(
      "UPDATE CategoryEntity c SET c.name = c.name WHERE c.listId = :listId AND c.deleted = FALSE")
  void bumpVersionsInList(@Param("listId") UUID listId);
}

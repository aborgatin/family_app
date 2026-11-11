package io.github.aborgatin.familyapp.family.childfield;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Child field values. No delete methods: they are syncable and deletes are soft (S2). */
interface ChildFieldValueRepository extends Repository<ChildFieldValue, UUID> {

  ChildFieldValue saveAndFlush(ChildFieldValue value);

  /** Including soft-deleted ones, so an upsert can tell "deleted" from "new". */
  Optional<ChildFieldValue> findById(UUID id);

  /** Every entry written after this Version, deleted ones included (for the pull). */
  List<ChildFieldValue> findByVersionGreaterThan(long version);

  /**
   * Soft-deletes the Child's entries (S2): each gets a new Version from the trigger. Clears the
   * persistence context, so later operations of the same push see them deleted.
   */
  @Modifying(flushAutomatically = true, clearAutomatically = true)
  @Query(
      "UPDATE ChildFieldValue v SET v.deleted = TRUE WHERE v.childId = :childId AND v.deleted ="
          + " FALSE")
  void markDeletedOfChild(@Param("childId") UUID childId);

  /** Soft-deletes the Child field's entries, of every Child, as {@link #markDeletedOfChild}. */
  @Modifying(flushAutomatically = true, clearAutomatically = true)
  @Query(
      "UPDATE ChildFieldValue v SET v.deleted = TRUE WHERE v.childFieldId = :childFieldId AND"
          + " v.deleted = FALSE")
  void markDeletedOfChildField(@Param("childFieldId") UUID childFieldId);
}

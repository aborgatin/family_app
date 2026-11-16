package io.github.aborgatin.familyapp.medical;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Illness events. No delete methods: they are syncable and deletes are soft (S2). */
interface IllnessEventRepository extends Repository<IllnessEvent, UUID> {

  IllnessEvent saveAndFlush(IllnessEvent event);

  /** Including soft-deleted ones, so an upsert can tell "deleted" from "new". */
  Optional<IllnessEvent> findById(UUID id);

  /** Every event written after this Version, deleted ones included (for the pull). */
  List<IllnessEvent> findByVersionGreaterThan(long version);

  /**
   * Soft-deletes the Illness's events (S2): each gets a new Version from the trigger. Clears the
   * persistence context, so later operations of the same push see them deleted.
   */
  @Modifying(flushAutomatically = true, clearAutomatically = true)
  @Query(
      "UPDATE IllnessEvent e SET e.deleted = TRUE WHERE e.illnessId = :illnessId AND e.deleted ="
          + " FALSE")
  void markDeletedOfIllness(@Param("illnessId") UUID illnessId);

  /** Soft-deletes the events of every Illness of the Child, as {@link #markDeletedOfIllness}. */
  @Modifying(flushAutomatically = true, clearAutomatically = true)
  @Query(
      "UPDATE IllnessEvent e SET e.deleted = TRUE WHERE e.deleted = FALSE AND e.illnessId IN"
          + " (SELECT i.id FROM Illness i WHERE i.childId = :childId)")
  void markDeletedOfChild(@Param("childId") UUID childId);
}

package io.github.aborgatin.familyapp.medical;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Illnesses and Conditions. No delete methods: they are syncable and deletes are soft (S2). */
interface IllnessRepository extends Repository<Illness, UUID> {

  Illness saveAndFlush(Illness illness);

  /** Including soft-deleted ones, so an upsert can tell "deleted" from "new". */
  Optional<Illness> findById(UUID id);

  /** These Illnesses, deleted ones included (whose card an event is on, for the pull). */
  List<Illness> findByIdIn(Collection<UUID> ids);

  /** Every Illness written after this Version, deleted ones included (for the pull). */
  List<Illness> findByVersionGreaterThan(long version);

  /**
   * Soft-deletes the Child's Illnesses (S2): each gets a new Version from the trigger. Clears the
   * persistence context, so later operations of the same push see them deleted.
   */
  @Modifying(flushAutomatically = true, clearAutomatically = true)
  @Query("UPDATE Illness i SET i.deleted = TRUE WHERE i.childId = :childId AND i.deleted = FALSE")
  void markDeletedOfChild(@Param("childId") UUID childId);
}

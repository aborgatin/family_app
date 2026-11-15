package io.github.aborgatin.familyapp.notifications.mute;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Mutes. No delete methods: they are syncable and deletes are soft (S2). */
interface MuteRepository extends Repository<Mute, UUID> {

  Mute saveAndFlush(Mute mute);

  /** Including soft-deleted ones, so an upsert can tell "deleted" from "new". */
  Optional<Mute> findById(UUID id);

  /** Every Mute written after this Version, deleted ones included (for the pull). */
  List<Mute> findByVersionGreaterThan(long version);

  /**
   * Soft-deletes the List's Mutes (S2): each gets a new Version from the trigger. Clears the
   * persistence context, so later operations of the same push see them deleted.
   */
  @Modifying(flushAutomatically = true, clearAutomatically = true)
  @Query("UPDATE Mute m SET m.deleted = TRUE WHERE m.listId = :listId AND m.deleted = FALSE")
  void markDeletedOfList(@Param("listId") UUID listId);
}

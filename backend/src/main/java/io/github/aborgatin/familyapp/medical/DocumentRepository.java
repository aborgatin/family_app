package io.github.aborgatin.familyapp.medical;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Documents. No delete methods: they are syncable and deletes are soft (S2). */
interface DocumentRepository extends Repository<Document, UUID> {

  Document saveAndFlush(Document document);

  /** Including soft-deleted ones, so an operation can tell "deleted" from "new". */
  Optional<Document> findById(UUID id);

  /** Whether the Illness event already carries a Document (at most one, the unique index). */
  boolean existsByIllnessEventIdAndDeletedFalse(UUID illnessEventId);

  /** Every Document written after this Version, deleted ones included (for the pull). */
  List<Document> findByVersionGreaterThan(long version);

  /** The ids of the Child's Documents that aren't deleted (their Illness events' included). */
  @Query("SELECT d.id FROM Document d WHERE d.childId = :childId AND d.deleted = FALSE")
  List<UUID> idsOfChild(@Param("childId") UUID childId);

  /**
   * Soft-deletes the Child's Documents (S2): each gets a new Version from the trigger. Clears the
   * persistence context, so later operations of the same push see them deleted.
   */
  @Modifying(flushAutomatically = true, clearAutomatically = true)
  @Query("UPDATE Document d SET d.deleted = TRUE WHERE d.childId = :childId AND d.deleted = FALSE")
  void markDeletedOfChild(@Param("childId") UUID childId);
}

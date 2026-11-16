package io.github.aborgatin.familyapp.medical;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Medicines. No delete methods: they are syncable and deletes are soft (S2). */
interface MedicineRepository extends Repository<Medicine, UUID> {

  Medicine saveAndFlush(Medicine medicine);

  /** Including soft-deleted ones, so an upsert can tell "deleted" from "new". */
  Optional<Medicine> findById(UUID id);

  /** Whether a Medicine with this id exists, deleted or not. */
  boolean existsById(UUID id);

  /** Every Medicine written after this Version, deleted ones included (for the pull). */
  List<Medicine> findByVersionGreaterThan(long version);

  /** Whether a Medicine other than {@code id} that isn't deleted has this name, ignoring case. */
  @Query(
      "SELECT COUNT(m) > 0 FROM Medicine m WHERE lower(m.name) = lower(:name) AND m.deleted ="
          + " FALSE AND m.id <> :id")
  boolean nameTaken(@Param("name") String name, @Param("id") UUID id);
}

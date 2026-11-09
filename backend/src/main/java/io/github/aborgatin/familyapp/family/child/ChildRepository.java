package io.github.aborgatin.familyapp.family.child;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.repository.Repository;

/**
 * Children. Deliberately has no delete methods: Children are syncable and deletes are soft (S2).
 */
interface ChildRepository extends Repository<Child, UUID> {

  Child saveAndFlush(Child child);

  Optional<Child> findById(UUID id);

  /** Every Child written after this Version, deleted ones included (the sync pull). */
  List<Child> findByVersionGreaterThan(long version);
}

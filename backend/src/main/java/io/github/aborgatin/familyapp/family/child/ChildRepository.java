package io.github.aborgatin.familyapp.family.child;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

/**
 * Children. Deliberately has no delete methods: Children are syncable and deletes are soft (S2).
 */
interface ChildRepository extends Repository<Child, UUID> {

  Child saveAndFlush(Child child);

  Optional<Child> findById(UUID id);

  /** Oldest first, Children without a birthday last, then by name (spec #5, Ordering). */
  @Query(
      """
      SELECT c FROM Child c WHERE c.deleted = false
      ORDER BY c.birthday ASC NULLS LAST, c.name ASC, c.id ASC
      """)
  List<Child> findAllInOrder();
}

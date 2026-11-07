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

  /**
   * Oldest first, Children without a birthday last, then by name, then by id (spec #5, Ordering).
   * Names compare by ICU's Russian collation, named explicitly rather than taken from the database
   * default, so the order is the same on every installation and the same as the web app's {@code
   * Intl.Collator('ru')} («ё» sorts with «е»).
   */
  @Query(
      nativeQuery = true,
      value =
          """
          SELECT * FROM child WHERE deleted = false
          ORDER BY birthday ASC NULLS LAST, name COLLATE "ru-x-icu" ASC, id ASC
          """)
  List<Child> findAllInOrder();
}

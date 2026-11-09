package io.github.aborgatin.familyapp.family.childfield;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.repository.Repository;

/** Child fields. No delete methods: Child fields are syncable and deletes are soft (S2). */
interface ChildFieldRepository extends Repository<ChildField, UUID> {

  ChildField saveAndFlush(ChildField childField);

  /** Including soft-deleted ones, so an upsert can tell "deleted" from "new". */
  Optional<ChildField> findById(UUID id);

  /** Every Child field written after this Version, deleted ones included (for the pull). */
  List<ChildField> findByVersionGreaterThan(long version);
}

package io.github.aborgatin.familyapp.lists.list;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.repository.Repository;

/** Lists. Deliberately has no delete methods: Lists are syncable and deletes are soft (S2). */
interface ListRepository extends Repository<ListEntity, UUID> {

  ListEntity saveAndFlush(ListEntity list);

  /** The List with this id, deleted or not, so an operation can tell "deleted" from "new". */
  Optional<ListEntity> findById(UUID id);

  /** Every List written after this Version, deleted ones included (the sync pull). */
  List<ListEntity> findByVersionGreaterThan(long version);
}

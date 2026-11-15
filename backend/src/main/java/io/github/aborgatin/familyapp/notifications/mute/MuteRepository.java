package io.github.aborgatin.familyapp.notifications.mute;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.repository.Repository;

/** Mutes. No delete methods: they are syncable and deletes are soft (S2). */
interface MuteRepository extends Repository<Mute, UUID> {

  Mute saveAndFlush(Mute mute);

  /** Including soft-deleted ones, so an upsert can tell "deleted" from "new". */
  Optional<Mute> findById(UUID id);

  /** Every Mute written after this Version, deleted ones included (for the pull). */
  List<Mute> findByVersionGreaterThan(long version);
}

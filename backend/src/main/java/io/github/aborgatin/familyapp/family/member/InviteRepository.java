package io.github.aborgatin.familyapp.family.member;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.repository.Repository;

/** Invites. */
interface InviteRepository extends Repository<Invite, UUID> {

  Invite save(Invite invite);

  Optional<Invite> findById(UUID id);

  Optional<Invite> findByTokenHash(byte[] tokenHash);

  /** Locks the row, so two acceptances of the same link run one after another (single use). */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  Optional<Invite> findForUpdateByTokenHash(byte[] tokenHash);

  /** Active Invites: not accepted, not revoked, not yet expired; newest first. */
  List<Invite> findByAcceptedAtIsNullAndRevokedAtIsNullAndExpiresAtAfterOrderByCreatedAtDesc(
      Instant now);
}

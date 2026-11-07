package io.github.aborgatin.familyapp.family.member;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.repository.Repository;

/** Password resets. */
public interface PasswordResetRepository extends Repository<PasswordReset, UUID> {

  PasswordReset save(PasswordReset reset);

  Optional<PasswordReset> findByTokenHash(byte[] tokenHash);

  /** Locks the row, so two completions of the same link run one after another (single use). */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  Optional<PasswordReset> findForUpdateByTokenHash(byte[] tokenHash);

  List<PasswordReset> findByMemberIdAndUsedAtIsNull(UUID memberId);
}

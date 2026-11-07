package io.github.aborgatin.familyapp.family.member;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.springframework.lang.Nullable;

/**
 * A one-time link that lets a Member set a new password (spec #5, Password reset). Not syncable: a
 * server-only auth artifact. Only the SHA-256 hash of its token is stored.
 */
@Entity
@Table(name = "password_reset")
public class PasswordReset {

  @Id private UUID id;

  @Column(nullable = false)
  private UUID memberId;

  @Column(nullable = false)
  private byte[] tokenHash;

  @Column(nullable = false)
  private Instant createdAt;

  @Column(nullable = false)
  private Instant expiresAt;

  @Nullable private Instant usedAt;

  protected PasswordReset() {}

  public PasswordReset(UUID memberId, byte[] tokenHash, Instant createdAt, Instant expiresAt) {
    this.id = UUID.randomUUID();
    this.memberId = memberId;
    this.tokenHash = tokenHash.clone();
    this.createdAt = createdAt;
    this.expiresAt = expiresAt;
  }

  public UUID memberId() {
    return memberId;
  }

  public Instant expiresAt() {
    return expiresAt;
  }

  public boolean isUsed() {
    return usedAt != null;
  }

  public boolean isExpiredAt(Instant now) {
    return !now.isBefore(expiresAt);
  }

  public void markUsed(Instant now) {
    usedAt = now;
  }

  /** A newer reset for the same Member replaces this one: from now on it counts as expired. */
  public void expire(Instant now) {
    if (now.isBefore(expiresAt)) {
      expiresAt = now;
    }
  }
}

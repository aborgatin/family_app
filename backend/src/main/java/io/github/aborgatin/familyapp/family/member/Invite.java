package io.github.aborgatin.familyapp.family.member;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.springframework.lang.Nullable;

/**
 * An Invite («Приглашение»): a one-time link a Member sends to another adult so they can register
 * and become a Member (spec #5, Invites). Not syncable: a server-only auth artifact. Only the
 * SHA-256 hash of its token is stored.
 */
@Entity
@Table(name = "invite")
public class Invite {

  @Id private UUID id;

  @Column(nullable = false)
  private byte[] tokenHash;

  @Column(nullable = false)
  private UUID createdBy;

  @Column(nullable = false)
  private Instant createdAt;

  @Column(nullable = false)
  private Instant expiresAt;

  @Nullable private Instant acceptedAt;

  @Nullable private UUID acceptedBy;

  @Nullable private Instant revokedAt;

  protected Invite() {}

  Invite(UUID createdBy, byte[] tokenHash, Instant createdAt, Instant expiresAt) {
    this.id = UUID.randomUUID();
    this.tokenHash = tokenHash.clone();
    this.createdBy = createdBy;
    this.createdAt = createdAt;
    this.expiresAt = expiresAt;
  }

  public UUID id() {
    return id;
  }

  public UUID createdBy() {
    return createdBy;
  }

  public Instant createdAt() {
    return createdAt;
  }

  public Instant expiresAt() {
    return expiresAt;
  }

  /** The Member who registered through this Invite, once accepted. */
  @Nullable
  public UUID acceptedBy() {
    return acceptedBy;
  }

  boolean isAccepted() {
    return acceptedAt != null;
  }

  boolean isRevoked() {
    return revokedAt != null;
  }

  boolean isExpiredAt(Instant now) {
    return !now.isBefore(expiresAt);
  }

  void accept(UUID memberId, Instant now) {
    acceptedBy = memberId;
    acceptedAt = now;
  }

  /** Revoking twice, or revoking an Invite already accepted, changes nothing. */
  void revoke(Instant now) {
    if (!isAccepted() && !isRevoked()) {
      revokedAt = now;
    }
  }
}

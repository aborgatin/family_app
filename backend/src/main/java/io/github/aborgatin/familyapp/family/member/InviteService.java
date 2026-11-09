package io.github.aborgatin.familyapp.family.member;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.family.Family;
import io.github.aborgatin.familyapp.family.FamilyLock;
import io.github.aborgatin.familyapp.family.member.RegistrationRequest.Registration;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Invites (spec #5, Invites): any Member creates, lists and revokes them; the invited adult opens
 * the link and registers. A token is 32 random bytes, base64url-encoded, and appears only in the
 * link returned on creation; only its SHA-256 hash is stored. An Invite works once, for {@code
 * INVITE_TTL} (default 7 days), until revoked. Several may be active at once.
 */
@Service
public class InviteService {

  private final Clock clock = Clock.systemUTC();
  private final FamilyLock familyLock;
  private final Family family;
  private final MemberRepository members;
  private final InviteRepository invites;
  private final PasswordEncoder passwordEncoder;
  private final Duration ttl;
  private final String domain;

  InviteService(
      FamilyLock familyLock,
      Family family,
      MemberRepository members,
      InviteRepository invites,
      PasswordEncoder passwordEncoder,
      @Value("${INVITE_TTL:7d}") Duration ttl,
      @Value("${DOMAIN:localhost}") String domain) {
    this.familyLock = familyLock;
    this.family = family;
    this.members = members;
    this.invites = invites;
    this.passwordEncoder = passwordEncoder;
    this.ttl = ttl;
    this.domain = domain;
  }

  /** Creates an Invite by this Member; the result carries the link, which can't be read again. */
  @Transactional
  public NewInvite create(UUID memberId) {
    Instant now = clock.instant();
    String token = OneTimeTokens.newToken();
    Invite invite =
        invites.save(new Invite(memberId, OneTimeTokens.hash(token), now, now.plus(ttl)));
    return new NewInvite(invite, "https://" + domain + "/invite/" + token);
  }

  /** Invites not accepted, not revoked and not expired, newest first. */
  @Transactional(readOnly = true)
  public List<Invite> active() {
    return invites.findByAcceptedAtIsNullAndRevokedAtIsNullAndExpiresAtAfterOrderByCreatedAtDesc(
        clock.instant());
  }

  /** Makes the link stop working. Idempotent; {@code 404 invite.not_found} for an unknown id. */
  @Transactional
  public void revoke(UUID id) {
    invites.findById(id).orElseThrow(InviteService::notFound).revoke(clock.instant());
  }

  /**
   * When the link with this token stops working, or {@code 404 invite.not_found}, {@code 410
   * invite.used} / {@code invite.revoked} / {@code invite.expired}.
   */
  @Transactional(readOnly = true)
  public Instant expiresAt(String token) {
    Invite invite =
        invites.findByTokenHash(OneTimeTokens.hash(token)).orElseThrow(InviteService::notFound);
    checkUsable(invite, clock.instant());
    return invite.expiresAt();
  }

  /**
   * Registers the invited adult as a Member and uses up the Invite, in one transaction. Fails like
   * {@link #expiresAt} for a link that doesn't work, with {@code 400 validation.failed} for a bad
   * body, or with {@code 409 member.email_taken} when a Member already has the email; the Invite
   * stays usable after a refused registration.
   */
  @Transactional
  public Member accept(String token, RegistrationRequest body) {
    // Family lock first: concurrent registrations with the same email run one after another.
    familyLock.lock();
    Invite invite =
        invites
            .findForUpdateByTokenHash(OneTimeTokens.hash(token))
            .orElseThrow(InviteService::notFound);
    Instant now = clock.instant();
    checkUsable(invite, now);

    Registration registration = body.validate();
    if (members.existsByEmail(registration.email())) {
      throw new ApiException(HttpStatus.CONFLICT, "member.email_taken");
    }
    Member member =
        members.saveAndFlush(
            new Member(
                family.id(),
                registration.email(),
                passwordEncoder.encode(registration.password()),
                registration.displayName(),
                registration.grammaticalGender()));
    invite.accept(member.id(), now);
    return member;
  }

  private static void checkUsable(Invite invite, Instant now) {
    if (invite.isAccepted()) {
      throw new ApiException(HttpStatus.GONE, "invite.used");
    }
    if (invite.isRevoked()) {
      throw new ApiException(HttpStatus.GONE, "invite.revoked");
    }
    if (invite.isExpiredAt(now)) {
      throw new ApiException(HttpStatus.GONE, "invite.expired");
    }
  }

  private static ApiException notFound() {
    return new ApiException(HttpStatus.NOT_FOUND, "invite.not_found");
  }

  /** An Invite just created, with its link: the only place the token ever appears. */
  public record NewInvite(Invite invite, String url) {}
}

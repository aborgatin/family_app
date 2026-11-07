package io.github.aborgatin.familyapp.family;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.error.FieldErrors;
import io.github.aborgatin.familyapp.family.member.LoginService;
import io.github.aborgatin.familyapp.family.member.Member;
import io.github.aborgatin.familyapp.family.member.MemberRepository;
import io.github.aborgatin.familyapp.family.member.PasswordReset;
import io.github.aborgatin.familyapp.family.member.PasswordResetRepository;
import io.github.aborgatin.familyapp.family.member.RegistrationRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.lang.Nullable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Password resets (spec #5, Password reset): one-time links that let a Member set a new password.
 * Used by the operator's {@code reset-password} command today, and meant to be reused unchanged by
 * a later «Сбросить пароль» action in Settings.
 *
 * <p>A token is 32 random bytes, base64url-encoded, and appears only in the link; only its SHA-256
 * hash is stored. A link works once, for {@code PASSWORD_RESET_TTL} (default 1 hour), and creating
 * a new reset for a Member makes their older unused ones expire. Ending the Member's sessions is
 * the caller's part, since only the web app has sessions.
 */
@Service
public class PasswordResets {

  private static final int TOKEN_BYTES = 32;

  private final Clock clock = Clock.systemUTC();
  private final SecureRandom random = new SecureRandom();
  private final MemberRepository members;
  private final PasswordResetRepository resets;
  private final PasswordEncoder passwordEncoder;
  private final Duration ttl;
  private final String domain;

  PasswordResets(
      MemberRepository members,
      PasswordResetRepository resets,
      PasswordEncoder passwordEncoder,
      @Value("${PASSWORD_RESET_TTL:1h}") Duration ttl,
      @Value("${DOMAIN:localhost}") String domain) {
    this.members = members;
    this.resets = resets;
    this.passwordEncoder = passwordEncoder;
    this.ttl = ttl;
    this.domain = domain;
  }

  /**
   * Creates a reset for the Member with this email (matched the way login matches it), or returns
   * empty when no Member has it. The Member's older unused resets stop working.
   */
  @Transactional
  public Optional<NewPasswordReset> createForEmail(String email) {
    Optional<Member> member =
        members.findByEmailAndDeletedFalse(LoginService.normalizeEmail(email));
    if (member.isEmpty()) {
      return Optional.empty();
    }
    Instant now = clock.instant();
    for (PasswordReset older : resets.findByMemberIdAndUsedAtIsNull(member.get().id())) {
      older.expire(now);
    }
    byte[] tokenBytes = new byte[TOKEN_BYTES];
    random.nextBytes(tokenBytes);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
    PasswordReset reset = new PasswordReset(member.get().id(), hash(token), now, now.plus(ttl));
    resets.save(reset);
    return Optional.of(
        new NewPasswordReset("https://" + domain + "/reset-password/" + token, reset.expiresAt()));
  }

  /**
   * When the link with this token stops working, or {@code 404 password_reset.not_found}, {@code
   * 410 password_reset.used} / {@code 410 password_reset.expired}.
   */
  @Transactional(readOnly = true)
  public Instant expiresAt(String token) {
    PasswordReset reset = resets.findByTokenHash(hash(token)).orElseThrow(PasswordResets::notFound);
    checkUsable(reset, clock.instant());
    return reset.expiresAt();
  }

  /**
   * Sets the Member's new password and uses up the link, failing like {@link #expiresAt} for a link
   * that doesn't work, or with {@code 400 validation.failed} for a password that breaks the
   * password rules (field {@code newPassword}). Returns the Member.
   */
  @Transactional
  public Member complete(String token, @Nullable String newPassword) {
    PasswordReset reset =
        resets.findForUpdateByTokenHash(hash(token)).orElseThrow(PasswordResets::notFound);
    Instant now = clock.instant();
    checkUsable(reset, now);

    FieldErrors errors = new FieldErrors();
    String password = RegistrationRequest.checkPassword("newPassword", newPassword, errors);
    errors.throwIfAny();

    Member member =
        members.findByIdAndDeletedFalse(reset.memberId()).orElseThrow(PasswordResets::notFound);
    member.changePasswordHash(passwordEncoder.encode(password));
    reset.markUsed(now);
    return members.saveAndFlush(member);
  }

  private static void checkUsable(PasswordReset reset, Instant now) {
    if (reset.isUsed()) {
      throw new ApiException(HttpStatus.GONE, "password_reset.used");
    }
    if (reset.isExpiredAt(now)) {
      throw new ApiException(HttpStatus.GONE, "password_reset.expired");
    }
  }

  private static ApiException notFound() {
    return new ApiException(HttpStatus.NOT_FOUND, "password_reset.not_found");
  }

  private static byte[] hash(String token) {
    try {
      return MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("Every Java platform has SHA-256", e);
    }
  }

  /** A reset just created: its link, the only place the token ever appears, and its expiry. */
  public record NewPasswordReset(String url, Instant expiresAt) {}
}

package io.github.aborgatin.familyapp.family.member;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Tokens for one-time links (Invites, Password resets; spec #5): 32 random bytes, base64url without
 * padding. Only the SHA-256 hash of a token is ever stored.
 */
public final class OneTimeTokens {

  private static final int TOKEN_BYTES = 32;
  private static final SecureRandom random = new SecureRandom();

  private OneTimeTokens() {}

  /** A new random token for a link. */
  public static String newToken() {
    byte[] tokenBytes = new byte[TOKEN_BYTES];
    random.nextBytes(tokenBytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
  }

  /** The SHA-256 hash under which a token is stored and looked up. */
  public static byte[] hash(String token) {
    try {
      return MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("Every Java platform has SHA-256", e);
    }
  }
}

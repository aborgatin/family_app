package io.github.aborgatin.familyapp.command;

import java.io.PrintStream;
import java.math.BigInteger;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;
import java.util.List;

/**
 * {@code generate-vapid-keys}: prints a fresh VAPID key pair (P-256, base64url, the form browsers
 * and {@code VAPID_PUBLIC_KEY} / {@code VAPID_PRIVATE_KEY} use) as two {@code .env} lines (spec
 * #104, Configuration). It runs without starting the application: it needs no database and no
 * settings, because it is how the operator gets the settings the app requires.
 */
final class GenerateVapidKeysCommand {

  static final String NAME = "generate-vapid-keys";
  static final String USAGE = "Usage: " + NAME;

  private GenerateVapidKeysCommand() {}

  /** Returns the process exit code. */
  static int run(List<String> args, PrintStream out, PrintStream err) {
    if (!args.isEmpty()) {
      err.println(USAGE);
      return Commands.EXIT_USAGE;
    }
    KeyPair pair;
    try {
      KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
      generator.initialize(new ECGenParameterSpec("secp256r1"));
      pair = generator.generateKeyPair();
    } catch (GeneralSecurityException e) {
      err.println("Could not generate a P-256 key pair: " + e);
      return Commands.EXIT_FAILED;
    }
    ECPublicKey publicKey = (ECPublicKey) pair.getPublic();
    ECPrivateKey privateKey = (ECPrivateKey) pair.getPrivate();
    byte[] point = new byte[65];
    point[0] = 0x04; // uncompressed: 0x04, x, y
    copy32(publicKey.getW().getAffineX(), point, 1);
    copy32(publicKey.getW().getAffineY(), point, 33);
    byte[] scalar = new byte[32];
    copy32(privateKey.getS(), scalar, 0);

    Base64.Encoder base64Url = Base64.getUrlEncoder().withoutPadding();
    out.println("VAPID_PUBLIC_KEY=" + base64Url.encodeToString(point));
    out.println("VAPID_PRIVATE_KEY=" + base64Url.encodeToString(scalar));
    return Commands.EXIT_OK;
  }

  /** Writes the number as exactly 32 big-endian bytes at {@code offset}. */
  private static void copy32(BigInteger value, byte[] target, int offset) {
    byte[] bytes = value.toByteArray(); // may have a leading sign byte or be shorter than 32
    int length = Math.min(bytes.length, 32);
    System.arraycopy(bytes, bytes.length - length, target, offset + 32 - length, length);
  }
}

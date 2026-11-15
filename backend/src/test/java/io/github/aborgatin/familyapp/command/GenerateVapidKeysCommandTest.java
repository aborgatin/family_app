package io.github.aborgatin.familyapp.command;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.aborgatin.familyapp.FamilyAppApplication;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.util.Arrays;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * The operator's one-off VAPID key generation (spec #104, Configuration; deployment.md "Environment
 * variables"): {@code docker run --rm <image> generate-vapid-keys} prints a fresh pair as {@code
 * .env} lines. It needs no database and no settings, since it runs before the app has them.
 */
class GenerateVapidKeysCommandTest {

  private static final Pattern PAIR =
      Pattern.compile(
          "VAPID_PUBLIC_KEY=([A-Za-z0-9_-]{87})\\nVAPID_PRIVATE_KEY=([A-Za-z0-9_-]{43})\\n");

  private final ByteArrayOutputStream out = new ByteArrayOutputStream();
  private final ByteArrayOutputStream err = new ByteArrayOutputStream();

  @Test
  void printsAFreshP256KeyPairAsEnvLinesWithoutStartingTheApp() throws Exception {
    assertThat(Commands.isCommand(new String[] {"generate-vapid-keys"})).isTrue();

    int exitCode = run("generate-vapid-keys");

    assertThat(exitCode).as(err.toString(StandardCharsets.UTF_8)).isZero();
    Matcher pair = PAIR.matcher(out.toString(StandardCharsets.UTF_8));
    assertThat(pair.find()).as(out.toString(StandardCharsets.UTF_8)).isTrue();
    assertSignsAndVerifies(pair.group(1), pair.group(2));

    out.reset();
    run("generate-vapid-keys");
    assertThat(out.toString(StandardCharsets.UTF_8)).doesNotContain(pair.group(1));
  }

  @Test
  void explainsItsUsageWhenGivenArguments() {
    assertThat(run("generate-vapid-keys", "extra")).isEqualTo(2);
    assertThat(err.toString(StandardCharsets.UTF_8)).contains("Usage: generate-vapid-keys");
  }

  private int run(String... args) {
    return Commands.run(
        FamilyAppApplication.class,
        args,
        new PrintStream(out, true, StandardCharsets.UTF_8),
        new PrintStream(err, true, StandardCharsets.UTF_8));
  }

  /** The printed keys are one pair: what the private key signs, the public key verifies. */
  private static void assertSignsAndVerifies(String publicKey, String privateKey) throws Exception {
    byte[] point = Base64.getUrlDecoder().decode(publicKey);
    byte[] scalar = Base64.getUrlDecoder().decode(privateKey);
    assertThat(point).hasSize(65);
    assertThat(point[0]).isEqualTo((byte) 0x04);
    assertThat(scalar).hasSize(32);

    AlgorithmParameters parameters = AlgorithmParameters.getInstance("EC");
    parameters.init(new ECGenParameterSpec("secp256r1"));
    ECParameterSpec p256 = parameters.getParameterSpec(ECParameterSpec.class);
    KeyFactory keys = KeyFactory.getInstance("EC");
    var publicEc =
        keys.generatePublic(
            new ECPublicKeySpec(
                new ECPoint(
                    new BigInteger(1, Arrays.copyOfRange(point, 1, 33)),
                    new BigInteger(1, Arrays.copyOfRange(point, 33, 65))),
                p256));
    var privateEc = keys.generatePrivate(new ECPrivateKeySpec(new BigInteger(1, scalar), p256));

    byte[] message = "family".getBytes(StandardCharsets.UTF_8);
    Signature signer = Signature.getInstance("SHA256withECDSA");
    signer.initSign(privateEc);
    signer.update(message);
    byte[] signature = signer.sign();
    Signature verifier = Signature.getInstance("SHA256withECDSA");
    verifier.initVerify(publicEc);
    verifier.update(message);
    assertThat(verifier.verify(signature)).isTrue();
  }
}

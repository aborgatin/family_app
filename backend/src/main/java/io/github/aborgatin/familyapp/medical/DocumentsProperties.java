package io.github.aborgatin.familyapp.medical;

import java.nio.file.Path;
import java.util.Base64;
import java.util.Objects;
import java.util.Optional;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.lang.Nullable;

/**
 * The {@code documents} settings of {@code application.yml} (spec #128, backend.md
 * "Configuration"). The encryption key is required: without it, or with one that is not 32 bytes in
 * base64, the app does not start, and the message names the variable. So are the bucket's settings
 * unless a folder keeps the files.
 *
 * @param encryptionKey {@code DOCUMENTS_ENCRYPTION_KEY}: the AES-256 key Document files are
 *     encrypted with, 32 bytes in base64
 * @param folder {@code DOCUMENTS_FOLDER}: when set, files are stored in this folder (local
 *     development, {@code scripts/dev.sh}); otherwise in the bucket of {@code s3}
 * @param s3 {@code DOCUMENTS_S3_*}: the S3-compatible bucket files are stored in (production,
 *     Cloudflare R2, ticket #135); every value required, and stripped, when there is no folder
 */
@ConfigurationProperties("documents")
record DocumentsProperties(String encryptionKey, @Nullable String folder, @Nullable Bucket s3) {

  static final String HOW_TO_GENERATE = " Generate one with `openssl rand -base64 32`.";

  DocumentsProperties {
    if (encryptionKey == null || encryptionKey.isBlank()) {
      throw new IllegalArgumentException("DOCUMENTS_ENCRYPTION_KEY is required." + HOW_TO_GENERATE);
    }
    if (decoded(encryptionKey).length != 32) {
      throw new IllegalArgumentException(
          "DOCUMENTS_ENCRYPTION_KEY must be 32 bytes in base64." + HOW_TO_GENERATE);
    }
    if (isBlank(folder)) {
      Bucket given = s3 == null ? new Bucket(null, null, null, null) : s3;
      s3 =
          new Bucket(
              required("DOCUMENTS_S3_ENDPOINT", given.endpoint()),
              required("DOCUMENTS_S3_BUCKET", given.name()),
              required("DOCUMENTS_S3_ACCESS_KEY_ID", given.accessKeyId()),
              required("DOCUMENTS_S3_SECRET_ACCESS_KEY", given.secretAccessKey()));
    }
  }

  /**
   * A bucket of an S3-compatible service and the API token for it. Nullable as bound; {@link
   * DocumentsProperties#bucket()} has every value.
   *
   * @param endpoint the service's S3 API URL, without the bucket (R2: {@code https://<account
   *     id>.r2.cloudflarestorage.com})
   * @param name the bucket's name
   */
  record Bucket(
      @Nullable String endpoint,
      @Nullable String name,
      @Nullable String accessKeyId,
      @Nullable String secretAccessKey) {}

  /** The folder files are kept in, when one is configured (blank is none). */
  Optional<Path> folderPath() {
    return isBlank(folder) ? Optional.empty() : Optional.of(Path.of(folder));
  }

  /** The bucket of production, every value set: call it only when no folder is configured. */
  Bucket bucket() {
    return Objects.requireNonNull(s3);
  }

  byte[] encryptionKeyBytes() {
    return decoded(encryptionKey);
  }

  /** The value, stripped; the app does not start when it is blank. */
  private static String required(String variable, @Nullable String value) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(
          variable + " is required (the bucket Document files are stored in).");
    }
    return value.strip();
  }

  private static boolean isBlank(@Nullable String value) {
    return value == null || value.isBlank();
  }

  /** The key's bytes; none when it is not base64. */
  private static byte[] decoded(String key) {
    try {
      return Base64.getDecoder().decode(key.strip());
    } catch (IllegalArgumentException e) {
      return new byte[0];
    }
  }
}

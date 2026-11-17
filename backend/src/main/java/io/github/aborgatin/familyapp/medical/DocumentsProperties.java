package io.github.aborgatin.familyapp.medical;

import java.net.URI;
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
 *     Cloudflare R2, ticket #135); every value required when there is no folder
 */
@ConfigurationProperties("documents")
record DocumentsProperties(String encryptionKey, @Nullable String folder, @Nullable S3 s3) {

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
      S3 bucket = s3 == null ? new S3(null, null, null, null) : s3;
      required("DOCUMENTS_S3_ENDPOINT", bucket.endpoint());
      required("DOCUMENTS_S3_BUCKET", bucket.bucket());
      required("DOCUMENTS_S3_ACCESS_KEY_ID", bucket.accessKeyId());
      required("DOCUMENTS_S3_SECRET_ACCESS_KEY", bucket.secretAccessKey());
    }
  }

  /**
   * The bucket of an S3-compatible service (R2: endpoint {@code https://<account
   * id>.r2.cloudflarestorage.com}).
   */
  record S3(
      @Nullable String endpoint,
      @Nullable String bucket,
      @Nullable String accessKeyId,
      @Nullable String secretAccessKey) {}

  /** The folder files are kept in, when one is configured (blank is none). */
  Optional<Path> folderPath() {
    return isBlank(folder) ? Optional.empty() : Optional.of(Path.of(folder));
  }

  /** The store of production: the bucket, when no folder is configured. */
  S3FileStore s3FileStore() {
    S3 bucket = Objects.requireNonNull(s3);
    return new S3FileStore(
        URI.create(bucket.endpoint().strip()),
        bucket.bucket().strip(),
        bucket.accessKeyId().strip(),
        bucket.secretAccessKey().strip());
  }

  byte[] encryptionKeyBytes() {
    return decoded(encryptionKey);
  }

  private static void required(String variable, @Nullable String value) {
    if (isBlank(value)) {
      throw new IllegalArgumentException(
          variable + " is required (the bucket Document files are stored in).");
    }
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

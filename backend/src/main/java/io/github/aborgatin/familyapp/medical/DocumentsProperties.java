package io.github.aborgatin.familyapp.medical;

import java.nio.file.Path;
import java.util.Base64;
import java.util.Optional;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.lang.Nullable;

/**
 * The {@code documents} settings of {@code application.yml} (spec #128, backend.md
 * "Configuration"). The encryption key is required: without it, or with one that is not 32 bytes in
 * base64, the app does not start, and the message names the variable.
 *
 * @param encryptionKey {@code DOCUMENTS_ENCRYPTION_KEY}: the AES-256 key Document files are
 *     encrypted with, 32 bytes in base64
 * @param folder {@code DOCUMENTS_FOLDER}: when set, files are stored in this folder (local
 *     development, {@code scripts/dev.sh}); production stores them in R2 (ticket #135)
 */
@ConfigurationProperties("documents")
record DocumentsProperties(String encryptionKey, @Nullable String folder) {

  static final String HOW_TO_GENERATE = " Generate one with `openssl rand -base64 32`.";

  DocumentsProperties {
    if (encryptionKey == null || encryptionKey.isBlank()) {
      throw new IllegalArgumentException("DOCUMENTS_ENCRYPTION_KEY is required." + HOW_TO_GENERATE);
    }
    if (decoded(encryptionKey).length != 32) {
      throw new IllegalArgumentException(
          "DOCUMENTS_ENCRYPTION_KEY must be 32 bytes in base64." + HOW_TO_GENERATE);
    }
  }

  /** The folder files are kept in, when one is configured (blank is none). */
  Optional<Path> folderPath() {
    return folder == null || folder.isBlank() ? Optional.empty() : Optional.of(Path.of(folder));
  }

  byte[] encryptionKeyBytes() {
    return decoded(encryptionKey);
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

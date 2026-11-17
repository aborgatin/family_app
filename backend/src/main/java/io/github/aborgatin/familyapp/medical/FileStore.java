package io.github.aborgatin.familyapp.medical;

import java.util.Optional;

/**
 * Where Document files live (spec #128 "File store port", ADR-0010): objects by key, holding bytes
 * the store never interprets. {@link DocumentFiles} encrypts above it, so a store only ever sees
 * ciphertext. Implementations: {@link FolderFileStore} (local development), an in-memory one
 * (tests), and an S3-compatible one for Cloudflare R2 (production, ticket #135). An implementation
 * throws an unchecked exception when the store itself fails.
 */
interface FileStore {

  /** Stores the object under {@code key}, replacing any object already there. */
  void put(String key, byte[] bytes);

  /** The object stored under {@code key}, or empty when there is none. */
  Optional<byte[]> get(String key);

  /** Deletes the object under {@code key}; a missing one is not an error. */
  void delete(String key);
}

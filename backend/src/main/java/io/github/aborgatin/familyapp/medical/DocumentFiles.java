package io.github.aborgatin.familyapp.medical;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Document files, encrypted above the {@link FileStore} (spec #128, ADR-0010): AES-256-GCM with
 * {@code DOCUMENTS_ENCRYPTION_KEY}, a random 12-byte nonce for each file, stored in front of the
 * ciphertext in the same object. The object key is the GCM associated data, so an object copied
 * under another Document's key does not decrypt.
 */
@Component
class DocumentFiles {

  private static final Logger log = LoggerFactory.getLogger(DocumentFiles.class);
  private static final String CIPHER = "AES/GCM/NoPadding";
  private static final int NONCE_BYTES = 12;
  private static final int TAG_BITS = 128;

  private final FileStore store;
  private final SecretKey key;
  private final SecureRandom random = new SecureRandom();

  DocumentFiles(FileStore store, DocumentsProperties properties) {
    this.store = store;
    this.key = new SecretKeySpec(properties.encryptionKeyBytes(), "AES");
  }

  /** Encrypts the file and stores it as the Document's object, replacing any already there. */
  void put(UUID documentId, byte[] file) {
    String objectKey = Document.objectKey(documentId);
    byte[] nonce = new byte[NONCE_BYTES];
    random.nextBytes(nonce);
    try {
      Cipher cipher = Cipher.getInstance(CIPHER);
      cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, nonce));
      cipher.updateAAD(objectKey.getBytes(StandardCharsets.UTF_8));
      byte[] sealed = cipher.doFinal(file);
      byte[] object = Arrays.copyOf(nonce, NONCE_BYTES + sealed.length);
      System.arraycopy(sealed, 0, object, NONCE_BYTES, sealed.length);
      store.put(objectKey, object);
    } catch (GeneralSecurityException e) {
      throw new IllegalStateException("Could not encrypt a Document file", e);
    }
  }

  /** The Document's file, decrypted; empty when its object is gone. */
  Optional<byte[]> get(UUID documentId) {
    String objectKey = Document.objectKey(documentId);
    return store.get(objectKey).map(object -> open(objectKey, object));
  }

  /** Deletes the Document's object. A failure is logged, never thrown (spec #128). */
  void delete(UUID documentId) {
    try {
      store.delete(Document.objectKey(documentId));
    } catch (RuntimeException e) {
      log.warn("Could not delete the file of Document {}; it stays in the store", documentId, e);
    }
  }

  private byte[] open(String objectKey, byte[] object) {
    try {
      Cipher cipher = Cipher.getInstance(CIPHER);
      cipher.init(
          Cipher.DECRYPT_MODE,
          key,
          new GCMParameterSpec(TAG_BITS, Arrays.copyOf(object, NONCE_BYTES)));
      cipher.updateAAD(objectKey.getBytes(StandardCharsets.UTF_8));
      return cipher.doFinal(object, NONCE_BYTES, object.length - NONCE_BYTES);
    } catch (GeneralSecurityException e) {
      throw new IllegalStateException("Could not decrypt the file " + objectKey, e);
    }
  }
}

package io.github.aborgatin.familyapp.medical;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MinIOContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * The production file store (ticket #135, ADR-0010) against a real S3-compatible server: MinIO in a
 * container ({@link Minio}), with path-style addressing and region {@code auto}, as for Cloudflare
 * R2.
 */
@Testcontainers
class S3FileStoreTest {

  private static final String BUCKET = "documents";

  @Container static final MinIOContainer minio = Minio.container();

  private S3FileStore store;

  @BeforeAll
  static void createTheBucket() throws Exception {
    Minio.createBucket(minio, BUCKET);
  }

  @BeforeEach
  void open() {
    store = storeOf(BUCKET);
  }

  @AfterEach
  void close() {
    store.close();
  }

  @Test
  void anObjectPutIsGotBackAndReplaced() {
    byte[] first = "ciphertext one".getBytes(StandardCharsets.UTF_8);
    byte[] second = "ciphertext two, longer".getBytes(StandardCharsets.UTF_8);

    store.put("documents/a", first);
    assertThat(store.get("documents/a")).hasValue(first);

    store.put("documents/a", second);
    assertThat(store.get("documents/a")).hasValue(second);
  }

  @Test
  void aMissingKeyIsEmpty() {
    assertThat(store.get("documents/never-stored")).isEmpty();
  }

  @Test
  void aDeletedObjectIsGoneAndDeletingAMissingOneIsNotAnError() {
    store.put("documents/b", new byte[] {1, 2, 3});

    store.delete("documents/b");

    assertThat(store.get("documents/b")).isEmpty();
    store.delete("documents/b");
  }

  @Test
  void aStoreThatFailsThrowsRatherThanReportingTheObjectMissing() {
    try (S3FileStore noBucket = storeOf("no-such-bucket")) {
      assertThatThrownBy(() -> noBucket.get("documents/a")).isInstanceOf(RuntimeException.class);
      assertThatThrownBy(() -> noBucket.put("documents/a", new byte[] {1}))
          .isInstanceOf(RuntimeException.class);
    }
  }

  private static S3FileStore storeOf(String bucket) {
    return Minio.store(minio, bucket);
  }
}

package io.github.aborgatin.familyapp.medical;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.aborgatin.familyapp.FamilyAppApplication;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.Banner;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Import;
import org.testcontainers.containers.MinIOContainer;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * The documents settings (spec #128, Configuration): {@code DOCUMENTS_ENCRYPTION_KEY} is required
 * and must be 32 bytes in base64, so the app does not start without one; {@code DOCUMENTS_FOLDER}
 * keeps the files, encrypted, in a folder (local development); without it the {@code
 * DOCUMENTS_S3_*} settings are required and keep them in a bucket (production, ticket #135). Tests
 * get a test key from {@code src/test/resources/config}; these start the app again with a setting
 * blanked or changed.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class DocumentsConfigurationTest {

  @Autowired PostgreSQLContainer<?> postgres;

  @Test
  void theAppDoesNotStartWithoutAnEncryptionKey() {
    assertThatThrownBy(() -> start("--DOCUMENTS_ENCRYPTION_KEY=").close())
        .satisfies(e -> assertThat(messages(e)).contains("DOCUMENTS_ENCRYPTION_KEY is required."));
  }

  @Test
  void theEncryptionKeyIs32BytesInBase64() {
    for (String key : new String[] {"c2hvcnQ=", "not base64 at all"}) {
      assertThatThrownBy(() -> start("--DOCUMENTS_ENCRYPTION_KEY=" + key).close())
          .as(key)
          .satisfies(
              e ->
                  assertThat(messages(e))
                      .contains("DOCUMENTS_ENCRYPTION_KEY must be 32 bytes in base64."));
    }
  }

  @Test
  void withoutAFolderTheAppDoesNotStartWithABlankS3Setting() {
    for (String variable :
        new String[] {
          "DOCUMENTS_S3_ENDPOINT",
          "DOCUMENTS_S3_BUCKET",
          "DOCUMENTS_S3_ACCESS_KEY_ID",
          "DOCUMENTS_S3_SECRET_ACCESS_KEY"
        }) {
      assertThatThrownBy(() -> start("--" + variable + "= ").close())
          .as(variable)
          .satisfies(e -> assertThat(messages(e)).contains(variable + " is required"));
    }
  }

  @Test
  void aFolderNeedsNoS3Settings(@TempDir Path folder) {
    try (ConfigurableApplicationContext app =
        start("--DOCUMENTS_FOLDER=" + folder, "--DOCUMENTS_S3_ENDPOINT=")) {
      assertThat(app.getBean(DocumentFiles.class)).isNotNull();
    }
  }

  @Test
  void theS3SettingsKeepTheFilesEncryptedInTheBucket() throws Exception {
    try (MinIOContainer minio = Minio.container()) {
      minio.start();
      Minio.createBucket(minio, "family-documents");
      UUID id = UUID.randomUUID();
      byte[] file = "%PDF-1.7 Анализ крови".getBytes(StandardCharsets.UTF_8);

      try (ConfigurableApplicationContext app =
              start(
                  "--DOCUMENTS_S3_ENDPOINT=" + minio.getS3URL(),
                  "--DOCUMENTS_S3_BUCKET=family-documents",
                  "--DOCUMENTS_S3_ACCESS_KEY_ID=" + minio.getUserName(),
                  "--DOCUMENTS_S3_SECRET_ACCESS_KEY=" + minio.getPassword());
          S3FileStore bucket =
              new S3FileStore(
                  URI.create(minio.getS3URL()),
                  "family-documents",
                  minio.getUserName(),
                  minio.getPassword())) {
        DocumentFiles files = app.getBean(DocumentFiles.class);
        files.put(id, file);

        assertThat(files.get(id)).hasValue(file);
        assertThat(bucket.get(Document.objectKey(id)))
            .hasValueSatisfying(
                stored ->
                    assertThat(new String(stored, StandardCharsets.ISO_8859_1))
                        .doesNotContain("%PDF"));
      }
    }
  }

  @Test
  void aFolderKeepsTheFilesEncrypted(@TempDir Path folder) throws Exception {
    UUID id = UUID.randomUUID();
    byte[] file = "%PDF-1.7 Анализ крови".getBytes(StandardCharsets.UTF_8);

    try (ConfigurableApplicationContext app = start("--DOCUMENTS_FOLDER=" + folder)) {
      DocumentFiles files = app.getBean(DocumentFiles.class);
      files.put(id, file);

      assertThat(files.get(id)).hasValue(file);
      try (Stream<Path> stored = Files.walk(folder)) {
        assertThat(stored.filter(Files::isRegularFile).toList())
            .singleElement()
            .satisfies(
                path ->
                    assertThat(new String(Files.readAllBytes(path), StandardCharsets.ISO_8859_1))
                        .doesNotContain("%PDF"));
      }
      files.delete(id);
      assertThat(files.get(id)).isEmpty();
    }
  }

  private ConfigurableApplicationContext start(String... settings) {
    return new SpringApplicationBuilder(FamilyAppApplication.class)
        .web(WebApplicationType.NONE)
        .bannerMode(Banner.Mode.OFF)
        .logStartupInfo(false)
        .run(
            Stream.concat(
                    Stream.of(
                        "--DATASOURCE_URL=" + postgres.getJdbcUrl(),
                        "--DATASOURCE_USERNAME=" + postgres.getUsername(),
                        "--DATASOURCE_PASSWORD=" + postgres.getPassword()),
                    Stream.of(settings))
                .toArray(String[]::new));
  }

  /** Every message in the cause chain, as the startup failure prints them. */
  private static String messages(Throwable e) {
    return Stream.iterate(e, t -> t != null, Throwable::getCause)
        .map(String::valueOf)
        .reduce("", (a, b) -> a + "\n" + b);
  }
}

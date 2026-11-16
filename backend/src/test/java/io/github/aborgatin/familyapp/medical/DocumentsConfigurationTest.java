package io.github.aborgatin.familyapp.medical;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.aborgatin.familyapp.FamilyAppApplication;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
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
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * The documents settings (spec #128, Configuration): {@code DOCUMENTS_ENCRYPTION_KEY} is required
 * and must be 32 bytes in base64, so the app does not start without one; {@code DOCUMENTS_FOLDER}
 * keeps the files, encrypted, in a folder (local development). Tests get a test key from {@code
 * src/test/resources/config}; these start the app again with a setting blanked or changed.
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

  private ConfigurableApplicationContext start(String setting) {
    return new SpringApplicationBuilder(FamilyAppApplication.class)
        .web(WebApplicationType.NONE)
        .bannerMode(Banner.Mode.OFF)
        .logStartupInfo(false)
        .run(
            "--DATASOURCE_URL=" + postgres.getJdbcUrl(),
            "--DATASOURCE_USERNAME=" + postgres.getUsername(),
            "--DATASOURCE_PASSWORD=" + postgres.getPassword(),
            setting);
  }

  /** Every message in the cause chain, as the startup failure prints them. */
  private static String messages(Throwable e) {
    return Stream.iterate(e, t -> t != null, Throwable::getCause)
        .map(String::valueOf)
        .reduce("", (a, b) -> a + "\n" + b);
  }
}

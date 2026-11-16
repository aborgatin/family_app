package io.github.aborgatin.familyapp.medical;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.HttpDevice;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Uploads to {@code POST /api/documents} on a real port, where the servlet container reads the
 * multipart body (spec #128, ticket #133): a file over 20 MB is refused while it is read, as {@code
 * document.too_large} (a body far larger is refused before it is read: the connection closes), and
 * the uploaded file is held in memory, never written in plaintext to the container's temporary
 * folder. {@code DocumentsTest} covers the rest of the API with MockMvc, which reads no body.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@Import({PostgresTestcontainer.class, InMemoryFileStore.Config.class})
class DocumentUploadOverHttpTest {

  private static final String BOUNDARY = "----family-app-test-boundary";
  private static final Path MULTIPART_FOLDER = temporaryFolder();

  @DynamicPropertySource
  static void multipartFolder(DynamicPropertyRegistry registry) {
    registry.add("spring.servlet.multipart.location", MULTIPART_FOLDER::toString);
  }

  @Autowired ConfigurableApplicationContext app;
  @Autowired JdbcTemplate jdbc;
  @Autowired InMemoryFileStore files;

  private HttpDevice anna;
  private String annaId;

  @BeforeEach
  void annaIsLoggedIn() throws Exception {
    FreshInstallation.reset(jdbc);
    files.reset();
    anna = new HttpDevice().at(app);
    anna.send("GET", "/api/auth/session", null);
    anna.send(
        "POST",
        "/api/auth/bootstrap",
        """
        {"email":"anna@example.com","password":"secret123","displayName":"Анна",
         "grammaticalGender":"FEMININE"}
        """);
    String session = anna.send("GET", "/api/auth/session", null).body();
    annaId = JsonPath.read(session, "$.member.id");
  }

  @Test
  void aFileOver20MbIsRefusedWhileItIsReadAsTooLarge() throws Exception {
    byte[] large =
        Arrays.copyOf("%PDF-1.7".getBytes(StandardCharsets.US_ASCII), 20 * 1024 * 1024 + 1);

    HttpResponse<String> response = upload(UUID.randomUUID(), large);

    assertThat(response.statusCode()).as(response.body()).isEqualTo(413);
    assertThat(JsonPath.<String>read(response.body(), "$.code")).isEqualTo("document.too_large");
    assertThat(files.keys()).isEmpty();
  }

  @Test
  void theFileIsNeverWrittenToTheTemporaryFolder() throws Exception {
    byte[] pdf = Arrays.copyOf("%PDF-1.7".getBytes(StandardCharsets.US_ASCII), 20 * 1024 * 1024);
    List<Path> written = new ArrayList<>();
    files.whilePutting(() -> written.addAll(filesIn(MULTIPART_FOLDER)));

    HttpResponse<String> response = upload(UUID.randomUUID(), pdf);

    assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
    assertThat(files.keys()).hasSize(1);
    assertThat(written).isEmpty();
  }

  private HttpResponse<String> upload(UUID id, byte[] file) throws Exception {
    ByteArrayOutputStream body = new ByteArrayOutputStream();
    field(body, "id", id.toString());
    field(body, "memberId", annaId);
    field(body, "title", "Скан");
    field(body, "date", "2026-12-02");
    text(
        body,
        "--"
            + BOUNDARY
            + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"scan.pdf\"\r\n"
            + "Content-Type: application/pdf\r\n\r\n");
    body.write(file);
    text(body, "\r\n--" + BOUNDARY + "--\r\n");
    return anna.send(
        "POST",
        "/api/documents",
        "multipart/form-data; boundary=" + BOUNDARY,
        BodyPublishers.ofByteArray(body.toByteArray()));
  }

  private static void field(ByteArrayOutputStream body, String name, String value) {
    text(
        body,
        "--"
            + BOUNDARY
            + "\r\nContent-Disposition: form-data; name=\""
            + name
            + "\"\r\n\r\n"
            + value
            + "\r\n");
  }

  private static void text(ByteArrayOutputStream body, String text) {
    body.writeBytes(text.getBytes(StandardCharsets.UTF_8));
  }

  private static List<Path> filesIn(Path folder) {
    try (Stream<Path> found = Files.walk(folder)) {
      return found.filter(Files::isRegularFile).toList();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private static Path temporaryFolder() {
    try {
      Path folder = Files.createTempDirectory("family-app-multipart");
      folder.toFile().deleteOnExit();
      return folder;
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}

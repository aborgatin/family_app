package io.github.aborgatin.familyapp;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * The backend serves the web bundle with an SPA fallback (spec #5, "Serving the bundle"). Runs a
 * real server so welcome-page forwards behave as in production. The test bundle lives in {@code
 * src/test/resources/static}.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@Import(PostgresTestcontainer.class)
class WebBundleServingTest {

  private static final String SHELL = "data-test=\"spa-shell\"";

  @Autowired TestRestTemplate http;

  @Test
  void rootServesIndexHtmlWithoutASession() {
    assertServesShell(http.getForEntity("/", String.class));
  }

  @Test
  void deepLinksServeIndexHtmlWithoutASession() {
    assertServesShell(http.getForEntity("/settings", String.class));
    assertServesShell(http.getForEntity("/settings/children/42", String.class));
  }

  @Test
  void existingFileIsServedAsItself() {
    ResponseEntity<String> response = http.getForEntity("/assets/app-abc123.js", String.class);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).contains("console.log(\"asset\")");
  }

  @Test
  void unknownApiAndActuatorPathsAreNotAnsweredWithIndexHtml() {
    for (String path : new String[] {"/api", "/api/does-not-exist", "/actuator/does-not-exist"}) {
      ResponseEntity<String> response = http.getForEntity(path, String.class);

      assertThat(response.getStatusCode().is2xxSuccessful()).as(path).isFalse();
      assertThat(String.valueOf(response.getBody())).as(path).doesNotContain(SHELL);
    }
  }

  @Test
  void hashedAssetsAreCachedForeverAsImmutable() {
    ResponseEntity<String> response = http.getForEntity("/assets/app-abc123.js", String.class);

    assertThat(response.getHeaders().getCacheControl())
        .contains("max-age=31536000")
        .contains("public")
        .contains("immutable");
  }

  @Test
  void indexHtmlServiceWorkerAndManifestAreRevalidatedOnEveryLoad() {
    for (String path :
        new String[] {"/", "/index.html", "/settings", "/sw.js", "/manifest.webmanifest"}) {
      ResponseEntity<String> response = http.getForEntity(path, String.class);

      assertThat(response.getStatusCode()).as(path).isEqualTo(HttpStatus.OK);
      assertThat(response.getHeaders().getCacheControl()).as(path).isEqualTo("no-cache");
    }
  }

  @Test
  void manifestIsServedAsAWebAppManifest() {
    ResponseEntity<String> response = http.getForEntity("/manifest.webmanifest", String.class);

    assertThat(response.getHeaders().getContentType())
        .isEqualTo(MediaType.parseMediaType("application/manifest+json"));
  }

  @Test
  void missingHashedAssetIsNotAnsweredWithIndexHtml() {
    ResponseEntity<String> response = http.getForEntity("/assets/app-gone.js", String.class);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    assertThat(String.valueOf(response.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL)))
        .doesNotContain("immutable");
  }

  private static void assertServesShell(ResponseEntity<String> response) {
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).contains(SHELL);
  }
}

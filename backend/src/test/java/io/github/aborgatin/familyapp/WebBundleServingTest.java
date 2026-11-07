package io.github.aborgatin.familyapp;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
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

  private static void assertServesShell(ResponseEntity<String> response) {
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).contains(SHELL);
  }
}

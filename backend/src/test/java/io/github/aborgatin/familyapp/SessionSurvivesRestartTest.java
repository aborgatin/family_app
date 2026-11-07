package io.github.aborgatin.familyapp;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublisher;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandlers;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/**
 * A Member stays logged in across an app restart or redeploy, because sessions live in PostgreSQL
 * (spec #5 story 17; ticket #15). The database outlives two separate runs of the app here, the way
 * the {@code postgres} service outlives an {@code app} container replaced by a deploy.
 */
@Testcontainers
class SessionSurvivesRestartTest {

  @Container
  static final PostgreSQLContainer<?> postgres =
      new PostgreSQLContainer<>(DockerImageName.parse("postgres:18"));

  @Test
  void aLoggedInDeviceIsStillLoggedInAfterTheAppRestarts() throws Exception {
    Device phone = new Device();
    try (ConfigurableApplicationContext app = startApp()) {
      Device setup = new Device().at(app);
      setup.send("GET", "/api/auth/session", null);
      setup.send(
          "POST",
          "/api/auth/bootstrap",
          """
          {"email":"anna@example.com","password":"secret123","displayName":"Анна",
           "grammaticalGender":"FEMININE"}
          """);

      phone.at(app).send("GET", "/api/auth/session", null);
      HttpResponse<String> login =
          phone.send(
              "POST",
              "/api/auth/login",
              "{\"email\":\"anna@example.com\",\"password\":\"secret123\"}");
      assertThat(login.statusCode()).isEqualTo(200);
    }

    try (ConfigurableApplicationContext app = startApp()) {
      HttpResponse<String> session = phone.at(app).send("GET", "/api/auth/session", null);

      assertThat(session.statusCode()).isEqualTo(200);
      assertThat(session.body()).contains("\"email\":\"anna@example.com\"");
    }
  }

  private static ConfigurableApplicationContext startApp() {
    return new SpringApplicationBuilder(FamilyAppApplication.class)
        .properties(
            "server.port=0",
            "DATASOURCE_URL=" + postgres.getJdbcUrl(),
            "DATASOURCE_USERNAME=" + postgres.getUsername(),
            "DATASOURCE_PASSWORD=" + postgres.getPassword())
        .run();
  }

  /**
   * A browser on one device: keeps its cookies across app restarts and sends the CSRF header on
   * writes. (The JDK's cookie store won't send {@code Secure} cookies over plain HTTP.)
   */
  private static final class Device {

    private final HttpClient http = HttpClient.newHttpClient();
    private final Map<String, String> cookies = new LinkedHashMap<>();
    private String base = "";

    Device at(ConfigurableApplicationContext app) {
      base = "http://localhost:" + app.getEnvironment().getProperty("local.server.port");
      return this;
    }

    HttpResponse<String> send(String method, String path, String json)
        throws IOException, InterruptedException {
      BodyPublisher body = json == null ? BodyPublishers.noBody() : BodyPublishers.ofString(json);
      HttpRequest.Builder request =
          HttpRequest.newBuilder(URI.create(base + path))
              .method(method, body)
              .header("Content-Type", "application/json");
      if (!cookies.isEmpty()) {
        request.header(
            "Cookie",
            cookies.entrySet().stream()
                .map(cookie -> cookie.getKey() + "=" + cookie.getValue())
                .collect(Collectors.joining("; ")));
      }
      String xsrf = cookies.get("XSRF-TOKEN");
      if (xsrf != null && !method.equals("GET")) {
        request.header("X-XSRF-TOKEN", xsrf);
      }
      HttpResponse<String> response = http.send(request.build(), BodyHandlers.ofString());
      for (String setCookie : response.headers().allValues("Set-Cookie")) {
        String pair = setCookie.split(";", 2)[0];
        int eq = pair.indexOf('=');
        cookies.put(pair.substring(0, eq), pair.substring(eq + 1));
      }
      return response;
    }
  }
}

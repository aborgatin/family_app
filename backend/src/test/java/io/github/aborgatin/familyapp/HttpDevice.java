package io.github.aborgatin.familyapp;

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
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * A browser on one device talking to a really running app over HTTP: keeps its cookies across app
 * restarts and sends the CSRF header on writes. (The JDK's cookie store won't send {@code Secure}
 * cookies over plain HTTP.) For tests that restart the app against the same database.
 */
final class HttpDevice {

  private final HttpClient http = HttpClient.newHttpClient();
  private final Map<String, String> cookies = new LinkedHashMap<>();
  private String base = "";

  /** Starts the whole app on a random port against {@code postgres}. */
  static ConfigurableApplicationContext startApp(PostgreSQLContainer<?> postgres) {
    return new SpringApplicationBuilder(FamilyAppApplication.class)
        .properties(
            "server.port=0",
            "DATASOURCE_URL=" + postgres.getJdbcUrl(),
            "DATASOURCE_USERNAME=" + postgres.getUsername(),
            "DATASOURCE_PASSWORD=" + postgres.getPassword())
        .run();
  }

  HttpDevice at(ConfigurableApplicationContext app) {
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

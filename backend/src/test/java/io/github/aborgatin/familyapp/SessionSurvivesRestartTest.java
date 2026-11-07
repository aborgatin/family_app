package io.github.aborgatin.familyapp;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
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
    HttpDevice phone = new HttpDevice();
    try (ConfigurableApplicationContext app = startApp()) {
      HttpDevice setup = new HttpDevice().at(app);
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
    return HttpDevice.startApp(postgres);
  }
}

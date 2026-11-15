package io.github.aborgatin.familyapp.notifications;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.aborgatin.familyapp.FakePushGateway;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.HttpDevice;
import io.github.aborgatin.familyapp.ListOperations;
import io.github.aborgatin.familyapp.TestClock;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/**
 * A pending Batch is in the database, so a deploy between a change and its Notification loses
 * nothing (spec #104 "Pending Batches"; ticket #109). The database outlives two runs of the app.
 */
@Testcontainers
class BatchesSurviveRestartTest {

  static final String ANNA_PHONE = "https://web.push.apple.com/anna-phone";

  @Container
  static final PostgreSQLContainer<?> postgres =
      new PostgreSQLContainer<>(DockerImageName.parse("postgres:18"));

  @Test
  void aBatchPendingWhenTheAppStopsIsSentAfterItStartsAgain() throws Exception {
    Instant start = Instant.now();
    try (ConfigurableApplicationContext app = startApp()) {
      app.getBean(TestClock.class).set(start);
      HttpDevice anna = new HttpDevice().at(app);
      anna.send("GET", "/api/auth/session", null);
      anna.send(
          "POST",
          "/api/auth/bootstrap",
          """
          {"email":"anna@example.com","password":"secret123","displayName":"Анна",
           "grammaticalGender":"FEMININE"}
          """);
      ok(anna.send("PATCH", "/api/members/me", "{\"notificationsEnabled\":true}"));
      ok(
          anna.send(
              "POST", "/api/push/subscriptions", PushSubscriptionsTest.subscription(ANNA_PHONE)));
      UUID home = UUID.randomUUID();
      ok(push(anna, ListOperations.list(home, "Дом", "TODO", "SHARED")));

      FreshInstallation.addMember(
          app.getBean(JdbcTemplate.class), "boris@example.com", "boris-pass", "Борис", "MASCULINE");
      HttpDevice boris = new HttpDevice().at(app);
      boris.send("GET", "/api/auth/session", null);
      ok(
          boris.send(
              "POST",
              "/api/auth/login",
              "{\"email\":\"boris@example.com\",\"password\":\"boris-pass\"}"));
      ok(push(boris, ListOperations.add(UUID.randomUUID(), home, "Починить кран")));
    }

    try (ConfigurableApplicationContext app = startApp()) {
      app.getBean(TestClock.class).set(start.plus(Duration.ofMinutes(2)));
      app.getBean(SchedulerStep.class).run();

      FakePushGateway gateway = app.getBean(FakePushGateway.class);
      assertThat(gateway.endpoints()).containsExactly(ANNA_PHONE);
      assertThat(gateway.pushes().get(0).payload()).contains("\"Починить кран\"");
    }
  }

  private static HttpResponse<String> push(HttpDevice device, String operation) throws Exception {
    return device.send("POST", "/api/sync/push", "{\"operations\":[" + operation + "]}");
  }

  private static void ok(HttpResponse<String> response) {
    assertThat(response.statusCode()).as(response.body()).isBetween(200, 299);
  }

  private static ConfigurableApplicationContext startApp() {
    return HttpDevice.startApp(postgres, FakePushGateway.Config.class, TestClock.Config.class);
  }
}

package io.github.aborgatin.familyapp;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.net.http.HttpResponse;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.context.ConfigurableApplicationContext;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/**
 * A fresh installation comes with the Default Child fields «Вес» and «Рост» (both {@code TEXT}, in
 * that order), and once a Member removes or renames one, it stays that way across app restarts
 * (spec #5 stories 46 and 53; ADR-0007). Uses its own, really fresh database.
 */
@Testcontainers
class ChildFieldDefaultsTest {

  @Container
  static final PostgreSQLContainer<?> postgres =
      new PostgreSQLContainer<>(DockerImageName.parse("postgres:18"));

  @Test
  void defaultsComeOnceAndNeverComeBackAfterAMemberChangesThem() throws Exception {
    HttpDevice anna = new HttpDevice();
    try (ConfigurableApplicationContext app = HttpDevice.startApp(postgres)) {
      anna.at(app).send("GET", "/api/auth/session", null);
      anna.send(
          "POST",
          "/api/auth/bootstrap",
          """
          {"email":"anna@example.com","password":"secret123","displayName":"Анна",
           "grammaticalGender":"FEMININE"}
          """);

      List<Map<String, Object>> defaults = childFields(anna);
      assertThat(defaults).extracting(f -> field(f, "name")).containsExactly("Вес", "Рост");
      assertThat(defaults).extracting(f -> field(f, "valueType")).containsExactly("TEXT", "TEXT");

      HttpResponse<String> changed =
          anna.send(
              "POST",
              "/api/sync/push",
              """
              {"operations":[
                {"table":"child_field","id":"%s","op":"delete"},
                {"table":"child_field","id":"%s","op":"upsert","fields":{"name":"Рост, см"}}]}
              """
                  .formatted(defaults.get(0).get("id"), defaults.get(1).get("id")));
      assertThat(changed.statusCode()).isEqualTo(200);
      assertThat(JsonPath.<List<String>>read(changed.body(), "$.results[*].status"))
          .containsExactly("applied", "applied");
    }

    try (ConfigurableApplicationContext app = HttpDevice.startApp(postgres)) {
      assertThat(childFields(anna.at(app)))
          .extracting(f -> field(f, "name"))
          .containsExactly("Рост, см");
    }
  }

  /** The Child fields a first pull returns, in display order (by position). */
  private static List<Map<String, Object>> childFields(HttpDevice device) throws Exception {
    HttpResponse<String> response = device.send("GET", "/api/sync/pull?since=0", null);
    assertThat(response.statusCode()).isEqualTo(200);
    List<Map<String, Object>> fields =
        JsonPath.read(response.body(), "$.changes[?(@.table=='child_field')]");
    return fields.stream()
        .sorted(Comparator.comparingDouble(f -> ((Number) field(f, "position")).doubleValue()))
        .toList();
  }

  /** One of the fields of a pulled change. */
  private static Object field(Map<String, Object> change, String name) {
    return ((Map<?, ?>) change.get("fields")).get(name);
  }
}

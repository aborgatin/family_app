package io.github.aborgatin.familyapp;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.net.http.HttpResponse;
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
      assertThat(defaults).extracting(f -> f.get("name")).containsExactly("Вес", "Рост");
      assertThat(defaults).extracting(f -> f.get("valueType")).containsExactly("TEXT", "TEXT");

      String weightId = (String) defaults.get(0).get("id");
      Map<String, Object> height = defaults.get(1);
      assertThat(anna.send("DELETE", "/api/child-fields/" + weightId, null).statusCode())
          .isEqualTo(204);
      HttpResponse<String> renamed =
          anna.send(
              "PUT",
              "/api/child-fields/" + height.get("id"),
              """
              {"name":"Рост, см","valueType":"TEXT","position":%s}
              """
                  .formatted(height.get("position")));
      assertThat(renamed.statusCode()).isEqualTo(200);
    }

    try (ConfigurableApplicationContext app = HttpDevice.startApp(postgres)) {
      assertThat(childFields(anna.at(app)))
          .extracting(f -> f.get("name"))
          .containsExactly("Рост, см");
    }
  }

  private static List<Map<String, Object>> childFields(HttpDevice device) throws Exception {
    HttpResponse<String> response = device.send("GET", "/api/child-fields", null);
    assertThat(response.statusCode()).isEqualTo(200);
    return JsonPath.read(response.body(), "$");
  }
}

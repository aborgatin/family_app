package io.github.aborgatin.familyapp.notifications;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.aborgatin.familyapp.FamilyAppApplication;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.notifications.push.NotificationsProperties;
import java.time.LocalTime;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.Banner;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Import;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * The notifications settings (spec #104, Configuration): the VAPID variables are required, so the
 * app does not start without them and says which one is missing; {@code REMINDER_MORNING_TIME}
 * defaults to 09:00. Tests get a test key pair from {@code src/test/resources/config}; these start
 * the app again with a setting blanked or changed.
 */
@SpringBootTest
@Import(PostgresTestcontainer.class)
class NotificationsConfigurationTest {

  @Autowired PostgreSQLContainer<?> postgres;
  @Autowired NotificationsProperties properties;

  @Test
  void theMorningTimeOfRemindersIsNineByDefault() {
    assertThat(properties.reminderMorningTime()).isEqualTo(LocalTime.of(9, 0));
  }

  @Test
  void theMorningTimeOfRemindersIsSet() {
    try (ConfigurableApplicationContext app = start("--REMINDER_MORNING_TIME=07:30")) {
      assertThat(app.getBean(NotificationsProperties.class).reminderMorningTime())
          .isEqualTo(LocalTime.of(7, 30));
    }
  }

  @Test
  void theAppDoesNotStartWithoutAVapidSetting() {
    for (String variable :
        new String[] {"VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"}) {
      assertThatThrownBy(() -> start("--" + variable + "=").close())
          .as(variable)
          .satisfies(e -> assertThat(messages(e)).contains(variable + " is required."));
    }
  }

  @Test
  void theVapidSubjectIsAMailtoAddress() {
    assertThatThrownBy(() -> start("--VAPID_SUBJECT=https://family.example.com").close())
        .satisfies(
            e -> assertThat(messages(e)).contains("VAPID_SUBJECT must be a mailto: address"));
  }

  @Test
  void theAppDoesNotStartWithAKeyPairItCannotRead() {
    // Another pair's private key: every push would be refused, so the app refuses to start.
    assertThatThrownBy(
            () -> start("--VAPID_PRIVATE_KEY=DrztBIjVCcvH5noEf40PrkK2ZDEYfqfNGSXCwQJFoWo").close())
        .satisfies(
            e ->
                assertThat(messages(e))
                    .contains("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be a P-256 key pair"));
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

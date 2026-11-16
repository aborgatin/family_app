package io.github.aborgatin.familyapp.notifications;

import static io.github.aborgatin.familyapp.SyncRequests.pushApplied;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FakePushGateway;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.HttpDevice;
import io.github.aborgatin.familyapp.ListOperations;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.SyncRequests;
import io.github.aborgatin.familyapp.TestClock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Announcements («Что нового», spec #120; ticket #121): an entry the operator adds to the catalog
 * reaches every Member with the Notifications switch on, once, on the next scheduler step. The
 * catalog is a test one ({@link Catalog}); Members act through HTTP; the step runs as the schedule
 * would; pushes are observed on the fake gateway.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({
  PostgresTestcontainer.class,
  TestClock.Config.class,
  FakePushGateway.Config.class,
  AnnouncementsTest.Catalog.class
})
class AnnouncementsTest {

  static final String ANNA_PHONE = "https://web.push.apple.com/anna-phone";
  static final String BORIS_PHONE = "https://web.push.apple.com/boris-phone";

  /** The time between two steps here: long enough for a Batch to be due (its 2 quiet minutes). */
  static final Duration STEP = Duration.ofMinutes(5);

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired FakePushGateway gateway;
  @Autowired TestClock clock;
  @Autowired SchedulerStep step;
  @Autowired PostgreSQLContainer<?> postgres;

  Browser anna;
  Browser boris;

  @BeforeEach
  void annaAndBorisHaveTheSwitchOnAndTheStepHasRunBefore() throws Exception {
    FreshInstallation.reset(jdbc);
    Catalog.ENTRIES.clear();
    anna = SyncRequests.bootstrapAnna(mvc);
    boris = SyncRequests.loginBoris(mvc, jdbc);
    for (Browser device : new Browser[] {anna, boris}) {
      PushSubscriptionsTest.switchNotifications(device, true);
    }
    PushSubscriptionsTest.subscribe(anna, ANNA_PHONE).andExpect(status().isNoContent());
    PushSubscriptionsTest.subscribe(boris, BORIS_PHONE).andExpect(status().isNoContent());
    clock.set(clock.instant().truncatedTo(ChronoUnit.MINUTES));
    nextStep(); // an existing installation: a step has run before
    gateway.reset();
  }

  @Test
  void aNewCatalogEntryIsSentOnTheNextStepToEachMember() {
    announce("Новое: медицинские карты", "Прививки и визиты к врачу", "/");

    nextStep();

    assertThat(gateway.endpoints()).containsExactlyInAnyOrder(ANNA_PHONE, BORIS_PHONE);
    for (FakePushGateway.Push sent : gateway.pushes()) {
      assertThat(sent.payloadJson())
          .isEqualTo(
              FakePushGateway.json(
                  """
                  {"type":"announcement","title":"Новое: медицинские карты",\
                  "body":"Прививки и визиты к врачу","url":"/"}"""));
    }
  }

  @Test
  void anEntryWithoutAUrlOpensHome() {
    announce("Новое", "Без ссылки", null);

    nextStep();

    assertThat(gateway.pushes())
        .extracting(sent -> sent.payloadJson().get("url").asText())
        .containsExactly("/", "/");
  }

  @Test
  void anEntryIsNotSentAgainByTheNextStep() {
    announce("Новое", "Один раз", "/");
    nextStep();
    gateway.reset();

    nextStep();

    assertThat(gateway.pushes()).isEmpty();
  }

  @Test
  void aFailedPushIsNotRetriedAndTheEntryStillCountsAsSent() {
    gateway.answer(ANNA_PHONE, PushResult.FAILED);
    gateway.throwOnNextSend();
    announce("Новое", "Не дошло", "/");
    nextStep();
    gateway.reset();

    nextStep();

    assertThat(gateway.pushes()).isEmpty();
  }

  @Test
  void aMemberWithTheSwitchOffGetsNothingNorAfterTurningItOn() throws Exception {
    PushSubscriptionsTest.switchNotifications(anna, false);
    announce("Новое", "Только Борису", "/");

    nextStep();
    assertThat(gateway.endpoints()).containsExactly(BORIS_PHONE);

    gateway.reset();
    PushSubscriptionsTest.switchNotifications(anna, true);
    nextStep();
    assertThat(gateway.pushes()).isEmpty();
  }

  @Test
  void aChildInTheFamilyGetsNothingOnlyMembersDo() throws Exception {
    SyncRequests.push(
            anna,
            SyncRequests.upsert(
                "child", UUID.randomUUID(), "{\"name\":\"Маша\",\"color\":\"coral\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));
    announce("Новое", "Только взрослым", "/");

    nextStep();

    assertThat(gateway.endpoints()).containsExactlyInAnyOrder(ANNA_PHONE, BORIS_PHONE);
  }

  @Test
  void muteHasNoEffect() throws Exception {
    UUID home = UUID.randomUUID();
    pushApplied(anna, ListOperations.list(home, "Дом", "TODO", "SHARED"));
    pushApplied(boris, ListOperations.mute(UUID.randomUUID(), home));
    announce("Новое", "Всем", "/");

    nextStep();

    assertThat(gateway.endpoints()).containsExactlyInAnyOrder(ANNA_PHONE, BORIS_PHONE);
  }

  @Test
  void aFreshDatabasesFirstStepSendsNothingAndLaterStepsNeverSendThoseEntries() {
    FreshInstallation.neverRanTheSchedulerStep(jdbc);
    announce("Старое", "Из прошлого релиза", "/");

    nextStep();
    assertThat(gateway.pushes()).isEmpty();

    nextStep();
    assertThat(gateway.pushes()).isEmpty();

    // An entry added later, by the next release, is sent.
    announce("Новое", "Из этого релиза", "/");
    nextStep();
    assertThat(gateway.pushes())
        .extracting(sent -> sent.payloadJson().get("title").asText())
        .containsExactly("Новое", "Новое");
  }

  @Test
  void anEntryIsNotSentAgainAfterARestartOrARollbackAndRedeploy() {
    announce("Новое", "Один раз", "/");
    nextStep();
    assertThat(gateway.pushes()).hasSize(2);

    // The app stops and starts again on the same database, with the same catalog: a restart, or a
    // rollback to the previous image followed by a redeploy of this one.
    try (ConfigurableApplicationContext restarted =
        HttpDevice.startApp(
            postgres, FakePushGateway.Config.class, TestClock.Config.class, Catalog.class)) {
      restarted.getBean(TestClock.class).set(clock.instant().plus(Duration.ofMinutes(1)));
      restarted.getBean(SchedulerStep.class).run();

      assertThat(restarted.getBean(FakePushGateway.class).pushes()).isEmpty();
    }
  }

  @Test
  void pushesGoOutNotificationsThenRemindersThenAnnouncementsInCatalogOrder() throws Exception {
    aNotificationAndAReminderDueOnTheNextStep();
    announce("Первое", "Первое", "/");
    announce("Второе", "Второе", "/");

    nextStep();

    assertThat(gateway.pushes())
        .extracting(AnnouncementsTest::typeOrAnnouncementTitle)
        .containsExactly(
            "notification",
            "notification",
            "reminder",
            "reminder",
            "Первое",
            "Первое",
            "Второе",
            "Второе");
  }

  @Test
  void anAnnouncementKeepsAWeekAtNormalUrgencyWhileNotificationsAndRemindersKeepADay()
      throws Exception {
    aNotificationAndAReminderDueOnTheNextStep();
    announce("Новое", "Неделю", "/");

    nextStep();

    assertThat(gateway.pushes())
        .extracting(sent -> typeOrAnnouncementTitle(sent) + " " + sent.ttl() + " " + sent.urgency())
        .containsExactly(
            "notification PT24H NORMAL",
            "notification PT24H NORMAL",
            "reminder PT24H HIGH",
            "reminder PT24H HIGH",
            "Новое PT168H NORMAL",
            "Новое PT168H NORMAL");
  }

  // --- helpers ---

  /** The payload's type, or an Announcement's title. */
  static String typeOrAnnouncementTitle(FakePushGateway.Push sent) {
    String type = sent.payloadJson().get("type").asText();
    return type.equals("announcement") ? sent.payloadJson().get("title").asText() : type;
  }

  /**
   * Each Member adds an Item to a Shared list now (a Notification for the other), Anna's due at the
   * next step's minute (a Reminder for both); the next step is late enough for the Batches.
   */
  void aNotificationAndAReminderDueOnTheNextStep() throws Exception {
    UUID home = UUID.randomUUID();
    LocalDateTime due =
        LocalDateTime.ofInstant(clock.instant().plus(STEP), clock.getZone())
            .truncatedTo(ChronoUnit.MINUTES);
    pushApplied(anna, ListOperations.list(home, "Дом", "TODO", "SHARED"));
    pushApplied(
        anna,
        SyncRequests.upsert(
            "item",
            UUID.randomUUID(),
            RemindersTest.dueFields(
                home,
                "Починить кран",
                due.toLocalDate(),
                due.toLocalTime().format(DateTimeFormatter.ofPattern("HH:mm")))));
    pushApplied(boris, ListOperations.add(UUID.randomUUID(), home, "Купить лампочку"));
  }

  /** Adds an entry with a new id at the end of the catalog, as the operator would. */
  static Announcement announce(String title, String body, String url) {
    Announcement entry = new Announcement(UUID.randomUUID().toString(), title, body, url);
    Catalog.ENTRIES.add(entry);
    return entry;
  }

  /** Moves the clock on by {@link #STEP} and runs the step. */
  void nextStep() {
    clock.set(clock.instant().plus(STEP));
    step.run();
  }

  /**
   * The catalog the tests write to, in place of {@code announcements.json}. Static, so an app
   * started again on the same database (a restart) reads the same entries.
   */
  @TestConfiguration(proxyBeanMethods = false)
  static class Catalog {

    static final List<Announcement> ENTRIES = new CopyOnWriteArrayList<>();

    @Bean
    @Primary
    AnnouncementCatalog testAnnouncementCatalog() {
      return () -> List.copyOf(ENTRIES);
    }
  }
}

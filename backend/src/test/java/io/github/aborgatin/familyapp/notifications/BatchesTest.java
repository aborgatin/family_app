package io.github.aborgatin.familyapp.notifications;

import static io.github.aborgatin.familyapp.ListOperations.add;
import static io.github.aborgatin.familyapp.ListOperations.list;
import static io.github.aborgatin.familyapp.SyncRequests.push;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FakePushGateway;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.SyncRequests;
import io.github.aborgatin.familyapp.TestClock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Notifications (spec #104 "Pending Batches", "Sending a Batch"; ticket #109): a Member's changes
 * to a List are gathered into one Batch, sent by the scheduler step once they paused for 2 minutes
 * or 10 minutes after the first one, to every other Member who sees the List. Members act through
 * the sync push; pushes are observed on the fake gateway.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({PostgresTestcontainer.class, TestClock.Config.class, FakePushGateway.Config.class})
class BatchesTest {

  static final String ANNA_PHONE = "https://web.push.apple.com/anna-phone";
  static final String BORIS_PHONE = "https://web.push.apple.com/boris-phone";

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired FakePushGateway gateway;
  @Autowired TestClock clock;
  @Autowired SchedulerStep step;

  Browser anna;
  Browser boris;
  final UUID home = UUID.randomUUID();

  @BeforeEach
  void annaAndBorisShareATodoList() throws Exception {
    FreshInstallation.reset(jdbc);
    gateway.reset();
    clock.set(Instant.now());
    anna = SyncRequests.bootstrapAnna(mvc);
    boris = SyncRequests.loginBoris(mvc, jdbc);
    for (Browser device : new Browser[] {anna, boris}) {
      PushSubscriptionsTest.switchNotifications(device, true);
    }
    PushSubscriptionsTest.subscribe(anna, ANNA_PHONE).andExpect(status().isNoContent());
    PushSubscriptionsTest.subscribe(boris, BORIS_PHONE).andExpect(status().isNoContent());
    push(anna, list(home, "Дом", "TODO", "SHARED")).andExpect(status().isOk());
    step.run(); // nothing is pending yet
  }

  @Test
  void anItemAddedByTheOtherMemberIsSentOnceTheyPausedForTwoMinutes() throws Exception {
    push(boris, add(UUID.randomUUID(), home, "Починить кран")).andExpect(status().isOk());

    later(Duration.ofSeconds(119));
    assertThat(gateway.pushes()).isEmpty();

    later(Duration.ofSeconds(1));
    assertThat(gateway.pushes()).hasSize(1);
    FakePushGateway.Push sent = gateway.pushes().get(0);
    assertThat(sent.endpoint()).isEqualTo(ANNA_PHONE);
    assertThat(json(sent.payload()))
        .isEqualTo(
            json(
                """
            {"type":"notification","actorName":"Борис","actorGrammaticalGender":"MASCULINE",\
            "listName":"Дом","listKind":"TODO","itemNames":["Починить кран"],"addedCount":1,\
            "assignedCount":0,"assignedItemName":null,"url":"/lists/%s"}"""
                    .formatted(home)));
    assertThat(sent.ttl()).isEqualTo(Duration.ofHours(24));
    assertThat(sent.urgency()).isEqualTo(Urgency.NORMAL);

    later(Duration.ofMinutes(5));
    assertThat(gateway.pushes()).hasSize(1);
  }

  // --- helpers ---

  static JsonNode json(String text) throws Exception {
    return new ObjectMapper().readTree(text);
  }

  /** Moves the clock on and runs the scheduler step, as the schedule would. */
  void later(Duration duration) {
    clock.set(clock.instant().plus(duration));
    step.run();
  }
}

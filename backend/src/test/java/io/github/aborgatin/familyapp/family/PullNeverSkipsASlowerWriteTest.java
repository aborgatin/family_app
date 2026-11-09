package io.github.aborgatin.familyapp.family;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.function.BooleanSupplier;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The out-of-order pitfall of {@code docs/architecture/sync.md} (spec #3 "Ordering Versions"): a
 * pull must never skip a row written by a slower concurrent transaction, even when a faster one
 * took a higher Version and could commit first.
 *
 * <p>Anna's push creates Петя (taking a Version) and then waits, in the middle of its transaction,
 * on a row lock this test holds on Маша. Meanwhile Boris pushes Соня. A third device pulls, then
 * the test lets Anna's push finish, and the device pulls again from the high-water Version it got.
 * Between the two pulls it must have seen every Child.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class PullNeverSkipsASlowerWriteTest {

  private static final Duration PATIENCE = Duration.ofSeconds(10);

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired DataSource dataSource;

  Browser anna;
  Browser boris;
  Browser annasTablet;

  @BeforeEach
  void threeDevices() throws Exception {
    FreshInstallation.reset(jdbc);
    anna = Sync.bootstrapAnna(mvc);
    boris = Sync.loginBoris(mvc, jdbc);
    annasTablet = new Browser(mvc);
    annasTablet.openApp();
    annasTablet
        .postJson("/api/auth/login", LoginTest.login("anna@example.com", "secret123"))
        .andExpect(status().isOk());
  }

  @Test
  void aPullNeverSkipsARowFromASlowerConcurrentWrite() throws Exception {
    UUID masha = UUID.randomUUID();
    UUID petya = UUID.randomUUID();
    UUID sonya = UUID.randomUUID();
    Sync.push(anna, Sync.upsert("child", masha, "{\"name\":\"Маша\",\"color\":\"coral\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));
    long start = Sync.version(Sync.pull(annasTablet, 0));

    CompletableFuture<Void> slow;
    CompletableFuture<Void> fast;
    long firstHighWater;
    Set<String> seen = new HashSet<>();
    try (Connection blocker = dataSource.getConnection()) {
      // Fixture: hold Маша's row so that Anna's push stops after it has written Петя.
      blocker.setAutoCommit(false);
      try (PreparedStatement lockMasha =
          blocker.prepareStatement("SELECT id FROM child WHERE id = ? FOR UPDATE")) {
        lockMasha.setObject(1, masha);
        lockMasha.executeQuery().close();
      }

      slow =
          CompletableFuture.runAsync(
              () ->
                  push(
                      anna,
                      Sync.upsert("child", petya, "{\"name\":\"Петя\",\"color\":\"blue\"}"),
                      Sync.upsert("child", masha, "{\"name\":\"Мария\"}")));
      waitUntil(() -> transactionsWaitingOnALock() == 1);

      fast =
          CompletableFuture.runAsync(
              () ->
                  push(
                      boris,
                      Sync.upsert("child", sonya, "{\"name\":\"Соня\",\"color\":\"pink\"}")));
      // Boris's push either finishes at once (nothing orders it after Anna's) or waits too.
      waitUntil(() -> fast.isDone() || transactionsWaitingOnALock() == 2);

      String first = Sync.pull(annasTablet, start).andReturn().getResponse().getContentAsString();
      seen.addAll(JsonPath.<List<String>>read(first, "$.changes[*].id"));
      firstHighWater = JsonPath.<Number>read(first, "$.version").longValue();

      blocker.rollback();
    }
    slow.get();
    fast.get();

    String second =
        Sync.pull(annasTablet, firstHighWater).andReturn().getResponse().getContentAsString();
    seen.addAll(JsonPath.<List<String>>read(second, "$.changes[*].id"));

    assertThat(seen).contains(masha.toString(), petya.toString(), sonya.toString());
  }

  private static void push(Browser device, String... operations) {
    try {
      Sync.push(device, operations).andExpect(status().isOk());
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  private int transactionsWaitingOnALock() {
    Integer waiting =
        jdbc.queryForObject(
            """
            SELECT count(*) FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
            """,
            Integer.class);
    return waiting == null ? 0 : waiting;
  }

  private static void waitUntil(BooleanSupplier condition) throws InterruptedException {
    Instant deadline = Instant.now().plus(PATIENCE);
    while (!condition.getAsBoolean()) {
      if (Instant.now().isAfter(deadline)) {
        throw new AssertionError("timed out waiting for the concurrent pushes");
      }
      Thread.sleep(20);
    }
  }
}

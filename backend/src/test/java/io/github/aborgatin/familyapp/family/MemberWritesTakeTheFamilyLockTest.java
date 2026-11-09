package io.github.aborgatin.familyapp.family;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.aborgatin.familyapp.PostgresTestcontainer;
import java.sql.Connection;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Every write to a syncable table takes {@code FamilyLock} first (spec #3 "Ordering Versions"), so
 * Versions commit in Version order. The Member writes outside the push are checked here: while the
 * test holds the Family row, each of them waits, and goes through once it is released. (The push,
 * registration and Invite acceptance are covered by {@code PullNeverSkipsASlowerWriteTest}, {@code
 * BootstrapTest} and {@code InviteAcceptanceTest}.)
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class MemberWritesTakeTheFamilyLockTest {

  private static final Duration PATIENCE = Duration.ofSeconds(10);

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired DataSource dataSource;
  @Autowired PasswordResets passwordResets;

  Browser anna;

  @BeforeEach
  void annaIsLoggedIn() throws Exception {
    FreshInstallation.reset(jdbc);
    anna = Sync.bootstrapAnna(mvc);
  }

  @Test
  void aProfileChangeWaitsForTheFamilyLock() throws Exception {
    waitsForTheFamilyLock(() -> anna.patchJson("/api/members/me", "{\"displayName\":\"Аня\"}"))
        .andExpect(status().isOk());
  }

  @Test
  void aPasswordChangeWaitsForTheFamilyLock() throws Exception {
    waitsForTheFamilyLock(
            () ->
                anna.postJson(
                    "/api/members/me/password",
                    "{\"currentPassword\":\"secret123\",\"newPassword\":\"new-secret-456\"}"))
        .andExpect(status().isNoContent());
  }

  @Test
  void aPasswordResetWaitsForTheFamilyLock() throws Exception {
    String url = passwordResets.createForEmail("anna@example.com").orElseThrow().url();
    String token = url.substring(url.lastIndexOf('/') + 1);
    Browser phone = new Browser(mvc);
    phone.openApp();

    waitsForTheFamilyLock(
            () ->
                phone.postJson(
                    "/api/password-resets/by-token/" + token + "/complete",
                    "{\"newPassword\":\"brand-new-secret\"}"))
        .andExpect(status().isOk());
  }

  /** Runs the write while this test holds the Family row; it must wait until that is released. */
  private ResultActions waitsForTheFamilyLock(Callable<ResultActions> write) throws Exception {
    CompletableFuture<ResultActions> running;
    try (Connection holder = dataSource.getConnection()) {
      holder.setAutoCommit(false);
      holder.createStatement().executeQuery("SELECT id FROM family FOR UPDATE").close();

      running =
          CompletableFuture.supplyAsync(
              () -> {
                try {
                  return write.call();
                } catch (Exception e) {
                  throw new IllegalStateException(e);
                }
              });
      Instant deadline = Instant.now().plus(PATIENCE);
      while (!running.isDone() && waitingOnALock() == 0 && Instant.now().isBefore(deadline)) {
        Thread.sleep(20);
      }
      assertThat(running).as("the write went ahead without the Family lock").isNotDone();
      holder.rollback();
    }
    return running.get();
  }

  private int waitingOnALock() {
    Integer waiting =
        jdbc.queryForObject(
            """
            SELECT count(*) FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
            """,
            Integer.class);
    return waiting == null ? 0 : waiting;
  }
}

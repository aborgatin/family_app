package io.github.aborgatin.familyapp;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

/** The test helper's own contract: one zone, and every view of it follows {@code set}. */
class TestClockTest {

  private final TestClock clock = new TestClock.Config().testClock();

  @Test
  void runsInTheInstallationsZone() {
    assertThat(clock.getZone()).isEqualTo(ZoneId.systemDefault());
  }

  @Test
  void setTodayIsTodayInItsOwnZone() {
    LocalDate day = LocalDate.of(2026, 3, 10);
    clock.setToday(day);
    assertThat(LocalDate.now(clock)).isEqualTo(day);
  }

  @Test
  void aClockInAnotherZoneFollowsLaterSets() {
    Clock utc = clock.withZone(ZoneOffset.UTC);
    Instant later = Instant.parse("2030-06-01T08:00:00Z");
    clock.set(later);
    assertThat(utc.instant()).isEqualTo(later);
    assertThat(utc.getZone()).isEqualTo(ZoneOffset.UTC);
  }
}

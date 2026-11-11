package io.github.aborgatin.familyapp;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * A clock a test sets, in place of the app's one {@code Clock} bean ({@code TimeConfig}): every
 * service reads time from it. Import {@link Config} and autowire the {@code TestClock}:
 *
 * <pre>{@code
 * @Import({PostgresTestcontainer.class, TestClock.Config.class})
 * class SomeTest {
 *   @Autowired TestClock clock;
 *   ... clock.setToday(LocalDate.of(2026, 3, 10)); // noon of that day in the JVM's zone
 * }
 * }</pre>
 *
 * <p>The test context is cached apart from the ones without it. Sessions and the database keep
 * their own clocks.
 */
public final class TestClock extends Clock {

  private volatile Instant now;

  private TestClock(Instant now) {
    this.now = now;
  }

  /** Moves the clock to this instant. */
  public void set(Instant instant) {
    now = instant;
  }

  /**
   * Moves the clock to noon of this day in the JVM's zone (the installation's time zone), far from
   * either midnight, and returns the day.
   */
  public LocalDate setToday(LocalDate day) {
    now = day.atTime(LocalTime.NOON).atZone(ZoneId.systemDefault()).toInstant();
    return day;
  }

  @Override
  public Instant instant() {
    return now;
  }

  @Override
  public ZoneId getZone() {
    return ZoneOffset.UTC;
  }

  @Override
  public Clock withZone(ZoneId zone) {
    return Clock.fixed(now, zone);
  }

  /** Puts a {@code TestClock} in the context, in place of the app's {@code Clock}. */
  @TestConfiguration(proxyBeanMethods = false)
  public static class Config {

    @Bean
    @Primary
    TestClock testClock() {
      return new TestClock(Instant.parse("2026-01-01T12:00:00Z"));
    }
  }
}

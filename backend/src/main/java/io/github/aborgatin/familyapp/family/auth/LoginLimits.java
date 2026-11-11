package io.github.aborgatin.familyapp.family.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Failed logins counted in memory per email and per client IP over a sliding window (spec #5,
 * Brute-force protection). In memory is enough: there is exactly one app instance (ADR-0004), and
 * counters starting over after a restart is acceptable.
 *
 * <p>Settings: {@code LOGIN_LIMIT_PER_EMAIL} (default 10), {@code LOGIN_LIMIT_PER_IP} (20) and
 * {@code LOGIN_LIMIT_WINDOW} (15m).
 */
@Component
class LoginLimits {

  private final Clock clock;
  private final Duration window;
  private final SlidingWindow byEmail;
  private final SlidingWindow byIp;

  LoginLimits(
      @Value("${LOGIN_LIMIT_PER_EMAIL:10}") int perEmail,
      @Value("${LOGIN_LIMIT_PER_IP:20}") int perIp,
      @Value("${LOGIN_LIMIT_WINDOW:15m}") Duration window,
      Clock clock) {
    this.clock = clock;
    this.window = window;
    this.byEmail = new SlidingWindow(perEmail);
    this.byIp = new SlidingWindow(perIp);
  }

  /**
   * How long until a login for this email from this IP may be tried again, or empty if it may be
   * tried now.
   */
  Optional<Duration> retryAfter(String email, String ip) {
    Instant now = clock.instant();
    return Stream.of(byEmail.retryAfter(email, now), byIp.retryAfter(ip, now))
        .flatMap(Optional::stream)
        .max(Comparator.naturalOrder());
  }

  void failed(String email, String ip) {
    Instant now = clock.instant();
    byEmail.add(email, now);
    byIp.add(ip, now);
  }

  /** A successful login forgives the email's earlier failures; the IP's still count. */
  void succeeded(String email) {
    byEmail.clear(email);
  }

  /** Failure times per key, oldest first, keeping only those inside the window. */
  private final class SlidingWindow {

    /** Above this many keys, a write first drops the keys whose failures have all expired. */
    private static final int SWEEP_ABOVE = 10_000;

    private final int limit;
    private final Map<String, Deque<Instant>> failures = new HashMap<>();

    SlidingWindow(int limit) {
      this.limit = limit;
    }

    synchronized Optional<Duration> retryAfter(String key, Instant now) {
      Deque<Instant> times = failures.get(key);
      if (times == null) {
        return Optional.empty();
      }
      expire(times, now);
      if (times.size() < limit) {
        return Optional.empty();
      }
      // Allowed again once enough failures have left the window to get below the limit.
      Iterator<Instant> oldestFirst = times.iterator();
      Instant blocking = oldestFirst.next();
      for (int i = 0; i < times.size() - limit; i++) {
        blocking = oldestFirst.next();
      }
      return Optional.of(Duration.between(now, blocking.plus(window)));
    }

    synchronized void add(String key, Instant now) {
      if (failures.size() > SWEEP_ABOVE) {
        failures.values().removeIf(times -> expire(times, now).isEmpty());
      }
      Deque<Instant> times = failures.computeIfAbsent(key, k -> new ArrayDeque<>());
      expire(times, now);
      times.addLast(now);
    }

    synchronized void clear(String key) {
      failures.remove(key);
    }

    private Deque<Instant> expire(Deque<Instant> times, Instant now) {
      Instant cutoff = now.minus(window);
      while (!times.isEmpty() && !times.peekFirst().isAfter(cutoff)) {
        times.removeFirst();
      }
      return times;
    }
  }
}

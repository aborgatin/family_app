package io.github.aborgatin.familyapp;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.aborgatin.familyapp.notifications.PushGateway;
import io.github.aborgatin.familyapp.notifications.PushResult;
import io.github.aborgatin.familyapp.notifications.PushSubscription;
import io.github.aborgatin.familyapp.notifications.Urgency;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * The push gateway tests use in place of the real one (spec #104, Testing): it sends nothing,
 * records every push and answers {@code DELIVERED}, or what a test told it to answer for a
 * subscription, or throws once when told to; it can also be slow ({@link #holdSends()}), as a push
 * service can be, and a test can wait for a push sent off the request's thread ({@link
 * #awaitPush}). Import {@link Config} and autowire the {@code FakePushGateway}; call {@link
 * #reset()} in {@code @BeforeEach}, as the context (and this fake) is shared by the test classes
 * that import it.
 */
public final class FakePushGateway implements PushGateway {

  /** One push as the gateway received it. */
  public record Push(PushSubscription subscription, String payload, Duration ttl, Urgency urgency) {

    public String endpoint() {
      return subscription.endpoint();
    }

    /** The payload, parsed. */
    public JsonNode payloadJson() {
      return json(payload);
    }
  }

  /** Parses JSON, as a test compares a payload or a part of one. */
  public static JsonNode json(String text) {
    try {
      return new ObjectMapper().readTree(text);
    } catch (JsonProcessingException e) {
      throw new IllegalArgumentException("Not JSON: " + text, e);
    }
  }

  /** How long a held send waits for {@link #releaseSends()}, and {@link #awaitPush} for a push. */
  public static final Duration PATIENCE = Duration.ofSeconds(10);

  private final List<Push> pushes = new ArrayList<>();
  private final Map<String, PushResult> answers = new ConcurrentHashMap<>();
  private boolean throwNext;
  private volatile CountDownLatch held = new CountDownLatch(0);

  @Override
  public PushResult send(
      PushSubscription subscription, String payload, Duration ttl, Urgency urgency) {
    waitWhileHeld();
    synchronized (this) {
      if (throwNext) {
        throwNext = false;
        throw new IllegalStateException("The fake push gateway was told to throw");
      }
      pushes.add(new Push(subscription, payload, ttl, urgency));
      return answers.getOrDefault(subscription.endpoint(), PushResult.DELIVERED);
    }
  }

  private void waitWhileHeld() {
    try {
      boolean released = held.await(PATIENCE.toMillis(), TimeUnit.MILLISECONDS);
      if (!released) {
        held = new CountDownLatch(0);
      }
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  /**
   * From now on every send waits, as on a slow push service, until {@link #releaseSends()} (or
   * {@link #PATIENCE} has passed); {@link #reset()} releases them too.
   */
  public void holdSends() {
    held = new CountDownLatch(1);
  }

  /** Lets the held sends go on, and the later ones go at once. */
  public void releaseSends() {
    held.countDown();
  }

  /**
   * Waits up to {@link #PATIENCE} for a push that matches, sent from any thread, and returns it.
   */
  public Push awaitPush(Predicate<Push> which) throws InterruptedException {
    Instant deadline = Instant.now().plus(PATIENCE);
    while (Instant.now().isBefore(deadline)) {
      for (Push push : pushes()) {
        if (which.test(push)) {
          return push;
        }
      }
      Thread.sleep(20);
    }
    throw new AssertionError("No such push within " + PATIENCE + "; sent: " + pushes());
  }

  /** From now on, pushes to this endpoint get this answer ({@code GONE}, {@code FAILED}). */
  public void answer(String endpoint, PushResult result) {
    answers.put(endpoint, result);
  }

  /**
   * The next push throws instead of being sent (and is not recorded), as a database call on the way
   * out could: the push after it goes through again.
   */
  public synchronized void throwOnNextSend() {
    throwNext = true;
  }

  /** Every push received since the last {@link #reset()}, in order. */
  public synchronized List<Push> pushes() {
    return List.copyOf(pushes);
  }

  /** The endpoints of {@link #pushes()}, in order. */
  public List<String> endpoints() {
    return pushes().stream().map(Push::endpoint).toList();
  }

  /** Forgets the pushes and the answers, and releases held sends. */
  public synchronized void reset() {
    releaseSends();
    pushes.clear();
    answers.clear();
    throwNext = false;
  }

  /** Puts a {@code FakePushGateway} in the context, in place of the real gateway. */
  @TestConfiguration(proxyBeanMethods = false)
  public static class Config {

    @Bean
    @Primary
    FakePushGateway fakePushGateway() {
      return new FakePushGateway();
    }
  }
}

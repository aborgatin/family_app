package io.github.aborgatin.familyapp;

import io.github.aborgatin.familyapp.notifications.PushGateway;
import io.github.aborgatin.familyapp.notifications.PushResult;
import io.github.aborgatin.familyapp.notifications.PushSubscription;
import io.github.aborgatin.familyapp.notifications.Urgency;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * The push gateway tests use in place of the real one (spec #104, Testing): it sends nothing,
 * records every push and answers {@code DELIVERED}, or what a test told it to answer for a
 * subscription. Import {@link Config} and autowire the {@code FakePushGateway}; call {@link
 * #reset()} in {@code @BeforeEach}, as the context (and this fake) is shared by the test classes
 * that import it.
 */
public final class FakePushGateway implements PushGateway {

  /** One push as the gateway received it. */
  public record Push(PushSubscription subscription, String payload, Duration ttl, Urgency urgency) {

    public String endpoint() {
      return subscription.endpoint();
    }
  }

  private final List<Push> pushes = new ArrayList<>();
  private final Map<String, PushResult> answers = new ConcurrentHashMap<>();

  @Override
  public synchronized PushResult send(
      PushSubscription subscription, String payload, Duration ttl, Urgency urgency) {
    pushes.add(new Push(subscription, payload, ttl, urgency));
    return answers.getOrDefault(subscription.endpoint(), PushResult.DELIVERED);
  }

  /** From now on, pushes to this endpoint get this answer ({@code GONE}, {@code FAILED}). */
  public void answer(String endpoint, PushResult result) {
    answers.put(endpoint, result);
  }

  /** Every push received since the last {@link #reset()}, in order. */
  public synchronized List<Push> pushes() {
    return List.copyOf(pushes);
  }

  /** The endpoints of {@link #pushes()}, in order. */
  public List<String> endpoints() {
    return pushes().stream().map(Push::endpoint).toList();
  }

  /** Forgets the pushes and the answers. */
  public synchronized void reset() {
    pushes.clear();
    answers.clear();
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

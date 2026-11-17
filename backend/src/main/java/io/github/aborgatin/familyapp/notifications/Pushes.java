package io.github.aborgatin.familyapp.notifications;

import io.github.aborgatin.familyapp.family.Members;
import io.github.aborgatin.familyapp.notifications.push.PushSubscriptions;
import java.time.Duration;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Sends push messages to a Member's devices (spec #104): every subscription the Member registered
 * from a session that is still alive, and only while their Notifications switch is on (turning it
 * off keeps the subscriptions). Callers decide who gets what; this is the one way out.
 */
@Service
public class Pushes {

  private static final Logger log = LoggerFactory.getLogger(Pushes.class);

  private final Members members;
  private final PushSubscriptions subscriptions;
  private final PushGateway gateway;

  Pushes(Members members, PushSubscriptions subscriptions, PushGateway gateway) {
    this.members = members;
    this.subscriptions = subscriptions;
    this.gateway = gateway;
  }

  /**
   * Sends the payload to each of the Member's devices, one push per device, outside any
   * transaction. A {@code GONE} subscription is deleted; a {@code FAILED} push is logged and not
   * retried.
   */
  public void sendTo(UUID memberId, String payload, Duration ttl, Urgency urgency) {
    if (!members.notificationsEnabled(memberId)) {
      return;
    }
    for (PushSubscription subscription : subscriptions.ofMember(memberId)) {
      PushResult result = gateway.send(subscription, payload, ttl, urgency);
      if (result == PushResult.GONE) {
        subscriptions.deleteGone(subscription.endpoint());
      } else if (result == PushResult.FAILED) {
        log.warn("A push to Member {} failed; it is not retried", memberId);
      }
    }
  }

  /**
   * Sends a message as {@link #sendTo} does. A failure on the way (a database call that throws) is
   * logged and not retried, and costs only this message: the caller goes on with its next one.
   */
  public void send(PushMessage message) {
    try {
      sendTo(message.recipientId(), message.payload(), message.ttl(), message.urgency());
    } catch (RuntimeException e) {
      log.warn("A push to Member {} failed; it is not retried", message.recipientId(), e);
    }
  }
}

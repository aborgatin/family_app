package io.github.aborgatin.familyapp.notifications.push;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.family.Members;
import io.github.aborgatin.familyapp.family.Sessions;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * This device's push subscription (spec #104, "Subscriptions"). Online-only, like the profile: the
 * app calls these directly. Every endpoint needs a session.
 */
@RestController
@ConditionalOnWebApplication
@RequestMapping("/api/push")
class PushController {

  private final Members members;
  private final Sessions sessions;
  private final PushSubscriptions subscriptions;
  private final String vapidPublicKey;

  PushController(
      Members members,
      Sessions sessions,
      PushSubscriptions subscriptions,
      NotificationsProperties properties) {
    this.members = members;
    this.sessions = sessions;
    this.subscriptions = subscriptions;
    this.vapidPublicKey = properties.vapid().publicKey();
  }

  /** The application server key the browser subscribes with. */
  @GetMapping("/vapid-public-key")
  VapidPublicKey vapidPublicKey() {
    return new VapidPublicKey(vapidPublicKey);
  }

  /**
   * Registers this device's subscription for the logged-in Member and this session. Idempotent; an
   * endpoint registered by the other Member moves to this one.
   */
  @PostMapping("/subscriptions")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void subscribe(@RequestBody SubscriptionRequest body, HttpServletRequest request) {
    var subscription = body.validate();
    UUID memberId = members.current().id();
    HttpSession session = request.getSession(false);
    String sessionKey = session == null ? null : sessions.keyOf(session.getId()).orElse(null);
    if (sessionKey == null || !subscriptions.upsert(subscription, memberId, sessionKey)) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "auth.required");
    }
  }

  /** Forgets the caller's own subscription with this endpoint; an unknown one is a no-op. */
  @DeleteMapping("/subscriptions")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void unsubscribe(@RequestBody SubscriptionRequest body) {
    String endpoint = body.validateEndpoint();
    subscriptions.delete(endpoint, members.current().id());
  }

  record VapidPublicKey(String publicKey) {}
}

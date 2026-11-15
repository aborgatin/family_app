package io.github.aborgatin.familyapp.notifications.push;

import io.github.aborgatin.familyapp.notifications.PushGateway;
import io.github.aborgatin.familyapp.notifications.PushResult;
import io.github.aborgatin.familyapp.notifications.PushSubscription;
import io.github.aborgatin.familyapp.notifications.Urgency;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.GeneralSecurityException;
import java.security.Security;
import java.time.Duration;
import nl.martijndwars.webpush.AbstractPushService;
import nl.martijndwars.webpush.Encoding;
import nl.martijndwars.webpush.Notification;
import org.bouncycastle.jce.interfaces.ECPrivateKey;
import org.bouncycastle.jce.interfaces.ECPublicKey;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.math.ec.ECPoint;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.lang.Nullable;

/**
 * The real {@link PushGateway}: Web Push with VAPID. {@code nl.martijndwars:web-push} builds the
 * request (the VAPID {@code Authorization} header and the payload encrypted as {@code aes128gcm},
 * the encoding Safari on iOS accepts); the JDK's {@link HttpClient} sends it, with timeouts. 404
 * and 410 from the push service are {@code GONE}; another non-2xx answer, a timeout or an error is
 * {@code FAILED}.
 */
final class WebPushGateway implements PushGateway {

  private static final Logger log = LoggerFactory.getLogger(WebPushGateway.class);
  private static final Duration TIMEOUT = Duration.ofSeconds(30);

  private final RequestBuilder requests;
  private final HttpClient http =
      HttpClient.newBuilder()
          .connectTimeout(TIMEOUT)
          .followRedirects(HttpClient.Redirect.NEVER)
          .build();

  /**
   * Fails when the keys cannot be read or are not one pair, so a bad configuration stops the app at
   * startup instead of every push being refused.
   */
  WebPushGateway(NotificationsProperties.Vapid vapid) {
    if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
      Security.addProvider(new BouncyCastleProvider());
    }
    RequestBuilder built;
    try {
      built = new RequestBuilder(vapid);
    } catch (GeneralSecurityException | RuntimeException e) {
      throw notAKeyPair(e);
    }
    if (!built.isOneKeyPair()) {
      throw notAKeyPair(null);
    }
    requests = built;
  }

  private static IllegalArgumentException notAKeyPair(@Nullable Exception cause) {
    return new IllegalArgumentException(
        "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be a P-256 key pair in base64url."
            + NotificationsProperties.HOW_TO_GENERATE,
        cause);
  }

  @Override
  public PushResult send(
      PushSubscription subscription, String payload, Duration ttl, Urgency urgency) {
    try {
      Notification notification =
          Notification.builder()
              .endpoint(subscription.endpoint())
              .userPublicKey(subscription.p256dh())
              .userAuth(subscription.auth())
              .payload(payload)
              .ttl((int) ttl.toSeconds())
              .urgency(
                  urgency == Urgency.HIGH
                      ? nl.martijndwars.webpush.Urgency.HIGH
                      : nl.martijndwars.webpush.Urgency.NORMAL)
              .build();
      nl.martijndwars.webpush.HttpRequest prepared = requests.prepare(notification);
      HttpRequest.Builder request =
          HttpRequest.newBuilder(URI.create(prepared.getUrl()))
              .timeout(TIMEOUT)
              .POST(HttpRequest.BodyPublishers.ofByteArray(prepared.getBody()));
      prepared.getHeaders().forEach(request::header);
      int status = http.send(request.build(), HttpResponse.BodyHandlers.discarding()).statusCode();
      if (status == 404 || status == 410) {
        return PushResult.GONE;
      }
      if (status >= 200 && status < 300) {
        return PushResult.DELIVERED;
      }
      log.warn("Push to {} failed: HTTP {}", host(subscription), status);
      return PushResult.FAILED;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      log.warn("Push to {} interrupted", host(subscription));
      return PushResult.FAILED;
    } catch (Exception e) {
      log.warn("Push to {} failed", host(subscription), e);
      return PushResult.FAILED;
    }
  }

  /** The push service's host only: the endpoint's path identifies the device. */
  private static String host(PushSubscription subscription) {
    try {
      return URI.create(subscription.endpoint()).getHost();
    } catch (IllegalArgumentException e) {
      return "?";
    }
  }

  /**
   * The library's request building, which it keeps for its own HTTP clients ({@code protected}).
   */
  private static final class RequestBuilder extends AbstractPushService<RequestBuilder> {

    RequestBuilder(NotificationsProperties.Vapid vapid) throws GeneralSecurityException {
      super(vapid.publicKey(), vapid.privateKey(), vapid.subject());
    }

    /** Whether the public key is the private key's: d·G on P-256. */
    boolean isOneKeyPair() {
      ECPrivateKey privateKey = (ECPrivateKey) getPrivateKey();
      ECPublicKey publicKey = (ECPublicKey) getPublicKey();
      ECPoint derived = privateKey.getParameters().getG().multiply(privateKey.getD()).normalize();
      return derived.equals(publicKey.getQ().normalize());
    }

    nl.martijndwars.webpush.HttpRequest prepare(Notification notification) throws Exception {
      return prepareRequest(notification, Encoding.AES128GCM);
    }
  }
}

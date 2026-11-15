package io.github.aborgatin.familyapp.notifications.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpServer;
import io.github.aborgatin.familyapp.notifications.PushResult;
import io.github.aborgatin.familyapp.notifications.PushSubscription;
import io.github.aborgatin.familyapp.notifications.Urgency;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * The real push gateway (spec #104, "Push gateway") against a stand-in push service on a local
 * port: what it sends, and how the push service's answer maps to {@code DELIVERED}, {@code GONE} or
 * {@code FAILED}.
 */
class WebPushGatewayTest {

  static final String PUBLIC_KEY =
      "BP_oubxAs6sub1HkjCbUTZNvXtO_gsTH-5Wsi5uheB0zE705d6mRvAQizx205aARQazMqdr4XbRZS8cg5pPefxs";
  static final String PRIVATE_KEY = "494_2TbVXlrlwcwNylIQ7rNOe3v5onx91UaQqu1Wk4Y";
  static final String P256DH =
      "BOpIBL_-gmK6UO5_nWwbtShTId4qzCcIjN7zQH2zqrdzn35vWekEuDeE-lbSdxbiWVc_QNJuYUSKvNisAEAkdgc";
  static final String AUTH = "8eDyX_uCN0XRhSbY5hs7Hg";

  final WebPushGateway gateway =
      new WebPushGateway(
          new NotificationsProperties.Vapid(PUBLIC_KEY, PRIVATE_KEY, "mailto:ops@example.com"));
  final Map<String, Headers> received = new ConcurrentHashMap<>();
  final Map<String, Integer> bodySizes = new ConcurrentHashMap<>();
  HttpServer pushService;

  @BeforeEach
  void startPushService() throws IOException {
    pushService = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
    pushService.createContext(
        "/",
        exchange -> {
          String path = exchange.getRequestURI().getPath();
          received.put(path, exchange.getRequestHeaders());
          bodySizes.put(path, exchange.getRequestBody().readAllBytes().length);
          int status =
              switch (path) {
                case "/gone" -> 410;
                case "/missing" -> 404;
                case "/broken" -> 500;
                case "/limited" -> 429;
                default -> 201;
              };
          exchange.sendResponseHeaders(status, -1);
          exchange.close();
        });
    pushService.start();
  }

  @AfterEach
  void stopPushService() {
    pushService.stop(0);
  }

  @Test
  void anAcceptedPushIsDeliveredWithVapidTtlUrgencyAndAnEncryptedPayload() {
    PushResult result =
        gateway.send(
            subscription("/device"), "{\"type\":\"reminder\"}", Duration.ofHours(24), Urgency.HIGH);

    assertThat(result).isEqualTo(PushResult.DELIVERED);
    Headers headers = received.get("/device");
    assertThat(headers.getFirst("TTL")).isEqualTo("86400");
    assertThat(headers.getFirst("Urgency")).isEqualTo("high");
    assertThat(headers.getFirst("Content-Encoding")).isEqualTo("aes128gcm");
    assertThat(headers.getFirst("Authorization"))
        .startsWith("vapid t=")
        .endsWith(", k=" + PUBLIC_KEY);
    // aes128gcm: an 86-byte header, the payload, a padding delimiter and a 16-byte tag.
    assertThat(bodySizes.get("/device")).isGreaterThan(86 + "{\"type\":\"reminder\"}".length());
  }

  @Test
  void aNotificationGoesWithNormalUrgency() {
    gateway.send(subscription("/device"), "{}", Duration.ofHours(24), Urgency.NORMAL);

    assertThat(received.get("/device").getFirst("Urgency")).isEqualTo("normal");
  }

  @Test
  void notFoundAndGoneMeanTheSubscriptionIsGone() {
    assertThat(send("/gone")).isEqualTo(PushResult.GONE);
    assertThat(send("/missing")).isEqualTo(PushResult.GONE);
  }

  @Test
  void anyOtherFailureIsFailed() throws IOException {
    assertThat(send("/broken")).isEqualTo(PushResult.FAILED);
    assertThat(send("/limited")).isEqualTo(PushResult.FAILED);

    int closedPort;
    try (ServerSocket socket = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
      closedPort = socket.getLocalPort();
    }
    PushSubscription unreachable =
        new PushSubscription("http://127.0.0.1:" + closedPort + "/device", P256DH, AUTH);
    assertThat(gateway.send(unreachable, "{}", Duration.ofHours(24), Urgency.NORMAL))
        .isEqualTo(PushResult.FAILED);

    PushSubscription badKey = new PushSubscription(endpoint("/device"), "bm90IGEga2V5", AUTH);
    assertThat(gateway.send(badKey, "{}", Duration.ofHours(24), Urgency.NORMAL))
        .isEqualTo(PushResult.FAILED);
  }

  @Test
  void aKeyPairThatCannotBeReadStopsTheAppWithAClearMessage() {
    assertThatThrownBy(
            () ->
                new WebPushGateway(
                    new NotificationsProperties.Vapid(
                        "not-a-key", PRIVATE_KEY, "mailto:ops@example.com")))
        .hasMessageContaining("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be a P-256 key pair");
  }

  private PushResult send(String path) {
    return gateway.send(subscription(path), "{}", Duration.ofHours(24), Urgency.NORMAL);
  }

  private PushSubscription subscription(String path) {
    return new PushSubscription(endpoint(path), P256DH, AUTH);
  }

  private String endpoint(String path) {
    return "http://127.0.0.1:" + pushService.getAddress().getPort() + path;
  }
}

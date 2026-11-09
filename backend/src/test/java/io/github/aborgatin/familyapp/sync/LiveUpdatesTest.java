package io.github.aborgatin.familyapp.sync;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.HttpDevice;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import java.net.http.HttpResponse;
import java.util.Iterator;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.lang.Nullable;

/**
 * Live updates (spec #3 "Live updates: SSE", ticket #54): {@code GET /api/sync/events} on a real
 * port, read as the browser's {@code EventSource} would. The heartbeat is shortened so a test sees
 * the connection end soon after the session does.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT, properties = "sync.heartbeat=200ms")
@Import(PostgresTestcontainer.class)
class LiveUpdatesTest {

  private static final String EVENTS = "/api/sync/events";

  @Autowired ConfigurableApplicationContext app;
  @Autowired JdbcTemplate jdbc;

  private HttpDevice anna;
  private HttpDevice boris;
  private EventStream borisEvents;

  @BeforeEach
  void setUp() throws Exception {
    FreshInstallation.reset(jdbc);
    anna = new HttpDevice().at(app);
    anna.send("GET", "/api/auth/session", null);
    anna.send(
        "POST",
        "/api/auth/bootstrap",
        """
        {"email":"anna@example.com","password":"secret123","displayName":"Анна",
         "grammaticalGender":"FEMININE"}
        """);
    FreshInstallation.addMember(jdbc, "boris@example.com", "boris-pass", "Борис", "MASCULINE");
    boris = new HttpDevice().at(app);
    boris.send("GET", "/api/auth/session", null);
    boris.send(
        "POST", "/api/auth/login", "{\"email\":\"boris@example.com\",\"password\":\"boris-pass\"}");
  }

  @AfterEach
  void closeStream() {
    if (borisEvents != null) {
      borisEvents.close();
    }
  }

  @Test
  void connectingSendsTheLatestVersionOnce() throws Exception {
    long latest = version(pushChild(anna, "Маша"));

    borisEvents = EventStream.open(boris, EVENTS);

    assertThat(borisEvents.nextChanged()).isEqualTo("{\"version\":%d}".formatted(latest));
  }

  @Test
  void aPushFromAnotherDeviceSendsChangedWithItsVersionAndNoData() throws Exception {
    borisEvents = EventStream.open(boris, EVENTS);
    borisEvents.nextChanged();

    long pushed = version(pushChild(anna, "Маша"));

    assertThat(borisEvents.nextChanged()).isEqualTo("{\"version\":%d}".formatted(pushed));
  }

  @Test
  void anOnlineOnlyMemberWriteSendsChanged() throws Exception {
    long before = version(pushChild(anna, "Маша"));
    borisEvents = EventStream.open(boris, EVENTS);
    borisEvents.nextChanged();

    anna.send("PATCH", "/api/members/me", "{\"displayName\":\"Аня\"}");

    String pull = boris.send("GET", "/api/sync/pull?since=" + before, null).body();
    List<Number> memberVersions = JsonPath.read(pull, "$.changes[?(@.table=='member')].version");
    assertThat(memberVersions).hasSize(1);
    assertThat(borisEvents.nextChanged())
        .isEqualTo("{\"version\":%d}".formatted(memberVersions.get(0).longValue()));
  }

  @Test
  void aPushOfSeveralOperationsSendsChangedOnce() throws Exception {
    borisEvents = EventStream.open(boris, EVENTS);
    borisEvents.nextChanged();

    long both = version(pushChildren(anna, "Маша", "Петя"));
    long later = version(pushChild(anna, "Вера"));

    assertThat(borisEvents.nextChanged()).isEqualTo("{\"version\":%d}".formatted(both));
    assertThat(borisEvents.nextChanged()).isEqualTo("{\"version\":%d}".formatted(later));
  }

  @Test
  void aWriteThatRollsBackSendsNothing() throws Exception {
    borisEvents = EventStream.open(boris, EVENTS);
    borisEvents.nextChanged();

    // Invite acceptance takes the Family lock before it finds the token unknown and rolls back.
    HttpDevice stranger = new HttpDevice().at(app);
    stranger.send("GET", "/api/auth/session", null);
    HttpResponse<String> refused =
        stranger.send(
            "POST",
            "/api/invites/by-token/no-such-token/accept",
            """
            {"email":"vera@example.com","password":"secret123","displayName":"Вера",
             "grammaticalGender":"FEMININE"}
            """);
    assertThat(refused.statusCode()).as(refused.body()).isEqualTo(404);
    long pushed = version(pushChild(anna, "Маша"));

    assertThat(borisEvents.nextChanged()).isEqualTo("{\"version\":%d}".formatted(pushed));
  }

  @Test
  void withoutASessionTheStreamIsRefusedLikeAnyOtherApiCall() throws Exception {
    HttpResponse<String> refused = new HttpDevice().at(app).send("GET", EVENTS, null);

    assertThat(refused.statusCode()).isEqualTo(401);
    assertThat(refused.body()).contains("\"code\":\"auth.required\"");
  }

  @Test
  void heartbeatCommentsKeepAnIdleConnectionAlive() throws Exception {
    borisEvents = EventStream.open(boris, EVENTS);
    borisEvents.nextChanged();

    assertThat(borisEvents.nextComment()).isNotNull();
    assertThat(borisEvents.nextComment()).isNotNull();
  }

  @Test
  @ExtendWith(OutputCaptureExtension.class)
  void aClientThatWentAwayIsNotLoggedAsAnError(CapturedOutput output) throws Exception {
    borisEvents = EventStream.open(boris, EVENTS);
    borisEvents.nextChanged();

    borisEvents.close();
    Thread.sleep(1000); // a few heartbeats, which find the connection gone

    assertThat(output.getAll()).doesNotContain("Unhandled exception");
  }

  @Test
  void theConnectionEndsWhenTheSessionEnds() throws Exception {
    borisEvents = EventStream.open(boris, EVENTS);
    borisEvents.nextChanged();

    boris.send("POST", "/api/auth/logout", null);

    assertThat(borisEvents.endsWithinSeconds(5)).isTrue();
  }

  private static HttpResponse<String> pushChild(HttpDevice device, String name) throws Exception {
    return device.send(
        "POST",
        "/api/sync/push",
        """
        {"operations":[{"table":"child","id":"%s","op":"upsert",
          "fields":{"name":"%s","color":"blue","birthday":null}}]}
        """
            .formatted(UUID.randomUUID(), name));
  }

  private static HttpResponse<String> pushChildren(HttpDevice device, String... names)
      throws Exception {
    String operations =
        Stream.of(names)
            .map(
                name ->
                    """
                    {"table":"child","id":"%s","op":"upsert",
                     "fields":{"name":"%s","color":"blue","birthday":null}}"""
                        .formatted(UUID.randomUUID(), name))
            .collect(Collectors.joining(","));
    return device.send("POST", "/api/sync/push", "{\"operations\":[" + operations + "]}");
  }

  private static long version(HttpResponse<String> response) {
    assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
    Number version = JsonPath.read(response.body(), "$.version");
    return version.longValue();
  }

  /** The events of one open SSE connection, read on a background thread as they arrive. */
  private static final class EventStream {

    private static final String END = "\u0000end";

    private final BlockingQueue<String> received = new LinkedBlockingQueue<>();
    private final Stream<String> lines;

    private EventStream(Stream<String> lines) {
      this.lines = lines;
    }

    static EventStream open(HttpDevice device, String path) throws Exception {
      HttpResponse<Stream<String>> response = device.openLines(path);
      assertThat(response.statusCode()).isEqualTo(200);
      assertThat(response.headers().firstValue("Content-Type").orElse(""))
          .startsWith("text/event-stream");
      EventStream stream = new EventStream(response.body());
      Thread reader = new Thread(stream::read, "sse-reader");
      reader.setDaemon(true);
      reader.start();
      return stream;
    }

    /**
     * Queues {@code changed:<data>} per event, {@code comment:<text>} per comment, and END when the
     * server ends the response.
     */
    private void read() {
      String event = "message";
      StringBuilder data = new StringBuilder();
      try {
        for (Iterator<String> it = lines.iterator(); it.hasNext(); ) {
          String line = it.next();
          if (line.isEmpty()) {
            if (!data.isEmpty()) {
              received.add(event + ":" + data);
            }
            event = "message";
            data.setLength(0);
          } else if (line.startsWith(":")) {
            received.add("comment:" + line.substring(1));
          } else if (line.startsWith("event:")) {
            event = line.substring("event:".length()).trim();
          } else if (line.startsWith("data:")) {
            data.append(line.substring("data:".length()).trim());
          }
        }
      } catch (RuntimeException closed) {
        // The test closed the stream.
      }
      received.add(END);
    }

    /** The data of the next event, which must be a {@code changed} event. */
    String nextChanged() throws InterruptedException {
      String next = nextSkippingComments();
      assertThat(next).as("next event").startsWith("changed:");
      return next.substring("changed:".length());
    }

    @Nullable
    String nextComment() throws InterruptedException {
      String next = received.poll(5, TimeUnit.SECONDS);
      assertThat(next).as("next comment").isNotNull().startsWith("comment:");
      return next;
    }

    boolean endsWithinSeconds(int seconds) throws InterruptedException {
      long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(seconds);
      for (; ; ) {
        String next = received.poll(deadline - System.nanoTime(), TimeUnit.NANOSECONDS);
        if (next == null) {
          return false;
        }
        if (next.equals(END)) {
          return true;
        }
      }
    }

    private String nextSkippingComments() throws InterruptedException {
      for (; ; ) {
        String next = received.poll(5, TimeUnit.SECONDS);
        assertThat(next).as("an event within 5 s").isNotNull().isNotEqualTo(END);
        if (!next.startsWith("comment:")) {
          return next;
        }
      }
    }

    void close() {
      lines.close();
    }
  }
}

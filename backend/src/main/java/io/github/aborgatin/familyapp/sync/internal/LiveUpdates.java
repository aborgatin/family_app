package io.github.aborgatin.familyapp.sync.internal;

import io.github.aborgatin.familyapp.sync.SyncableWriteStarted;
import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * The open live-update connections (spec #3 "Live updates: SSE"). Each gets {@code changed} with
 * the latest Version when it opens and after every commit of a transaction that wrote a syncable
 * row, and a heartbeat comment at a fixed interval. A connection ends at the first heartbeat after
 * its session has ended, or when a write to it fails (the client went away).
 */
@Component
class LiveUpdates {

  private static final Logger log = LoggerFactory.getLogger(LiveUpdates.class);
  private static final Object COMMIT_HOOK_KEY = new Object();

  private final SyncService sync;
  private final Set<Connection> connections = ConcurrentHashMap.newKeySet();
  private final ScheduledExecutorService heartbeats =
      Executors.newSingleThreadScheduledExecutor(
          runnable -> {
            Thread thread = new Thread(runnable, "sse-heartbeat");
            thread.setDaemon(true);
            return thread;
          });

  /**
   * {@code heartbeat} is short enough for Caddy and iOS to keep an idle connection open; tests
   * shorten it.
   */
  LiveUpdates(SyncService sync, @Value("${sync.heartbeat:25s}") Duration heartbeat) {
    this.sync = sync;
    var unused =
        heartbeats.scheduleWithFixedDelay(
            this::heartbeat, heartbeat.toMillis(), heartbeat.toMillis(), TimeUnit.MILLISECONDS);
  }

  private record Connection(SseEmitter emitter, BooleanSupplier sessionActive) {}

  /**
   * Opens a connection that lasts while {@code sessionActive} holds, and sends it the latest
   * Version.
   */
  SseEmitter open(BooleanSupplier sessionActive) {
    SseEmitter emitter = new SseEmitter(0L); // no timeout: the heartbeat and the session end it
    Connection connection = new Connection(emitter, sessionActive);
    emitter.onCompletion(() -> connections.remove(connection));
    emitter.onError(failure -> connections.remove(connection));
    connections.add(connection);
    sendChanged(connection, sync.latestVersion());
    return emitter;
  }

  /** Sends {@code changed} once after the current transaction commits, however often it locks. */
  @EventListener
  void onSyncableWrite(SyncableWriteStarted event) {
    if (!TransactionSynchronizationManager.isSynchronizationActive()
        || TransactionSynchronizationManager.hasResource(COMMIT_HOOK_KEY)) {
      return;
    }
    TransactionSynchronizationManager.bindResource(COMMIT_HOOK_KEY, true);
    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
          @Override
          public void afterCommit() {
            broadcastChanged();
          }

          @Override
          public void afterCompletion(int status) {
            TransactionSynchronizationManager.unbindResourceIfPossible(COMMIT_HOOK_KEY);
          }
        });
  }

  private void broadcastChanged() {
    if (connections.isEmpty()) {
      return;
    }
    long version = sync.latestVersion();
    for (Connection connection : connections) {
      sendChanged(connection, version);
    }
  }

  private void sendChanged(Connection connection, long version) {
    send(
        connection,
        SseEmitter.event()
            .name("changed")
            .data(Map.of("version", version), MediaType.APPLICATION_JSON));
  }

  private void heartbeat() {
    for (Connection connection : connections) {
      try {
        if (connection.sessionActive().getAsBoolean()) {
          send(connection, SseEmitter.event().comment(""));
        } else {
          end(connection);
        }
      } catch (RuntimeException failure) {
        // The session store is unreachable: keep the connection, check again next time.
        log.warn("Live-update heartbeat failed", failure);
      }
    }
  }

  private void send(Connection connection, SseEmitter.SseEventBuilder event) {
    try {
      connection.emitter().send(event);
    } catch (IOException | IllegalStateException gone) {
      // The client went away; Spring MVC ends the request itself after a failed write.
      connections.remove(connection);
    }
  }

  private void end(Connection connection) {
    connections.remove(connection);
    connection.emitter().complete();
  }

  /** Ends every connection when the app stops, before graceful shutdown waits for open requests. */
  @EventListener(ContextClosedEvent.class)
  void shutDown() {
    heartbeats.shutdownNow();
    connections.forEach(this::end);
  }
}

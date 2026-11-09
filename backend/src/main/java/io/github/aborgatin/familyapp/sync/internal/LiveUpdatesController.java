package io.github.aborgatin.familyapp.sync.internal;

import io.github.aborgatin.familyapp.error.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.session.Session;
import org.springframework.session.SessionRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * {@code GET /api/sync/events}: the live-update stream (spec #3 "Live updates: SSE"). Its only
 * event, {@code changed}, carries the latest Version and never any data; the client pulls when it
 * is above its own. Needs a session like any other API call, and ends when that session ends.
 */
@RestController
@ConditionalOnWebApplication
class LiveUpdatesController {

  private final LiveUpdates liveUpdates;
  private final SessionRepository<? extends Session> sessions;

  LiveUpdatesController(LiveUpdates liveUpdates, SessionRepository<? extends Session> sessions) {
    this.liveUpdates = liveUpdates;
    this.sessions = sessions;
  }

  @GetMapping(path = "/api/sync/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  SseEmitter events(HttpServletRequest request) {
    HttpSession session = request.getSession(false);
    if (session == null) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "auth.required");
    }
    String sessionId = session.getId();
    return liveUpdates.open(() -> sessions.findById(sessionId) != null);
  }
}

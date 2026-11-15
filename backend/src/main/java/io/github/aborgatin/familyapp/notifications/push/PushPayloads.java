package io.github.aborgatin.familyapp.notifications.push;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

/**
 * Writes a push payload (a Notification's or a Reminder's record) as the JSON the service worker
 * reads ({@code web/src/serviceWorker/pushPayload.ts}).
 */
@Component
public class PushPayloads {

  private final ObjectMapper json;

  PushPayloads(ObjectMapper json) {
    this.json = json;
  }

  /** The payload as JSON; a payload record always serializes. */
  public String write(Object payload) {
    try {
      return json.writeValueAsString(payload);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("A push payload is always JSON", e);
    }
  }
}

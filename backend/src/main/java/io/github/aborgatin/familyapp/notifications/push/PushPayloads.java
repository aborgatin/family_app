package io.github.aborgatin.familyapp.notifications.push;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Writes a push payload (a Notification's, a Reminder's or an Announcement's record) as the JSON
 * the service worker reads ({@code web/src/serviceWorker/pushPayload.ts}), and builds the screen
 * URLs a tap opens.
 */
@Component
public class PushPayloads {

  /** Home, {@code /}: the screen an Announcement without a {@code url} opens. */
  public static final String HOME_URL = "/";

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

  /** The List's screen: {@code /lists/:id}. */
  public static String listUrl(UUID listId) {
    return "/lists/" + listId;
  }

  /** The Item's screen: {@code /lists/:id/items/:itemId}. */
  public static String itemUrl(UUID listId, UUID itemId) {
    return listUrl(listId) + "/items/" + itemId;
  }
}

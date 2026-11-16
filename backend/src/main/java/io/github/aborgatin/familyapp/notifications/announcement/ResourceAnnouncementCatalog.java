package io.github.aborgatin.familyapp.notifications.announcement;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.aborgatin.familyapp.notifications.Announcement;
import io.github.aborgatin.familyapp.notifications.AnnouncementCatalog;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * The catalog the operator ships: {@code announcements.json} in the backend's resources, a JSON
 * array of {@code {id, title, body, url?}} in sending order (deployment.md "Adding an Announcement
 * to a release"). Read once, at startup: a new entry comes with a new release.
 */
@Component
class ResourceAnnouncementCatalog implements AnnouncementCatalog {

  static final String RESOURCE = "/announcements.json";

  private final List<Announcement> entries;

  ResourceAnnouncementCatalog(ObjectMapper json) {
    try (InputStream in = ResourceAnnouncementCatalog.class.getResourceAsStream(RESOURCE)) {
      if (in == null) {
        throw new IllegalStateException("Missing classpath resource " + RESOURCE);
      }
      this.entries = List.copyOf(json.readValue(in, new TypeReference<List<Announcement>>() {}));
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  @Override
  public List<Announcement> entries() {
    return entries;
  }
}

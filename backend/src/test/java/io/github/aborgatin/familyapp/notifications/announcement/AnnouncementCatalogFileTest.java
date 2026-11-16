package io.github.aborgatin.familyapp.notifications.announcement;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.aborgatin.familyapp.notifications.Announcement;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * The guard on the real {@code announcements.json} (spec #120 "Testing Decisions", D3): a bad entry
 * fails CI before it can reach a phone. Whether a {@code url} is a real screen of the app is the
 * web's catalog route test ({@code web/src/app/announcementRoutes.test.ts}).
 */
class AnnouncementCatalogFileTest {

  static final int MAX_TITLE = 60;
  static final int MAX_BODY = 180;

  private final List<Announcement> entries =
      new ResourceAnnouncementCatalog(new ObjectMapper()).entries();

  @Test
  void idsAreUnique() {
    Set<String> seen = new HashSet<>();
    List<String> duplicates =
        entries.stream().map(Announcement::id).filter(id -> !seen.add(id)).toList();
    assertThat(duplicates).as("ids used more than once").isEmpty();
  }

  @Test
  void idsAreNotBlank() {
    assertThat(entries).filteredOn(a -> a.id() == null || a.id().isBlank()).isEmpty();
  }

  @Test
  void titlesAreNonBlankAndAtMost60Characters() {
    assertThat(entries)
        .filteredOn(a -> a.title() == null || a.title().isBlank() || length(a.title()) > MAX_TITLE)
        .extracting(Announcement::id)
        .as("ids whose title is blank or longer than %d characters", MAX_TITLE)
        .isEmpty();
  }

  @Test
  void bodiesAreNonBlankAndAtMost180Characters() {
    assertThat(entries)
        .filteredOn(a -> a.body() == null || a.body().isBlank() || length(a.body()) > MAX_BODY)
        .extracting(Announcement::id)
        .as("ids whose body is blank or longer than %d characters", MAX_BODY)
        .isEmpty();
  }

  @Test
  void urlsAreAbsentOrAnAppPath() {
    assertThat(entries)
        .filteredOn(a -> a.url() != null && !isAppPath(a.url()))
        .extracting(Announcement::id)
        .as("ids whose url does not start with / or is under /api")
        .isEmpty();
  }

  private static boolean isAppPath(String url) {
    return url.startsWith("/")
        && !url.startsWith("//")
        && !url.equals("/api")
        && !url.startsWith("/api/")
        && !url.startsWith("/api?");
  }

  /** Characters as a person counts them: code points, so an emoji is one, not two. */
  private static int length(String text) {
    return text.codePointCount(0, text.length());
  }
}

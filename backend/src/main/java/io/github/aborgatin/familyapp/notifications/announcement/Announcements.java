package io.github.aborgatin.familyapp.notifications.announcement;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.github.aborgatin.familyapp.family.MemberSummary;
import io.github.aborgatin.familyapp.family.Members;
import io.github.aborgatin.familyapp.notifications.Announcement;
import io.github.aborgatin.familyapp.notifications.AnnouncementCatalog;
import io.github.aborgatin.familyapp.notifications.PushMessage;
import io.github.aborgatin.familyapp.notifications.push.PushPayloads;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Announcements a scheduler step sends (spec #120 "Sending: the scheduler step"): the catalog
 * entries with no {@code announcement_sent} row (V19). Each is recorded in the step's transaction
 * and becomes one push per Member; once recorded it is never sent again, whatever happens to the
 * push.
 */
@Service
public class Announcements {

  /**
   * The push payload of an Announcement, as the service worker reads it ({@code pushPayload.ts}).
   */
  record AnnouncementPayload(String title, String body, String url) {

    @JsonProperty
    String type() {
      return "announcement";
    }
  }

  private final AnnouncementCatalog catalog;
  private final Members members;
  private final PushPayloads payloads;
  private final JdbcTemplate jdbc;

  Announcements(
      AnnouncementCatalog catalog, Members members, PushPayloads payloads, JdbcTemplate jdbc) {
    this.catalog = catalog;
    this.members = members;
    this.payloads = payloads;
    this.jdbc = jdbc;
  }

  /**
   * Records every catalog entry not handled yet as handled at {@code now}, in the caller's
   * transaction, and returns their pushes in catalog order: one per Member and entry. On a fresh
   * database's first step ({@code firstStep}) they are recorded but nothing is returned, so a new
   * installation never gets the Announcements of releases before it.
   */
  @Transactional(propagation = Propagation.MANDATORY)
  public List<PushMessage> takeNew(boolean firstStep, Instant now) {
    List<PushMessage> messages = new ArrayList<>();
    for (Announcement entry : catalog.entries()) {
      if (!record(entry, now) || firstStep) {
        continue;
      }
      String payload = payloads.write(payload(entry));
      for (MemberSummary member : members.all()) {
        messages.add(PushMessage.announcement(member.id(), payload));
      }
    }
    return messages;
  }

  /** Records the entry as handled; {@code false} when it already was. */
  private boolean record(Announcement entry, Instant now) {
    return jdbc.update(
            "INSERT INTO announcement_sent (id, sent_at) VALUES (?, ?) ON CONFLICT DO NOTHING",
            entry.id(),
            Timestamp.from(now))
        == 1;
  }

  private static AnnouncementPayload payload(Announcement entry) {
    return new AnnouncementPayload(
        entry.title(), entry.body(), entry.url() == null ? PushPayloads.HOME_URL : entry.url());
  }
}

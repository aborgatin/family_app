package io.github.aborgatin.familyapp.notifications.announcement;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.github.aborgatin.familyapp.family.MemberSummary;
import io.github.aborgatin.familyapp.family.Members;
import io.github.aborgatin.familyapp.notifications.Announcement;
import io.github.aborgatin.familyapp.notifications.AnnouncementCatalog;
import io.github.aborgatin.familyapp.notifications.PushMessage;
import io.github.aborgatin.familyapp.notifications.push.PushPayloads;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Announcements a scheduler step sends (spec #120 "Sending: the scheduler step"): the catalog
 * entries not yet in {@link SentAnnouncements}. Each is recorded in the step's transaction and
 * becomes one push per Member; once recorded it is never sent again, whatever happens to the push.
 */
@Service
public class Announcements {

  /** Home, {@code /}: the screen an Announcement without a {@code url} opens. */
  private static final String HOME_URL = "/";

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
  private final SentAnnouncements sent;
  private final Members members;
  private final PushPayloads payloads;

  Announcements(
      AnnouncementCatalog catalog, SentAnnouncements sent, Members members, PushPayloads payloads) {
    this.catalog = catalog;
    this.sent = sent;
    this.members = members;
    this.payloads = payloads;
  }

  /**
   * Records every catalog entry not handled yet as handled at {@code now}, in the caller's
   * transaction, and returns their pushes in catalog order: one per Member and entry. The step
   * drops them on a fresh database's first run, so a new installation never gets the Announcements
   * of releases before it.
   */
  @Transactional(propagation = Propagation.MANDATORY)
  public List<PushMessage> takeNew(Instant now) {
    List<PushMessage> messages = new ArrayList<>();
    for (Announcement entry : catalog.entries()) {
      if (sent.recordIfNew(entry.id(), now)) {
        String payload = payloads.write(payload(entry));
        for (MemberSummary member : members.all()) {
          messages.add(PushMessage.announcement(member.id(), payload));
        }
      }
    }
    return messages;
  }

  private static AnnouncementPayload payload(Announcement entry) {
    return new AnnouncementPayload(
        entry.title(), entry.body(), entry.url() == null ? HOME_URL : entry.url());
  }
}

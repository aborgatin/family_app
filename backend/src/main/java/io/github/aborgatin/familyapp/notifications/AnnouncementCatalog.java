package io.github.aborgatin.familyapp.notifications;

import java.util.List;

/**
 * The Announcements the operator ships with a release, in sending order (spec #120 "Catalog"). The
 * real one reads {@code announcements.json} from the backend's resources; tests replace the bean
 * with entries of their own.
 */
public interface AnnouncementCatalog {

  /** Every entry, in catalog order. */
  List<Announcement> entries();
}

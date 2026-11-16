/**
 * The {@code notifications} module (spec #104): push subscriptions, the Notifications switch's
 * effect, the push gateway, pending Batches, Reminders, the scheduler step, Mute and Announcements
 * (spec #120). Types in this package are the module's public API ({@link Pushes}, {@link
 * SchedulerStep}, {@link PushMessage}, {@link Urgency}, the {@link PushGateway} seam tests replace
 * with a fake, with its {@link PushSubscription} and {@link PushResult}, and the {@link
 * AnnouncementCatalog} seam tests replace with entries of their own, with its {@link
 * Announcement}); sub-packages are internal (CODING_STANDARDS M1). Dependencies: {@code
 * notifications → family} (Members, the switch, the session), {@code notifications → lists} (its
 * events and query API), {@code notifications → sync} (the {@code mute} table), {@code
 * notifications → error}.
 */
@ApplicationModule(displayName = "Notifications")
package io.github.aborgatin.familyapp.notifications;

import org.springframework.modulith.ApplicationModule;

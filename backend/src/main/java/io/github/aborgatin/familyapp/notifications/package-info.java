/**
 * The {@code notifications} module (spec #104): push subscriptions, the Notifications switch's
 * effect, the push gateway, pending Batches, the scheduler step and Mute. Types in this package are
 * the module's public API ({@link Pushes}, {@link SchedulerStep}, and the {@link PushGateway} seam
 * tests replace with a fake); sub-packages are internal (CODING_STANDARDS M1). Dependencies: {@code
 * notifications → family} (Members, the switch, the session), {@code notifications → lists} (its
 * events and query API), {@code notifications → sync} (the {@code mute} table), {@code
 * notifications → error}.
 */
@ApplicationModule(displayName = "Notifications")
package io.github.aborgatin.familyapp.notifications;

import org.springframework.modulith.ApplicationModule;

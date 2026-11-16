/**
 * The {@code medical} module (spec #128): Medical cards, their Illnesses and Conditions ({@code
 * illness}) and Illness events ({@code illness_event}), as syncable tables. Everything reaches
 * clients through the sync push and pull; its one public type is the {@link
 * io.github.aborgatin.familyapp.medical.MedicineDoseLogged} event (the dose Notification). Who sees
 * a card's rows is decided in one place, {@link io.github.aborgatin.familyapp.medical.Person}.
 * Dependencies: {@code medical → sync}, {@code medical → family} ({@code Children}, {@code
 * ChildDeleted}), {@code medical → error}.
 */
@ApplicationModule(displayName = "Medical")
package io.github.aborgatin.familyapp.medical;

import org.springframework.modulith.ApplicationModule;

/**
 * The {@code medical} module (spec #128): Medical cards, their Illnesses and Conditions ({@code
 * illness}), Illness events ({@code illness_event}) and Documents ({@code document}), as syncable
 * tables, and the Medicines ({@code medicine}). Everything reaches clients through the sync push
 * and pull, except a Document's file: uploaded and downloaded through {@code /api/documents}, kept
 * encrypted in a file store. Its one public type is the {@link
 * io.github.aborgatin.familyapp.medical.MedicineDoseLogged} event (the dose Notification). Who sees
 * a card's rows is decided in one place, {@link io.github.aborgatin.familyapp.medical.Person}.
 * Dependencies: {@code medical → sync}, {@code medical → family} ({@code Children}, {@code
 * ChildDeleted}, {@code Members}, {@code FamilyLock}), {@code medical → error}.
 */
@ApplicationModule(displayName = "Medical")
package io.github.aborgatin.familyapp.medical;

import org.springframework.modulith.ApplicationModule;

/**
 * The {@code medical} module (spec #128): Medical cards, their Illnesses and Conditions ({@code
 * illness}) and Illness events ({@code illness_event}), as syncable tables. It has no public API:
 * everything reaches clients through the sync push and pull. Who sees a card's rows is decided in
 * one place, {@link io.github.aborgatin.familyapp.medical.Person}. Dependencies: {@code medical →
 * sync}, {@code medical → family} ({@code Children}, {@code ChildDeleted}), {@code medical →
 * error}.
 */
@ApplicationModule(displayName = "Medical")
package io.github.aborgatin.familyapp.medical;

import org.springframework.modulith.ApplicationModule;

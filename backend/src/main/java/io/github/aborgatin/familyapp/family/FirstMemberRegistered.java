package io.github.aborgatin.familyapp.family;

import java.util.UUID;

/**
 * Published inside the transaction that registers the first Member of a fresh installation
 * (bootstrap), never on Invite registration, while that transaction holds the {@link FamilyLock}.
 * Synchronous listeners write their module's Defaults that need an Owner, such as the Default
 * Shopping lists (spec #4 "Defaults"); a listener that throws rolls the registration back.
 */
public record FirstMemberRegistered(UUID memberId) {}

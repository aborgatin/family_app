package io.github.aborgatin.familyapp.medical;

import java.util.UUID;

/**
 * A Member logged a new Medicine dose on a Child's card (spec #128 "Notification"). Published
 * inside the push operation that creates the dose, so a listener after the commit hears it only
 * when the push committed. Never for an edit, nor for a dose on a Member's card.
 */
public record MedicineDoseLogged(UUID childId, UUID illnessId, UUID byMemberId) {}

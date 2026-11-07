package io.github.aborgatin.familyapp.family;

import java.util.UUID;

/** A Member as other modules see them: id and display name (spec #5, Modules). */
public record MemberSummary(UUID id, String displayName) {}

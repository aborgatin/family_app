package io.github.aborgatin.familyapp.family;

import java.util.UUID;

/**
 * A Member as other modules see them (spec #5, Modules): id, display name and Grammatical gender
 * ({@code MASCULINE} or {@code FEMININE}, the verb forms in sentences about them; spec #104).
 */
public record MemberSummary(UUID id, String displayName, String grammaticalGender) {}

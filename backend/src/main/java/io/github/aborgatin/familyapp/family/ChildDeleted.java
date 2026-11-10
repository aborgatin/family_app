package io.github.aborgatin.familyapp.family;

import java.util.UUID;

/**
 * Published when a Child is deleted, inside the push operation that deletes them (so under the
 * {@link FamilyLock}). Synchronous listeners soft-delete what their module keeps about the Child,
 * such as the Child lists (spec #81); what they write commits or rolls back with the delete.
 */
public record ChildDeleted(UUID childId) {}

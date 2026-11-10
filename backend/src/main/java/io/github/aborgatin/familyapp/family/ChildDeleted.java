package io.github.aborgatin.familyapp.family;

import java.util.UUID;

/**
 * Published inside the push operation that deletes a Child (it holds the {@link FamilyLock}), right
 * after the Child is soft-deleted. Synchronous listeners soft-delete what belongs to the Child in
 * the same operation, such as its Child field values (spec #81); a listener that throws rejects the
 * delete.
 */
public record ChildDeleted(UUID childId) {}

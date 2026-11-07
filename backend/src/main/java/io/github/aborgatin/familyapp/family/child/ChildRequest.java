package io.github.aborgatin.familyapp.family.child;

import org.springframework.lang.Nullable;

/**
 * The body of {@code PUT /api/children/{id}}: {@code {name, color, birthday | null}}. Fields are
 * read as plain strings so that a missing or bad value becomes a field code, not a parse error.
 */
record ChildRequest(@Nullable String name, @Nullable String color, @Nullable String birthday) {}

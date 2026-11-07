package io.github.aborgatin.familyapp.family.child;

import java.time.LocalDate;
import org.springframework.lang.Nullable;

/** A Child's client-editable fields after validation: trimmed name, palette code, birthday. */
record ChildDetails(String name, String color, @Nullable LocalDate birthday) {}

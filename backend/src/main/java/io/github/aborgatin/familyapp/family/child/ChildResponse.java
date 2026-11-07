package io.github.aborgatin.familyapp.family.child;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.lang.Nullable;

/** The API's {@code Child} shape (spec #5, API contract): {@code birthday} is null when unknown. */
record ChildResponse(
    UUID id,
    String name,
    String color,
    @Nullable LocalDate birthday,
    long version,
    Instant updatedAt) {

  static ChildResponse of(Child child) {
    return new ChildResponse(
        child.id(),
        child.name(),
        child.color(),
        child.birthday(),
        child.version(),
        child.updatedAt());
  }
}

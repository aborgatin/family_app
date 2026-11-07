package io.github.aborgatin.familyapp.family.member;

import java.time.Instant;
import java.util.UUID;

/** The API's {@code Member} shape (spec #5, API contract). The password hash never leaves. */
public record MemberResponse(
    UUID id,
    String email,
    String displayName,
    GrammaticalGender grammaticalGender,
    long version,
    Instant updatedAt) {

  public static MemberResponse of(Member member) {
    return new MemberResponse(
        member.id(),
        member.email(),
        member.displayName(),
        member.grammaticalGender(),
        member.version(),
        member.updatedAt());
  }
}

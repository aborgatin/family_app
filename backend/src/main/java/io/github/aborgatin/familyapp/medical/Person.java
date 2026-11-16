package io.github.aborgatin.familyapp.medical;

import io.github.aborgatin.familyapp.error.ApiException;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.lang.Nullable;

/**
 * Whose Medical card a row is on: exactly one of a Member and a Child. The one place of the card's
 * visibility rule (spec #128 "Visibility in sync"): a Member's card is seen only by that Member, a
 * Child's by every Member. A row a Member can't see is left out of their pull entirely (no
 * tombstone, like a Mute), and an operation on it is {@code medical.not_found}.
 */
record Person(@Nullable UUID memberId, @Nullable UUID childId) {

  /** Whether {@code viewer} sees this person's card. */
  boolean visibleTo(UUID viewer) {
    return childId != null || viewer.equals(memberId);
  }

  /** The rejection of an operation on a row the pushing Member can't see, or that isn't there. */
  static ApiException notFound(String param, UUID id) {
    return new ApiException(
        HttpStatus.NOT_FOUND, "medical.not_found", Map.of(param, id.toString()));
  }
}

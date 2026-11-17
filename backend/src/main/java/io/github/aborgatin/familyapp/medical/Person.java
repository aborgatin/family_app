package io.github.aborgatin.familyapp.medical;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.error.FieldErrors;
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

  /**
   * The person a new row names: exactly one of {@code memberId} and {@code childId}, each an id.
   * Neither is {@code memberId} {@code required}, both {@code childId} {@code value.invalid}, added
   * to {@code errors}; {@code null} when it added any.
   *
   * <p>Whether a named Child is there is the caller's: a sync row for a deleted Child is stored
   * deleted and {@code ignored} (delete wins: the rows pushed with it are ignored too), while an
   * upload, which answers at once, is {@code medical.not_found}.
   */
  @Nullable
  static Person of(FieldErrors errors, @Nullable String memberId, @Nullable String childId) {
    UUID member = errors.uuid("memberId", memberId);
    UUID child = errors.uuid("childId", childId);
    if (member == null && child == null && !errors.has("memberId") && !errors.has("childId")) {
      errors.add("memberId", FieldErrors.REQUIRED);
    } else if (member != null && child != null) {
      errors.add("childId", FieldErrors.VALUE_INVALID);
    }
    return errors.has("memberId") || errors.has("childId") ? null : new Person(member, child);
  }

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

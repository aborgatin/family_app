package io.github.aborgatin.familyapp.family.member;

import io.github.aborgatin.familyapp.error.FieldErrors;
import java.util.Map;
import org.springframework.lang.Nullable;

/**
 * A change to a Member's own profile, {@code PATCH /api/members/me}: {@code {displayName?,
 * grammaticalGender?}}. Only the fields sent are changed; a field sent as {@code null} or blank is
 * {@code required}. A {@code null} component here means "not sent, leave as is".
 */
public record ProfileChange(
    @Nullable String displayName, @Nullable GrammaticalGender grammaticalGender) {

  private static final String DISPLAY_NAME = "displayName";
  private static final String GRAMMATICAL_GENDER = "grammaticalGender";

  /**
   * Validates the request body (a JSON object read as a map, so an absent field can be told apart
   * from one sent as {@code null}), or throws {@code 400 validation.failed}.
   */
  public static ProfileChange fromBody(Map<String, ?> body) {
    FieldErrors errors = new FieldErrors();
    String displayName = null;
    GrammaticalGender gender = null;
    if (body.containsKey(DISPLAY_NAME) && isText(DISPLAY_NAME, body, errors)) {
      displayName =
          RegistrationRequest.checkDisplayName(
              DISPLAY_NAME, (String) body.get(DISPLAY_NAME), errors);
    }
    if (body.containsKey(GRAMMATICAL_GENDER) && isText(GRAMMATICAL_GENDER, body, errors)) {
      gender =
          errors.requiredChoice(
              GRAMMATICAL_GENDER,
              (String) body.get(GRAMMATICAL_GENDER),
              GrammaticalGender.values());
    }
    errors.throwIfAny();
    return new ProfileChange(displayName, gender);
  }

  /** A string or null; any other JSON type (number, object, …) is {@code value.invalid}. */
  private static boolean isText(String field, Map<String, ?> body, FieldErrors errors) {
    Object value = body.get(field);
    if (value == null || value instanceof String) {
      return true;
    }
    errors.add(field, FieldErrors.VALUE_INVALID);
    return false;
  }
}

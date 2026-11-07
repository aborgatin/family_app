package io.github.aborgatin.familyapp.family.member;

import io.github.aborgatin.familyapp.error.FieldErrors;
import java.util.Locale;
import java.util.Objects;
import java.util.regex.Pattern;
import org.springframework.lang.Nullable;

/**
 * The body of every registration (bootstrap now, Invite acceptance later): {@code {email, password,
 * displayName, grammaticalGender}}. Fields are read as plain strings so that a missing or unknown
 * value becomes a field code instead of a parse error.
 */
public record RegistrationRequest(
    @Nullable String email,
    @Nullable String password,
    @Nullable String displayName,
    @Nullable String grammaticalGender) {

  public static final int MIN_PASSWORD_LENGTH = MemberFields.MIN_PASSWORD_LENGTH;

  static final int MAX_EMAIL_LENGTH = 254;

  private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

  /**
   * Validates every field and returns the normalized values (email trimmed and lower-cased, display
   * name trimmed), or throws {@code 400 validation.failed} listing every bad field.
   */
  public Registration validate() {
    FieldErrors errors = new FieldErrors();

    String normalizedEmail = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    if (normalizedEmail.isEmpty()) {
      errors.add("email", FieldErrors.REQUIRED);
    } else if (normalizedEmail.length() > MAX_EMAIL_LENGTH) {
      errors.add("email", FieldErrors.TOO_LONG);
    } else if (!EMAIL.matcher(normalizedEmail).matches()) {
      errors.add("email", FieldErrors.EMAIL_INVALID);
    }
    String validPassword = MemberFields.newPassword("password", password, errors);
    String name = MemberFields.displayName("displayName", displayName, errors);
    GrammaticalGender gender =
        MemberFields.grammaticalGender("grammaticalGender", grammaticalGender, errors);

    errors.throwIfAny();
    return new Registration(
        normalizedEmail,
        Objects.requireNonNull(validPassword),
        Objects.requireNonNull(name),
        Objects.requireNonNull(gender));
  }

  /** A registration that passed validation. */
  public record Registration(
      String email, String password, String displayName, GrammaticalGender grammaticalGender) {}
}

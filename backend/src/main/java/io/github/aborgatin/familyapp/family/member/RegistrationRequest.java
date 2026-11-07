package io.github.aborgatin.familyapp.family.member;

import io.github.aborgatin.familyapp.error.FieldErrors;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Locale;
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

  public static final int MIN_PASSWORD_LENGTH = 8;

  /** bcrypt only looks at the first 72 bytes; longer passwords are refused, not truncated. */
  static final int MAX_PASSWORD_BYTES = 72;

  static final int MAX_EMAIL_LENGTH = 254;
  static final int MAX_DISPLAY_NAME_LENGTH = 100;

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

    String rawPassword = password == null ? "" : password;
    if (rawPassword.isEmpty()) {
      errors.add("password", FieldErrors.REQUIRED);
    } else if (rawPassword.codePointCount(0, rawPassword.length()) < MIN_PASSWORD_LENGTH) {
      errors.add("password", FieldErrors.PASSWORD_TOO_SHORT);
    } else if (rawPassword.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
      errors.add("password", FieldErrors.TOO_LONG);
    }

    String name = displayName == null ? "" : displayName.trim();
    if (name.isEmpty()) {
      errors.add("displayName", FieldErrors.REQUIRED);
    } else if (name.codePointCount(0, name.length()) > MAX_DISPLAY_NAME_LENGTH) {
      errors.add("displayName", FieldErrors.TOO_LONG);
    }

    GrammaticalGender gender = null;
    if (grammaticalGender == null || grammaticalGender.isBlank()) {
      errors.add("grammaticalGender", FieldErrors.REQUIRED);
    } else {
      gender =
          Arrays.stream(GrammaticalGender.values())
              .filter(value -> value.name().equals(grammaticalGender))
              .findFirst()
              .orElse(null);
      if (gender == null) {
        errors.add("grammaticalGender", FieldErrors.VALUE_INVALID);
      }
    }

    errors.throwIfAny();
    return new Registration(normalizedEmail, rawPassword, name, gender);
  }

  /** A registration that passed validation. */
  public record Registration(
      String email, String password, String displayName, GrammaticalGender grammaticalGender) {}
}

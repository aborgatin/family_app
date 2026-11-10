package io.github.aborgatin.familyapp.family.member;

import io.github.aborgatin.familyapp.error.FieldErrors;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Pattern;
import org.springframework.lang.Nullable;

/**
 * The body of every registration (bootstrap and Invite acceptance): {@code {email, password,
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

    String rawPassword = checkPassword("password", password, errors);

    String name = checkDisplayName("displayName", displayName, errors);
    GrammaticalGender gender =
        errors.requiredChoice("grammaticalGender", grammaticalGender, GrammaticalGender.values());

    errors.throwIfAny();
    return new Registration(normalizedEmail, rawPassword, name, gender);
  }

  /**
   * Checks a new password against the password rules (at least 8 characters, at most 72 bytes),
   * adding any failure to {@code errors} under {@code field}. Returns the password, {@code ""} when
   * missing.
   */
  public static String checkPassword(String field, @Nullable String password, FieldErrors errors) {
    String rawPassword = password == null ? "" : password;
    if (rawPassword.isEmpty()) {
      errors.add(field, FieldErrors.REQUIRED);
    } else if (rawPassword.codePointCount(0, rawPassword.length()) < MIN_PASSWORD_LENGTH) {
      errors.add(field, FieldErrors.PASSWORD_TOO_SHORT);
    } else if (rawPassword.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
      errors.add(field, FieldErrors.TOO_LONG);
    }
    return rawPassword;
  }

  /**
   * Checks a display name (1–100 characters after trimming), adding any failure to {@code errors}
   * under {@code field}. Returns the trimmed name, {@code ""} when missing.
   */
  public static String checkDisplayName(
      String field, @Nullable String displayName, FieldErrors errors) {
    String name = displayName == null ? "" : displayName.trim();
    if (name.isEmpty()) {
      errors.add(field, FieldErrors.REQUIRED);
    } else if (name.codePointCount(0, name.length()) > MAX_DISPLAY_NAME_LENGTH) {
      errors.add(field, FieldErrors.TOO_LONG);
    }
    return name;
  }

  /** A registration that passed validation. */
  public record Registration(
      String email, String password, String displayName, GrammaticalGender grammaticalGender) {}
}

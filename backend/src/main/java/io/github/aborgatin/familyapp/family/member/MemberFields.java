package io.github.aborgatin.familyapp.family.member;

import io.github.aborgatin.familyapp.error.FieldErrors;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.springframework.lang.Nullable;

/**
 * Validation of the Member fields that several requests share (registration, own profile, own
 * password). Each method records a field code in {@code errors} and returns the normalized value,
 * or {@code null} when the value is invalid.
 */
public final class MemberFields {

  public static final int MIN_PASSWORD_LENGTH = 8;

  /** bcrypt only looks at the first 72 bytes; longer passwords are refused, not truncated. */
  static final int MAX_PASSWORD_BYTES = 72;

  static final int MAX_DISPLAY_NAME_LENGTH = 100;

  private MemberFields() {}

  /** 1–100 characters after trimming; returns the trimmed name. */
  @Nullable
  public static String displayName(String field, @Nullable String value, FieldErrors errors) {
    String name = value == null ? "" : value.trim();
    if (name.isEmpty()) {
      errors.add(field, FieldErrors.REQUIRED);
      return null;
    }
    if (name.codePointCount(0, name.length()) > MAX_DISPLAY_NAME_LENGTH) {
      errors.add(field, FieldErrors.TOO_LONG);
      return null;
    }
    return name;
  }

  /** A new password: at least 8 characters, at most 72 bytes; returned unchanged. */
  @Nullable
  public static String newPassword(String field, @Nullable String value, FieldErrors errors) {
    String password = value == null ? "" : value;
    if (password.isEmpty()) {
      errors.add(field, FieldErrors.REQUIRED);
      return null;
    }
    if (password.codePointCount(0, password.length()) < MIN_PASSWORD_LENGTH) {
      errors.add(field, FieldErrors.PASSWORD_TOO_SHORT);
      return null;
    }
    if (password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
      errors.add(field, FieldErrors.TOO_LONG);
      return null;
    }
    return password;
  }

  /** {@code MASCULINE} or {@code FEMININE}; required. */
  @Nullable
  public static GrammaticalGender grammaticalGender(
      String field, @Nullable String value, FieldErrors errors) {
    if (value == null || value.isBlank()) {
      errors.add(field, FieldErrors.REQUIRED);
      return null;
    }
    GrammaticalGender gender =
        Arrays.stream(GrammaticalGender.values())
            .filter(candidate -> candidate.name().equals(value))
            .findFirst()
            .orElse(null);
    if (gender == null) {
      errors.add(field, FieldErrors.VALUE_INVALID);
    }
    return gender;
  }
}

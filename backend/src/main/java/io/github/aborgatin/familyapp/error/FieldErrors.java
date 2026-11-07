package io.github.aborgatin.familyapp.error;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;

/**
 * Collects field-level validation failures for one request. {@link #throwIfAny()} turns them into
 * {@code 400 {"code":"validation.failed","params":{"errors":[{"field":…,"code":…}]}}}.
 *
 * <p>Field codes used so far: {@code required}, {@code email.invalid}, {@code password.too_short},
 * {@code too_long}, {@code value.invalid}.
 */
public final class FieldErrors {

  public static final String REQUIRED = "required";
  public static final String EMAIL_INVALID = "email.invalid";
  public static final String PASSWORD_TOO_SHORT = "password.too_short";
  public static final String TOO_LONG = "too_long";
  public static final String VALUE_INVALID = "value.invalid";

  private final List<Map<String, Object>> errors = new ArrayList<>();

  public FieldErrors add(String field, String code) {
    errors.add(Map.of("field", field, "code", code));
    return this;
  }

  public boolean has(String field) {
    return errors.stream().anyMatch(error -> field.equals(error.get("field")));
  }

  public void throwIfAny() {
    if (!errors.isEmpty()) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST, "validation.failed", Map.of("errors", List.copyOf(errors)));
    }
  }
}

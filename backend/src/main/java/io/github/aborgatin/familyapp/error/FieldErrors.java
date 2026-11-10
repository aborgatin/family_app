package io.github.aborgatin.familyapp.error;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.http.HttpStatus;
import org.springframework.lang.Nullable;

/**
 * Collects field-level validation failures for one request. {@link #throwIfAny()} turns them into
 * {@code 400 {"code":"validation.failed","params":{"errors":[{"field":…,"code":…}]}}}.
 *
 * <p>Field codes used so far: {@code required}, {@code email.invalid}, {@code password.too_short},
 * {@code too_long}, {@code value.invalid}, {@code color.invalid}.
 *
 * <p>It also reads the values requests share, each the one way to read it: an enum by its exact
 * name ({@link #choice}, {@link #requiredChoice}), an id ({@link #uuid}, {@link #requiredUuid}), a
 * {@code YYYY-MM-DD} day ({@link #date}), anything else with a parser ({@link #parsed}). Each
 * returns {@code null} for a missing value or a failure it added.
 */
public final class FieldErrors {

  public static final String REQUIRED = "required";
  public static final String EMAIL_INVALID = "email.invalid";
  public static final String PASSWORD_TOO_SHORT = "password.too_short";
  public static final String TOO_LONG = "too_long";
  public static final String VALUE_INVALID = "value.invalid";
  public static final String COLOR_INVALID = "color.invalid";

  private final List<Map<String, Object>> errors = new ArrayList<>();

  public FieldErrors add(String field, String code) {
    errors.add(Map.of("field", field, "code", code));
    return this;
  }

  public boolean has(String field) {
    return errors.stream().anyMatch(error -> field.equals(error.get("field")));
  }

  /**
   * {@code value} as one of {@code values} by its exact name, {@code null} when {@code null}; any
   * other text (blank too) is {@code value.invalid}.
   */
  @Nullable
  public <E extends Enum<E>> E choice(String field, @Nullable String value, E[] values) {
    if (value == null) {
      return null;
    }
    E found =
        Arrays.stream(values)
            .filter(candidate -> candidate.name().equals(value))
            .findFirst()
            .orElse(null);
    if (found == null) {
      add(field, VALUE_INVALID);
    }
    return found;
  }

  /** {@link #choice}, and {@code required} when {@code value} is missing or blank. */
  @Nullable
  public <E extends Enum<E>> E requiredChoice(String field, @Nullable String value, E[] values) {
    return required(field, value) ? choice(field, value, values) : null;
  }

  /**
   * {@code value} as a UUID, {@code null} when {@code null}; any other text (blank too) is {@code
   * value.invalid}.
   */
  @Nullable
  public UUID uuid(String field, @Nullable String value) {
    return parsed(field, value, UUID::fromString);
  }

  /** {@link #uuid}, and {@code required} when {@code value} is missing or blank. */
  @Nullable
  public UUID requiredUuid(String field, @Nullable String value) {
    return required(field, value) ? uuid(field, value) : null;
  }

  /**
   * {@code value} as a day written {@code YYYY-MM-DD} (ISO, a day that exists), {@code null} when
   * {@code null}; anything else is {@code value.invalid}.
   */
  @Nullable
  public LocalDate date(String field, @Nullable String value) {
    return parsed(field, value, LocalDate::parse);
  }

  /**
   * {@code value} read by {@code parse}, {@code null} when {@code null}; {@code value.invalid} when
   * {@code parse} rejects it (a {@link DateTimeParseException} or {@link
   * IllegalArgumentException}).
   */
  @Nullable
  public <T> T parsed(String field, @Nullable String value, Function<String, T> parse) {
    if (value == null) {
      return null;
    }
    try {
      return parse.apply(value);
    } catch (DateTimeParseException | IllegalArgumentException e) {
      add(field, VALUE_INVALID);
      return null;
    }
  }

  /** Whether {@code value} is there and not blank; adds {@code required} when it isn't. */
  private boolean required(String field, @Nullable String value) {
    if (value == null || value.isBlank()) {
      add(field, REQUIRED);
      return false;
    }
    return true;
  }

  public void throwIfAny() {
    if (!errors.isEmpty()) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST, "validation.failed", Map.of("errors", List.copyOf(errors)));
    }
  }
}

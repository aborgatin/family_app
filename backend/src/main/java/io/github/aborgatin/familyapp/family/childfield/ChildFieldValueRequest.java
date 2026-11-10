package io.github.aborgatin.familyapp.family.childfield;

import io.github.aborgatin.familyapp.error.FieldErrors;
import java.util.UUID;
import org.springframework.lang.Nullable;

/**
 * A new Child field value as an upsert carries it: {@code {childId, childFieldId, value}}, all
 * required. Fields are read as nullable strings so that a missing or bad value becomes a field
 * code, not a parse error.
 */
record ChildFieldValueRequest(
    @Nullable String childId, @Nullable String childFieldId, @Nullable String value) {

  /**
   * Whose value of which Child field this is, and the value trimmed; or {@code 400
   * validation.failed} listing every missing field and bad id.
   */
  Valid validate() {
    FieldErrors errors = new FieldErrors();
    UUID child = errors.requiredUuid("childId", childId);
    UUID childField = errors.requiredUuid("childFieldId", childFieldId);
    if (value == null) {
      errors.add("value", FieldErrors.REQUIRED);
    }
    errors.throwIfAny();
    return new Valid(child, childField, value.strip());
  }

  /** A request whose fields are all there; {@code value} is trimmed. */
  record Valid(UUID childId, UUID childFieldId, String value) {

    /** The longest {@code TEXT} value, in code points. */
    private static final int MAX_TEXT_LENGTH = 1000;

    /**
     * The value in the canonical format of the field's Value type (ADR-0007), or {@code 400
     * validation.failed} for {@code value}: {@code TEXT} longer than 1000 code points is {@code
     * too_long}, a {@code DATE} not written {@code YYYY-MM-DD} is {@code value.invalid}. Empty is a
     * cleared value, allowed for every type.
     */
    String valueOf(ValueType type) {
      FieldErrors errors = new FieldErrors();
      if (!value.isEmpty()) {
        switch (type) {
          case TEXT -> {
            if (value.codePointCount(0, value.length()) > MAX_TEXT_LENGTH) {
              errors.add("value", FieldErrors.TOO_LONG);
            }
          }
          case DATE -> errors.date("value", value);
        }
      }
      errors.throwIfAny();
      return value;
    }
  }
}

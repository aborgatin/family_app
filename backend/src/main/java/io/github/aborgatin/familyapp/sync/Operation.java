package io.github.aborgatin.familyapp.sync;

import io.github.aborgatin.familyapp.error.FieldErrors;
import java.util.Map;
import java.util.UUID;
import org.springframework.lang.Nullable;

/**
 * One Outbox operation as a {@link SyncableTable} receives it: the record {@code id}, whether it is
 * an {@code upsert} or a {@code delete}, the fields an upsert carries (only the changed ones; none
 * for a delete), and the Member who pushed it.
 *
 * <p>An upsert of an unknown id creates the record and must carry every required field; of a known
 * id it changes only the fields it carries (Last write wins per field, by server arrival).
 */
public record Operation(UUID memberId, UUID id, Type type, Map<String, Object> fields) {

  /** What an operation does to its record. */
  public enum Type {
    UPSERT,
    DELETE
  }

  /** Whether the upsert carries this field (even as {@code null}). */
  public boolean has(String field) {
    return fields.containsKey(field);
  }

  /**
   * The field as text, or {@code null} when it is absent or {@code null}. A value of another JSON
   * type is {@code 400 validation.failed} with {@code value.invalid} for the field.
   */
  @Nullable
  public String text(String field) {
    Object value = fields.get(field);
    if (value == null || value instanceof String) {
      return (String) value;
    }
    new FieldErrors().add(field, FieldErrors.VALUE_INVALID).throwIfAny();
    return null;
  }

  /**
   * The field as a number, or {@code null} when it is absent or {@code null}. A value of another
   * JSON type is {@code 400 validation.failed} with {@code value.invalid} for the field.
   */
  @Nullable
  public Double number(String field) {
    Object value = fields.get(field);
    if (value == null) {
      return null;
    }
    if (value instanceof Number number) {
      return number.doubleValue();
    }
    new FieldErrors().add(field, FieldErrors.VALUE_INVALID).throwIfAny();
    return null;
  }
}

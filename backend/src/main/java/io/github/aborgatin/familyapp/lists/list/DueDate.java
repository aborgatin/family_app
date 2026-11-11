package io.github.aborgatin.familyapp.lists.list;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import org.springframework.lang.Nullable;

/**
 * A todo item's Due date (GLOSSARY): the day it should be done by, optionally with a time of day.
 * Wall-clock values, not an instant. No day is no Due date; there is never a time without a day.
 */
record DueDate(@Nullable LocalDate day, @Nullable LocalTime time) {

  /** No Due date. */
  static final DueDate NONE = new DueDate(null, null);

  /** {@code dueTime} on the wire: {@code HH:MM}, 24 hours, no seconds. */
  private static final DateTimeFormatter TIME =
      DateTimeFormatter.ofPattern("HH:mm").withResolverStyle(ResolverStyle.STRICT);

  /** {@code dueTime} as a push carries it; a {@link DateTimeParseException} when it isn't one. */
  static LocalTime parseTime(String text) {
    return LocalTime.parse(text, TIME);
  }

  /** {@code dueDate} as the pull sends it: {@code YYYY-MM-DD}, or {@code null}. */
  @Nullable
  String dayText() {
    return day == null ? null : day.toString();
  }

  /** {@code dueTime} as the pull sends it: {@code HH:MM}, or {@code null}. */
  @Nullable
  String timeText() {
    return time == null ? null : TIME.format(time);
  }
}

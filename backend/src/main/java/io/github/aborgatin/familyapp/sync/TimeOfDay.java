package io.github.aborgatin.familyapp.sync;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;

/**
 * A wall-clock time of day on the wire: {@code HH:MM}, 24 hours, no seconds (a day is {@code
 * YYYY-MM-DD}, {@link java.time.LocalDate}'s own format). An Item's {@code dueTime}, an Illness
 * event's {@code time}.
 */
public final class TimeOfDay {

  private static final DateTimeFormatter FORMAT =
      DateTimeFormatter.ofPattern("HH:mm").withResolverStyle(ResolverStyle.STRICT);

  private TimeOfDay() {}

  /** The time a push carries; a {@link DateTimeParseException} when it isn't one. */
  public static LocalTime parse(String text) {
    return LocalTime.parse(text, FORMAT);
  }

  /** The time as the pull sends it. */
  public static String format(LocalTime time) {
    return FORMAT.format(time);
  }
}

package io.github.aborgatin.familyapp.lists.list;

import java.time.LocalDate;

/**
 * A todo item's Repeat (GLOSSARY): how often it recurs. Code, not Family data (S7). Only on an Item
 * with a Due date; removing the Due date removes it.
 */
enum Repeat {
  DAILY,
  WEEKLY,
  MONTHLY,
  YEARLY;

  /**
   * The Due date of the next occurrence after one due on {@code day} (ADR-0009): {@code day}
   * advanced by this period, at least once, until it is after {@code today}. A monthly or yearly
   * step to a day the month doesn't have lands on its last day, and the next step goes on from
   * there (31 Jan → 28 Feb → 28 Mar).
   */
  LocalDate next(LocalDate day, LocalDate today) {
    LocalDate next = step(day);
    while (!next.isAfter(today)) {
      next = step(next);
    }
    return next;
  }

  /** One period on; {@code plusMonths} and {@code plusYears} clamp to the month's last day. */
  private LocalDate step(LocalDate day) {
    return switch (this) {
      case DAILY -> day.plusDays(1);
      case WEEKLY -> day.plusWeeks(1);
      case MONTHLY -> day.plusMonths(1);
      case YEARLY -> day.plusYears(1);
    };
  }
}

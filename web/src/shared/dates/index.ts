// Days written `YYYY-MM-DD` (a birthday, a Due date): wall-calendar days, the same on every device.

/** The day's numbers: the year, the month (1–12) and the day of the month. */
export function dayParts(day: string): { year: number; month: number; day: number } {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return { year, month, day: date };
}

/** The day at its local midnight: the day as written, whatever the device's time zone. */
export function localDay(day: string): Date {
  const { year, month, day: date } = dayParts(day);
  return new Date(year, month - 1, date);
}

/**
 * Whole calendar days from `now`'s day to `day` (`YYYY-MM-DD`): 0 today, 1 tomorrow, -1 yesterday,
 * whatever the clock changes in between.
 */
export function daysFromToday(day: string, now: Date): number {
  const { year, month, day: date } = dayParts(day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(year, month - 1, date) - today) / 86_400_000);
}

/** «12 нояб.», with the year when it isn't `now`'s («5 мар. 2025 г.»). */
export function shortDay(day: Date, now: Date): string {
  return new Intl.DateTimeFormat('ru', {
    day: 'numeric',
    month: 'short',
    ...(day.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
  }).format(day);
}

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
 * The moment at `time` (`HH:MM`, wall-clock) on `day` (`YYYY-MM-DD`), in the device's time zone;
 * `24:00` is the next day's midnight.
 */
export function localMoment(day: string, time: string): Date {
  const { year, month, day: date } = dayParts(day);
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return new Date(year, month - 1, date, hours, minutes);
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

/**
 * «2 декабря 2026» (`year: 'always'`), or «2 декабря» with the year only when it isn't `now`'s
 * (`year: now`). Without the «г.» Intl adds.
 */
export function longDay(day: Date, year: 'always' | Date): string {
  const withYear = year === 'always' || day.getFullYear() !== year.getFullYear();
  return new Intl.DateTimeFormat('ru', {
    day: 'numeric',
    month: 'long',
    ...(withYear && { year: 'numeric' }),
  })
    .formatToParts(day)
    .filter(({ type }) => type === 'day' || type === 'month' || type === 'year')
    .map(({ value }) => value)
    .join(' ');
}

/** The day `date` is on, written `YYYY-MM-DD` (its local calendar day). */
export function dayOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${String(date.getFullYear())}-${month}-${day}`;
}

/** The time of day `date` is at, written `HH:MM` (local time). */
export function timeOf(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

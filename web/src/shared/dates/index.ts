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

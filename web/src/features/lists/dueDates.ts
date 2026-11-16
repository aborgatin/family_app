import type { TFunction } from 'i18next';
import { daysFromToday, localDay, localMoment, shortDay } from '@/shared/dates';
import type { Item } from './listTypes';

// How a todo item's Due date reads and when it is overdue, by the device's clock and time zone:
// the Due date is a wall-clock day and time, the same on every device.

/**
 * The day of a Due date (`YYYY-MM-DD`): «Сегодня», «Завтра» or «Вчера» for those days of the
 * device's calendar, else «15 нояб.», with the year when it isn't this one.
 */
export function dueDayText(t: TFunction, dueDate: string, now: Date): string {
  const days = daysFromToday(dueDate, now);
  if (days === 0) return t('lists.due.today');
  if (days === 1) return t('lists.due.tomorrow');
  if (days === -1) return t('lists.due.yesterday');
  return shortDay(localDay(dueDate), now);
}

/**
 * An Item's Due date as its row shows it: the day and, when it has one, the time («15 нояб.,
 * 15:00»); `undefined` without a Due date.
 */
export function dueDateText(
  t: TFunction,
  item: Pick<Item, 'dueDate' | 'dueTime'>,
  now: Date,
): string | undefined {
  if (item.dueDate == null) return undefined;
  const day = dueDayText(t, item.dueDate, now);
  return item.dueTime == null ? day : t('lists.due.dayAndTime', { day, time: item.dueTime });
}

/**
 * Whether the Due date has passed on the device's clock: one with a time once that time passes,
 * one without from the next day.
 */
export function isOverdue(item: Pick<Item, 'dueDate' | 'dueTime'>, now: Date): boolean {
  if (item.dueDate == null) return false;
  // Without a time, the end of the day.
  const due = localMoment(item.dueDate, item.dueTime ?? '24:00');
  // Date-only: overdue from the next day's midnight on; timed: after its minute has come.
  return item.dueTime == null ? now >= due : now > due;
}

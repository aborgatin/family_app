import type { TFunction } from 'i18next';
import { localMoment } from '@/shared/dates';
import type { Illness, IllnessEvent } from './medicalTypes';

/*
 * The Medical card's rules (spec #128 "Client-side rules"), as pure functions.
 */

/** How far back a Temperature or dose still joins an Illness: 48 hours. */
const JOIN_WINDOW_MS = 48 * 60 * 60 * 1000;

/** When the event happened: its date at its time, or at 00:00 of the day when it has none. */
export function eventMoment(event: IllnessEvent): Date {
  return localMoment(event.date, event.time ?? '00:00');
}

/** The moment of the Illness's latest event; `undefined` when it has none. */
export function latestEventMoment(events: readonly IllnessEvent[]): Date | undefined {
  let latest: Date | undefined;
  for (const event of events) {
    const moment = eventMoment(event);
    if (latest === undefined || moment > latest) latest = moment;
  }
  return latest;
}

/**
 * The Illness a new Temperature or dose joins: of the person's Illnesses that aren't Ended, the
 * one with the latest event, when that event is at or after `now` − 48 h. `undefined`: none, so it
 * starts a new Illness. Conditions are never picked.
 */
export function illnessToJoin(
  illnesses: readonly Illness[],
  eventsOf: (illnessId: string) => readonly IllnessEvent[],
  now: Date,
): Illness | undefined {
  let found: { illness: Illness; latest: Date } | undefined;
  for (const illness of illnesses) {
    if (illness.kind !== 'ILLNESS' || illness.ended === true) continue;
    const latest = latestEventMoment(eventsOf(illness.id));
    if (latest === undefined || now.getTime() - latest.getTime() > JOIN_WINDOW_MS) continue;
    if (found === undefined || latest > found.latest) found = { illness, latest };
  }
  return found?.illness;
}

/**
 * Illnesses by their latest event, newest first; one without events by when it was created (one
 * made here, not pulled back yet, counts as created now).
 */
export function illnessesInOrder(
  illnesses: readonly Illness[],
  eventsOf: (illnessId: string) => readonly IllnessEvent[],
  now: Date,
): Illness[] {
  const moment = (illness: Illness) =>
    (
      latestEventMoment(eventsOf(illness.id)) ??
      (illness.createdAt === undefined ? now : new Date(illness.createdAt))
    ).getTime();
  return [...illnesses].sort((a, b) => moment(b) - moment(a) || (a.id < b.id ? -1 : 1));
}

/** Events by date, newest first; within a day, timed ones (latest first) before untimed ones. */
export function eventsInOrder(events: readonly IllnessEvent[]): IllnessEvent[] {
  return [...events].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const aTime = a.time ?? '';
    const bTime = b.time ?? '';
    if (aTime !== bTime) return aTime < bTime ? 1 : -1;
    return a.id < b.id ? -1 : 1;
  });
}

/** The first day of the Illness: its earliest event's date; `undefined` without events. */
export function firstDay(events: readonly IllnessEvent[]): string | undefined {
  let first: string | undefined;
  for (const { date } of events) {
    if (first === undefined || date < first) first = date;
  }
  return first;
}

const ONE_DECIMAL = new Intl.NumberFormat('ru', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** «38,5 °C». */
export function formatTemperature(t: TFunction, temperature: number): string {
  return t('medical.temperatureValue', { value: ONE_DECIMAL.format(temperature) });
}

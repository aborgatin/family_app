import type { TFunction } from 'i18next';
import { localMoment } from '@/shared/dates';
import { byId } from '@/shared/sync';
import type { Illness, IllnessEvent } from './medicalTypes';

/*
 * The Medical card's rules (spec #128 "Client-side rules"), as pure functions.
 */

/** Whether the Illness or Condition takes an event of this kind: a Condition holds Notes only. */
export function takesEvent(illness: Illness, kind: IllnessEvent['kind']): boolean {
  return illness.kind === 'ILLNESS' || kind === 'NOTE';
}

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
  return [...illnesses].sort((a, b) => moment(b) - moment(a) || byId(a, b));
}

/** Conditions by `position` (one without, last), ties by id. */
export function conditionsInOrder(conditions: readonly Illness[]): Illness[] {
  const position = (condition: Illness) => condition.position ?? Number.POSITIVE_INFINITY;
  return [...conditions].sort((a, b) =>
    position(a) === position(b) ? byId(a, b) : position(a) - position(b),
  );
}

/**
 * The positions of Conditions in order (`conditionsInOrder`), for `positionAfterMove`: one without
 * a position (it sorts last) counts as one past the one before it, so the numbers keep the order.
 */
export function positionsOf(conditions: readonly Illness[]): number[] {
  const positions: number[] = [];
  for (const { position } of conditions) {
    positions.push(position ?? (positions.at(-1) ?? 0) + 1);
  }
  return positions;
}

/** Events by date, newest first; within a day, timed ones (latest first) before untimed ones. */
export function eventsInOrder(events: readonly IllnessEvent[]): IllnessEvent[] {
  return [...events].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const aTime = a.time ?? '';
    const bTime = b.time ?? '';
    if (aTime !== bTime) return aTime < bTime ? 1 : -1;
    return byId(a, b);
  });
}

/**
 * The amount to prefill for a dose of `medicineId`: that of the latest of `events` (a person's)
 * dosing it, by its own date and time (none counts as 00:00), so a dose logged later for an earlier
 * time doesn't change it; on a tie the higher Version wins, and one not pulled back yet is the
 * newest. `undefined` when there is none.
 */
export function lastAmount(
  events: readonly IllnessEvent[],
  medicineId: string,
): string | undefined {
  let latest: { event: IllnessEvent; moment: number; version: number } | undefined;
  for (const event of events) {
    if (event.kind !== 'MEDICINE_DOSE' || event.medicineId !== medicineId) continue;
    const moment = eventMoment(event).getTime();
    const version = event.version ?? Number.POSITIVE_INFINITY;
    if (
      latest === undefined ||
      moment > latest.moment ||
      (moment === latest.moment && version > latest.version)
    ) {
      latest = { event, moment, version };
    }
  }
  return latest?.event.amount ?? undefined;
}

/** The day of the latest event: its date; `undefined` without events. */
export function lastDay(events: readonly IllnessEvent[]): string | undefined {
  let last: string | undefined;
  for (const { date } of events) {
    if (last === undefined || date > last) last = date;
  }
  return last;
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

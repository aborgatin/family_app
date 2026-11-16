import { useCallback, useMemo } from 'react';
import { upsertRows, useRows, type SyncedTable } from '@/shared/sync';
import { illnessesInOrder } from './illnessRules';
import { isOn, type Illness, type IllnessEvent, type Person } from './medicalTypes';

/** A Temperature as the sheet saves it. */
export interface TemperatureDetails {
  /** °C, one decimal place. */
  temperature: number;
  /** `YYYY-MM-DD`. */
  date: string;
  /** `HH:MM`, or `null` for none. */
  time: string | null;
  description: string | null;
}

/** Where a new event goes: an existing Illness, or a new one with this name. */
export type EventTarget = { illnessId: string } | { newIllnessName: string };

const NO_EVENTS: readonly IllnessEvent[] = [];

/**
 * One person's Medical card on the local store: the only data access of this feature. It reads
 * the local store and writes through the Outbox (S4), so it works the same offline.
 *
 * - `illnesses`: the card's Illnesses (kind ILLNESS) in order (`illnessesInOrder`), `undefined`
 *   until the first local read;
 * - `eventsOf(illnessId)`: the Illness's events, unordered;
 * - `logTemperature(target, details)`: adds a Temperature to an Illness, or creates the Illness
 *   and the event in one Outbox batch.
 */
export function useMedicalCard(person: Person) {
  const illnessRows = useRows('illness') as Illness[] | undefined;
  const eventRows = useRows('illness_event') as IllnessEvent[] | undefined;

  const eventsByIllness = useMemo(() => {
    const byIllness = new Map<string, IllnessEvent[]>();
    for (const event of eventRows ?? []) {
      const events = byIllness.get(event.illnessId) ?? [];
      events.push(event);
      byIllness.set(event.illnessId, events);
    }
    return byIllness;
  }, [eventRows]);

  const eventsOf = useCallback(
    (illnessId: string) => eventsByIllness.get(illnessId) ?? NO_EVENTS,
    [eventsByIllness],
  );

  const illnesses = useMemo(
    () =>
      illnessRows === undefined || eventRows === undefined
        ? undefined
        : illnessesInOrder(
            illnessRows.filter((illness) => illness.kind === 'ILLNESS' && isOn(person, illness)),
            eventsOf,
            new Date(),
          ),
    [illnessRows, eventRows, eventsOf, person],
  );

  const logTemperature = useCallback(
    async (target: EventTarget, details: TemperatureDetails) => {
      const writes: { table: SyncedTable; id: string; fields: Record<string, unknown> }[] = [];
      let illnessId: string;
      if ('illnessId' in target) {
        illnessId = target.illnessId;
      } else {
        illnessId = crypto.randomUUID();
        writes.push({
          table: 'illness',
          id: illnessId,
          fields: { ...person, kind: 'ILLNESS', name: target.newIllnessName },
        });
      }
      writes.push({
        table: 'illness_event',
        id: crypto.randomUUID(),
        fields: { illnessId, kind: 'TEMPERATURE', ...details },
      });
      await upsertRows(writes);
    },
    [person],
  );

  return { illnesses, eventsOf, logTemperature };
}

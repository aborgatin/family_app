import { useCallback, useMemo } from 'react';
import { upsertRows, useRows, type SyncedTable } from '@/shared/sync';
import { illnessesInOrder, lastAmount } from './illnessRules';
import { isOn, type Illness, type IllnessEvent, type Person } from './medicalTypes';

/** When an event happened, and its Description, as every event sheet saves them. */
export interface EventTiming {
  /** `YYYY-MM-DD`. */
  date: string;
  /** `HH:MM`, or `null` for none. */
  time: string | null;
  description: string | null;
}

/** A Temperature as the sheet saves it. */
export interface TemperatureDetails extends EventTiming {
  /** °C, one decimal place. */
  temperature: number;
}

/** The Medicine of a dose: one of the list, or a new one typed in the picker. */
export type MedicineChoice = { medicineId: string } | { newMedicineName: string };

/** A Medicine dose as the sheet saves it. */
export interface DoseDetails extends EventTiming {
  medicine: MedicineChoice;
  /** As written: «5 мл». */
  amount: string;
  /** °C, one decimal place, or `null` when not taken. */
  temperature: number | null;
}

/** The Illness a new event goes to: an existing one, or a new one with this name. */
export type IllnessChoice = { illnessId: string } | { newIllnessName: string };

const NO_EVENTS: readonly IllnessEvent[] = [];

interface Write {
  table: SyncedTable;
  id: string;
  fields: Record<string, unknown>;
}

/**
 * One person's Medical card on the local store: the only data access of this feature. It reads
 * the local store and writes through the Outbox (S4), so it works the same offline.
 *
 * - `illnesses`: the card's Illnesses (kind ILLNESS) in order (`illnessesInOrder`), `undefined`
 *   until the first local read;
 * - `eventsOf(illnessId)`: the Illness's events, unordered;
 * - `lastAmountOf(medicineId)`: the amount to prefill for a dose of it (`lastAmount` over every
 *   event on the card); `undefined` the first time;
 * - `logTemperature(target, details)`, `logDose(target, details)`: add the event to an Illness,
 *   or create the Illness and the event in one Outbox batch; a dose of a Medicine typed in the
 *   picker adds the Medicine first, in the same batch.
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

  const cardEvents = useMemo(
    () =>
      (illnessRows ?? [])
        .filter((illness) => isOn(person, illness))
        .flatMap((illness) => eventsOf(illness.id)),
    [illnessRows, eventsOf, person],
  );

  const lastAmountOf = useCallback(
    (medicineId: string) => lastAmount(cardEvents, medicineId),
    [cardEvents],
  );

  /** Writes the event, after the rows it needs first, in one Outbox batch. */
  const log = useCallback(
    async (target: IllnessChoice, event: Record<string, unknown>, first: readonly Write[] = []) => {
      const writes = [...first];
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
        fields: { illnessId, ...event },
      });
      await upsertRows(writes);
    },
    [person],
  );

  const logTemperature = useCallback(
    (target: IllnessChoice, details: TemperatureDetails) =>
      log(target, { kind: 'TEMPERATURE', ...details }),
    [log],
  );

  const logDose = useCallback(
    (target: IllnessChoice, { medicine, ...details }: DoseDetails) => {
      if ('medicineId' in medicine) {
        return log(target, { kind: 'MEDICINE_DOSE', medicineId: medicine.medicineId, ...details });
      }
      const medicineId = crypto.randomUUID();
      return log(target, { kind: 'MEDICINE_DOSE', medicineId, ...details }, [
        { table: 'medicine', id: medicineId, fields: { name: medicine.newMedicineName } },
      ]);
    },
    [log],
  );

  return { illnesses, eventsOf, lastAmountOf, logTemperature, logDose };
}

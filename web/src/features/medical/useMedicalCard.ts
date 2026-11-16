import { useCallback, useMemo } from 'react';
import { deleteRow, upsertRow, upsertRows, useRows, type SyncedTable } from '@/shared/sync';
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

/** A Note as the sheet saves it. */
export interface NoteEventDetails extends EventTiming {
  /** «Сходили к доктору». */
  title: string;
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

/** Where an event is saved: its Illness, and `eventId` when an existing event is edited. */
export type EventPlace = IllnessChoice & { eventId?: string };

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
 * - `saveTemperature(place, details)`, `saveDose(place, details)`, `saveNoteEvent(place,
 *   details)`: add the event to an Illness, or create the Illness and the event in one Outbox
 *   batch; a dose of a Medicine typed in the picker adds the Medicine first, in the same batch.
 *   With the place's `eventId`, they change that event instead: only the fields that differ are
 *   written and sent (`upsertRows`);
 * - `rename(illness, name)`, `describe(illness, description)` (both trimmed, a blank Description
 *   is none): resolve with the value as saved; `removeIllness(illness)`: deletes it with its events;
 *   `removeEvent(event)`.
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
  const saveEvent = useCallback(
    async (
      { eventId = crypto.randomUUID(), ...target }: EventPlace,
      event: Record<string, unknown>,
      first: readonly Write[] = [],
    ) => {
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
        id: eventId,
        fields: { illnessId, ...event },
      });
      await upsertRows(writes);
    },
    [person],
  );

  const saveTemperature = useCallback(
    (place: EventPlace, details: TemperatureDetails) =>
      saveEvent(place, { kind: 'TEMPERATURE', ...details }),
    [saveEvent],
  );

  const saveNoteEvent = useCallback(
    (place: EventPlace, details: NoteEventDetails) =>
      saveEvent(place, { kind: 'NOTE', ...details }),
    [saveEvent],
  );

  const saveDose = useCallback(
    (place: EventPlace, { medicine, ...details }: DoseDetails) => {
      if ('medicineId' in medicine) {
        return saveEvent(place, {
          kind: 'MEDICINE_DOSE',
          medicineId: medicine.medicineId,
          ...details,
        });
      }
      const medicineId = crypto.randomUUID();
      return saveEvent(place, { kind: 'MEDICINE_DOSE', medicineId, ...details }, [
        { table: 'medicine', id: medicineId, fields: { name: medicine.newMedicineName } },
      ]);
    },
    [saveEvent],
  );

  const removeEvent = useCallback(
    (event: IllnessEvent) => deleteRow('illness_event', event.id),
    [],
  );

  const rename = useCallback(async (illness: Illness, name: string) => {
    const text = name.trim();
    await upsertRow('illness', illness.id, { name: text });
    return text;
  }, []);

  const describe = useCallback(async (illness: Illness, description: string) => {
    const text = description.trim();
    await upsertRow('illness', illness.id, { description: text === '' ? null : text });
    return text;
  }, []);

  const removeIllness = useCallback((illness: Illness) => deleteRow('illness', illness.id), []);

  return {
    illnesses,
    eventsOf,
    lastAmountOf,
    saveTemperature,
    saveDose,
    saveNoteEvent,
    rename,
    describe,
    removeIllness,
    removeEvent,
  };
}

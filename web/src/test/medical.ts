import { fixtureId } from './fixtures';

/*
 * Medical card rows as the sync pull returns them (spec #128), for `syncServer.seed`: Illnesses,
 * their Temperatures, Medicine doses and Notes, and the Family's Medicines. Each gets a fresh id.
 */

let seeded = 0;
function nextId() {
  seeded += 1;
  return fixtureId('ed1c0000', seeded);
}

/** An Illness on the card of `person` (`{ memberId }` or `{ childId }`). */
export function illnessRow(
  person: { memberId: string } | { childId: string },
  name: string,
  createdAt = '2026-11-01T10:00:00Z',
) {
  return {
    id: nextId(),
    memberId: null as string | null,
    childId: null as string | null,
    ...person,
    kind: 'ILLNESS',
    name,
    description: null,
    ended: false,
    position: null,
    createdAt,
  };
}

function eventRow(
  illness: { id: string },
  date: string,
  time: string | null,
  fields: {
    kind: string;
    medicineId?: string;
    amount?: string;
    temperature: number | null;
    title?: string;
  },
) {
  return {
    id: nextId(),
    illnessId: illness.id,
    date,
    time,
    medicineId: null as string | null,
    amount: null as string | null,
    title: null as string | null,
    ...fields,
    description: null as string | null,
  };
}

/** A Temperature in an Illness. */
export function temperatureRow(
  illness: { id: string },
  date: string,
  time: string | null,
  temperature: number,
) {
  return eventRow(illness, date, time, { kind: 'TEMPERATURE', temperature });
}

/** A Medicine dose in an Illness. */
export function doseRow(
  illness: { id: string },
  medicine: { id: string },
  amount: string,
  date: string,
  time: string | null,
  temperature: number | null = null,
) {
  return eventRow(illness, date, time, {
    kind: 'MEDICINE_DOSE',
    medicineId: medicine.id,
    amount,
    temperature,
  });
}

/** A Note event («Сходили к доктору») in an Illness. */
export function noteRow(
  illness: { id: string },
  date: string,
  time: string | null,
  title: string,
) {
  return eventRow(illness, date, time, { kind: 'NOTE', temperature: null, title });
}

/** A Medicine of the Family's list. */
export function medicineRow(name: string, deleted = false) {
  return { id: nextId(), name, deleted };
}

/** The text of a wheel's (a native select's) chosen option. */
export function selectedText(select: HTMLElement) {
  return (select as HTMLSelectElement).selectedOptions[0]?.textContent;
}

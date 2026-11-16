/** Whose Medical card: a Member's own, or a Child's. */
export type Person = { memberId: string; childId?: never } | { childId: string; memberId?: never };

/** An Illness or Condition as the sync pull returns its fields (`illness`). */
export interface Illness {
  id: string;
  /** The person: exactly one of these two is set. */
  memberId?: string | null;
  childId?: string | null;
  kind: 'ILLNESS' | 'CONDITION';
  name: string;
  description?: string | null;
  ended?: boolean;
  position?: number | null;
  /** Set by the server; absent on one made here until the pull brings it back. */
  createdAt?: string;
}

/** An Illness event as the sync pull returns its fields (`illness_event`). */
export interface IllnessEvent {
  id: string;
  illnessId: string;
  kind: 'MEDICINE_DOSE' | 'TEMPERATURE' | 'NOTE';
  /** `YYYY-MM-DD`, as written. */
  date: string;
  /** `HH:MM`, as written, or none. */
  time?: string | null;
  /** °C, one decimal place: a Temperature's, or optional on a Medicine dose. */
  temperature?: number | null;
  /** A Medicine dose's Medicine and how much was given («5 мл»). */
  medicineId?: string | null;
  amount?: string | null;
  /** A Note's title («Сходили к доктору»). */
  title?: string | null;
  description?: string | null;
  /** The Version the pull brought it with; absent on one made here until the pull brings it. */
  version?: number;
}

/** A Medicine as the sync pull returns its fields (`medicine`): deleted ones too, marked. */
export interface Medicine {
  id: string;
  name: string;
  /** Deleted: left out of the list and the picker, but past doses still show its name. */
  deleted?: boolean;
}

/**
 * A Document as the sync pull returns its fields (`document`): never the file itself, which is
 * downloaded when opened.
 */
export interface MedicalDocument {
  id: string;
  /** The person: exactly one of these two is set. */
  memberId?: string | null;
  childId?: string | null;
  /** The Illness event it was added to, if any. */
  illnessEventId?: string | null;
  title: string;
  /** `YYYY-MM-DD`: the day the document is from. */
  date: string;
  description?: string | null;
  /** What the server found the file to be: `application/pdf`, `image/jpeg`, … */
  contentType: string;
  /** The file's size in bytes. */
  size: number;
}

/** Whether the row (an Illness, a Document) is on `person`'s card. */
export function isOn(
  person: Person,
  row: { memberId?: string | null; childId?: string | null },
): boolean {
  return person.childId !== undefined
    ? row.childId === person.childId
    : row.memberId === person.memberId;
}

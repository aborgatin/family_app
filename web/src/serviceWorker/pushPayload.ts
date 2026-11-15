// The push payload contract (spec #104 "Payload: codes, not texts"): the server sends codes and
// parameters, never texts, and the service worker builds the Russian text from the ru i18n file.
// The backend's payload must keep this shape; frontend.md "PWA" documents it.

/** The List kinds and Grammatical genders a payload names, as the backend writes them. */
const LIST_KINDS = ['SHOPPING', 'TODO', 'WISH'] as const;
const GRAMMATICAL_GENDERS = ['MASCULINE', 'FEMININE'] as const;

/** A Notification: one Batch of changes by one Member to one List, for one recipient. */
export interface NotificationPayload {
  type: 'notification';
  /** The acting Member's name. */
  actorName: string;
  /** The acting Member's Grammatical gender; `null` when not set (the neutral wording). */
  actorGrammaticalGender: (typeof GRAMMATICAL_GENDERS)[number] | null;
  listName: string;
  listKind: (typeof LIST_KINDS)[number];
  /** The added Items' names, in the order added (at least the first three). */
  itemNames: string[];
  /** How many Items were added, in all. */
  addedCount: number;
  /** How many Items were assigned to the recipient. */
  assignedCount: number;
  /** The assigned Item's name when exactly one was assigned, else `null`. */
  assignedItemName: string | null;
  /** The screen a tap opens: `/lists/:id` or `/lists/:id/items/:itemId`. */
  url: string;
}

/** A Reminder: a todo item's Due date has come. */
export interface ReminderPayload {
  type: 'reminder';
  itemName: string;
  listName: string;
  /** The Due date, `YYYY-MM-DD`. */
  dueDate: string;
  /** The Due date's time, `HH:mm`, or `null` without one. */
  dueTime: string | null;
  /** The screen a tap opens: `/lists/:id/items/:itemId`. */
  url: string;
}

export type PushPayload = NotificationPayload | ReminderPayload;

/** The payload in the push data (JSON text), or `undefined` when it isn't one this worker reads. */
export function parsePushPayload(data: string | undefined): PushPayload | undefined {
  if (data === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return undefined;
  }
  return isNotification(value) || isReminder(value) ? value : undefined;
}

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null;
const isString = (value: unknown) => typeof value === 'string';
const isStringOrNull = (value: unknown) => value === null || isString(value);
const isCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;
const isOneOf = (choices: readonly unknown[], value: unknown) => choices.includes(value);

function isNotification(value: unknown): value is NotificationPayload {
  return (
    isFields(value) &&
    value.type === 'notification' &&
    [value.url, value.actorName, value.listName].every(isString) &&
    [value.addedCount, value.assignedCount].every(isCount) &&
    isStringOrNull(value.assignedItemName) &&
    (value.actorGrammaticalGender === null ||
      isOneOf(GRAMMATICAL_GENDERS, value.actorGrammaticalGender)) &&
    isOneOf(LIST_KINDS, value.listKind) &&
    Array.isArray(value.itemNames) &&
    value.itemNames.every(isString)
  );
}

function isReminder(value: unknown): value is ReminderPayload {
  return (
    isFields(value) &&
    value.type === 'reminder' &&
    [value.url, value.itemName, value.listName, value.dueDate].every(isString) &&
    isStringOrNull(value.dueTime)
  );
}

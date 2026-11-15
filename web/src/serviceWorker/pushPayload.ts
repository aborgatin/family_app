// The push payload contract (spec #104 "Payload: codes, not texts"): the server sends codes and
// parameters, never texts, and the service worker builds the Russian text from the ru i18n file.
// The backend's payload must keep this shape; frontend.md "PWA" documents it.

/** A Notification: one Batch of changes by one Member to one List, for one recipient. */
export interface NotificationPayload {
  type: 'notification';
  /** The acting Member's name. */
  actorName: string;
  /** The acting Member's Grammatical gender; `null` when not set (the neutral wording). */
  actorGrammaticalGender: 'MASCULINE' | 'FEMININE' | null;
  listName: string;
  listKind: 'SHOPPING' | 'TODO' | 'WISH';
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
  if (typeof value !== 'object' || value === null) return undefined;
  const fields = value as Record<string, unknown>;
  const isString = (key: string) => typeof fields[key] === 'string';
  const isStringOrNull = (key: string) => fields[key] === null || isString(key);
  const isCount = (key: string) => Number.isInteger(fields[key]) && (fields[key] as number) >= 0;

  if (!isString('url')) return undefined;
  if (fields.type === 'notification') {
    const readable =
      ['actorName', 'listName'].every(isString) &&
      ['addedCount', 'assignedCount'].every(isCount) &&
      isStringOrNull('assignedItemName') &&
      [null, 'MASCULINE', 'FEMININE'].includes(fields.actorGrammaticalGender as string | null) &&
      ['SHOPPING', 'TODO', 'WISH'].includes(fields.listKind as string) &&
      Array.isArray(fields.itemNames) &&
      fields.itemNames.every((name) => typeof name === 'string');
    return readable ? (fields as unknown as NotificationPayload) : undefined;
  }
  if (fields.type === 'reminder') {
    const readable =
      ['itemName', 'listName', 'dueDate'].every(isString) && isStringOrNull('dueTime');
    return readable ? (fields as unknown as ReminderPayload) : undefined;
  }
  return undefined;
}

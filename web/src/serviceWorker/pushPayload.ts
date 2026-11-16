// The push payload contract (spec #104 "Payload: codes, not texts"): the server sends codes and
// parameters, never texts, and the service worker builds the Russian text from the ru i18n file.
// The one deliberate exception is an Announcement (spec #120): hand-written text with nothing to
// compose, sent as finished text so any worker that knows the type shows it as written. A dose
// Notification (spec #128) names the Member and the Child, never the Medicine or the amount.
// The backend's payload must keep this shape (`PushPayloads`); frontend.md "PWA" documents it.

/** The List kinds and Grammatical genders a payload names, as the backend writes them. */
const LIST_KINDS = ['SHOPPING', 'TODO', 'WISH'] as const;
const GRAMMATICAL_GENDERS = ['MASCULINE', 'FEMININE'] as const;

/** A Notification: one Batch of changes by one Member to one List, for one recipient. */
export interface NotificationPayload {
  type: 'notification';
  /** The acting Member's name. */
  actorName: string;
  /**
   * The acting Member's Grammatical gender; the server always sends it. `null` is still read (the
   * neutral wording), defensively.
   */
  actorGrammaticalGender: (typeof GRAMMATICAL_GENDERS)[number] | null;
  listName: string;
  listKind: (typeof LIST_KINDS)[number];
  /** The first three added Items' names (fewer when fewer were added), in the order added. */
  itemNames: string[];
  /** How many Items were added, in all. */
  addedCount: number;
  /** How many Items were assigned to the recipient. */
  assignedCount: number;
  /** The assigned Item's name when exactly one was assigned, else `null`. */
  assignedItemName: string | null;
  /** The screen a tap opens: the List's, `/lists/:id`. */
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

/**
 * An Announcement («Что нового», spec #120): an entry of the server's catalog, its title and body
 * shown exactly as written (the exception to "codes, not texts").
 */
export interface AnnouncementPayload {
  type: 'announcement';
  title: string;
  body: string;
  /** The screen a tap opens; the server sends `/` when the entry names none. */
  url: string;
}

/**
 * A dose Notification (spec #128): another Member logged a Medicine dose on a Child's Medical card.
 * It names no Medicine and no amount, so a lock screen shows nothing medical.
 */
export interface DosePayload {
  type: 'dose';
  /** The Member who logged the dose. */
  actorName: string;
  /** As in a Notification: always sent; `null` is still read (the neutral wording). */
  actorGrammaticalGender: (typeof GRAMMATICAL_GENDERS)[number] | null;
  childName: string;
  /** The screen a tap opens: the Illness, `/children/:id/medical/illnesses/:illnessId`. */
  url: string;
}

export type PushPayload =
  | NotificationPayload
  | ReminderPayload
  | AnnouncementPayload
  | DosePayload;

/** The payload in the push data (JSON text), or `undefined` when it isn't one this worker reads. */
export function parsePushPayload(data: string | undefined): PushPayload | undefined {
  if (data === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return undefined;
  }
  return isNotification(value) || isReminder(value) || isAnnouncement(value) || isDose(value)
    ? value
    : undefined;
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

function isDose(value: unknown): value is DosePayload {
  return (
    isFields(value) &&
    value.type === 'dose' &&
    [value.actorName, value.childName, value.url].every(isString) &&
    (value.actorGrammaticalGender === null ||
      isOneOf(GRAMMATICAL_GENDERS, value.actorGrammaticalGender))
  );
}

function isAnnouncement(value: unknown): value is AnnouncementPayload {
  return (
    isFields(value) &&
    value.type === 'announcement' &&
    [value.title, value.body, value.url].every(isString)
  );
}

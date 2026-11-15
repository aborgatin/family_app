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

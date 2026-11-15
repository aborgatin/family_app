import { createInstance } from 'i18next';
import { daysFromToday, localDay, shortDay } from '@/shared/dates';
import ru from '@/shared/i18n/locales/ru.json';
import {
  parsePushPayload,
  type NotificationPayload,
  type PushPayload,
  type ReminderPayload,
} from './pushPayload';

// The text a push shows, built from the payload's codes and parameters with the app's ru i18n
// file and its plurals and gendered verbs (spec #104 "UI and Copy"). Pure: no worker globals, so
// it is tested without a worker.

// The worker's own i18next instance: the app's `@/shared/i18n` also loads react-i18next.
const i18n = createInstance();
void i18n.init({
  lng: 'ru',
  fallbackLng: 'ru',
  resources: { ru: { translation: ru } },
  initAsync: false,
  interpolation: { escapeValue: false },
});
const t = i18n.t;

/** What a push shows and where a tap on it goes. */
export interface PushMessage {
  title: string;
  body: string;
  url: string;
}

/**
 * What to show for a push's data (JSON text), at the device's `now`. Data that can't be read still
 * gives a notification, «Семья» opening `/`: iOS revokes the subscription of a worker that shows
 * none.
 */
export function readPushMessage(data: string | undefined, now: Date): PushMessage {
  const payload = parsePushPayload(data);
  return payload === undefined
    ? { title: t('app.name'), body: '', url: '/' }
    : pushMessage(payload, now);
}

/** The title, body and URL of the notification shown for `payload`, at the device's `now`. */
function pushMessage(payload: PushPayload, now: Date): PushMessage {
  if (payload.type === 'notification') {
    return { title: payload.listName, body: notificationBody(payload), url: payload.url };
  }
  return { title: payload.itemName, body: reminderBody(payload, now), url: payload.url };
}

/**
 * «Дом · сегодня в 18:00», «Дом · сегодня» without a time; a Reminder that comes late (after the
 * server was down) says «вчера» once the device's day has moved on.
 */
function reminderBody(payload: ReminderPayload, now: Date): string {
  const days = daysFromToday(payload.dueDate, now);
  const dayText =
    days === 0
      ? t('push.today')
      : days === -1
        ? t('push.yesterday')
        : shortDay(localDay(payload.dueDate), now);
  const due =
    payload.dueTime === null
      ? dayText
      : t('push.dayAndTime', { day: dayText, time: payload.dueTime });
  return t('push.reminder', { list: payload.listName, due });
}

/**
 * «Даша добавила «Молоко»», «… 7 товаров: Молоко, Хлеб, Сыр…», «… 3 задачи, 1 — вам»; with no
 * additions, «Даша назначила вам «Купить подарок»» or «… 2 задачи».
 */
function notificationBody(payload: NotificationPayload): string {
  const actor = payload.actorName;
  const context = payload.actorGrammaticalGender?.toLowerCase();
  const counted = (count: number) => t(`push.count.${payload.listKind}`, { count });

  if (payload.addedCount === 0) {
    const items =
      payload.assignedCount === 1 && payload.assignedItemName !== null
        ? t('push.quoted', { name: payload.assignedItemName })
        : counted(payload.assignedCount);
    return t('push.assigned', { actor, items, context });
  }

  // The server decides how many Items are named (the first three): when it named them all, they
  // are quoted; otherwise they are counted, naming the ones sent.
  const names = payload.itemNames;
  let items: string;
  if (payload.assignedCount > 0) {
    items = t('push.toYou', { items: counted(payload.addedCount), count: payload.assignedCount });
  } else if (names.length === payload.addedCount) {
    items = names.map((name) => t('push.quoted', { name })).join(', ');
  } else {
    items = t('push.names', { items: counted(payload.addedCount), names: names.join(', ') });
  }
  return t('push.added', { actor, items, context });
}

import { createInstance } from 'i18next';
import ru from '@/shared/i18n/locales/ru.json';
import type { NotificationPayload, PushPayload } from './pushPayload';

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

/** The title, body and URL of the notification shown for `payload`, at the device's `now`. */
export function pushMessage(payload: PushPayload, now: Date): PushMessage {
  void now;
  if (payload.type === 'notification') {
    return { title: payload.listName, body: notificationBody(payload), url: payload.url };
  }
  return { title: payload.itemName, body: '', url: payload.url };
}

/** Up to this many added Items are named in quotes; more are counted, naming the first ones. */
const NAMED_ITEMS = 3;

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

  const names = payload.itemNames.slice(0, NAMED_ITEMS);
  let items: string;
  if (payload.assignedCount > 0) {
    items = t('push.toYou', { items: counted(payload.addedCount), count: payload.assignedCount });
  } else if (payload.addedCount <= NAMED_ITEMS) {
    items = names.map((name) => t('push.quoted', { name })).join(', ');
  } else {
    items = t('push.names', { items: counted(payload.addedCount), names: names.join(', ') });
  }
  return t('push.added', { actor, items, context });
}

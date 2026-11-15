import { describe, expect, it } from 'vitest';
import type { NotificationPayload, ReminderPayload } from './pushPayload';
import { pushMessage, readPushMessage } from './pushMessages';

// The text a push shows, built by the service worker from the payload's codes and parameters with
// the ru i18n file (spec #104 "UI and Copy").

const NOW = new Date(2026, 10, 15, 12, 0);

function notification(fields: Partial<NotificationPayload>): NotificationPayload {
  return {
    type: 'notification',
    actorName: 'Даша',
    actorGrammaticalGender: 'FEMININE',
    listName: 'Продукты',
    listKind: 'SHOPPING',
    itemNames: [],
    addedCount: 0,
    assignedCount: 0,
    assignedItemName: null,
    url: '/lists/l1',
    ...fields,
  };
}

describe('a Notification', () => {
  it('names the one Item added, under the List name', () => {
    const message = pushMessage(notification({ itemNames: ['Молоко'], addedCount: 1 }), NOW);

    expect(message).toEqual({
      title: 'Продукты',
      body: 'Даша добавила «Молоко»',
      url: '/lists/l1',
    });
  });

  it('names two or three Items added', () => {
    const two = notification({ itemNames: ['Молоко', 'Хлеб'], addedCount: 2 });
    const three = notification({ itemNames: ['Молоко', 'Хлеб', 'Сыр'], addedCount: 3 });

    expect(pushMessage(two, NOW).body).toBe('Даша добавила «Молоко», «Хлеб»');
    expect(pushMessage(three, NOW).body).toBe('Даша добавила «Молоко», «Хлеб», «Сыр»');
  });

  it('counts four or more Items added and names the first three', () => {
    const seven = notification({
      itemNames: ['Молоко', 'Хлеб', 'Сыр', 'Масло', 'Яйца', 'Чай', 'Соль'],
      addedCount: 7,
    });

    expect(pushMessage(seven, NOW).body).toBe('Даша добавила 7 товаров: Молоко, Хлеб, Сыр…');
  });

  // Every plural form of each List kind's noun: 21 (one), 4 (few), 5 (many).
  it.each([
    ['SHOPPING', 21, '21 товар'],
    ['SHOPPING', 4, '4 товара'],
    ['SHOPPING', 5, '5 товаров'],
    ['TODO', 21, '21 задачу'],
    ['TODO', 4, '4 задачи'],
    ['TODO', 5, '5 задач'],
    ['WISH', 21, '21 желание'],
    ['WISH', 4, '4 желания'],
    ['WISH', 5, '5 желаний'],
  ] as const)('counts the Items of a %s list: %i', (listKind, addedCount, counted) => {
    const payload = notification({ listKind, itemNames: ['А', 'Б', 'В'], addedCount });

    expect(pushMessage(payload, NOW).body).toBe(`Даша добавила ${counted}: А, Б, В…`);
  });

  it('follows the actor’s Grammatical gender, neutral when it isn’t set', () => {
    const added = { itemNames: ['Молоко'], addedCount: 1 };
    const boris = notification({ ...added, actorName: 'Боря', actorGrammaticalGender: 'MASCULINE' });
    const unset = notification({ ...added, actorName: 'Саша', actorGrammaticalGender: null });

    expect(pushMessage(boris, NOW).body).toBe('Боря добавил «Молоко»');
    expect(pushMessage(unset, NOW).body).toBe('Саша добавил(а) «Молоко»');
  });

  it('counts the Items added and how many of them are the recipient’s', () => {
    const payload = notification({
      listKind: 'TODO',
      itemNames: ['Позвонить', 'Купить подарок', 'Забрать посылку'],
      addedCount: 3,
      assignedCount: 1,
      assignedItemName: 'Купить подарок',
    });

    expect(pushMessage(payload, NOW).body).toBe('Даша добавила 3 задачи, 1 — вам');
  });

  it('names the one Item assigned to the recipient', () => {
    const payload = notification({
      listKind: 'TODO',
      assignedCount: 1,
      assignedItemName: 'Купить подарок',
    });

    expect(pushMessage(payload, NOW).body).toBe('Даша назначила вам «Купить подарок»');
  });

  it('counts several Items assigned to the recipient', () => {
    const boris = notification({
      actorName: 'Боря',
      actorGrammaticalGender: 'MASCULINE',
      listKind: 'TODO',
      assignedCount: 2,
    });
    const unset = notification({
      actorName: 'Саша',
      actorGrammaticalGender: null,
      listKind: 'TODO',
      assignedCount: 5,
    });

    expect(pushMessage(boris, NOW).body).toBe('Боря назначил вам 2 задачи');
    expect(pushMessage(unset, NOW).body).toBe('Саша назначил(а) вам 5 задач');
  });
});

describe('a Reminder', () => {
  function reminder(fields: Partial<ReminderPayload>): ReminderPayload {
    return {
      type: 'reminder',
      itemName: 'Оплатить свет',
      listName: 'Дом',
      dueDate: '2026-11-15',
      dueTime: '18:00',
      url: '/lists/l2/items/i9',
      ...fields,
    };
  }

  it('says when the Item is due today, under the Item name', () => {
    expect(pushMessage(reminder({}), NOW)).toEqual({
      title: 'Оплатить свет',
      body: 'Дом · сегодня в 18:00',
      url: '/lists/l2/items/i9',
    });
  });

  it('says only the day without a time', () => {
    expect(pushMessage(reminder({ dueTime: null }), NOW).body).toBe('Дом · сегодня');
  });

  it('says «вчера» when it comes late, after midnight', () => {
    const justAfterMidnight = new Date(2026, 10, 16, 0, 30);

    expect(pushMessage(reminder({}), justAfterMidnight).body).toBe('Дом · вчера в 18:00');
    expect(pushMessage(reminder({ dueTime: null }), justAfterMidnight).body).toBe('Дом · вчера');
  });

  it('still says «сегодня» when it comes late the same day', () => {
    const later = new Date(2026, 10, 15, 21, 0);

    expect(pushMessage(reminder({}), later).body).toBe('Дом · сегодня в 18:00');
  });

  it('names the day when the Due date is further back (a device clock ahead)', () => {
    const twoDaysOn = new Date(2026, 10, 17, 9, 0);

    expect(pushMessage(reminder({}), twoDaysOn).body).toBe('Дом · 15 нояб. в 18:00');
  });
});

describe('the push data as it arrives', () => {
  const GENERIC = { title: 'Семья', body: '', url: '/' };

  it('is read as its payload', () => {
    const data = JSON.stringify({
      type: 'reminder',
      itemName: 'Оплатить свет',
      listName: 'Дом',
      dueDate: '2026-11-15',
      dueTime: null,
      url: '/lists/l2/items/i9',
    });

    expect(readPushMessage(data, NOW)).toEqual({
      title: 'Оплатить свет',
      body: 'Дом · сегодня',
      url: '/lists/l2/items/i9',
    });
  });

  it('is read as its payload, a Notification too', () => {
    const data = JSON.stringify(
      notification({ itemNames: ['Молоко'], addedCount: 1, actorGrammaticalGender: null }),
    );

    expect(readPushMessage(data, NOW).body).toBe('Даша добавил(а) «Молоко»');
  });

  it.each([
    ['no data', undefined],
    ['not JSON', 'Молоко'],
    ['JSON that is not an object', '42'],
    ['an unknown type', JSON.stringify({ type: 'birthday', url: '/' })],
    ['a Notification missing its fields', JSON.stringify({ type: 'notification', url: '/' })],
    ['a Reminder missing its fields', JSON.stringify({ type: 'reminder', itemName: 'Чай' })],
  ])('that can’t be read (%s) still shows a «Семья» notification opening /', (_, data) => {
    expect(readPushMessage(data, NOW)).toEqual(GENERIC);
  });
});

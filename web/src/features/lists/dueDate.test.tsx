import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localStore } from '@/shared/sync/localStore';
import { anna, boris, masha, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// A todo item's Due date (spec #81, ticket #84): a day, optionally with a time of day, set on the
// Item screen («Срок», «Время»), shown on the Todo list's row under the name, red when overdue by
// the device clock, and ordering the open Items.

/** The device's clock: the afternoon of Tuesday 10 November 2026, local time. */
const NOW = new Date(2026, 10, 10, 15, 30);

/** A List row as the pull sends it. */
function list(n: number, name: string, kind: 'SHOPPING' | 'TODO' | 'WISH') {
  return {
    id: `1157a000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    name,
    kind,
    visibility: 'SHARED',
    ownerId: anna.id,
    createdAt: '2026-10-01T10:00:00Z',
  };
}

const chores = list(1, 'Дела по дому', 'TODO');
const groceries = list(2, 'Супермаркет', 'SHOPPING');
const gifts = list(3, 'Подарки', 'WISH');

/** An open Item row as the pull sends it, the `n`th added, with this Due date (none: no date). */
function item(
  n: number,
  text: string,
  dueDate: string | null = null,
  dueTime: string | null = null,
  listId = chores.id,
) {
  return {
    id: `17e40000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    listId,
    text,
    description: null as string | null,
    dueDate,
    dueTime,
    done: false,
    doneById: null as string | null,
    doneAt: null as string | null,
    creatorId: boris.id,
    createdAt: `2026-10-01T09:00:${String(n).padStart(2, '0')}Z`,
  };
}

/** `row`, marked Done by Анна today. */
function done<T extends object>(row: T) {
  return { ...row, done: true, doneById: anna.id, doneAt: new Date(2026, 10, 10, 9).toISOString() };
}

function itemPath(row: { id: string; listId: string }) {
  return `/lists/${row.listId}/items/${row.id}`;
}

/** What was pushed for Items, in order: each operation's fields. */
function pushed() {
  return syncServer.operations('item').map((operation) => operation.fields);
}

/** «Время» once it can be set: the Due date just typed has reached the local store. */
async function enabledTime() {
  const time = screen.getByLabelText('Время');
  await waitFor(() => {
    expect(time).toBeEnabled();
  });
  return time;
}

/** The connection is back: the app notices (browser `online` event) and sends what is waiting. */
function reconnect() {
  syncServer.goOnline();
  window.dispatchEvent(new Event('online'));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
  syncServer.seed('list', [chores, groceries, gifts]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('«Срок» and «Время» on the Item screen of a todo item', () => {
  it('saves a Due date without a time, then a time, each as its own field', async () => {
    const flowers = item(1, 'Полить цветы');
    syncServer.seed('item', [flowers]);
    const user = userEvent.setup();

    renderApp(itemPath(flowers));
    const due = await screen.findByLabelText('Срок');
    expect(due).toHaveValue('');
    expect(screen.getByLabelText('Время')).toBeDisabled();

    await user.type(due, '2026-11-15');
    await user.tab();

    await waitFor(() => {
      expect(pushed()).toEqual([{ dueDate: '2026-11-15' }]);
    });
    expect(syncServer.row('item', flowers.id)).toMatchObject({
      dueDate: '2026-11-15',
      dueTime: null,
    });

    const time = screen.getByLabelText('Время');
    expect(time).toBeEnabled();
    await user.type(time, '15:00');
    await user.tab();

    await waitFor(() => {
      expect(pushed()).toEqual([{ dueDate: '2026-11-15' }, { dueTime: '15:00' }]);
    });
    expect(screen.getByLabelText('Срок')).toHaveValue('2026-11-15');
    expect(screen.getByLabelText('Время')).toHaveValue('15:00');
  });

  it('removes the time with the Due date, and the time alone', async () => {
    const flowers = item(1, 'Полить цветы', '2026-11-15', '15:00');
    const certificate = item(2, 'Забрать справку', '2026-11-16', '09:30');
    syncServer.seed('item', [flowers, certificate]);
    const user = userEvent.setup();

    const first = renderApp(itemPath(flowers));
    expect(await screen.findByLabelText('Срок')).toHaveValue('2026-11-15');
    expect(screen.getByLabelText('Время')).toHaveValue('15:00');
    await user.click(screen.getByRole('button', { name: 'Очистить «Срок»' }));

    await waitFor(() => {
      expect(syncServer.row('item', flowers.id)).toMatchObject({ dueDate: null, dueTime: null });
    });
    expect(screen.getByLabelText('Срок')).toHaveValue('');
    expect(screen.getByLabelText('Время')).toHaveValue('');
    expect(screen.getByLabelText('Время')).toBeDisabled();
    first.unmount();

    renderApp(itemPath(certificate));
    expect(await screen.findByLabelText('Время')).toHaveValue('09:30');
    await user.click(screen.getByRole('button', { name: 'Очистить «Время»' }));

    await waitFor(() => {
      expect(syncServer.row('item', certificate.id)).toMatchObject({
        dueDate: '2026-11-16',
        dueTime: null,
      });
    });
    expect(syncServer.operations('item').at(-1)?.fields).toEqual({ dueTime: null });
    expect(screen.getByLabelText('Срок')).toHaveValue('2026-11-16');
    expect(screen.getByLabelText('Время')).toBeEnabled();
  });

  it('keeps a Due date set with no connection across a restart, and sends it on reconnect', async () => {
    const flowers = item(1, 'Полить цветы');
    syncServer.seed('item', [flowers]);
    const user = userEvent.setup();

    const first = renderApp(itemPath(flowers));
    const due = await screen.findByLabelText('Срок');
    syncServer.goOffline();
    await user.type(due, '2026-11-15');
    await user.tab();
    await user.type(await enabledTime(), '15:00');
    await user.tab();
    await waitFor(() => {
      expect(screen.getByLabelText('Время')).toHaveValue('15:00');
    });
    first.unmount();

    renderApp(itemPath(flowers));
    expect(await screen.findByLabelText('Срок')).toHaveValue('2026-11-15');
    expect(screen.getByLabelText('Время')).toHaveValue('15:00');
    expect(pushed()).toEqual([]);

    reconnect();

    await waitFor(() => {
      expect(syncServer.row('item', flowers.id)).toMatchObject({
        dueDate: '2026-11-15',
        dueTime: '15:00',
      });
    });
  });

  it('shows the other Member’s Due date while the screen is open', async () => {
    const flowers = item(1, 'Полить цветы');
    syncServer.seed('item', [flowers]);

    renderApp(itemPath(flowers));
    expect(await screen.findByLabelText('Срок')).toHaveValue('');
    syncServer.change('item', flowers.id, { dueDate: '2026-11-20', dueTime: '08:15' });
    window.dispatchEvent(new Event('online'));

    await waitFor(() => {
      expect(screen.getByLabelText('Срок')).toHaveValue('2026-11-20');
    });
    expect(screen.getByLabelText('Время')).toHaveValue('08:15');
  });

  it('shows them read-only on a Done item', async () => {
    const flowers = done(item(1, 'Полить цветы', '2026-11-15', '15:00'));
    const trash = done(item(2, 'Вынести мусор'));
    syncServer.seed('item', [flowers, trash]);

    const first = renderApp(itemPath(flowers));
    expect(await screen.findByText('Срок')).toBeInTheDocument();
    expect(screen.getByText('15 нояб.')).toBeInTheDocument();
    expect(screen.getByText('Время')).toBeInTheDocument();
    expect(screen.getByText('15:00')).toBeInTheDocument();
    expect(screen.queryByLabelText('Срок')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Время')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Очистить/ })).not.toBeInTheDocument();
    first.unmount();

    renderApp(itemPath(trash));
    expect(await screen.findByText('Срок')).toBeInTheDocument();
    expect(screen.getByText('Время')).toBeInTheDocument();
    // «Срок», «Время» and «Повтор».
    expect(screen.getAllByText('Нет')).toHaveLength(3);
    expect(screen.queryByLabelText('Срок')).not.toBeInTheDocument();
  });

  it('makes them editable again once the item is ticked back on', async () => {
    const flowers = done(item(1, 'Полить цветы', '2026-11-15'));
    syncServer.seed('item', [flowers]);
    const user = userEvent.setup();

    renderApp(itemPath(flowers));
    await user.click(await screen.findByRole('checkbox', { name: 'Выполнено «Полить цветы»' }));

    expect(await screen.findByLabelText('Срок')).toHaveValue('2026-11-15');
    expect(screen.getByLabelText('Время')).toBeEnabled();
  });

  it('works the same on a Child’s Todo list, whose row shows the Due date too', async () => {
    const school = { ...list(4, 'Школа', 'TODO'), childId: masha.id };
    const homework = item(1, 'Сделать поделку', null, null, school.id);
    syncServer.seed('child', [masha]);
    syncServer.seed('list', [school]);
    syncServer.seed('item', [homework]);
    const user = userEvent.setup();

    renderApp(itemPath(homework));
    await user.type(await screen.findByLabelText('Срок'), '2026-11-11');
    await user.tab();
    await user.type(await enabledTime(), '08:30');
    await user.tab();

    await waitFor(() => {
      expect(syncServer.row('item', homework.id)).toMatchObject({
        dueDate: '2026-11-11',
        dueTime: '08:30',
      });
    });
    await user.click(screen.getByRole('link', { name: 'Школа' }));
    expect(within(await openRow('Сделать поделку')).getByText('Завтра, 08:30')).toBeInTheDocument();
  });
});

describe('The Item screen of a shopping or wish item', () => {
  it('has no «Срок» or «Время»', async () => {
    const milk = item(1, 'Молоко', null, null, groceries.id);
    const lego = item(2, 'Лего', null, null, gifts.id);
    syncServer.seed('item', [milk, lego, done(item(3, 'Хлеб', null, null, groceries.id))]);

    const first = renderApp(itemPath(milk));
    expect(await screen.findByRole('textbox', { name: 'Название' })).toHaveValue('Молоко');
    expect(screen.queryByText('Срок')).not.toBeInTheDocument();
    expect(screen.queryByText('Время')).not.toBeInTheDocument();
    first.unmount();

    const second = renderApp(itemPath(lego));
    expect(await screen.findByRole('textbox', { name: 'Название' })).toHaveValue('Лего');
    expect(screen.queryByText('Срок')).not.toBeInTheDocument();
    expect(screen.queryByText('Время')).not.toBeInTheDocument();
    second.unmount();

    renderApp(itemPath(item(3, 'Хлеб', null, null, groceries.id)));
    expect(await screen.findByRole('textbox', { name: 'Название' })).toHaveValue('Хлеб');
    expect(screen.queryByText('Срок')).not.toBeInTheDocument();
  });
});

/** The row of the open todo item named `text`. */
async function openRow(text: string) {
  const field = await screen.findByRole('textbox', { name: `Задача «${text}»` });
  const row = field.closest<HTMLElement>('[role="listitem"]');
  if (row === null) throw new Error(`«${text}» is not in a row`);
  return row;
}

describe('A Todo list’s row', () => {
  it('shows the Due date under the name: «Сегодня», «Завтра», «Вчера» or the day, and the time', async () => {
    syncServer.seed('item', [
      item(1, 'Сегодня', '2026-11-10'),
      item(2, 'Завтра утром', '2026-11-11', '09:05'),
      item(3, 'Вчера', '2026-11-09'),
      item(4, 'В воскресенье', '2026-11-15', '15:00'),
      item(5, 'В январе', '2027-01-05'),
      item(6, 'В прошлом году', '2025-12-31', '23:59'),
      item(7, 'Послезавтра', '2026-11-12'),
      item(8, 'Когда-нибудь'),
    ]);

    renderApp(`/lists/${chores.id}`);

    expect(within(await openRow('Сегодня')).getByText('Сегодня')).toBeInTheDocument();
    expect(within(await openRow('Завтра утром')).getByText('Завтра, 09:05')).toBeInTheDocument();
    expect(within(await openRow('Вчера')).getByText('Вчера')).toBeInTheDocument();
    expect(within(await openRow('В воскресенье')).getByText('15 нояб., 15:00')).toBeInTheDocument();
    expect(within(await openRow('В январе')).getByText('5 янв. 2027 г.')).toBeInTheDocument();
    expect(
      within(await openRow('В прошлом году')).getByText('31 дек. 2025 г., 23:59'),
    ).toBeInTheDocument();
    expect(within(await openRow('Послезавтра')).getByText('12 нояб.')).toBeInTheDocument();
    expect((await openRow('Когда-нибудь')).textContent).toBe('');
  });

  it('keeps the Due date on the row while it is being edited, and on a Done row', async () => {
    syncServer.seed('item', [
      item(1, 'Полить цветы', '2026-11-15', '15:00'),
      done(item(2, 'Вынести мусор', '2026-11-08')),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${chores.id}`);
    const row = await openRow('Полить цветы');
    await user.click(within(row).getByRole('textbox', { name: 'Задача «Полить цветы»' }));

    expect(within(row).getByRole('link', { name: 'Подробнее' })).toBeInTheDocument();
    expect(within(row).getByText('15 нояб., 15:00')).toBeInTheDocument();
    const doneRegion = screen.getByRole('region', { name: 'Выполнено' });
    expect(within(doneRegion).getByText('8 нояб.')).toBeInTheDocument();
  });

  it('shows a Due date set on the Item screen once back on the list', async () => {
    const flowers = item(1, 'Полить цветы');
    syncServer.seed('item', [flowers]);
    const user = userEvent.setup();

    renderApp(itemPath(flowers));
    await user.type(await screen.findByLabelText('Срок'), '2026-11-11');
    await user.tab();
    await user.click(screen.getByRole('link', { name: 'Дела по дому' }));

    expect(within(await openRow('Полить цветы')).getByText('Завтра')).toBeInTheDocument();
  });

  it('shows an overdue Due date in red: date-only from the next day, with a time once it passes', async () => {
    syncServer.seed('item', [
      item(1, 'Вчера', '2026-11-09'),
      item(2, 'Вчера поздно', '2026-11-09', '23:59'),
      item(3, 'Сегодня', '2026-11-10'),
      item(4, 'Сегодня в три', '2026-11-10', '15:00'),
      item(5, 'Сегодня сейчас', '2026-11-10', '15:30'),
      item(6, 'Сегодня позже', '2026-11-10', '15:31'),
      item(7, 'Завтра ночью', '2026-11-11', '00:05'),
      item(8, 'Давно', '2026-10-01'),
      done(item(9, 'Сделано с опозданием', '2026-11-01')),
    ]);

    renderApp(`/lists/${chores.id}`);

    const overdue = async (text: string, line: string) =>
      within(await openRow(text))
        .getByText(line)
        .getAttribute('data-tone') === 'destructive';
    expect(await overdue('Вчера', 'Вчера')).toBe(true);
    expect(await overdue('Вчера поздно', 'Вчера, 23:59')).toBe(true);
    expect(await overdue('Сегодня', 'Сегодня')).toBe(false);
    expect(await overdue('Сегодня в три', 'Сегодня, 15:00')).toBe(true);
    expect(await overdue('Сегодня сейчас', 'Сегодня, 15:30')).toBe(false);
    expect(await overdue('Сегодня позже', 'Сегодня, 15:31')).toBe(false);
    expect(await overdue('Завтра ночью', 'Завтра, 00:05')).toBe(false);
    expect(await overdue('Давно', '1 окт.')).toBe(true);
    const doneRegion = screen.getByRole('region', { name: 'Выполнено' });
    expect(within(doneRegion).getByText('1 нояб.')).not.toHaveAttribute('data-tone');
  });
});

describe('A Due date the server rejects', () => {
  it('says why a time was not saved when the other Member removed the Due date meanwhile, and shows the server’s copy', async () => {
    const flowers = item(1, 'Полить цветы', '2026-11-15');
    syncServer.seed('item', [flowers]);
    const user = userEvent.setup();

    renderApp(itemPath(flowers));
    const time = await screen.findByLabelText('Время');
    syncServer.change('item', flowers.id, { dueDate: null });
    syncServer.rejectWhen(() => ({ code: 'item.due_time_without_due_date' }));
    await user.type(time, '15:00');
    await user.tab();

    expect(
      await screen.findByText('Не удалось сохранить: время указывается только вместе со сроком'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Срок')).toHaveValue('');
    });
    expect(screen.getByLabelText('Время')).toHaveValue('');
    expect(screen.getByLabelText('Время')).toBeDisabled();
  });

  it('says a todo field is only for a todo item', async () => {
    const flowers = item(1, 'Полить цветы');
    syncServer.seed('item', [flowers]);
    const user = userEvent.setup();

    renderApp(itemPath(flowers));
    syncServer.rejectWhen(() => ({ code: 'item.list_not_todo', params: { listId: chores.id } }));
    await user.type(await screen.findByLabelText('Срок'), '2026-11-15');
    await user.tab();

    expect(
      await screen.findByText('Не удалось сохранить: это можно указать только у задачи'),
    ).toBeInTheDocument();
  });
});

describe('A store from the app version before Due dates', () => {
  it('still sends its unsent operation, and its Items take a Due date', async () => {
    // The store as the app before this ticket left it (schema version 5): a todo item pulled
    // without the Due date fields, renamed offline and not sent yet.
    const { id, listId, text, description, done: open, creatorId, createdAt } = item(1, 'Цветы');
    const flowers = { id, listId, text, description, done: open, creatorId, createdAt };
    syncServer.seed('item', [flowers]);
    localStore.close();
    await Dexie.delete(localStore.name);
    const older = new Dexie(localStore.name);
    older.version(1).stores({ member: 'id', child: 'id', outbox: '++seq', meta: 'key' });
    older.version(2).stores({ child_field: 'id', list: 'id' });
    older.version(3).stores({ item: 'id, listId' });
    older.version(4).stores({ category: 'id, listId' });
    older.version(5).stores({ item_history: 'id, listId' });
    await older.table('list').put(chores);
    await older.table('item').put({ ...flowers, text: 'Полить фикус' });
    await older
      .table('outbox')
      .add({ table: 'item', id, op: 'upsert', fields: { text: 'Полить фикус' } });
    older.close();
    await localStore.open();
    const user = userEvent.setup();

    renderApp(itemPath(flowers));

    expect(await screen.findByRole('textbox', { name: 'Название' })).toHaveValue('Полить фикус');
    await waitFor(() => {
      expect(syncServer.row('item', id)).toMatchObject({ text: 'Полить фикус' });
    });
    expect(screen.getByLabelText('Срок')).toHaveValue('');
    await user.type(screen.getByLabelText('Срок'), '2026-11-15');
    await user.tab();
    await waitFor(() => {
      expect(pushed()).toEqual([{ text: 'Полить фикус' }, { dueDate: '2026-11-15' }]);
    });
  });
});

/** The names of the open Items of the section `header`, top to bottom. */
function openNames(header: string) {
  const section = screen.getByRole('region', { name: header });
  return within(section)
    .getAllByRole<HTMLInputElement>('textbox', { name: /^(Задача|Товар|Желание) «/ })
    .map((field) => field.value);
}

describe('The order of a Todo list’s open items', () => {
  it('puts those with a Due date first, soonest on top, timed before date-only on a day, then as added', async () => {
    syncServer.seed('item', [
      item(1, 'Без срока, первая'),
      item(2, 'Послезавтра', '2026-11-12'),
      item(3, 'Сегодня без времени', '2026-11-10'),
      item(4, 'Сегодня в 18', '2026-11-10', '18:00'),
      item(5, 'Сегодня в 9', '2026-11-10', '09:00'),
      item(6, 'Вчера', '2026-11-09'),
      item(7, 'Без срока, вторая'),
      item(8, 'Сегодня без времени, вторая', '2026-11-10'),
      item(9, 'Сегодня в 9, вторая', '2026-11-10', '09:00'),
      item(10, 'В следующем году', '2027-01-01', '08:00'),
    ]);

    renderApp(`/lists/${chores.id}`);

    await waitFor(() => {
      expect(openNames('Задачи')).toEqual([
        'Вчера',
        'Сегодня в 9',
        'Сегодня в 9, вторая',
        'Сегодня в 18',
        'Сегодня без времени',
        'Сегодня без времени, вторая',
        'Послезавтра',
        'В следующем году',
        'Без срока, первая',
        'Без срока, вторая',
      ]);
    });
  });

  it('moves an item when its Due date is set, also one added on this device', async () => {
    const flowers = item(1, 'Полить цветы');
    syncServer.seed('item', [flowers, item(2, 'Вынести мусор', '2026-11-12')]);
    const user = userEvent.setup();

    const first = renderApp(`/lists/${chores.id}`);
    await user.type(await screen.findByRole('textbox', { name: 'Новая задача' }), 'Купить клей');
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(openNames('Задачи')).toEqual(['Вынести мусор', 'Полить цветы', 'Купить клей']);
    });
    first.unmount();

    renderApp(itemPath(flowers));
    await user.type(await screen.findByLabelText('Срок'), '2026-11-11');
    await user.tab();
    await user.click(screen.getByRole('link', { name: 'Дела по дому' }));

    await waitFor(() => {
      expect(openNames('Задачи')).toEqual(['Полить цветы', 'Вынести мусор', 'Купить клей']);
    });
  });

  it('leaves Shopping and Wish lists in the order added', async () => {
    syncServer.seed('item', [
      item(1, 'Молоко', null, null, groceries.id),
      // Not something the server allows: the order must not depend on it all the same.
      item(2, 'Хлеб', '2026-11-01', null, groceries.id),
      item(3, 'Лего', null, null, gifts.id),
      item(4, 'Самокат', '2026-11-01', null, gifts.id),
    ]);

    const first = renderApp(`/lists/${groceries.id}`);
    await waitFor(() => {
      expect(openNames('Товары')).toEqual(['Молоко', 'Хлеб']);
    });
    first.unmount();

    renderApp(`/lists/${gifts.id}`);
    await waitFor(() => {
      expect(openNames('Желания')).toEqual(['Лего', 'Самокат']);
    });
    expect(screen.queryByText('1 нояб.')).not.toBeInTheDocument();
  });
});

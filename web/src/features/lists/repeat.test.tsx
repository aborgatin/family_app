import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anna, boris, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';
import { upgradeStoreFrom } from '@/test/olderStore';

// A todo item's Repeat (spec #81, ticket #86): daily, weekly, monthly or yearly, only with a Due
// date, chosen on the Item screen («Повтор») and marked ↻ on the row after the Due date. What
// marking a repeating item Done does is ticket #87. Анна is logged in and owns the Lists.

/** The device's clock: the afternoon of Tuesday 10 November 2026, local time. */
const NOW = new Date(2026, 10, 10, 15, 30);

/** A List row as the pull sends it. */
function list(
  n: number,
  name: string,
  kind: 'SHOPPING' | 'TODO' | 'WISH',
  visibility: 'SHARED' | 'PRIVATE' = 'SHARED',
) {
  return {
    id: `1157a000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    name,
    kind,
    visibility,
    ownerId: anna.id,
    createdAt: '2026-10-01T10:00:00Z',
  };
}

const chores = list(1, 'Дела по дому', 'TODO');
const groceries = list(2, 'Супермаркет', 'SHOPPING');
const secrets = list(3, 'Сюрприз Борису', 'TODO', 'PRIVATE');

/** An open Item row as the pull sends it, the `n`th added, with this Due date and Repeat. */
function item(
  n: number,
  text: string,
  dueDate: string | null = null,
  repeat: string | null = null,
  listId = chores.id,
) {
  return {
    id: `17e40000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    listId,
    text,
    description: null as string | null,
    dueDate,
    dueTime: null as string | null,
    repeat,
    assigneeId: null as string | null,
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

/** «Повтор» on the Item screen. */
async function repeat() {
  return screen.findByRole<HTMLSelectElement>('combobox', { name: 'Повтор' });
}

/** «Повтор» once it can be chosen: the Due date just set has reached the local store. */
async function enabledRepeat() {
  const select = await repeat();
  await waitFor(() => {
    expect(select).toBeEnabled();
  });
  return select;
}

/** The choices of a select, top to bottom. */
function choices(select: HTMLSelectElement) {
  return within(select)
    .getAllByRole('option')
    .map((option) => option.textContent);
}

/** The choice a select shows. */
function chosen(select: HTMLSelectElement) {
  return select.selectedOptions[0]?.textContent;
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
  syncServer.seed('member', [
    { id: boris.id, displayName: 'Даша', grammaticalGender: 'FEMININE' },
    { id: anna.id, displayName: 'Анна', grammaticalGender: 'FEMININE' },
  ]);
  syncServer.seed('list', [chores, groceries, secrets]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('«Повтор» on the Item screen of a todo item', () => {
  it('is disabled until a «Срок» is set, then offers each Repeat and saves the one chosen', async () => {
    const rubbish = item(1, 'Вынести мусор');
    syncServer.seed('item', [rubbish]);
    const user = userEvent.setup();

    renderApp(itemPath(rubbish));
    const select = await repeat();
    expect(select).toBeDisabled();
    expect(chosen(select)).toBe('Нет');
    expect(choices(select)).toEqual([
      'Нет',
      'Каждый день',
      'Каждую неделю',
      'Каждый месяц',
      'Каждый год',
    ]);

    await user.type(screen.getByLabelText('Срок'), '2026-11-15');
    await user.tab();
    await user.selectOptions(await enabledRepeat(), 'Каждую неделю');

    await waitFor(() => {
      expect(pushed()).toEqual([{ dueDate: '2026-11-15' }, { repeat: 'WEEKLY' }]);
    });
    expect(chosen(select)).toBe('Каждую неделю');

    await user.selectOptions(select, 'Каждый год');
    await user.selectOptions(select, 'Нет');

    await waitFor(() => {
      expect(pushed()).toEqual([
        { dueDate: '2026-11-15' },
        { repeat: 'WEEKLY' },
        { repeat: 'YEARLY' },
        { repeat: null },
      ]);
    });
    expect(syncServer.row('item', rubbish.id)).toMatchObject({ repeat: null });
    expect(chosen(select)).toBe('Нет');
  });

  it('goes with the «Срок» without asking', async () => {
    const rubbish = item(1, 'Вынести мусор', '2026-11-15', 'WEEKLY');
    syncServer.seed('item', [rubbish]);
    const user = userEvent.setup();

    renderApp(itemPath(rubbish));
    const select = await repeat();
    expect(chosen(select)).toBe('Каждую неделю');
    await user.click(screen.getByRole('button', { name: 'Очистить «Срок»' }));

    await waitFor(() => {
      expect(syncServer.row('item', rubbish.id)).toMatchObject({ dueDate: null, repeat: null });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(chosen(select)).toBe('Нет');
    expect(select).toBeDisabled();
  });

  it('keeps a Repeat chosen with no connection across a restart, and sends it on reconnect', async () => {
    const rubbish = item(1, 'Вынести мусор', '2026-11-15');
    syncServer.seed('item', [rubbish]);
    const user = userEvent.setup();

    const first = renderApp(itemPath(rubbish));
    const select = await enabledRepeat();
    syncServer.goOffline();
    await user.selectOptions(select, 'Каждый месяц');
    await waitFor(() => {
      expect(chosen(select)).toBe('Каждый месяц');
    });
    first.unmount();

    renderApp(itemPath(rubbish));
    await waitFor(async () => {
      expect(chosen(await repeat())).toBe('Каждый месяц');
    });
    expect(pushed()).toEqual([]);

    reconnect();

    await waitFor(() => {
      expect(syncServer.row('item', rubbish.id)).toMatchObject({ repeat: 'MONTHLY' });
    });
  });

  it('removes the Repeat with the «Срок» with no connection, and sends both on reconnect', async () => {
    const rubbish = item(1, 'Вынести мусор', '2026-11-15', 'DAILY');
    syncServer.seed('item', [rubbish]);
    const user = userEvent.setup();

    renderApp(itemPath(rubbish));
    const select = await repeat();
    expect(chosen(select)).toBe('Каждый день');
    syncServer.goOffline();
    await user.click(screen.getByRole('button', { name: 'Очистить «Срок»' }));
    await waitFor(() => {
      expect(chosen(select)).toBe('Нет');
    });
    expect(select).toBeDisabled();

    reconnect();

    await waitFor(() => {
      expect(syncServer.row('item', rubbish.id)).toMatchObject({ dueDate: null, repeat: null });
    });
  });

  it('is read-only on a Done item, and a choice again once the item is ticked back on', async () => {
    const rubbish = done(item(1, 'Вынести мусор', '2026-11-15', 'WEEKLY'));
    syncServer.seed('item', [rubbish]);
    const user = userEvent.setup();

    renderApp(itemPath(rubbish));
    expect(await screen.findByText('Повтор')).toBeInTheDocument();
    expect(screen.getByText('Каждую неделю')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Повтор' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Выполнено «Вынести мусор»' }));

    expect(chosen(await repeat())).toBe('Каждую неделю');
  });

  it('is on a Private Todo list too', async () => {
    const watch = item(1, 'Купить часы', '2026-11-15', null, secrets.id);
    syncServer.seed('item', [watch]);
    const user = userEvent.setup();

    renderApp(itemPath(watch));
    await user.selectOptions(await enabledRepeat(), 'Каждый год');

    await waitFor(() => {
      expect(syncServer.row('item', watch.id)).toMatchObject({ repeat: 'YEARLY' });
    });
  });

  it('is not on a shopping item', async () => {
    const milk = item(1, 'Молоко', null, null, groceries.id);
    syncServer.seed('item', [milk]);

    renderApp(itemPath(milk));
    expect(await screen.findByRole('textbox', { name: 'Название' })).toHaveValue('Молоко');
    expect(screen.queryByText('Повтор')).not.toBeInTheDocument();
  });
});

describe('A Repeat the server rejects', () => {
  it('says why when the other Member removed the Due date meanwhile, and shows the server’s copy', async () => {
    const rubbish = item(1, 'Вынести мусор', '2026-11-15');
    syncServer.seed('item', [rubbish]);
    const user = userEvent.setup();

    renderApp(itemPath(rubbish));
    const select = await enabledRepeat();
    syncServer.change('item', rubbish.id, { dueDate: null });
    syncServer.rejectWhen(() => ({ code: 'item.repeat_without_due_date' }));
    await user.selectOptions(select, 'Каждую неделю');

    expect(
      await screen.findByText('Не удалось сохранить: повтор указывается только вместе со сроком'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(chosen(select)).toBe('Нет');
    });
    expect(select).toBeDisabled();
  });
});

describe('A store from the app version before Repeats', () => {
  it('still sends its unsent operation, and its Items take a Repeat', async () => {
    // The store as the app before this ticket left it (schema version 7): a todo item pulled
    // without `repeat`, given a Due date offline and not sent yet.
    const pulled = item(1, 'Вынести мусор');
    const rubbish = Object.fromEntries(
      Object.entries(pulled).filter(([field]) => field !== 'repeat'),
    ) as Omit<typeof pulled, 'repeat'>;
    syncServer.seed('item', [rubbish]);
    await upgradeStoreFrom(7, async (older) => {
      await older.table('list').put(chores);
      await older.table('item').put({ ...rubbish, dueDate: '2026-11-15' });
      await older
        .table('outbox')
        .add({ table: 'item', id: rubbish.id, op: 'upsert', fields: { dueDate: '2026-11-15' } });
    });
    const user = userEvent.setup();

    renderApp(itemPath(rubbish));

    expect(await screen.findByLabelText('Срок')).toHaveValue('2026-11-15');
    await waitFor(() => {
      expect(syncServer.row('item', rubbish.id)).toMatchObject({ dueDate: '2026-11-15' });
    });
    const select = await enabledRepeat();
    expect(chosen(select)).toBe('Нет');
    await user.selectOptions(select, 'Каждый день');
    await waitFor(() => {
      expect(pushed()).toEqual([{ dueDate: '2026-11-15' }, { repeat: 'DAILY' }]);
    });
  });
});

/** The row of the open todo item named `text`. */
async function openRow(text: string) {
  const field = await screen.findByRole('textbox', { name: `Задача «${text}»` });
  const row = field.closest<HTMLElement>('[role="listitem"]');
  if (row === null) throw new Error(`«${text}» is not in a row`);
  return row;
}

/** The small line under the name on the row of the open todo item `text`; `''` when none. */
async function rowLine(text: string) {
  return (await openRow(text)).textContent;
}

describe('A Todo list’s row', () => {
  it('marks a repeating item ↻ after the Due date and time, before the Assignee', async () => {
    syncServer.seed('item', [
      {
        ...item(1, 'Оплатить садик', '2026-11-15', 'MONTHLY'),
        dueTime: '15:00',
        assigneeId: boris.id,
      },
      item(2, 'Вынести мусор', '2026-11-11', 'WEEKLY'),
      { ...item(3, 'Полить цветы', '2026-11-12'), assigneeId: anna.id },
    ]);

    renderApp(`/lists/${chores.id}`);

    await waitFor(async () => {
      expect(await rowLine('Оплатить садик')).toBe('15 нояб., 15:00 ↻ · Даша');
    });
    expect(await rowLine('Вынести мусор')).toBe('Завтра ↻');
    expect(await rowLine('Полить цветы')).toBe('12 нояб. · Анна');
  });

  it('keeps the mark grey on an overdue item, and shows a Repeat chosen on the Item screen', async () => {
    const rubbish = item(1, 'Вынести мусор', '2026-11-01');
    syncServer.seed('item', [rubbish]);
    const user = userEvent.setup();

    renderApp(itemPath(rubbish));
    await user.selectOptions(await enabledRepeat(), 'Каждый день');
    await user.click(screen.getByRole('link', { name: 'Дела по дому' }));

    await waitFor(async () => {
      expect(await rowLine('Вынести мусор')).toBe('1 нояб. ↻');
    });
    const row = await openRow('Вынести мусор');
    expect(within(row).getByText('↻')).not.toHaveAttribute('data-tone');
    expect(within(row).getByText('1 нояб.')).toHaveAttribute('data-tone', 'destructive');
  });
});

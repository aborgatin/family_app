import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anna, boris, masha, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';
import { upgradeStoreFrom } from '@/test/olderStore';

// A todo item's Assignee (spec #81, ticket #85): a Member, on a Shared Todo list only, chosen on
// the Item screen («Ответственный»: «Никто», then each Member) and shown on the row after the Due
// date. Анна is logged in and owns the Lists.

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
const gifts = list(3, 'Подарки', 'WISH');
const secrets = list(4, 'Сюрприз Борису', 'TODO', 'PRIVATE');

/** An open Item row as the pull sends it, the `n`th added, with this Assignee (none: nobody). */
function item(n: number, text: string, assigneeId: string | null = null, listId = chores.id) {
  return {
    id: `17e40000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    listId,
    text,
    description: null as string | null,
    dueDate: null as string | null,
    dueTime: null as string | null,
    assigneeId,
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

/** «Ответственный» on the Item screen, once it is there with the Members to choose from. */
async function assignee() {
  const select = await screen.findByRole<HTMLSelectElement>('combobox', { name: 'Ответственный' });
  await within(select).findByRole('option', { name: 'Борис' });
  return select;
}

/** The choices of «Ответственный», top to bottom. */
function choices(select: HTMLSelectElement) {
  return within(select)
    .getAllByRole('option')
    .map((option) => option.textContent);
}

/** The choice «Ответственный» shows. */
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
    { id: boris.id, displayName: 'Борис', grammaticalGender: 'MASCULINE' },
    { id: anna.id, displayName: 'Анна', grammaticalGender: 'FEMININE' },
  ]);
  syncServer.seed('list', [chores, groceries, gifts, secrets]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('«Ответственный» on the Item screen of a todo item on a Shared list', () => {
  it('is «Никто» by default and offers every Member, the other one and oneself', async () => {
    const flowers = item(1, 'Полить цветы');
    syncServer.seed('item', [flowers]);
    const user = userEvent.setup();

    renderApp(itemPath(flowers));
    const select = await assignee();
    expect(chosen(select)).toBe('Никто');
    expect(choices(select)).toEqual(['Никто', 'Анна', 'Борис']);

    await user.selectOptions(select, 'Борис');

    await waitFor(() => {
      expect(pushed()).toEqual([{ assigneeId: boris.id }]);
    });
    expect(chosen(select)).toBe('Борис');

    await user.selectOptions(select, 'Анна');

    await waitFor(() => {
      expect(syncServer.row('item', flowers.id)).toMatchObject({ assigneeId: anna.id });
    });
    expect(chosen(select)).toBe('Анна');

    await user.selectOptions(select, 'Никто');

    await waitFor(() => {
      expect(pushed()).toEqual([
        { assigneeId: boris.id },
        { assigneeId: anna.id },
        { assigneeId: null },
      ]);
    });
    expect(chosen(select)).toBe('Никто');
  });

  it('keeps an Assignee chosen with no connection across a restart, and sends it on reconnect', async () => {
    const flowers = item(1, 'Полить цветы');
    syncServer.seed('item', [flowers]);
    const user = userEvent.setup();

    const first = renderApp(itemPath(flowers));
    const select = await assignee();
    syncServer.goOffline();
    await user.selectOptions(select, 'Борис');
    await waitFor(() => {
      expect(chosen(select)).toBe('Борис');
    });
    first.unmount();

    renderApp(itemPath(flowers));
    await waitFor(async () => {
      expect(chosen(await assignee())).toBe('Борис');
    });
    expect(pushed()).toEqual([]);

    reconnect();

    await waitFor(() => {
      expect(syncServer.row('item', flowers.id)).toMatchObject({ assigneeId: boris.id });
    });
  });

  it('shows the other Member’s choice while the screen is open', async () => {
    const flowers = item(1, 'Полить цветы');
    syncServer.seed('item', [flowers]);

    renderApp(itemPath(flowers));
    const select = await assignee();
    expect(chosen(select)).toBe('Никто');
    syncServer.change('item', flowers.id, { assigneeId: anna.id });
    window.dispatchEvent(new Event('online'));

    await waitFor(() => {
      expect(chosen(select)).toBe('Анна');
    });
  });

  it('is read-only on a Done item, and a choice again once the item is ticked back on', async () => {
    const flowers = done(item(1, 'Полить цветы', boris.id));
    const trash = done(item(2, 'Вынести мусор'));
    syncServer.seed('item', [flowers, trash]);
    const user = userEvent.setup();

    const first = renderApp(itemPath(trash));
    expect(await screen.findByText('Ответственный')).toBeInTheDocument();
    expect(screen.getByText('Никто')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Ответственный' })).not.toBeInTheDocument();
    first.unmount();

    renderApp(itemPath(flowers));
    expect(await screen.findByText('Ответственный')).toBeInTheDocument();
    expect(await screen.findByText('Борис')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Ответственный' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Выполнено «Полить цветы»' }));

    expect(chosen(await assignee())).toBe('Борис');
  });

  it('is offered on a Child’s Todo list, which is always Shared', async () => {
    const school = { ...list(5, 'Школа', 'TODO'), childId: masha.id };
    const homework = item(1, 'Сделать поделку', null, school.id);
    syncServer.seed('child', [masha]);
    syncServer.seed('list', [school]);
    syncServer.seed('item', [homework]);
    const user = userEvent.setup();

    renderApp(itemPath(homework));
    await user.selectOptions(await assignee(), 'Анна');

    await waitFor(() => {
      expect(syncServer.row('item', homework.id)).toMatchObject({ assigneeId: anna.id });
    });
  });
});

describe('The Item screen where an Item has no Assignee', () => {
  it('has no «Ответственный» on a Private Todo list, open or Done', async () => {
    const watch = item(1, 'Купить часы', null, secrets.id);
    const card = done(item(2, 'Подписать открытку', null, secrets.id));
    syncServer.seed('item', [watch, card]);

    const first = renderApp(itemPath(watch));
    expect(await screen.findByLabelText('Срок')).toBeInTheDocument();
    expect(screen.queryByText('Ответственный')).not.toBeInTheDocument();
    first.unmount();

    renderApp(itemPath(card));
    expect(await screen.findByText('Срок')).toBeInTheDocument();
    expect(screen.queryByText('Ответственный')).not.toBeInTheDocument();
  });

  it('has no «Ответственный» on a shopping or wish item', async () => {
    const milk = item(1, 'Молоко', null, groceries.id);
    const lego = item(2, 'Лего', null, gifts.id);
    syncServer.seed('item', [milk, lego]);

    const first = renderApp(itemPath(milk));
    expect(await screen.findByRole('textbox', { name: 'Название' })).toHaveValue('Молоко');
    expect(screen.queryByText('Ответственный')).not.toBeInTheDocument();
    first.unmount();

    renderApp(itemPath(lego));
    expect(await screen.findByRole('textbox', { name: 'Название' })).toHaveValue('Лего');
    expect(screen.queryByText('Ответственный')).not.toBeInTheDocument();
  });
});

describe('Making a Shared Todo list Private', () => {
  it('removes every Assignee, and making it Shared again restores none', async () => {
    const flowers = item(1, 'Полить цветы', boris.id);
    const trash = done(item(2, 'Вынести мусор', anna.id));
    const paint = item(3, 'Купить краску', boris.id, list(6, 'Ремонт', 'TODO').id);
    syncServer.seed('list', [list(6, 'Ремонт', 'TODO')]);
    syncServer.seed('item', [flowers, trash, paint]);
    const user = userEvent.setup();

    const settings = renderApp(`/lists/${chores.id}/settings`);
    await user.click(await screen.findByRole('radio', { name: 'Личный' }));

    await waitFor(() => {
      expect(syncServer.row('list', chores.id)).toMatchObject({ visibility: 'PRIVATE' });
    });
    expect(syncServer.row('item', flowers.id)).toMatchObject({ assigneeId: null });
    expect(syncServer.row('item', trash.id)).toMatchObject({ assigneeId: null });
    expect(syncServer.row('item', paint.id)).toMatchObject({ assigneeId: boris.id });

    await user.click(screen.getByRole('radio', { name: 'Общий' }));
    await waitFor(() => {
      expect(syncServer.row('list', chores.id)).toMatchObject({ visibility: 'SHARED' });
    });
    settings.unmount();

    renderApp(`/lists/${chores.id}`);
    expect(await rowLine('Полить цветы')).toBe('');
    expect(screen.queryByText('· Анна')).not.toBeInTheDocument();
    expect(screen.queryByText('Анна')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('textbox', { name: 'Задача «Полить цветы»' }));
    await user.click(screen.getByRole('link', { name: 'Подробнее' }));
    expect(chosen(await assignee())).toBe('Никто');
  });

  it('hides the Assignee on the row at once, before the server has removed it', async () => {
    const flowers = { ...item(1, 'Полить цветы', boris.id), dueDate: '2026-11-15' };
    syncServer.seed('item', [flowers]);
    const user = userEvent.setup();

    const settings = renderApp(`/lists/${chores.id}/settings`);
    const visibility = await screen.findByRole('radio', { name: 'Личный' });
    syncServer.goOffline();
    await user.click(visibility);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Личный' })).toBeChecked();
    });
    settings.unmount();

    renderApp(`/lists/${chores.id}`);
    expect(await rowLine('Полить цветы')).toBe('15 нояб.');
  });
});

describe('An Assignee the server rejects', () => {
  it('says the list is Private when its Owner made it so meanwhile, and shows the server’s copy', async () => {
    const flowers = item(1, 'Полить цветы');
    syncServer.seed('item', [flowers]);
    const user = userEvent.setup();

    renderApp(itemPath(flowers));
    const select = await assignee();
    syncServer.rejectWhen(() => ({
      code: 'item.assignee_on_private_list',
      params: { listId: chores.id },
    }));
    await user.selectOptions(select, 'Борис');

    expect(
      await screen.findByText('Не удалось сохранить: в личном списке нет ответственных'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(chosen(select)).toBe('Никто');
    });
  });

  it('says the Member is no more', async () => {
    const flowers = item(1, 'Полить цветы');
    syncServer.seed('item', [flowers]);
    const user = userEvent.setup();

    renderApp(itemPath(flowers));
    const select = await assignee();
    syncServer.rejectWhen(() => ({
      code: 'item.assignee_not_found',
      params: { assigneeId: boris.id },
    }));
    await user.selectOptions(select, 'Борис');

    expect(
      await screen.findByText('Не удалось сохранить: такого взрослого больше нет'),
    ).toBeInTheDocument();
  });
});

describe('A store from the app version before Assignees', () => {
  it('still sends its unsent operation, and its Items take an Assignee', async () => {
    // The store as the app before this ticket left it (schema version 7): a todo item pulled
    // without `assigneeId`, given a Due date offline and not sent yet.
    const pulled = item(1, 'Полить цветы');
    const flowers = Object.fromEntries(
      Object.entries(pulled).filter(([field]) => field !== 'assigneeId'),
    ) as Omit<typeof pulled, 'assigneeId'>;
    syncServer.seed('item', [flowers]);
    await upgradeStoreFrom(7, async (older) => {
      await older.table('list').put(chores);
      await older.table('item').put({ ...flowers, dueDate: '2026-11-15' });
      await older
        .table('outbox')
        .add({ table: 'item', id: flowers.id, op: 'upsert', fields: { dueDate: '2026-11-15' } });
    });
    const user = userEvent.setup();

    renderApp(itemPath(flowers));

    expect(await screen.findByLabelText('Срок')).toHaveValue('2026-11-15');
    await waitFor(() => {
      expect(syncServer.row('item', flowers.id)).toMatchObject({ dueDate: '2026-11-15' });
    });
    const select = await assignee();
    expect(chosen(select)).toBe('Никто');
    await user.selectOptions(select, 'Борис');
    await waitFor(() => {
      expect(pushed()).toEqual([{ dueDate: '2026-11-15' }, { assigneeId: boris.id }]);
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
  it('shows the Assignee’s name after the Due date, or alone without one', async () => {
    syncServer.seed('item', [
      { ...item(1, 'Оплатить садик', boris.id), dueDate: '2026-11-15' },
      { ...item(2, 'Забрать справку', anna.id), dueDate: '2026-11-11', dueTime: '15:00' },
      item(3, 'Полить цветы', boris.id),
      { ...item(4, 'Вынести мусор'), dueDate: '2026-11-10' },
      item(5, 'Когда-нибудь'),
    ]);

    renderApp(`/lists/${chores.id}`);

    await waitFor(async () => {
      expect(await rowLine('Оплатить садик')).toBe('15 нояб. · Борис');
    });
    expect(await rowLine('Забрать справку')).toBe('Завтра, 15:00 · Анна');
    expect(await rowLine('Полить цветы')).toBe('Борис');
    expect(await rowLine('Вынести мусор')).toBe('Сегодня');
    expect(await rowLine('Когда-нибудь')).toBe('');
  });

  it('keeps the Assignee on a Done row, and only the Due date is red when overdue', async () => {
    syncServer.seed('item', [
      { ...item(1, 'Оплатить садик', boris.id), dueDate: '2026-11-01' },
      done({ ...item(2, 'Вынести мусор', anna.id), dueDate: '2026-11-08' }),
    ]);

    renderApp(`/lists/${chores.id}`);

    const row = await openRow('Оплатить садик');
    expect(await within(row).findByText('· Борис')).not.toHaveAttribute('data-tone');
    expect(within(row).getByText('1 нояб.')).toHaveAttribute('data-tone', 'destructive');
    const doneRegion = screen.getByRole('region', { name: 'Выполнено' });
    expect(within(doneRegion).getByText('· Анна')).toBeInTheDocument();
  });

  it('shows an Assignee chosen on the Item screen once back on the list', async () => {
    const flowers = item(1, 'Полить цветы');
    syncServer.seed('item', [flowers]);
    const user = userEvent.setup();

    renderApp(itemPath(flowers));
    await user.selectOptions(await assignee(), 'Борис');
    await user.click(screen.getByRole('link', { name: 'Дела по дому' }));

    await waitFor(async () => {
      expect(await rowLine('Полить цветы')).toBe('Борис');
    });
  });
});

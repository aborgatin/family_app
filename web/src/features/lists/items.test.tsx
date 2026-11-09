import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { localStore } from '@/shared/sync/localStore';
import { anna, boris, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// Items on the List screen (spec #3, ticket #57): open Items in the order added, newest at the
// bottom; adding from the last row, editing in place and deleting, all on the local store and
// pushed through the Outbox, offline too.

/** A List row as the pull sends it. */
function list(n: number, name: string, kind: 'SHOPPING' | 'TODO' | 'WISH') {
  return {
    id: `1157a000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    name,
    kind,
    visibility: 'SHARED',
    ownerId: anna.id,
    createdAt: '2026-11-01T10:00:00Z',
  };
}

const groceries = list(1, 'Супермаркет', 'SHOPPING');

/** An Item row as the pull sends it, added at `createdAt`. */
function item(n: number, text: string, createdAt: string, listId = groceries.id) {
  return {
    id: `17e40000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    listId,
    text,
    note: null,
    done: false,
    doneById: null,
    doneAt: null,
    creatorId: boris.id,
    createdAt,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** The id of `item(n, …)`. */
function itemId(n: number) {
  return item(n, '', '').id;
}

/** The connection is back: the app notices (browser `online` event) and sends what is waiting. */
function reconnect() {
  syncServer.goOnline();
  window.dispatchEvent(new Event('online'));
}

/** The text of each Item row, top to bottom. */
async function itemTexts(name = 'Товары') {
  const rows = within(await screen.findByRole('region', { name })).queryAllByRole('listitem');
  return rows.map((row) => within(row).queryByRole('textbox')?.getAttribute('value') ?? '');
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
});

describe('The List screen’s Items', () => {
  it('lists the List’s open Items in the order added, newest at the bottom', async () => {
    syncServer.seed('list', [groceries, list(2, 'Аптека', 'SHOPPING')]);
    syncServer.seed('item', [
      item(3, 'Хлеб', '2026-11-02T09:00:00Z'),
      item(1, 'Молоко', '2026-11-01T09:00:00Z'),
      item(4, 'Аспирин', '2026-11-01T08:00:00Z', list(2, 'Аптека', 'SHOPPING').id),
      item(2, 'Яйца', '2026-11-02T09:00:00Z'),
    ]);

    renderApp(`/lists/${groceries.id}`);

    await waitFor(async () => {
      expect(await itemTexts()).toEqual(['Молоко', 'Яйца', 'Хлеб']);
    });
    expect(screen.queryByText('Товаров пока нет')).not.toBeInTheDocument();
  });

  it('orders by the time added however many fraction digits the server prints', async () => {
    // The server prints an Instant with 0, 3, 6 or 9 fraction digits.
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [
      item(1, 'Яйца', '2026-11-02T09:00:00.123456Z'),
      item(2, 'Молоко', '2026-11-02T09:00:00.123Z'),
      item(3, 'Хлеб', '2026-11-02T09:00:01Z'),
      item(4, 'Сыр', '2026-11-02T09:00:00Z'),
    ]);

    renderApp(`/lists/${groceries.id}`);

    await waitFor(async () => {
      expect(await itemTexts()).toEqual(['Сыр', 'Молоко', 'Яйца', 'Хлеб']);
    });
  });
});

describe('Adding an Item', () => {
  it.each([
    ['SHOPPING', 'Новый товар', 'Товары'],
    ['TODO', 'Новая задача', 'Задачи'],
    ['WISH', 'Новое желание', 'Желания'],
  ] as const)('a %s List’s last row is «%s»', async (kind, placeholder, header) => {
    const shown = list(5, 'Мой список', kind);
    syncServer.seed('list', [shown]);

    renderApp(`/lists/${shown.id}`);

    const section = await screen.findByRole('region', { name: header });
    const add = await within(section).findByRole('textbox', { name: placeholder });
    expect(add).toHaveAttribute('placeholder', placeholder);
    expect(add).toHaveValue('');
  });

  it('adds at the bottom on Enter and keeps the focus for the next one', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [item(1, 'Молоко', '2026-11-01T09:00:00Z')]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const add = await screen.findByRole('textbox', { name: 'Новый товар' });
    await user.click(add);
    await user.keyboard('  Хлеб {Enter}');

    expect(add).toHaveFocus();
    expect(add).toHaveValue('');
    await user.keyboard('Яйца{Enter}');

    await waitFor(async () => {
      expect(await itemTexts()).toEqual(['Молоко', 'Хлеб', 'Яйца']);
    });
    expect(add).toHaveFocus();
    await waitFor(() => {
      expect(syncServer.operations('item')).toHaveLength(2);
    });
    const [bread, eggs] = syncServer.operations('item');
    expect(bread).toMatchObject({ op: 'upsert', fields: { listId: groceries.id, text: 'Хлеб' } });
    expect(eggs?.fields).toEqual({ listId: groceries.id, text: 'Яйца' });
    expect(bread?.id).toMatch(UUID);
    expect(eggs?.id).not.toBe(bread?.id);
    expect(syncServer.pushes[0]?.csrf).toBe('token-from-server');
  });

  it('adds nothing for blank text', async () => {
    syncServer.seed('list', [groceries]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await user.type(await screen.findByRole('textbox', { name: 'Новый товар' }), '   {Enter}');

    expect(await screen.findByText('Товаров пока нет')).toBeInTheDocument();
    expect(syncServer.operations('item')).toEqual([]);
  });

  it('adds offline at once, in order, and sends them when the server is back', async () => {
    syncServer.seed('list', [groceries]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const add = await screen.findByRole('textbox', { name: 'Новый товар' });
    await screen.findByText('Товаров пока нет');
    syncServer.goOffline();
    await user.type(add, 'Молоко{Enter}Хлеб{Enter}Яйца{Enter}');

    await waitFor(async () => {
      expect(await itemTexts()).toEqual(['Молоко', 'Хлеб', 'Яйца']);
    });
    expect(syncServer.pushes).toEqual([]);

    reconnect();

    await waitFor(() => {
      expect(syncServer.operations('item').map((op) => op.fields?.text)).toEqual([
        'Молоко',
        'Хлеб',
        'Яйца',
      ]);
    });
    // Pulled back with the server's created at, they keep their order.
    const pulls = syncServer.pulls.length;
    syncServer.operations('item').forEach((op, n) => {
      syncServer.change('item', op.id, { createdAt: `2026-11-09T10:00:0${String(n)}Z` });
    });
    window.dispatchEvent(new Event('online'));
    await waitFor(() => {
      expect(syncServer.pulls.length).toBeGreaterThan(pulls);
    });
    expect(await itemTexts()).toEqual(['Молоко', 'Хлеб', 'Яйца']);
  });

  it('takes a rejected new Item off the List and says «Не удалось сохранить»', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.rejectWhen(() => ({ code: 'list.not_found' }));
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await user.type(await screen.findByRole('textbox', { name: 'Новый товар' }), 'Молоко{Enter}');

    const section = await screen.findByRole('region', { name: 'Товары' });
    expect(await within(section).findByText('Не удалось сохранить')).toBeInTheDocument();
    await waitFor(async () => {
      expect(await itemTexts()).toEqual([]);
    });
  });
});

describe('Editing an Item', () => {
  it('changes the text in place offline at once, sending only the text on reconnect', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [item(1, 'Молоко', '2026-11-01T09:00:00Z')]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const text = await screen.findByRole('textbox', { name: 'Товар «Молоко»' });
    syncServer.goOffline();
    await user.clear(text);
    await user.type(text, 'Кефир{Enter}');

    expect(await screen.findByRole('textbox', { name: 'Товар «Кефир»' })).toHaveValue('Кефир');
    expect(syncServer.pushes).toEqual([]);

    reconnect();

    await waitFor(() => {
      expect(syncServer.operations('item')).toEqual([
        { table: 'item', id: itemId(1), op: 'upsert', fields: { text: 'Кефир' } },
      ]);
    });
  });

  it('refuses an empty text without sending anything', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [item(1, 'Молоко', '2026-11-01T09:00:00Z')]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const text = await screen.findByRole('textbox', { name: 'Товар «Молоко»' });
    await user.clear(text);
    await user.keyboard('{Enter}');

    expect(text).toHaveAccessibleDescription('Заполните это поле');
    expect(syncServer.operations('item')).toEqual([]);
  });

  it('keeps an unsent edit when a pull brings the other Member’s change to the Item', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [item(1, 'Молоко', '2026-11-01T09:00:00Z')]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const text = await screen.findByRole('textbox', { name: 'Товар «Молоко»' });
    await waitFor(() => {
      expect(syncServer.pulls).toHaveLength(1);
    });
    // A pull is on its way when Boris changes the Item, and Anna edits its text.
    const release = syncServer.holdPulls();
    window.dispatchEvent(new Event('online'));
    await waitFor(() => {
      expect(syncServer.pulls).toHaveLength(2);
    });
    syncServer.change('item', itemId(1), { text: 'Молоко 3,2%', note: 'Любое' });
    await user.clear(text);
    await user.type(text, 'Кефир{Enter}');
    release();

    await waitFor(() => {
      expect(syncServer.pulls.length).toBeGreaterThan(2);
    });
    expect(screen.getByRole('textbox', { name: 'Товар «Кефир»' })).toHaveValue('Кефир');
    await waitFor(() => {
      expect(syncServer.row('item', itemId(1))).toMatchObject({ text: 'Кефир', note: 'Любое' });
    });
  });
});

describe('Deleting an Item', () => {
  it('deletes with right-click → «Удалить» after the action sheet, offline at once', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [
      item(1, 'Молоко', '2026-11-01T09:00:00Z'),
      item(2, 'Хлеб', '2026-11-01T10:00:00Z'),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const field = await screen.findByRole('textbox', { name: 'Товар «Молоко»' });
    syncServer.goOffline();
    await user.pointer({ keys: '[MouseRight]', target: field });
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    const sheet = screen.getByRole('dialog', { name: 'Удалить „Молоко“?' });
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    await waitFor(async () => {
      expect(await itemTexts()).toEqual(['Хлеб']);
    });
    expect(syncServer.pushes).toEqual([]);

    reconnect();

    await waitFor(() => {
      expect(syncServer.operations('item')).toEqual([
        { table: 'item', id: itemId(1), op: 'delete' },
      ]);
    });
  });

  it('deletes from edit mode «Изменить», leaving it with the last Item', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [item(1, 'Молоко', '2026-11-01T09:00:00Z')]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const section = await screen.findByRole('region', { name: 'Товары' });
    await within(section).findByRole('textbox', { name: 'Товар «Молоко»' });
    await user.click(within(section).getByRole('button', { name: 'Изменить' }));
    await user.click(within(section).getByRole('button', { name: 'Удалить «Молоко»' }));
    const sheet = screen.getByRole('dialog', { name: 'Удалить „Молоко“?' });
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    expect(await within(section).findByText('Товаров пока нет')).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Готово' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.row('item', itemId(1))).toBeUndefined();
    });
  });
});

/** The text of each Done Item row, top to bottom. */
async function doneTexts(name = 'Куплено') {
  const rows = within(await screen.findByRole('region', { name })).queryAllByRole('listitem');
  return rows.map((row) => row.textContent);
}

/** An Item row as the pull sends it, Done by Boris at `doneAt`. */
function doneItem(n: number, text: string, doneAt: string, listId = groceries.id) {
  return {
    ...item(n, text, '2026-11-01T09:00:00Z', listId),
    done: true,
    doneById: boris.id,
    doneAt,
  };
}

describe('Done', () => {
  it('ticks an Item off offline at once, under «Куплено», and sends only Done on reconnect', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [
      item(1, 'Молоко', '2026-11-01T09:00:00Z'),
      item(2, 'Хлеб', '2026-11-01T10:00:00Z'),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const toggle = await screen.findByRole('checkbox', { name: 'Куплено «Молоко»' });
    expect(toggle).not.toBeChecked();
    syncServer.goOffline();
    await user.click(toggle);

    await waitFor(async () => {
      expect(await doneTexts()).toEqual(['Молоко']);
    });
    expect(await itemTexts()).toEqual(['Хлеб']);
    expect(screen.getByRole('checkbox', { name: 'Куплено «Молоко»' })).toBeChecked();
    expect(syncServer.pushes).toEqual([]);

    reconnect();

    await waitFor(() => {
      expect(syncServer.operations('item')).toEqual([
        { table: 'item', id: itemId(1), op: 'upsert', fields: { done: true } },
      ]);
    });
  });

  it('lists Done Items most recently done first, ticked offline ones on top in the order ticked, and keeps that order when the server’s copy arrives', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [
      item(1, 'Молоко', '2026-11-01T09:00:00Z'),
      item(2, 'Хлеб', '2026-11-01T10:00:00Z'),
      doneItem(3, 'Сыр', '2026-11-02T09:00:00.5Z'),
      doneItem(4, 'Яйца', '2026-11-02T09:00:00.25Z'),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await waitFor(async () => {
      expect(await doneTexts()).toEqual(['Сыр', 'Яйца']);
    });
    syncServer.goOffline();
    await user.click(await screen.findByRole('checkbox', { name: 'Куплено «Молоко»' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Куплено «Хлеб»' }));

    await waitFor(async () => {
      expect(await doneTexts()).toEqual(['Хлеб', 'Молоко', 'Сыр', 'Яйца']);
    });

    // The server sets done at in the order the ticks arrive, after every earlier one.
    reconnect();
    await waitFor(() => {
      expect(syncServer.operations('item')).toHaveLength(2);
    });
    const pulls = syncServer.pulls.length;
    syncServer.change('item', itemId(1), { doneById: anna.id, doneAt: '2026-11-09T10:00:00Z' });
    syncServer.change('item', itemId(2), { doneById: anna.id, doneAt: '2026-11-09T10:00:01Z' });
    window.dispatchEvent(new Event('online'));
    await waitFor(() => {
      expect(syncServer.pulls.length).toBeGreaterThan(pulls);
    });
    expect(syncServer.row('item', itemId(1))).toMatchObject({ done: true });
    expect(await doneTexts()).toEqual(['Хлеб', 'Молоко', 'Сыр', 'Яйца']);
  });

  it('puts an Item ticked back on and off again offline on top, not where its old done at was', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [
      doneItem(1, 'Хлеб', '2026-11-02T09:00:00Z'),
      doneItem(2, 'Сыр', '2026-11-03T09:00:00Z'),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await waitFor(async () => {
      expect(await doneTexts()).toEqual(['Сыр', 'Хлеб']);
    });
    syncServer.goOffline();
    await user.click(await screen.findByRole('checkbox', { name: 'Куплено «Хлеб»' }));
    await waitFor(async () => {
      expect(await itemTexts()).toEqual(['Хлеб']);
    });
    await user.click(await screen.findByRole('checkbox', { name: 'Куплено «Хлеб»' }));

    await waitFor(async () => {
      expect(await doneTexts()).toEqual(['Хлеб', 'Сыр']);
    });
  });

  it('ticks a Done Item back on offline: it returns to its place among the open ones', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [
      item(1, 'Молоко', '2026-11-01T09:00:00Z'),
      doneItem(2, 'Хлеб', '2026-11-02T09:00:00Z'),
      item(3, 'Яйца', '2026-11-01T11:00:00Z'),
    ]);
    // Хлеб was added between Молоко and Яйца.
    syncServer.change('item', itemId(2), { createdAt: '2026-11-01T10:00:00Z' });
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const toggle = await screen.findByRole('checkbox', { name: 'Куплено «Хлеб»' });
    expect(toggle).toBeChecked();
    syncServer.goOffline();
    await user.click(toggle);

    await waitFor(async () => {
      expect(await itemTexts()).toEqual(['Молоко', 'Хлеб', 'Яйца']);
    });
    expect(screen.queryByRole('region', { name: 'Куплено' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Куплено «Хлеб»' })).not.toBeChecked();

    reconnect();

    await waitFor(() => {
      expect(syncServer.operations('item')).toEqual([
        { table: 'item', id: itemId(2), op: 'upsert', fields: { done: false } },
      ]);
    });
  });

  it.each([
    ['SHOPPING', 'Куплено', 'Товары'],
    ['TODO', 'Выполнено', 'Задачи'],
    ['WISH', 'Исполнено', 'Желания'],
  ] as const)('a %s List’s Done Items are headed «%s»', async (kind, done, header) => {
    const shown = list(5, 'Мой список', kind);
    syncServer.seed('list', [shown]);
    syncServer.seed('item', [
      item(1, 'Первое', '2026-11-01T09:00:00Z', shown.id),
      doneItem(2, 'Второе', '2026-11-02T09:00:00Z', shown.id),
    ]);

    renderApp(`/lists/${shown.id}`);

    expect(await doneTexts(done)).toEqual(['Второе']);
    expect(await itemTexts(header)).toEqual(['Первое']);
    expect(screen.getByRole('checkbox', { name: `${done} «Второе»` })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: `${done} «Первое»` })).not.toBeChecked();
  });
});

describe('A List that leaves the phone', () => {
  it('takes its Items with it: shared again, only the Items the pull brings come back', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [item(1, 'Молоко', '2026-11-01T09:00:00Z')]);

    renderApp(`/lists/${groceries.id}`);
    await screen.findByRole('textbox', { name: 'Товар «Молоко»' });

    // Its Owner makes it Private: the pull brings the List's tombstone (and nothing for its Item).
    syncServer.change('list', groceries.id, 'deleted');
    window.dispatchEvent(new Event('online'));
    await screen.findByText('Такого списка нет: возможно, его удалили.');

    syncServer.change('list', groceries.id, {});
    window.dispatchEvent(new Event('online'));

    expect(await screen.findByText('Товаров пока нет')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Товар «Молоко»' })).not.toBeInTheDocument();
  });
});

describe('The store upgrade that adds Items', () => {
  it('sends a List still waiting in the store of the app version before Items', async () => {
    // The store as the app before Items created it (schema version 2), with a List added offline
    // and not sent yet.
    localStore.close();
    await Dexie.delete(localStore.name);
    const older = new Dexie(localStore.name);
    older.version(1).stores({ member: 'id', child: 'id', outbox: '++seq', meta: 'key' });
    older.version(2).stores({ child_field: 'id', list: 'id' });
    const { id, name, kind, visibility } = groceries;
    await older.table('list').put({ id, name, kind, visibility });
    await older
      .table('outbox')
      .add({ table: 'list', id, op: 'upsert', fields: { name, kind, visibility } });
    older.close();
    await localStore.open();

    renderApp(`/lists/${groceries.id}`);

    expect(await screen.findByText('Товаров пока нет')).toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.row('list', id)).toEqual({ id, name, kind, visibility });
    });
  });
});

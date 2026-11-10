import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { anna, boris, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// Clearing the Bought section (spec #67, ticket #71): «Очистить» at the top of a Shopping list's
// «Куплено» asks first, then deletes every Done Item this device shows, one Item delete each,
// offline too.

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

/** An open Item row as the pull sends it. */
function item(n: number, text: string, listId = groceries.id) {
  return {
    id: `17e40000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    listId,
    text,
    done: false,
    doneById: null,
    doneAt: null,
    creatorId: boris.id,
    createdAt: `2026-11-01T09:00:${String(n).padStart(2, '0')}Z`,
  };
}

/** A Done Item row as the pull sends it, ticked off by Boris. */
function doneItem(n: number, text: string, listId = groceries.id) {
  return {
    ...item(n, text, listId),
    done: true,
    doneById: boris.id,
    doneAt: `2026-11-02T09:00:${String(n).padStart(2, '0')}Z`,
  };
}

/** The id of `item(n, …)`. */
function itemId(n: number) {
  return item(n, '').id;
}

/** `count` Done Items numbered from 1. */
function doneItems(count: number) {
  return Array.from({ length: count }, (_, index) =>
    doneItem(index + 1, `Товар ${String(index + 1)}`),
  );
}

/** The connection is back: the app notices (browser `online` event) and sends what is waiting. */
function reconnect() {
  syncServer.goOnline();
  window.dispatchEvent(new Event('online'));
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
});

describe('«Очистить» on the Bought section', () => {
  it('heads a Shopping list’s «Куплено»', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [item(1, 'Молоко'), doneItem(2, 'Хлеб')]);

    renderApp(`/lists/${groceries.id}`);

    const bought = await screen.findByRole('region', { name: 'Куплено' });
    expect(within(bought).getByRole('button', { name: 'Очистить' })).toBeInTheDocument();
    const open = screen.getByRole('region', { name: 'Товары' });
    expect(within(open).queryByRole('button', { name: 'Очистить' })).not.toBeInTheDocument();
  });

  it.each([
    ['TODO', 'Выполнено'],
    ['WISH', 'Исполнено'],
  ] as const)('is not on a %s List’s «%s»', async (kind, done) => {
    const shown = list(5, 'Мой список', kind);
    syncServer.seed('list', [shown]);
    syncServer.seed('item', [doneItem(1, 'Первое', shown.id)]);

    renderApp(`/lists/${shown.id}`);

    const section = await screen.findByRole('region', { name: done });
    expect(within(section).getByRole('button', { name: 'Изменить' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Очистить' })).not.toBeInTheDocument();
  });

  it('is gone once nothing is bought', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [item(1, 'Молоко')]);

    renderApp(`/lists/${groceries.id}`);

    await screen.findByRole('textbox', { name: 'Товар «Молоко»' });
    expect(screen.queryByRole('button', { name: 'Очистить' })).not.toBeInTheDocument();
  });

  it.each([
    [1, 'Очистить 1 товар?'],
    [3, 'Очистить 3 товара?'],
    [12, 'Очистить 12 товаров?'],
  ])('asks about %i Done Items «%s»', async (count, question) => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', doneItems(count));
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const bought = await screen.findByRole('region', { name: 'Куплено' });
    await waitFor(() => {
      expect(within(bought).getAllByRole('listitem')).toHaveLength(count);
    });
    await user.click(within(bought).getByRole('button', { name: 'Очистить' }));

    const sheet = screen.getByRole('dialog', { name: question });
    expect(within(sheet).getByRole('button', { name: 'Очистить' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Отменить' })).toBeInTheDocument();
  });

  it('clears nothing on «Отменить»', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', doneItems(2));
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const bought = await screen.findByRole('region', { name: 'Куплено' });
    await within(bought).findByRole('checkbox', { name: 'Куплено «Товар 2»' });
    await user.click(within(bought).getByRole('button', { name: 'Очистить' }));
    const sheet = screen.getByRole('dialog', { name: 'Очистить 2 товара?' });
    await user.click(within(sheet).getByRole('button', { name: 'Отменить' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(bought).getAllByRole('listitem')).toHaveLength(2);
    expect(syncServer.pushes).toEqual([]);
  });

  it('deletes every Done Item shown, offline at once, one Item delete each on reconnect', async () => {
    syncServer.seed('list', [groceries, list(2, 'Аптека', 'SHOPPING')]);
    syncServer.seed('item', [
      item(1, 'Молоко'),
      doneItem(2, 'Хлеб'),
      doneItem(3, 'Сыр'),
      doneItem(4, 'Аспирин', list(2, 'Аптека', 'SHOPPING').id),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const bought = await screen.findByRole('region', { name: 'Куплено' });
    await within(bought).findByRole('checkbox', { name: 'Куплено «Хлеб»' });
    await within(bought).findByRole('checkbox', { name: 'Куплено «Сыр»' });
    syncServer.goOffline();
    await user.click(within(bought).getByRole('button', { name: 'Очистить' }));
    const sheet = screen.getByRole('dialog', { name: 'Очистить 2 товара?' });
    await user.click(within(sheet).getByRole('button', { name: 'Очистить' }));

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Куплено' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('textbox', { name: 'Товар «Молоко»' })).toBeInTheDocument();
    expect(syncServer.pushes).toEqual([]);

    reconnect();

    await waitFor(() => {
      expect(syncServer.row('item', itemId(3))).toBeUndefined();
    });
    expect(syncServer.operations('item')).toEqual(
      expect.arrayContaining([
        { table: 'item', id: itemId(2), op: 'delete' },
        { table: 'item', id: itemId(3), op: 'delete' },
      ]),
    );
    expect(syncServer.operations('item')).toHaveLength(2);
    expect(syncServer.operations('list')).toEqual([]);
    expect(syncServer.row('item', itemId(1))).toMatchObject({ done: false });
    expect(syncServer.row('item', itemId(4))).toMatchObject({ done: true });
  });

  it('leaves an Item the other Member ticked off that this device hasn’t pulled yet', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [item(1, 'Молоко'), doneItem(2, 'Хлеб')]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const bought = await screen.findByRole('region', { name: 'Куплено' });
    await within(bought).findByRole('checkbox', { name: 'Куплено «Хлеб»' });
    await screen.findByRole('checkbox', { name: 'Куплено «Молоко»' });
    // Boris ticks Молоко off; no pull brings it before the clear.
    const release = syncServer.holdPulls();
    syncServer.change('item', itemId(1), {
      done: true,
      doneById: boris.id,
      doneAt: '2026-11-09T10:00:00Z',
    });
    await user.click(within(bought).getByRole('button', { name: 'Очистить' }));
    const sheet = screen.getByRole('dialog', { name: 'Очистить 1 товар?' });
    await user.click(within(sheet).getByRole('button', { name: 'Очистить' }));
    release();

    await waitFor(() => {
      expect(syncServer.row('item', itemId(2))).toBeUndefined();
    });
    expect(syncServer.operations('item')).toEqual([{ table: 'item', id: itemId(2), op: 'delete' }]);
    expect(syncServer.row('item', itemId(1))).toMatchObject({ done: true });
    await waitFor(async () => {
      const shown = await screen.findByRole('region', { name: 'Куплено' });
      expect(within(shown).getByRole('checkbox', { name: 'Куплено «Молоко»' })).toBeChecked();
    });
  });
});

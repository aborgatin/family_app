import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { localStore } from '@/shared/sync/localStore';
import { anna, boris, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// Categories on the Shopping list screen (spec #4, ticket #70): one section per Category and one
// for the Unnamed category, in walking order, each with its own «Новый товар» field.

/** A List row as the pull sends it. */
function list(n: number, name: string, kind: 'SHOPPING' | 'TODO' | 'WISH', unnamed = 0) {
  return {
    id: `1157a000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    name,
    kind,
    visibility: 'SHARED',
    unnamedCategoryPosition: unnamed,
    ownerId: anna.id,
    createdAt: '2026-11-01T10:00:00Z',
  };
}

const groceries = list(1, 'Супермаркет', 'SHOPPING', 2);

/** A Category row as the pull sends it. */
function category(n: number, name: string, position: number, listId = groceries.id) {
  return {
    id: `ca7e0000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    listId,
    name,
    position,
  };
}

const food = category(1, 'Еда', 1);
const chemicals = category(2, 'Бытовая химия', 3);

/** An Item row as the pull sends it, added at `createdAt`, in a Category or the Unnamed one. */
function item(n: number, text: string, categoryId: string | null, createdAt: string) {
  return {
    id: `17e40000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    listId: groceries.id,
    text,
    categoryId,
    note: null,
    done: false,
    doneById: null,
    doneAt: null,
    creatorId: boris.id,
    createdAt,
  };
}

/** The open Items' texts in the section named `name`, top to bottom. */
async function itemTexts(name: string) {
  const rows = within(await screen.findByRole('region', { name })).queryAllByRole('listitem');
  return rows.map((row) => within(row).queryByRole('textbox')?.getAttribute('value') ?? '');
}

/** The connection is back: the app notices (browser `online` event) and sends what is waiting. */
function reconnect() {
  syncServer.goOnline();
  window.dispatchEvent(new Event('online'));
}

/** The «Новый товар» field of the section named `name`. */
async function addField(name: string) {
  return within(await screen.findByRole('region', { name })).findByRole('textbox', {
    name: 'Новый товар',
  });
}

/** The names of the screen's sections, top to bottom. */
function sectionNames() {
  return screen
    .getAllByRole('region')
    .map(
      (region) =>
        region.getAttribute('aria-label') ??
        document.getElementById(region.getAttribute('aria-labelledby') ?? '')?.textContent,
    );
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
});

describe('A Shopping list without named Categories', () => {
  it('looks as before: one «Товары» section, «Товаров пока нет» while empty', async () => {
    syncServer.seed('list', [list(3, 'Аптека', 'SHOPPING')]);

    renderApp(`/lists/${list(3, '', 'SHOPPING').id}`);

    expect(await screen.findByText('Товаров пока нет')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Товары' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Без категории' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Новая категория' })).toBeInTheDocument();
  });

  it.each(['TODO', 'WISH'] as const)('a %s List has no Categories', async (kind) => {
    const chores = list(4, 'Дела', kind);
    syncServer.seed('list', [chores]);
    syncServer.seed('category', [category(5, 'Дом', 1, chores.id)]);

    renderApp(`/lists/${chores.id}`);

    await screen.findByRole('textbox', {
      name: kind === 'TODO' ? 'Новая задача' : 'Новое желание',
    });
    expect(screen.queryByRole('region', { name: 'Дом' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Новая категория' })).not.toBeInTheDocument();
  });
});

describe('A Shopping list with Categories', () => {
  it('shows a section per Category and an untitled one for the Unnamed category, by position', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [chemicals, food]);
    syncServer.seed('item', [
      item(1, 'Мыло', chemicals.id, '2026-11-01T09:00:00Z'),
      item(2, 'Хлеб', null, '2026-11-01T09:01:00Z'),
      item(3, 'Молоко', food.id, '2026-11-01T09:02:00Z'),
      item(4, 'Сыр', food.id, '2026-11-01T09:03:00Z'),
    ]);

    renderApp(`/lists/${groceries.id}`);

    await waitFor(async () => {
      expect(await itemTexts('Еда')).toEqual(['Молоко', 'Сыр']);
    });
    expect(await itemTexts('Без категории')).toEqual(['Хлеб']);
    expect(await itemTexts('Бытовая химия')).toEqual(['Мыло']);
    expect(screen.getAllByRole('heading').map((heading) => heading.textContent)).toEqual([
      'Супермаркет',
      'Еда',
      'Бытовая химия',
    ]);
    expect(sectionNames().slice(0, 3)).toEqual(['Еда', 'Без категории', 'Бытовая химия']);
    for (const name of ['Еда', 'Без категории', 'Бытовая химия']) {
      expect(
        within(screen.getByRole('region', { name })).getByRole('textbox', { name: 'Новый товар' }),
      ).toBeInTheDocument();
    }
    expect(screen.queryByRole('region', { name: 'Товары' })).not.toBeInTheDocument();
  });

  it('shows an empty Category with its add field, and no «Товаров пока нет»', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [food, chemicals]);
    syncServer.seed('item', [item(1, 'Молоко', food.id, '2026-11-01T09:00:00Z')]);

    renderApp(`/lists/${groceries.id}`);

    expect(await addField('Бытовая химия')).toBeInTheDocument();
    expect(await itemTexts('Бытовая химия')).toEqual([]);
    expect(await addField('Без категории')).toBeInTheDocument();
    expect(screen.queryByText('Товаров пока нет')).not.toBeInTheDocument();
  });

  it('adds an Item typed in a Category’s field into it, offline too', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [food, chemicals]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const add = await addField('Бытовая химия');
    syncServer.goOffline();
    await user.type(add, 'Мыло{Enter}');
    await user.type(await addField('Без категории'), 'Хлеб{Enter}');

    await waitFor(async () => {
      expect(await itemTexts('Бытовая химия')).toEqual(['Мыло']);
    });
    expect(await itemTexts('Без категории')).toEqual(['Хлеб']);
    expect(await itemTexts('Еда')).toEqual([]);

    reconnect();

    await waitFor(() => {
      expect(syncServer.operations('item').map((op) => op.fields)).toEqual([
        { listId: groceries.id, text: 'Мыло', categoryId: chemicals.id },
        { listId: groceries.id, text: 'Хлеб' },
      ]);
    });
  });

  it('returns an Item ticked back on to its Category; «Куплено» stays one group', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [food, chemicals]);
    syncServer.seed('item', [
      {
        ...item(1, 'Молоко', food.id, '2026-11-01T09:00:00Z'),
        done: true,
        doneAt: '2026-11-02T09:00:00Z',
      },
      {
        ...item(2, 'Мыло', chemicals.id, '2026-11-01T09:00:00Z'),
        done: true,
        doneAt: '2026-11-02T10:00:00Z',
      },
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const done = await screen.findByRole('region', { name: 'Куплено' });
    expect(
      within(done)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual(['Мыло', 'Молоко']);

    await user.click(screen.getByRole('checkbox', { name: 'Куплено «Молоко»' }));

    await waitFor(async () => {
      expect(await itemTexts('Еда')).toEqual(['Молоко']);
    });
    expect(await itemTexts('Без категории')).toEqual([]);
  });

  it('removes a Category’s section when the pull brings its tombstone; its Items stay', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [food, chemicals]);
    syncServer.seed('item', [item(1, 'Мыло', chemicals.id, '2026-11-01T09:00:00Z')]);

    renderApp(`/lists/${groceries.id}`);
    expect(await itemTexts('Бытовая химия')).toEqual(['Мыло']);

    syncServer.change('category', chemicals.id, 'deleted');
    window.dispatchEvent(new Event('online'));

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Бытовая химия' })).not.toBeInTheDocument();
    });
    expect(await itemTexts('Без категории')).toEqual(['Мыло']);
    expect(await itemTexts('Еда')).toEqual([]);
  });
});

describe('«Новая категория»', () => {
  it('adds a Category at the end with its title being typed, then moves to its add field', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [food, chemicals]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await user.click(await screen.findByRole('button', { name: 'Новая категория' }));

    const title = screen.getByRole('textbox', { name: 'Название категории' });
    expect(title).toHaveFocus();
    expect(title).toHaveAttribute('placeholder', 'Название категории');
    await user.keyboard('Напитки{Enter}');

    await waitFor(async () => {
      expect(await addField('Напитки')).toHaveFocus();
    });
    expect(sectionNames().slice(0, 4)).toEqual([
      'Еда',
      'Без категории',
      'Бытовая химия',
      'Напитки',
    ]);
    await user.keyboard('Сок{Enter}');

    await waitFor(() => {
      expect(syncServer.operations('category').map((op) => op.fields)).toEqual([
        { listId: groceries.id, name: 'Напитки', position: 4 },
      ]);
    });
    const [created] = syncServer.operations('category');
    await waitFor(() => {
      expect(syncServer.operations('item').map((op) => op.fields)).toEqual([
        { listId: groceries.id, text: 'Сок', categoryId: created?.id },
      ]);
    });
  });

  it('starts a list’s first Category after the Unnamed one, whose Items keep their place', async () => {
    const pharmacy = list(3, 'Аптека', 'SHOPPING');
    syncServer.seed('list', [pharmacy]);
    syncServer.seed('item', [
      { ...item(1, 'Аспирин', null, '2026-11-01T09:00:00Z'), listId: pharmacy.id },
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${pharmacy.id}`);
    await user.click(await screen.findByRole('button', { name: 'Новая категория' }));
    await user.keyboard('Витамины{Enter}');

    await waitFor(async () => {
      expect(await addField('Витамины')).toHaveFocus();
    });
    expect(await itemTexts('Без категории')).toEqual(['Аспирин']);
    expect(sectionNames().slice(0, 2)).toEqual(['Без категории', 'Витамины']);
    expect(screen.queryByRole('region', { name: 'Товары' })).not.toBeInTheDocument();
    expect(syncServer.operations('category').map((op) => op.fields?.position)).toEqual([1]);
  });

  it('adds nothing when the title is left empty', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [food]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await user.click(await screen.findByRole('button', { name: 'Новая категория' }));
    await user.keyboard('  {Enter}');

    expect(screen.queryByRole('textbox', { name: 'Название категории' })).not.toBeInTheDocument();
    expect(syncServer.operations('category')).toEqual([]);
  });
});

describe('The store upgrade that adds Categories', () => {
  it('sends an Item still waiting in the store of the app version before Categories', async () => {
    // The store as the app before Categories created it (schema version 3), with an Item added
    // offline and not sent yet.
    localStore.close();
    await Dexie.delete(localStore.name);
    const older = new Dexie(localStore.name);
    older.version(1).stores({ member: 'id', child: 'id', outbox: '++seq', meta: 'key' });
    older.version(2).stores({ child_field: 'id', list: 'id' });
    older.version(3).stores({ item: 'id, listId' });
    const { id, name, kind, visibility } = groceries;
    const milkId = item(1, '', null, '').id;
    const milk = { listId: id, text: 'Молоко' };
    await older.table('list').put({ id, name, kind, visibility });
    await older.table('item').put({ id: milkId, ...milk, done: false });
    await older.table('outbox').add({ table: 'item', id: milkId, op: 'upsert', fields: milk });
    older.close();
    await localStore.open();
    syncServer.seed('list', [groceries]);

    renderApp(`/lists/${groceries.id}`);

    await waitFor(() => {
      expect(syncServer.row('item', milkId)).toEqual({ id: milkId, ...milk });
    });
    expect(await screen.findByRole('textbox', { name: 'Товар «Молоко»' })).toBeInTheDocument();
  });
});

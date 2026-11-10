import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { anna, boris, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// The Category chip (spec #4, ticket #73): under a shopping Item being edited, when the List has
// named Categories, a menu that moves the Item to another Category.

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

/** An open Item row as the pull sends it, in a Category or the Unnamed one. */
function item(n: number, text: string, categoryId: string | null, listId = groceries.id) {
  return {
    id: `17e40000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    listId,
    text,
    categoryId,
    description: null,
    done: false,
    doneById: null,
    doneAt: null,
    creatorId: boris.id,
    createdAt: `2026-11-01T09:0${String(n)}:00Z`,
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

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
});

describe('The Category chip', () => {
  it('shows the Item’s Category under it while it is edited', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [food, chemicals]);
    syncServer.seed('item', [item(1, 'Молоко', food.id)]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const text = await screen.findByRole('textbox', { name: 'Товар «Молоко»' });
    expect(screen.queryByRole('button', { name: /^Категория:/ })).not.toBeInTheDocument();

    await user.click(text);

    expect(screen.getByRole('button', { name: 'Категория: Еда' })).toHaveTextContent('Еда');
  });

  it('lists the Categories in order, «Без категории» in its place, the current one ticked', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [chemicals, food]);
    syncServer.seed('item', [item(1, 'Хлеб', null)]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await user.click(await screen.findByRole('textbox', { name: 'Товар «Хлеб»' }));
    await user.click(screen.getByRole('button', { name: 'Категория: Без категории' }));

    const choices = within(await screen.findByRole('menu')).getAllByRole('menuitemradio');
    expect(choices.map((choice) => choice.textContent)).toEqual([
      'Еда',
      'Без категории',
      'Бытовая химия',
    ]);
    expect(choices.map((choice) => choice.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
    ]);
  });

  it('moves the Item to the picked Category at once, sending only `categoryId`, offline too', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [food, chemicals]);
    syncServer.seed('item', [item(1, 'Молоко', null), item(2, 'Сыр', food.id)]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await user.click(await screen.findByRole('textbox', { name: 'Товар «Молоко»' }));
    syncServer.goOffline();
    await user.click(screen.getByRole('button', { name: 'Категория: Без категории' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Еда' }));

    await waitFor(async () => {
      expect(await itemTexts('Еда')).toEqual(['Молоко', 'Сыр']);
    });
    expect(await itemTexts('Без категории')).toEqual([]);
    expect(syncServer.pushes).toEqual([]);

    reconnect();

    await waitFor(() => {
      expect(syncServer.operations('item')).toEqual([
        expect.objectContaining({ op: 'upsert', fields: { categoryId: food.id } }),
      ]);
    });
  });

  it('moves the Item to «Без категории» by sending a null `categoryId`', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [food, chemicals]);
    syncServer.seed('item', [item(1, 'Мыло', chemicals.id)]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await user.click(await screen.findByRole('textbox', { name: 'Товар «Мыло»' }));
    await user.click(screen.getByRole('button', { name: 'Категория: Бытовая химия' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Без категории' }));

    await waitFor(async () => {
      expect(await itemTexts('Без категории')).toEqual(['Мыло']);
    });
    expect(await itemTexts('Бытовая химия')).toEqual([]);
    await waitFor(() => {
      expect(syncServer.operations('item').map((op) => op.fields)).toEqual([{ categoryId: null }]);
    });
  });

  it('is not shown on a Shopping list without named Categories', async () => {
    const pharmacy = list(3, 'Аптека', 'SHOPPING');
    syncServer.seed('list', [pharmacy]);
    syncServer.seed('item', [item(1, 'Аспирин', null, pharmacy.id)]);
    const user = userEvent.setup();

    renderApp(`/lists/${pharmacy.id}`);
    await user.click(await screen.findByRole('textbox', { name: 'Товар «Аспирин»' }));

    expect(screen.getByRole('textbox', { name: 'Описание «Аспирин»' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Категория:/ })).not.toBeInTheDocument();
  });

  it.each([
    ['TODO', 'Задача «Позвонить»'],
    ['WISH', 'Желание «Позвонить»'],
  ] as const)('is not shown on a %s item', async (kind, field) => {
    const other = list(4, 'Другое', kind);
    syncServer.seed('list', [other]);
    syncServer.seed('category', [category(5, 'Дом', 1, other.id)]);
    syncServer.seed('item', [item(1, 'Позвонить', null, other.id)]);
    const user = userEvent.setup();

    renderApp(`/lists/${other.id}`);
    await user.click(await screen.findByRole('textbox', { name: field }));

    expect(screen.getByRole('textbox', { name: 'Описание «Позвонить»' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Категория:/ })).not.toBeInTheDocument();
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { anna, boris, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// Re-adding a name a Shopping list already has (spec #4, ticket #75): an open Item with that name
// is highlighted instead of a duplicate; a Done one moves back into the add field's Category.

/** A List row as the pull sends it. */
function list(n: number, name: string, kind: 'SHOPPING' | 'TODO' | 'WISH') {
  return {
    id: `1157a000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    name,
    kind,
    visibility: 'SHARED',
    unnamedCategoryPosition: 2,
    ownerId: anna.id,
    createdAt: '2026-11-01T10:00:00Z',
  };
}

const groceries = list(1, 'Супермаркет', 'SHOPPING');

/** An Item row as the pull sends it, added at `createdAt`. */
function item(
  n: number,
  text: string,
  createdAt: string,
  more: { done?: boolean; categoryId?: string; listId?: string } = {},
) {
  const done = more.done ?? false;
  return {
    id: `17e40000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    listId: more.listId ?? groceries.id,
    text,
    categoryId: more.categoryId ?? null,
    description: null,
    done,
    doneById: done ? boris.id : null,
    doneAt: done ? '2026-11-03T10:00:00Z' : null,
    creatorId: boris.id,
    createdAt,
  };
}

const food = { id: 'ca7e0000-0000-4000-8000-000000000001', listId: groceries.id, name: 'Еда' };
const chemicals = {
  id: 'ca7e0000-0000-4000-8000-000000000002',
  listId: groceries.id,
  name: 'Бытовая химия',
};

/** The section named `name`. */
async function section(name: string) {
  return screen.findByRole('region', { name });
}

/** The «Новый товар» field of the section named `name`. */
async function addField(name = 'Товары') {
  return within(await section(name)).findByRole('textbox', { name: 'Новый товар' });
}

/** The open Items' texts in the section named `name`, top to bottom. */
async function itemTexts(name: string) {
  const rows = within(await section(name)).queryAllByRole('listitem');
  return rows.map((row) => within(row).queryByRole('textbox')?.getAttribute('value') ?? '');
}

/** The Done Items' texts, top to bottom (none when there is no «Куплено» section). */
function boughtTexts() {
  const bought = screen.queryByRole('region', { name: 'Куплено' });
  return bought === null
    ? []
    : within(bought)
        .queryAllByRole('listitem')
        .map((row) => row.textContent);
}

/** The connection is back: the app notices (browser `online` event) and sends what is waiting. */
function reconnect() {
  syncServer.goOnline();
  window.dispatchEvent(new Event('online'));
}

/** The row of the open Item `text`. */
function openRow(text: string) {
  return screen.getByRole('textbox', { name: `Товар «${text}»` }).closest('[role=listitem]');
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
});

describe('Re-adding a name that is open', () => {
  it('highlights the open Item, writes nothing, and keeps the add field empty and focused', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [
      item(1, 'Молоко', '2026-11-01T09:00:00Z'),
      item(2, 'Хлеб', '2026-11-01T10:00:00Z'),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const field = await addField();
    await waitFor(async () => {
      expect(await itemTexts('Товары')).toEqual(['Молоко', 'Хлеб']);
    });

    await user.type(field, '  молоко {Enter}');

    await waitFor(() => {
      expect(openRow('Молоко')).toHaveAttribute('data-highlighted');
    });
    expect(openRow('Хлеб')).not.toHaveAttribute('data-highlighted');
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();

    await user.type(field, 'Сыр{Enter}');

    await waitFor(() => {
      expect(syncServer.operations('item').map((op) => op.fields)).toEqual([
        { listId: groceries.id, text: 'Сыр' },
      ]);
    });
    expect(await itemTexts('Товары')).toEqual(['Молоко', 'Хлеб', 'Сыр']);
    await waitFor(
      () => {
        expect(openRow('Молоко')).not.toHaveAttribute('data-highlighted');
      },
      { timeout: 3000 },
    );
  });
});

describe('Re-adding a name that is bought', () => {
  it('moves the Done Item back into the add field’s Category, offline too, sending only done and categoryId', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [
      { ...food, position: 1 },
      { ...chemicals, position: 3 },
    ]);
    syncServer.seed('item', [
      item(1, 'Мыло', '2026-11-01T09:00:00Z', { done: true, categoryId: food.id }),
      item(2, 'Хлеб', '2026-11-01T10:00:00Z', { done: true }),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const field = await addField('Бытовая химия');
    await waitFor(() => {
      expect(boughtTexts()).toEqual(['Мыло', 'Хлеб']);
    });
    syncServer.goOffline();

    await user.type(field, 'МЫЛО {Enter}');

    await waitFor(async () => {
      expect(await itemTexts('Бытовая химия')).toEqual(['Мыло']);
    });
    expect(await itemTexts('Еда')).toEqual([]);
    expect(boughtTexts()).toEqual(['Хлеб']);
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();

    reconnect();

    await waitFor(() => {
      expect(syncServer.operations('item').map(({ id, fields }) => ({ id, fields }))).toEqual([
        { id: item(1, '', '').id, fields: { done: false, categoryId: chemicals.id } },
      ]);
    });
  });

  it('moves it into the Unnamed category from the untitled section’s field', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [{ ...food, position: 1 }]);
    syncServer.seed('item', [
      item(1, 'Молоко', '2026-11-01T09:00:00Z', { done: true, categoryId: food.id }),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await user.type(await addField('Без категории'), 'молоко{Enter}');

    await waitFor(async () => {
      expect(await itemTexts('Без категории')).toEqual(['Молоко']);
    });
    await waitFor(() => {
      expect(syncServer.operations('item').map((op) => op.fields)).toEqual([
        { done: false, categoryId: null },
      ]);
    });
  });
});

describe('Which name matches', () => {
  it('prefers an open Item to a more recently created Done one', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [
      item(2, 'молоко', '2026-11-02T09:00:00Z', { done: true }),
      item(1, 'Молоко', '2026-11-01T09:00:00Z'),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await waitFor(async () => {
      expect(await itemTexts('Товары')).toEqual(['Молоко']);
    });
    await user.type(await addField(), 'Молоко{Enter}');

    await waitFor(() => {
      expect(openRow('Молоко')).toHaveAttribute('data-highlighted');
    });
    expect(await itemTexts('Товары')).toEqual(['Молоко']);
    expect(boughtTexts()).toEqual(['молоко']);
    expect(syncServer.operations('item')).toEqual([]);
  });

  it('with none open, reopens the most recently created Done one', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [
      item(2, 'молоко', '2026-11-02T09:00:00Z', { done: true }),
      item(3, 'Молоко', '2026-11-01T08:00:00Z', { done: true }),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await waitFor(() => {
      expect(boughtTexts()).toEqual(['молоко', 'Молоко']);
    });
    await user.type(await addField(), 'Молоко{Enter}');

    await waitFor(() => {
      expect(syncServer.operations('item').map(({ id, fields }) => ({ id, fields }))).toEqual([
        // Already in the Unnamed category: only what changes is sent.
        { id: item(2, '', '').id, fields: { done: false } },
      ]);
    });
    expect(boughtTexts()).toEqual(['Молоко']);
  });

  it('runs the same check for a tapped suggestion', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [item(1, 'Молоко', '2026-11-01T09:00:00Z')]);
    syncServer.seed('item_history', [
      {
        id: '415e0000-0000-4000-8000-000000000001',
        listId: groceries.id,
        name: 'Молоко',
        lastUsedAt: '2026-11-05T10:00:00Z',
      },
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await user.type(await addField(), 'мол');
    await user.click(await screen.findByRole('button', { name: 'Молоко' }));

    await waitFor(() => {
      expect(openRow('Молоко')).toHaveAttribute('data-highlighted');
    });
    expect(await itemTexts('Товары')).toEqual(['Молоко']);
    expect(syncServer.operations('item')).toEqual([]);
  });

  it('lets a Todo list have two Items with one name', async () => {
    const chores = list(2, 'Дела', 'TODO');
    syncServer.seed('list', [chores]);
    syncServer.seed('item', [item(1, 'Позвонить', '2026-11-01T09:00:00Z', { listId: chores.id })]);
    const user = userEvent.setup();

    renderApp(`/lists/${chores.id}`);
    await user.type(
      await screen.findByRole('textbox', { name: 'Новая задача' }),
      'позвонить{Enter}',
    );

    await waitFor(() => {
      expect(syncServer.operations('item').map((op) => op.fields)).toEqual([
        { listId: chores.id, text: 'позвонить' },
      ]);
    });
  });
});

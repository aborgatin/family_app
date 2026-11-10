import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { anna, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// Autocomplete from the Item history (spec #4, ticket #74): while a name is typed in a Shopping
// list's «Новый товар», up to 5 names from that list's history show under the field; tapping one
// adds it. A Member removes a mistyped name with the × on its row (ticket #78).

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
const pharmacy = list(2, 'Аптека', 'SHOPPING');

/** An Item history row as the pull sends it. */
function history(n: number, name: string, lastUsedAt: string, listId = groceries.id) {
  return {
    id: `415e0000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    listId,
    name,
    lastUsedAt,
  };
}

const food = { id: 'ca7e0000-0000-4000-8000-000000000001', listId: groceries.id, name: 'Еда' };
const chemicals = {
  id: 'ca7e0000-0000-4000-8000-000000000002',
  listId: groceries.id,
  name: 'Бытовая химия',
};

/** The «Новый товар» field of the section named `name`. */
async function addField(name = 'Товары') {
  return within(await screen.findByRole('region', { name })).findByRole('textbox', {
    name: 'Новый товар',
  });
}

/** The names suggested, top to bottom (none when no suggestions show). */
function suggestions() {
  const group = screen.queryByRole('group', { name: 'Подсказки' });
  return group === null
    ? []
    : within(group)
        .getAllByRole('button')
        .filter((button) => !button.getAttribute('aria-label')?.startsWith('Удалить подсказку'))
        .map((button) => button.textContent);
}

/** The open Items' texts in the section named `name`, top to bottom. */
async function itemTexts(name: string) {
  const rows = within(await screen.findByRole('region', { name })).queryAllByRole('listitem');
  return rows.map((row) => within(row).queryByRole('textbox')?.getAttribute('value') ?? '');
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
});

describe('Suggestions from the Item history', () => {
  it('suggests the names with a word starting with the typed text, case and spaces ignored', async () => {
    syncServer.seed('list', [groceries, pharmacy]);
    syncServer.seed('item_history', [
      history(1, 'Молоко', '2026-11-05T10:00:00Z'),
      history(2, 'Кокосовое молоко', '2026-11-04T10:00:00Z'),
      history(3, 'Хлеб', '2026-11-06T10:00:00Z'),
      history(4, 'Смолы', '2026-11-06T10:00:00Z'),
      history(5, 'Молочко для тела', '2026-11-06T10:00:00Z', pharmacy.id),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const field = await addField();
    expect(suggestions()).toEqual([]);

    await user.type(field, '  МОЛ ');

    await waitFor(() => {
      expect(suggestions()).toEqual(['Молоко', 'Кокосовое молоко']);
    });

    await user.keyboard('{Escape}');
    expect(suggestions()).toEqual([]);
  });

  it('shows at most 5, the most recently used first', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item_history', [
      history(1, 'Сыр', '2026-11-01T10:00:00Z'),
      history(2, 'Сметана', '2026-11-03T10:00:00.5Z'),
      history(3, 'Сок', '2026-11-03T10:00:00.123456Z'),
      history(4, 'Соль', '2026-11-02T10:00:00Z'),
      history(5, 'Сахар', '2026-11-07T10:00:00Z'),
      history(6, 'Сосиски', '2026-11-03T10:00:00Z'),
      history(7, 'Хлеб', '2026-11-08T10:00:00Z'),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await user.type(await addField(), 'с');

    await waitFor(() => {
      expect(suggestions()).toEqual(['Сахар', 'Сметана', 'Сок', 'Сосиски', 'Соль']);
    });
  });

  it('adds a tapped name into the field’s Category, offline too, instead of the typed text', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [
      { ...food, position: 1 },
      { ...chemicals, position: 3 },
    ]);
    syncServer.seed('item_history', [
      history(1, 'Молоко', '2026-11-05T10:00:00Z'),
      history(2, 'Мыло', '2026-11-04T10:00:00Z'),
      history(3, 'Хлеб', '2026-11-03T10:00:00Z'),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const foodField = await addField('Еда');
    syncServer.goOffline();
    await user.type(foodField, 'мол');
    await user.click(await screen.findByRole('button', { name: 'Молоко' }));

    await waitFor(async () => {
      expect(await itemTexts('Еда')).toEqual(['Молоко']);
    });
    expect(foodField).toHaveValue('');
    expect(foodField).toHaveFocus();
    expect(suggestions()).toEqual([]);

    await user.type(await addField('Без категории'), 'х');
    await user.click(await screen.findByRole('button', { name: 'Хлеб' }));

    await waitFor(async () => {
      expect(await itemTexts('Без категории')).toEqual(['Хлеб']);
    });
    expect(await itemTexts('Бытовая химия')).toEqual([]);

    syncServer.goOnline();
    window.dispatchEvent(new Event('online'));

    await waitFor(() => {
      expect(syncServer.operations('item').map((op) => op.fields)).toEqual([
        { listId: groceries.id, text: 'Молоко', categoryId: food.id },
        { listId: groceries.id, text: 'Хлеб' },
      ]);
    });
  });

  it('reaches the suggestions with Tab without adding the typed text', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item_history', [history(1, 'Молоко', '2026-11-05T10:00:00Z')]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await user.type(await addField(), 'мол');
    await screen.findByRole('button', { name: 'Молоко' });
    await user.tab();

    expect(screen.getByRole('button', { name: 'Молоко' })).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(async () => {
      expect(await itemTexts('Товары')).toEqual(['Молоко']);
    });
    await waitFor(() => {
      expect(syncServer.operations('item').map((op) => op.fields?.text)).toEqual(['Молоко']);
    });
  });

  it.each(['TODO', 'WISH'] as const)('suggests nothing on a %s List', async (kind) => {
    const chores = list(3, 'Дела', kind);
    syncServer.seed('list', [chores]);
    syncServer.seed('item_history', [
      history(1, 'Пропылесосить', '2026-11-05T10:00:00Z', chores.id),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${chores.id}`);
    await user.type(
      await screen.findByRole('textbox', {
        name: kind === 'TODO' ? 'Новая задача' : 'Новое желание',
      }),
      'про',
    );

    expect(suggestions()).toEqual([]);
  });

  it('stops suggesting a name when the pull brings its tombstone', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item_history', [
      history(1, 'Молоко', '2026-11-05T10:00:00Z'),
      history(2, 'Мыло', '2026-11-04T10:00:00Z'),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await user.type(await addField(), 'м');
    await waitFor(() => {
      expect(suggestions()).toEqual(['Молоко', 'Мыло']);
    });

    syncServer.change('item_history', history(1, '', '').id, 'deleted');
    window.dispatchEvent(new Event('online'));

    await waitFor(() => {
      expect(suggestions()).toEqual(['Мыло']);
    });
  });
});

describe('Removing a name from the Item history', () => {
  it('removes a name with its ×, at once and offline too, keeping the typed text and the focus', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item_history', [
      history(1, 'Малоко', '2026-11-05T10:00:00Z'),
      history(2, 'Масло', '2026-11-04T10:00:00Z'),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const field = await addField();
    syncServer.goOffline();
    await user.type(field, 'ма');
    await user.click(await screen.findByRole('button', { name: 'Удалить подсказку „Малоко“' }));

    await waitFor(() => {
      expect(suggestions()).toEqual(['Масло']);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(field).toHaveValue('ма');
    expect(field).toHaveFocus();
    expect(await itemTexts('Товары')).toEqual([]);

    syncServer.goOnline();
    window.dispatchEvent(new Event('online'));

    await waitFor(() => {
      expect(syncServer.operations('item_history')).toEqual([
        { table: 'item_history', id: history(1, '', '').id, op: 'delete' },
      ]);
    });
    expect(syncServer.operations('item')).toEqual([]);
  });

  it('still adds the name when its row itself is tapped', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item_history', [history(1, 'Малоко', '2026-11-05T10:00:00Z')]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await user.type(await addField(), 'ма');
    await user.click(await screen.findByRole('button', { name: 'Малоко' }));

    await waitFor(async () => {
      expect(await itemTexts('Товары')).toEqual(['Малоко']);
    });
    expect(syncServer.operations('item_history')).toEqual([]);
  });

  it('suggests a removed name again when the pull brings it back, used anew', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item_history', [history(1, 'Малоко', '2026-11-05T10:00:00Z')]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const field = await addField();
    await user.type(field, 'ма');
    await user.click(await screen.findByRole('button', { name: 'Удалить подсказку „Малоко“' }));
    await waitFor(() => {
      expect(syncServer.row('item_history', history(1, '', '').id)).toBeUndefined();
    });
    expect(suggestions()).toEqual([]);

    syncServer.change('item_history', history(1, '', '').id, {
      name: 'малоко',
      lastUsedAt: '2026-11-09T10:00:00Z',
    });
    window.dispatchEvent(new Event('online'));

    await waitFor(() => {
      expect(suggestions()).toEqual(['малоко']);
    });
  });
});

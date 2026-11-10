import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { anna, boris, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// A Description written while adding an Item (spec #67, ticket #79): ↓ in the add field, or its
// icon button, opens a grey «Описание» line under the name; Enter adds the Item with both.

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
function item(n: number, text: string, createdAt: string, more: { done?: boolean } = {}) {
  const done = more.done ?? false;
  return {
    id: `17e40000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    listId: groceries.id,
    text,
    categoryId: null,
    description: null,
    done,
    doneById: done ? boris.id : null,
    doneAt: done ? '2026-11-03T10:00:00Z' : null,
    creatorId: boris.id,
    createdAt,
  };
}

/** The «Товары» section. */
async function items() {
  return screen.findByRole('region', { name: 'Товары' });
}

/** The add field of the List on screen. */
async function addField(name = 'Новый товар') {
  return screen.findByRole('textbox', { name });
}

/** The add row's icon button, if shown. */
function descriptionButton() {
  return screen.queryByRole('button', { name: 'Добавить описание' });
}

/** The add row's «Описание» line, if open. */
function descriptionField() {
  return screen.queryByRole('textbox', { name: 'Описание' });
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

describe('The add field’s Description button', () => {
  it('shows only while the field has text', async () => {
    syncServer.seed('list', [groceries]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const field = await addField();
    expect(descriptionButton()).not.toBeInTheDocument();

    await user.type(field, 'Молоко');
    expect(descriptionButton()).toBeInTheDocument();

    await user.clear(field);
    expect(descriptionButton()).not.toBeInTheDocument();
    expect(within(await items()).queryAllByRole('listitem')).toEqual([]);
  });
});

describe('Adding an Item with a Description', () => {
  it('opens the «Описание» line on a tap of the button, and Enter there adds both in one push, offline too', async () => {
    syncServer.seed('list', [groceries]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const field = await addField();
    await user.type(field, 'Молоко');
    syncServer.goOffline();
    await user.click(screen.getByRole('button', { name: 'Добавить описание' }));

    const line = screen.getByRole('textbox', { name: 'Описание' });
    expect(line).toHaveFocus();
    expect(line).toHaveAttribute('placeholder', 'Описание');
    expect(descriptionButton()).not.toBeInTheDocument();

    await user.type(line, 'Безлактозное{Enter}');

    expect(
      await within(await items()).findByRole('textbox', { name: 'Товар «Молоко»' }),
    ).toBeInTheDocument();
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
    expect(descriptionField()).not.toBeInTheDocument();

    reconnect();

    await waitFor(() => {
      expect(syncServer.operations('item').map((op) => op.fields)).toEqual([
        { listId: groceries.id, text: 'Молоко', description: 'Безлактозное' },
      ]);
    });
  });

  it('opens the line with ↓, goes back with ↑, and Enter in the name adds both', async () => {
    syncServer.seed('list', [groceries]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const field = await addField();
    await user.type(field, 'Хлеб{ArrowDown}');

    expect(descriptionField()).toHaveFocus();
    await user.type(screen.getByRole('textbox', { name: 'Описание' }), '  Бородинский  {ArrowUp}');
    expect(field).toHaveFocus();
    expect(descriptionField()).toHaveValue('  Бородинский  ');

    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(syncServer.operations('item').map((op) => op.fields)).toEqual([
        { listId: groceries.id, text: 'Хлеб', description: 'Бородинский' },
      ]);
    });
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
    expect(descriptionField()).not.toBeInTheDocument();
  });

  it('closes the line with Esc, discarding it, and adds the name alone', async () => {
    syncServer.seed('list', [groceries]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const field = await addField();
    await user.type(field, 'Хлеб{ArrowDown}Бородинский{Escape}');

    expect(descriptionField()).not.toBeInTheDocument();
    expect(field).toHaveFocus();
    expect(field).toHaveValue('Хлеб');

    await user.keyboard('{ArrowDown}');
    expect(descriptionField()).toHaveValue('');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(syncServer.operations('item').map((op) => op.fields)).toEqual([
        { listId: groceries.id, text: 'Хлеб' },
      ]);
    });
  });

  it('adds nothing while the focus moves between the name and the line, and both once on leaving the row', async () => {
    syncServer.seed('list', [groceries]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const field = await addField();
    await user.type(field, 'Хлеб');
    await user.click(screen.getByRole('button', { name: 'Добавить описание' }));
    await user.keyboard('Бородинский{ArrowUp}{ArrowDown}');
    await user.click(field);
    await user.tab();
    expect(descriptionField()).toHaveFocus();
    expect(within(await items()).queryAllByRole('listitem')).toEqual([]);

    await user.click(document.body);

    await waitFor(() => {
      expect(syncServer.operations('item').map((op) => op.fields)).toEqual([
        { listId: groceries.id, text: 'Хлеб', description: 'Бородинский' },
      ]);
    });
    expect(field).toHaveValue('');
    expect(descriptionField()).not.toBeInTheDocument();
  });

  it('sends no Description for a plain name and Enter', async () => {
    syncServer.seed('list', [groceries]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await user.type(await addField(), 'Сыр{Enter}');

    await waitFor(() => {
      expect(syncServer.operations('item').map((op) => op.fields)).toEqual([
        { listId: groceries.id, text: 'Сыр' },
      ]);
    });
  });

  it('works on a Todo list too', async () => {
    const chores = list(2, 'Дела', 'TODO');
    syncServer.seed('list', [chores]);
    const user = userEvent.setup();

    renderApp(`/lists/${chores.id}`);
    const field = await addField('Новая задача');
    await user.type(field, 'Позвонить врачу');
    await user.click(screen.getByRole('button', { name: 'Добавить описание' }));
    await user.keyboard('После 10:00{Enter}');

    await waitFor(() => {
      expect(syncServer.operations('item').map((op) => op.fields)).toEqual([
        { listId: chores.id, text: 'Позвонить врачу', description: 'После 10:00' },
      ]);
    });
  });
});

describe('Re-adding a name with a Description', () => {
  it('highlights an open match and writes nothing', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [item(1, 'Молоко', '2026-11-01T09:00:00Z')]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await within(await items()).findByRole('textbox', { name: 'Товар «Молоко»' });
    await user.type(await addField(), 'молоко{ArrowDown}Безлактозное{Enter}');

    await waitFor(() => {
      expect(
        screen.getByRole('textbox', { name: 'Товар «Молоко»' }).closest('[role=listitem]'),
      ).toHaveAttribute('data-highlighted');
    });
    expect(syncServer.operations('item')).toEqual([]);
  });

  it('reopens a Done match with the typed Description, and keeps its own when none is typed', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [
      item(1, 'Молоко', '2026-11-01T09:00:00Z', { done: true }),
      { ...item(2, 'Хлеб', '2026-11-01T10:00:00Z', { done: true }), description: 'Бородинский' },
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await screen.findByRole('region', { name: 'Куплено' });
    const field = await addField();
    await user.type(field, 'молоко{ArrowDown}Безлактозное{Enter}');
    await user.type(field, 'хлеб{ArrowDown}   {Enter}');

    await waitFor(() => {
      expect(syncServer.operations('item').map(({ id, fields }) => ({ id, fields }))).toEqual([
        { id: item(1, '', '').id, fields: { done: false, description: 'Безлактозное' } },
        { id: item(2, '', '').id, fields: { done: false } },
      ]);
    });
  });
});

describe('Suggestions while adding a Description', () => {
  const history = [
    {
      id: '415e0000-0000-4000-8000-000000000001',
      listId: groceries.id,
      name: 'Молоко',
      lastUsedAt: '2026-11-05T10:00:00Z',
    },
  ];

  it('hide while the line has the focus, and a tapped one adds just the name', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('item_history', history);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const field = await addField();
    await user.type(field, 'мол');
    expect(await screen.findByRole('button', { name: 'Молоко' })).toBeInTheDocument();

    await user.keyboard('{ArrowDown}');
    expect(screen.queryByRole('button', { name: 'Молоко' })).not.toBeInTheDocument();

    await user.keyboard('Свежее{ArrowUp}');
    await user.click(await screen.findByRole('button', { name: 'Молоко' }));

    await waitFor(() => {
      expect(syncServer.operations('item').map((op) => op.fields)).toEqual([
        { listId: groceries.id, text: 'Молоко' },
      ]);
    });
    expect(descriptionField()).not.toBeInTheDocument();
  });
});

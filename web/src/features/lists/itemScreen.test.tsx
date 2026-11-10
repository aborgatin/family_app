import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeEventSource } from '@/test/eventSource';
import { anna, boris, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// The Item screen (spec #81, ticket #83): every Item of every kind has its own screen, opened by
// «Подробнее» on the row being edited, or by a tap on a Done row's text: the name, a large
// «Описание», the Done toggle, who added it and who marked it Done, and «Удалить».

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
const chores = list(2, 'Дела', 'TODO');
const gifts = list(3, 'Подарки', 'WISH');

/** An open Item row as the pull sends it, added by Борис on 12 November. */
function item(n: number, text: string, listId = groceries.id) {
  return {
    id: `17e40000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    listId,
    text,
    description: null as string | null,
    done: false,
    doneById: null as string | null,
    doneAt: null as string | null,
    creatorId: boris.id,
    createdAt: '2026-11-12T10:00:00Z',
  };
}

const milk = item(1, 'Молоко');

/** `item`, marked Done by Анна on 14 November. */
function done<T extends object>(row: T) {
  return { ...row, done: true, doneById: anna.id, doneAt: '2026-11-14T12:00:00Z' };
}

function itemPath(row: { id: string; listId: string }) {
  return `/lists/${row.listId}/items/${row.id}`;
}

/** The connection is back: the app notices (browser `online` event) and sends what is waiting. */
function reconnect() {
  syncServer.goOnline();
  window.dispatchEvent(new Event('online'));
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
  syncServer.seed('member', [
    { id: anna.id, displayName: 'Анна', grammaticalGender: 'FEMININE' },
    { id: boris.id, displayName: 'Борис', grammaticalGender: 'MASCULINE' },
  ]);
  syncServer.seed('list', [groceries, chores, gifts]);
});

describe('Opening the Item screen', () => {
  it('shows «Подробнее» on the row being edited, which opens the Item screen', async () => {
    syncServer.seed('item', [milk, item(2, 'Хлеб')]);
    const user = userEvent.setup();

    const app = renderApp(`/lists/${groceries.id}`);
    const text = await screen.findByRole('textbox', { name: 'Товар «Молоко»' });
    expect(screen.queryByRole('link', { name: 'Подробнее' })).not.toBeInTheDocument();

    await user.click(text);
    await user.click(screen.getByRole('link', { name: 'Подробнее' }));

    expect(app.location()).toBe(itemPath(milk));
    expect(await screen.findByRole('heading', { level: 1, name: 'Товар' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Название' })).toHaveValue('Молоко');
    expect(screen.getByRole('link', { name: 'Супермаркет' })).toHaveAttribute(
      'href',
      `/lists/${groceries.id}`,
    );
  });
});

// Used by the tests added with the next slices.
void [waitFor, within, FakeEventSource, done, reconnect];

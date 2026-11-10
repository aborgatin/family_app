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
    expect(await screen.findByRole('textbox', { name: 'Название' })).toHaveValue('Молоко');
    expect(screen.getByRole('link', { name: 'Супермаркет' })).toHaveAttribute(
      'href',
      `/lists/${groceries.id}`,
    );
  });

  it('saves what was typed in the row before «Подробнее» opens the screen', async () => {
    syncServer.seed('item', [milk]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    await user.click(await screen.findByRole('textbox', { name: 'Товар «Молоко»' }));
    await user.keyboard(' 3,2%');
    await user.type(screen.getByRole('textbox', { name: 'Описание «Молоко»' }), 'Любое');
    await user.click(screen.getByRole('link', { name: 'Подробнее' }));

    expect(await screen.findByRole('textbox', { name: 'Название' })).toHaveValue('Молоко 3,2%');
    await waitFor(() => {
      expect(syncServer.row('item', milk.id)).toMatchObject({
        text: 'Молоко 3,2%',
        description: 'Любое',
      });
    });
  });

  it('opens from a Done row by a tap on its text', async () => {
    syncServer.seed('item', [done(milk)]);
    const user = userEvent.setup();

    const app = renderApp(`/lists/${groceries.id}`);
    const bought = await screen.findByRole('region', { name: 'Куплено' });
    await user.click(await within(bought).findByRole('link', { name: 'Молоко' }));

    expect(app.location()).toBe(itemPath(milk));
    expect(await screen.findByRole('heading', { level: 1, name: 'Товар' })).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Название' })).toHaveValue('Молоко');
  });

  it('keeps a Done row’s text plain in edit mode', async () => {
    syncServer.seed('item', [done(milk)]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);
    const bought = await screen.findByRole('region', { name: 'Куплено' });
    await within(bought).findByRole('link', { name: 'Молоко' });
    await user.click(within(bought).getByRole('button', { name: 'Изменить' }));

    expect(within(bought).queryByRole('link', { name: 'Молоко' })).not.toBeInTheDocument();
    expect(within(bought).getByText('Молоко')).toBeInTheDocument();
  });

  it.each([
    [chores, 'Задача'],
    [gifts, 'Желание'],
  ] as const)('is titled by the List’s kind: %o → «%s»', async (shown, title) => {
    const row = item(5, 'Самокат', shown.id);
    syncServer.seed('item', [row]);

    renderApp(itemPath(row));

    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Название' })).toHaveValue('Самокат');
    expect(screen.getByRole('link', { name: shown.name })).toHaveAttribute(
      'href',
      `/lists/${shown.id}`,
    );
  });
});

describe('The Item screen’s name and Description', () => {
  it('saves both by themselves with no connection; they are still there after a restart offline, and sent on reconnect', async () => {
    syncServer.seed('item', [milk]);
    const user = userEvent.setup();

    const app = renderApp(itemPath(milk));
    const name = await screen.findByRole('textbox', { name: 'Название' });
    const description = screen.getByRole('textbox', { name: 'Описание' });
    expect(description).toHaveAttribute('placeholder', 'Описание');
    expect(description).toHaveValue('');
    syncServer.goOffline();

    await user.click(name);
    await user.keyboard(' 3,2%{Enter}');
    await user.click(description);
    await user.keyboard('Безлактозное{Enter}{Enter}Магазин у дома');
    expect(description).toHaveValue('Безлактозное\n\nМагазин у дома');
    await user.click(name);
    expect(syncServer.pushes).toEqual([]);

    app.unmount();
    renderApp(itemPath(milk), { offline: true });

    expect(await screen.findByRole('textbox', { name: 'Название' })).toHaveValue('Молоко 3,2%');
    expect(screen.getByRole('textbox', { name: 'Описание' })).toHaveValue(
      'Безлактозное\n\nМагазин у дома',
    );

    reconnect();

    await waitFor(() => {
      expect(syncServer.operations('item')).toEqual([
        { table: 'item', id: milk.id, op: 'upsert', fields: { text: 'Молоко 3,2%' } },
        {
          table: 'item',
          id: milk.id,
          op: 'upsert',
          fields: { description: 'Безлактозное\n\nМагазин у дома' },
        },
      ]);
    });
  });

  it('refuses an empty name without sending anything', async () => {
    syncServer.seed('item', [milk]);
    const user = userEvent.setup();

    renderApp(itemPath(milk));
    await user.clear(await screen.findByRole('textbox', { name: 'Название' }));
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Заполните это поле')).toBeInTheDocument();
    expect(syncServer.operations('item')).toEqual([]);
  });

  it('puts the saved Description back on Esc, and clears it when emptied', async () => {
    syncServer.seed('item', [{ ...milk, description: 'Любое' }]);
    const user = userEvent.setup();

    renderApp(itemPath(milk));
    const description = await screen.findByRole('textbox', { name: 'Описание' });
    await user.click(description);
    await user.keyboard(', но свежее{Escape}');
    expect(description).toHaveValue('Любое');

    await user.clear(description);
    await user.click(screen.getByRole('textbox', { name: 'Название' }));

    await waitFor(() => {
      expect(syncServer.operations('item')).toEqual([
        { table: 'item', id: milk.id, op: 'upsert', fields: { description: null } },
      ]);
    });
  });

  it('shows the Description’s addresses as links that open in a new tab, with its line breaks', async () => {
    syncServer.seed('item', [
      {
        ...milk,
        description: 'Любое, вот такое: https://shop.example/milk?id=7.\n\nИли http://other.example',
      },
    ]);

    renderApp(itemPath(milk));

    const link = await screen.findByRole('link', { name: 'https://shop.example/milk?id=7' });
    expect(link).toHaveAttribute('href', 'https://shop.example/milk?id=7');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.getByRole('link', { name: 'http://other.example' })).toHaveAttribute(
      'href',
      'http://other.example',
    );
    const text = screen.getByText(/Любое, вот такое/, { ignore: 'textarea' });
    expect(text).toHaveClass('whitespace-pre-wrap');
    expect(text.textContent).toBe(
      'Любое, вот такое: https://shop.example/milk?id=7.\n\nИли http://other.example',
    );
  });

  it('starts editing the whole Description, the caret at its end, on a tap beside its links', async () => {
    syncServer.seed('item', [{ ...milk, description: 'Любое\nhttps://shop.example' }]);
    const user = userEvent.setup();

    renderApp(itemPath(milk));
    await user.click(await screen.findByText(/Любое/, { ignore: 'textarea' }));

    const description = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Описание' });
    expect(description).toHaveFocus();
    expect(description).toHaveValue('Любое\nhttps://shop.example');
    expect(description.selectionStart).toBe('Любое\nhttps://shop.example'.length);
    // Being edited, it is one field: the links come back when it is left.
    expect(screen.queryByRole('link', { name: 'https://shop.example' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('textbox', { name: 'Название' }));
    expect(screen.getByRole('link', { name: 'https://shop.example' })).toBeInTheDocument();
  });

  it('shows the other Member’s change to the Description while the screen is open', async () => {
    syncServer.seed('item', [{ ...milk, description: 'Любое' }]);

    renderApp(itemPath(milk));
    expect(await screen.findByRole('textbox', { name: 'Описание' })).toHaveValue('Любое');
    const sse = await liveUpdates();

    syncServer.change('item', milk.id, { description: 'Только безлактозное' });
    sse.emit('changed', JSON.stringify({ version: syncServer.latestVersion }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Описание' })).toHaveValue(
        'Только безлактозное',
      );
    });
  });
});

/** The app's live-update connection, open. */
async function liveUpdates() {
  await waitFor(() => {
    expect(FakeEventSource.instances).not.toHaveLength(0);
  });
  const sse = FakeEventSource.latest();
  sse.open();
  return sse;
}

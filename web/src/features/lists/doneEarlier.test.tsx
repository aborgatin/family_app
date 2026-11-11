import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeEventSource } from '@/test/eventSource';
import { anna, boris, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// The Done window of a Todo list (spec #81, ticket #88): «Выполнено» shows the Items marked Done
// today or in the six calendar days before, by the device clock; older ones are behind the row
// «Выполненные ранее», which opens their own screen. Wish and Shopping lists show every Done Item.

/** The device's clock: the afternoon of 10 November 2026, local time. */
const NOW = new Date(2026, 10, 10, 15, 30);

/** A moment on the device's calendar day `days` days before today, as the server prints it. */
function daysAgo(days: number, hours = 12, minutes = 0, seconds = 0) {
  return new Date(2026, 10, 10 - days, hours, minutes, seconds).toISOString();
}

/** A List row as the pull sends it. */
function list(n: number, name: string, kind: 'SHOPPING' | 'TODO' | 'WISH') {
  return {
    id: `1157a000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    name,
    kind,
    visibility: 'SHARED',
    ownerId: anna.id,
    createdAt: '2026-10-01T10:00:00Z',
  };
}

const chores = list(1, 'Дела по дому', 'TODO');

/** An open Item row as the pull sends it. */
function item(n: number, text: string, listId = chores.id) {
  return {
    id: `17e40000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    listId,
    text,
    description: null,
    done: false,
    doneById: null,
    doneAt: null,
    creatorId: boris.id,
    createdAt: `2026-10-01T09:00:${String(n).padStart(2, '0')}Z`,
  };
}

/** An Item row as the pull sends it, marked Done by Boris at `doneAt`. */
function doneItem(n: number, text: string, doneAt: string, listId = chores.id) {
  return { ...item(n, text, listId), done: true, doneById: boris.id, doneAt };
}

/** The id of `item(n, …)`. */
function itemId(n: number) {
  return item(n, '').id;
}

/** The text of each row of the section with this name, top to bottom. */
async function rowTexts(name: string) {
  const rows = within(await screen.findByRole('region', { name })).queryAllByRole('listitem');
  return rows.map((row) => row.textContent);
}

/** The connection is back: the app notices (browser `online` event) and sends what is waiting. */
function reconnect() {
  syncServer.goOnline();
  window.dispatchEvent(new Event('online'));
}

/** The live-update connection, open, once the app has made it. */
async function liveUpdates() {
  await waitFor(() => {
    expect(FakeEventSource.instances).not.toHaveLength(0);
  });
  const sse = FakeEventSource.latest();
  sse.open();
  return sse;
}

/** The server announces its latest Version, as after a commit by the other Member. */
function announce(sse: FakeEventSource) {
  sse.emit('changed', JSON.stringify({ version: syncServer.latestVersion }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('«Выполнено» on a Todo list', () => {
  it('shows the Items marked Done today or in the six calendar days before', async () => {
    syncServer.seed('list', [chores]);
    syncServer.seed('item', [
      item(1, 'Полить цветы'),
      doneItem(2, 'Сегодня утром', daysAgo(0, 8)),
      doneItem(3, 'Три дня назад', daysAgo(3)),
      doneItem(4, 'Шесть дней назад, в полночь', daysAgo(6, 0)),
      doneItem(5, 'Семь дней назад, перед полуночью', daysAgo(7, 23, 59, 59)),
      doneItem(6, 'Месяц назад', daysAgo(30)),
    ]);

    renderApp(`/lists/${chores.id}`);

    await waitFor(async () => {
      expect(await rowTexts('Выполнено')).toEqual([
        'Сегодня утром',
        'Три дня назад',
        'Шесть дней назад, в полночь',
      ]);
    });
    expect(screen.queryByText('Семь дней назад, перед полуночью')).not.toBeInTheDocument();
    expect(screen.queryByText('Месяц назад')).not.toBeInTheDocument();
  });

  it('has a row «Выполненные ранее» under it that opens the older ones, most recent first', async () => {
    syncServer.seed('list', [chores]);
    syncServer.seed('item', [
      item(1, 'Полить цветы'),
      doneItem(2, 'Вчера', daysAgo(1)),
      doneItem(3, 'Месяц назад', daysAgo(30)),
      doneItem(4, 'Неделю назад', daysAgo(7)),
      doneItem(5, 'Две недели назад', daysAgo(14)),
    ]);
    const user = userEvent.setup();

    const app = renderApp(`/lists/${chores.id}`);
    const done = await screen.findByRole('region', { name: 'Выполнено' });
    await user.click(await within(done).findByRole('link', { name: 'Выполненные ранее' }));

    // Level 1 is the screen's title: its section, once the Items are read, has the same name.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Выполненные ранее' }),
    ).toBeInTheDocument();
    expect(app.location()).toBe(`/lists/${chores.id}/done-earlier`);
    await waitFor(async () => {
      expect(await rowTexts('Выполненные ранее')).toEqual([
        'Неделю назад',
        'Две недели назад',
        'Месяц назад',
      ]);
    });
    expect(screen.queryByText('Вчера')).not.toBeInTheDocument();
    expect(screen.queryByText('Полить цветы')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Дела по дому' })).toHaveAttribute(
      'href',
      `/lists/${chores.id}`,
    );
  });

  it('has no «Выполненные ранее» row while no Done Item is older', async () => {
    syncServer.seed('list', [chores]);
    syncServer.seed('item', [
      doneItem(1, 'Вчера', daysAgo(1)),
      doneItem(2, 'Шесть дней', daysAgo(6)),
    ]);

    renderApp(`/lists/${chores.id}`);

    await waitFor(async () => {
      expect(await rowTexts('Выполнено')).toEqual(['Вчера', 'Шесть дней']);
    });
    expect(screen.queryByRole('link', { name: 'Выполненные ранее' })).not.toBeInTheDocument();
  });

  it('is only the «Выполненные ранее» row when every Done Item is older', async () => {
    syncServer.seed('list', [chores]);
    syncServer.seed('item', [item(1, 'Полить цветы'), doneItem(2, 'Месяц назад', daysAgo(30))]);

    renderApp(`/lists/${chores.id}`);

    const done = await screen.findByRole('region', { name: 'Выполнено' });
    expect(within(done).getByRole('link', { name: 'Выполненные ранее' })).toBeInTheDocument();
    expect(within(done).queryByRole('listitem')).not.toBeInTheDocument();
    expect(within(done).queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument();
  });

  it('has an Item ticked off on this device offline, before the server stamps it', async () => {
    syncServer.seed('list', [chores]);
    syncServer.seed('item', [item(1, 'Полить цветы'), doneItem(2, 'Месяц назад', daysAgo(30))]);
    const user = userEvent.setup();

    renderApp(`/lists/${chores.id}`);
    const toggle = await screen.findByRole('checkbox', { name: 'Выполнено «Полить цветы»' });
    syncServer.goOffline();
    await user.click(toggle);

    await waitFor(async () => {
      expect(await rowTexts('Выполнено')).toEqual(['Полить цветы']);
    });
  });

  it('has no «Очистить», and neither has «Выполненные ранее»', async () => {
    syncServer.seed('list', [chores]);
    syncServer.seed('item', [
      doneItem(1, 'Вчера', daysAgo(1)),
      doneItem(2, 'Месяц назад', daysAgo(30)),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${chores.id}`);
    const done = await screen.findByRole('region', { name: 'Выполнено' });
    await within(done).findByRole('checkbox', { name: 'Выполнено «Вчера»' });
    expect(screen.queryByRole('button', { name: 'Очистить' })).not.toBeInTheDocument();

    await user.click(within(done).getByRole('link', { name: 'Выполненные ранее' }));
    const earlier = await screen.findByRole('region', { name: 'Выполненные ранее' });
    expect(within(earlier).getByRole('button', { name: 'Изменить' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Очистить' })).not.toBeInTheDocument();
  });

  it('gets an Item the other Member marked Done, after a live update', async () => {
    syncServer.seed('list', [chores]);
    syncServer.seed('item', [item(1, 'Полить цветы'), item(2, 'Вынести мусор')]);

    renderApp(`/lists/${chores.id}`);
    await screen.findByRole('checkbox', { name: 'Выполнено «Полить цветы»' });
    const sse = await liveUpdates();
    expect(screen.queryByRole('region', { name: 'Выполнено' })).not.toBeInTheDocument();

    syncServer.change('item', itemId(1), { done: true, doneById: boris.id, doneAt: daysAgo(0) });
    announce(sse);

    await waitFor(async () => {
      expect(await rowTexts('Выполнено')).toEqual(['Полить цветы']);
    });
    expect(screen.queryByRole('link', { name: 'Выполненные ранее' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Выполнено «Вынести мусор»' })).not.toBeChecked();
  });

  it('leaves an Item whose Done time a live update brings as older to «Выполненные ранее»', async () => {
    syncServer.seed('list', [chores]);
    syncServer.seed('item', [item(1, 'Полить цветы'), doneItem(2, 'Вчера', daysAgo(1))]);

    renderApp(`/lists/${chores.id}`);
    await screen.findByRole('checkbox', { name: 'Выполнено «Полить цветы»' });
    const sse = await liveUpdates();

    syncServer.change('item', itemId(1), { done: true, doneById: boris.id, doneAt: daysAgo(9) });
    announce(sse);

    expect(await screen.findByRole('link', { name: 'Выполненные ранее' })).toBeInTheDocument();
    expect(await rowTexts('Выполнено')).toEqual(['Вчера']);
    expect(screen.queryByText('Полить цветы')).not.toBeInTheDocument();
  });
});

describe('The «Выполненные ранее» screen', () => {
  /** The screen of `chores`, open and showing its section. */
  async function earlierOpen() {
    const app = renderApp(`/lists/${chores.id}/done-earlier`);
    await screen.findByRole('region', { name: 'Выполненные ранее' });
    return app;
  }

  it('ticks an Item back on, offline at once: it leaves the screen and is open on the List', async () => {
    syncServer.seed('list', [chores]);
    syncServer.seed('item', [
      item(1, 'Полить цветы'),
      doneItem(2, 'Месяц назад', daysAgo(30)),
      doneItem(3, 'Две недели назад', daysAgo(14)),
    ]);
    const user = userEvent.setup();

    await earlierOpen();
    const toggle = await screen.findByRole('checkbox', { name: 'Выполнено «Месяц назад»' });
    expect(toggle).toBeChecked();
    syncServer.goOffline();
    await user.click(toggle);

    await waitFor(async () => {
      expect(await rowTexts('Выполненные ранее')).toEqual(['Две недели назад']);
    });
    expect(syncServer.pushes).toEqual([]);

    reconnect();
    await waitFor(() => {
      expect(syncServer.operations('item')).toEqual([
        { table: 'item', id: itemId(2), op: 'upsert', fields: { done: false } },
      ]);
    });

    await user.click(screen.getByRole('link', { name: 'Дела по дому' }));
    expect(
      await screen.findByRole('textbox', { name: 'Задача «Месяц назад»' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Выполнено «Месяц назад»' })).not.toBeChecked();
  });

  it('deletes an Item after the action sheet: it is in neither place', async () => {
    syncServer.seed('list', [chores]);
    syncServer.seed('item', [
      doneItem(1, 'Вчера', daysAgo(1)),
      doneItem(2, 'Месяц назад', daysAgo(30)),
      doneItem(3, 'Две недели назад', daysAgo(14)),
    ]);
    const user = userEvent.setup();

    await earlierOpen();
    const earlier = screen.getByRole('region', { name: 'Выполненные ранее' });
    await within(earlier).findByRole('checkbox', { name: 'Выполнено «Месяц назад»' });
    await user.click(within(earlier).getByRole('button', { name: 'Изменить' }));
    await user.click(within(earlier).getByRole('button', { name: 'Удалить «Месяц назад»' }));
    const sheet = screen.getByRole('dialog', { name: 'Удалить „Месяц назад“?' });
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    await waitFor(async () => {
      expect(await rowTexts('Выполненные ранее')).toEqual(['Две недели назад']);
    });
    await waitFor(() => {
      expect(syncServer.operations('item')).toEqual([
        { table: 'item', id: itemId(2), op: 'delete' },
      ]);
    });

    await user.click(within(earlier).getByRole('button', { name: 'Готово' }));
    await user.click(screen.getByRole('link', { name: 'Дела по дому' }));
    await waitFor(async () => {
      expect(await rowTexts('Выполнено')).toEqual(['Вчера']);
    });
    expect(screen.queryByText('Месяц назад')).not.toBeInTheDocument();
  });

  it('never gets a todo item deleted from «Выполнено» on the List', async () => {
    syncServer.seed('list', [chores]);
    syncServer.seed('item', [
      doneItem(1, 'Вчера', daysAgo(1)),
      doneItem(2, 'Месяц назад', daysAgo(30)),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${chores.id}`);
    const done = await screen.findByRole('region', { name: 'Выполнено' });
    await user.pointer({ keys: '[MouseRight]', target: await within(done).findByText('Вчера') });
    await user.click(screen.getByRole('menuitem', { name: 'Удалить' }));
    const sheet = screen.getByRole('dialog', { name: 'Удалить „Вчера“?' });
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    await waitFor(async () => {
      expect(await rowTexts('Выполнено')).toEqual([]);
    });
    await user.click(screen.getByRole('link', { name: 'Выполненные ранее' }));
    await waitFor(async () => {
      expect(await rowTexts('Выполненные ранее')).toEqual(['Месяц назад']);
    });
    expect(screen.queryByText('Вчера')).not.toBeInTheDocument();
  });

  it('says «Выполненных ранее задач нет» once the last one is gone', async () => {
    syncServer.seed('list', [chores]);
    syncServer.seed('item', [doneItem(1, 'Месяц назад', daysAgo(30))]);
    const user = userEvent.setup();

    await earlierOpen();
    await user.click(await screen.findByRole('checkbox', { name: 'Выполнено «Месяц назад»' }));

    expect(await screen.findByText('Выполненных ранее задач нет')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument();
  });

  it('loses an Item the other Member ticked back on, and gets one whose Done time is older, after a live update', async () => {
    syncServer.seed('list', [chores]);
    syncServer.seed('item', [
      item(1, 'Полить цветы'),
      doneItem(2, 'Месяц назад', daysAgo(30)),
      doneItem(3, 'Две недели назад', daysAgo(14)),
    ]);

    await earlierOpen();
    await screen.findByRole('checkbox', { name: 'Выполнено «Месяц назад»' });
    const sse = await liveUpdates();

    syncServer.change('item', itemId(2), { done: false, doneById: null, doneAt: null });
    syncServer.change('item', itemId(1), { done: true, doneById: boris.id, doneAt: daysAgo(8) });
    announce(sse);

    await waitFor(async () => {
      expect(await rowTexts('Выполненные ранее')).toEqual(['Полить цветы', 'Две недели назад']);
    });
  });

  it.each([
    ['SHOPPING', 'Супермаркет'],
    ['WISH', 'Подарки'],
  ] as const)('is not there for a %s List', async (kind, name) => {
    const other = list(2, name, kind);
    syncServer.seed('list', [other]);
    syncServer.seed('item', [doneItem(1, 'Месяц назад', daysAgo(30), other.id)]);

    // The List and its Item are on the device before the screen is asked for (an app restart).
    const first = renderApp(`/lists/${other.id}`);
    await screen.findByText('Месяц назад');
    first.unmount();

    renderApp(`/lists/${other.id}/done-earlier`);

    expect(await screen.findByRole('alert')).toHaveTextContent('Такого списка нет');
    expect(screen.queryByText('Месяц назад')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Выполненные ранее' })).not.toBeInTheDocument();
  });

  it('says the List is gone for an unknown one', async () => {
    renderApp('/lists/1157a000-0000-4000-8000-000000000099/done-earlier');

    expect(await screen.findByRole('alert')).toHaveTextContent('Такого списка нет');
  });
});

describe('Other Lists’ Done Items', () => {
  it('are all in a Wish list’s «Исполнено», however old', async () => {
    const gifts = list(3, 'Подарки', 'WISH');
    syncServer.seed('list', [gifts]);
    syncServer.seed('item', [
      doneItem(1, 'Вчера', daysAgo(1), gifts.id),
      doneItem(2, 'Месяц назад', daysAgo(30), gifts.id),
      doneItem(3, 'Год назад', daysAgo(365), gifts.id),
    ]);

    renderApp(`/lists/${gifts.id}`);

    await waitFor(async () => {
      expect(await rowTexts('Исполнено')).toEqual(['Вчера', 'Месяц назад', 'Год назад']);
    });
    expect(screen.queryByRole('link', { name: 'Выполненные ранее' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Очистить' })).not.toBeInTheDocument();
  });

  it('are all in a Shopping list’s «Куплено», and «Очистить» takes them all', async () => {
    const groceries = list(4, 'Супермаркет', 'SHOPPING');
    syncServer.seed('list', [groceries]);
    syncServer.seed('item', [
      doneItem(1, 'Вчера', daysAgo(1), groceries.id),
      doneItem(2, 'Месяц назад', daysAgo(30), groceries.id),
      doneItem(3, 'Год назад', daysAgo(365), groceries.id),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${groceries.id}`);

    await waitFor(async () => {
      expect(await rowTexts('Куплено')).toEqual(['Вчера', 'Месяц назад', 'Год назад']);
    });
    expect(screen.queryByRole('link', { name: 'Выполненные ранее' })).not.toBeInTheDocument();
    const bought = screen.getByRole('region', { name: 'Куплено' });
    await user.click(within(bought).getByRole('button', { name: 'Очистить' }));
    const sheet = screen.getByRole('dialog', { name: 'Очистить 3 товара?' });
    await user.click(within(sheet).getByRole('button', { name: 'Очистить' }));

    await waitFor(() => {
      expect(syncServer.operations('item')).toHaveLength(3);
    });
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Куплено' })).not.toBeInTheDocument();
    });
  });
});

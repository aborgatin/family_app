import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeEventSource } from '@/test/eventSource';
import { anna, boris, masha, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// Hide done on a Todo list (spec #81, ticket #93): «Скрыть» in the «Выполнено» header moves every
// Done item there to «Выполненные ранее», for both Members. The List keeps one moment, set by the
// server's clock when the press arrives (`doneHiddenAt`); «Выполнено» shows the Done items marked
// Done after it and in the last 7 days, «Выполненные ранее» every other Done item.

/** The device's clock: the afternoon of 10 November 2026, local time. */
const NOW = new Date(2026, 10, 10, 15, 30);

/** A moment on the device's calendar day `days` days before today, as the server prints it. */
function daysAgo(days: number, hours = 12, minutes = 0) {
  return new Date(2026, 10, 10 - days, hours, minutes).toISOString();
}

/** A List row as the pull sends it. */
function list(n: number, name: string, kind: 'SHOPPING' | 'TODO' | 'WISH') {
  return {
    id: `1157a000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    name,
    kind,
    visibility: 'SHARED',
    unnamedCategoryPosition: 0,
    ownerId: anna.id,
    childId: null as string | null,
    createdAt: '2026-10-01T10:00:00Z',
    doneHiddenAt: null as string | null,
  };
}

const chores = list(1, 'Дела по дому', 'TODO');

/** What a press of «Скрыть» carries: its own id, so the server applies each press once (S3). */
const PRESS_ID: unknown = expect.stringMatching(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
);

/** An open Item row as the pull sends it. */
function item(n: number, text: string, listId = chores.id) {
  return {
    id: `17e40000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    listId,
    text,
    description: null,
    done: false,
    doneById: null as string | null,
    doneAt: null as string | null,
    creatorId: boris.id,
    createdAt: `2026-10-01T09:00:${String(n).padStart(2, '0')}Z`,
  };
}

/** An Item row as the pull sends it, marked Done by Boris at `doneAt`. */
function doneItem(n: number, text: string, doneAt: string, listId = chores.id) {
  return { ...item(n, text, listId), done: true, doneById: boris.id, doneAt };
}

/** The text of each row of the section with this name, top to bottom. */
async function rowTexts(name: string) {
  const rows = within(await screen.findByRole('region', { name })).queryAllByRole('listitem');
  return rows.map((row) => row.textContent);
}

/** «Скрыть» in the «Выполнено» header, once the section is shown. */
async function hideButton() {
  const done = await screen.findByRole('region', { name: 'Выполнено' });
  return within(done).findByRole('button', { name: 'Скрыть' });
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('«Скрыть» on a Todo list', () => {
  it('moves every Done item of «Выполнено» to «Выполненные ранее» at once, with no question, and the server stamps the moment', async () => {
    syncServer.seed('list', [chores]);
    syncServer.seed('item', [
      item(1, 'Полить цветы'),
      doneItem(2, 'Вчера', daysAgo(1)),
      doneItem(3, 'Сегодня утром', daysAgo(0, 8)),
      doneItem(4, 'Месяц назад', daysAgo(30)),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${chores.id}`);
    await waitFor(async () => {
      expect(await rowTexts('Выполнено')).toEqual(['Сегодня утром', 'Вчера']);
    });
    await user.click(await hideButton());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(async () => {
      expect(await rowTexts('Выполнено')).toEqual([]);
    });
    const done = screen.getByRole('region', { name: 'Выполнено' });
    expect(within(done).queryByRole('button', { name: 'Скрыть' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Выполнено «Полить цветы»' })).not.toBeChecked();
    await waitFor(() => {
      expect(syncServer.operations('list')).toEqual([
        { table: 'list', id: chores.id, op: 'upsert', fields: { hideDone: PRESS_ID } },
      ]);
    });
    await waitFor(() => {
      expect(syncServer.row('list', chores.id)?.doneHiddenAt).toBe(NOW.toISOString());
    });

    await user.click(within(done).getByRole('link', { name: 'Выполненные ранее' }));
    await waitFor(async () => {
      expect(await rowTexts('Выполненные ранее')).toEqual([
        'Сегодня утром',
        'Вчера',
        'Месяц назад',
      ]);
    });
  });

  it('works with no connection: at once, across a restart, an Item ticked before it hidden and one after not, sent on reconnect', async () => {
    syncServer.seed('list', [chores]);
    syncServer.seed('item', [
      item(1, 'Полить цветы'),
      item(2, 'Вынести мусор'),
      doneItem(3, 'Вчера', daysAgo(1)),
    ]);
    const user = userEvent.setup();

    const app = renderApp(`/lists/${chores.id}`);
    const water = await screen.findByRole('checkbox', { name: 'Выполнено «Полить цветы»' });
    syncServer.goOffline();
    await user.click(water);
    await waitFor(async () => {
      expect(await rowTexts('Выполнено')).toEqual(['Полить цветы', 'Вчера']);
    });

    await user.click(await hideButton());
    await waitFor(async () => {
      expect(await rowTexts('Выполнено')).toEqual([]);
    });
    vi.setSystemTime(new Date(2026, 10, 10, 15, 31));
    await user.click(screen.getByRole('checkbox', { name: 'Выполнено «Вынести мусор»' }));
    await waitFor(async () => {
      expect(await rowTexts('Выполнено')).toEqual(['Вынести мусор']);
    });
    expect(syncServer.pushes).toEqual([]);

    app.unmount();
    renderApp(`/lists/${chores.id}`, { offline: true });
    await waitFor(async () => {
      expect(await rowTexts('Выполнено')).toEqual(['Вынести мусор']);
    });

    reconnect();
    await waitFor(() => {
      expect(syncServer.pushes.flatMap((push) => push.operations)).toEqual([
        { table: 'item', id: item(1, '').id, op: 'upsert', fields: { done: true } },
        { table: 'list', id: chores.id, op: 'upsert', fields: { hideDone: PRESS_ID } },
        { table: 'item', id: item(2, '').id, op: 'upsert', fields: { done: true } },
      ]);
    });
    await waitFor(() => {
      expect(syncServer.row('item', item(2, '').id)?.doneAt).not.toBeNull();
    });
    // The server's copies, pulled back: the same split.
    await waitFor(async () => {
      expect(await rowTexts('Выполнено')).toEqual(['Вынести мусор']);
    });
    await user.click(screen.getByRole('link', { name: 'Выполненные ранее' }));
    await waitFor(async () => {
      expect(await rowTexts('Выполненные ранее')).toEqual(['Полить цветы', 'Вчера']);
    });
  });

  it('sends each press with an id of its own, and a later press moves the moment on', async () => {
    syncServer.seed('list', [chores]);
    syncServer.seed('item', [item(1, 'Полить цветы'), doneItem(2, 'Вчера', daysAgo(1))]);
    const user = userEvent.setup();

    renderApp(`/lists/${chores.id}`);
    await user.click(await hideButton());
    await waitFor(() => {
      expect(syncServer.row('list', chores.id)?.doneHiddenAt).toBe(NOW.toISOString());
    });
    vi.setSystemTime(new Date(2026, 10, 10, 15, 31));
    await user.click(screen.getByRole('checkbox', { name: 'Выполнено «Полить цветы»' }));
    await user.click(await hideButton());

    await waitFor(() => {
      const moment = syncServer.row('list', chores.id)?.doneHiddenAt as string;
      expect(Date.parse(moment)).toBeGreaterThanOrEqual(new Date(2026, 10, 10, 15, 31).getTime());
    });
    const presses = syncServer.operations('list').map((op) => op.fields?.hideDone);
    expect(presses).toEqual([PRESS_ID, PRESS_ID]);
    expect(presses[0]).not.toBe(presses[1]);
    expect(await rowTexts('Выполнено')).toEqual([]);
  });

  it('empties «Выполнено» on this phone when the other Member pressed it, after a live update', async () => {
    syncServer.seed('list', [chores]);
    syncServer.seed('item', [
      doneItem(1, 'Вчера', daysAgo(1)),
      doneItem(2, 'Утром', daysAgo(0, 9)),
    ]);

    renderApp(`/lists/${chores.id}`);
    await waitFor(async () => {
      expect(await rowTexts('Выполнено')).toEqual(['Утром', 'Вчера']);
    });
    const sse = await liveUpdates();

    syncServer.change('list', chores.id, { doneHiddenAt: daysAgo(0, 10) });
    sse.emit('changed', JSON.stringify({ version: syncServer.latestVersion }));

    await waitFor(async () => {
      expect(await rowTexts('Выполнено')).toEqual([]);
    });
    expect(screen.queryByRole('button', { name: 'Скрыть' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Выполненные ранее' })).toBeInTheDocument();
  });

  it('is there for the Member who is not the Owner, on a Child’s Todo list', async () => {
    server.use(sessionHandler({ bootstrapRequired: false, member: boris }).handler);
    const school = { ...list(2, 'Школа', 'TODO'), childId: masha.id };
    syncServer.seed('child', [masha]);
    syncServer.seed('list', [school]);
    syncServer.seed('item', [doneItem(1, 'Купить тетради', daysAgo(1), school.id)]);
    const user = userEvent.setup();

    renderApp(`/lists/${school.id}`);
    await user.click(await hideButton());

    await waitFor(async () => {
      expect(await rowTexts('Выполнено')).toEqual([]);
    });
    await waitFor(() => {
      expect(syncServer.row('list', school.id)?.doneHiddenAt).toBe(NOW.toISOString());
    });
  });

  it('is not shown while «Выполнено» has no Items', async () => {
    syncServer.seed('list', [chores]);
    syncServer.seed('item', [item(1, 'Полить цветы'), doneItem(2, 'Месяц назад', daysAgo(30))]);

    renderApp(`/lists/${chores.id}`);

    const done = await screen.findByRole('region', { name: 'Выполнено' });
    expect(
      await within(done).findByRole('link', { name: 'Выполненные ранее' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Скрыть' })).not.toBeInTheDocument();
  });

  it.each([
    ['SHOPPING', 'Супермаркет', 'Куплено'],
    ['WISH', 'Подарки', 'Исполнено'],
  ] as const)('is not on a %s List', async (kind, name, header) => {
    const other = list(3, name, kind);
    syncServer.seed('list', [other]);
    syncServer.seed('item', [doneItem(1, 'Вчера', daysAgo(1), other.id)]);

    renderApp(`/lists/${other.id}`);

    await waitFor(async () => {
      expect(await rowTexts(header)).toEqual(['Вчера']);
    });
    expect(screen.queryByRole('button', { name: 'Скрыть' })).not.toBeInTheDocument();
  });

  it('says why when the server refuses it', async () => {
    syncServer.seed('list', [chores]);
    syncServer.seed('item', [doneItem(1, 'Вчера', daysAgo(1))]);
    syncServer.rejectWhen((op) => op.table === 'list' && { code: 'list.hide_done_not_todo' });
    const user = userEvent.setup();

    renderApp(`/lists/${chores.id}`);
    await user.click(await hideButton());

    expect(
      await screen.findByText(
        'Не удалось сохранить: скрыть выполненные можно только в TODO-списке',
      ),
    ).toBeInTheDocument();
    await waitFor(async () => {
      expect(await rowTexts('Выполнено')).toEqual(['Вчера']);
    });
  });
});

describe('A hidden Done item', () => {
  /** `chores`, hidden at 10:00 today, with an open Item, two Done ones before that and an old one. */
  function seedHidden() {
    syncServer.seed('list', [{ ...chores, doneHiddenAt: daysAgo(0, 10) }]);
    syncServer.seed('item', [
      item(1, 'Полить цветы'),
      doneItem(2, 'Утром', daysAgo(0, 9)),
      doneItem(3, 'Вчера', daysAgo(1)),
      doneItem(4, 'Месяц назад', daysAgo(30)),
    ]);
  }

  it('is in «Выполненные ранее» with the older ones, most recent first', async () => {
    seedHidden();

    renderApp(`/lists/${chores.id}/done-earlier`);

    await waitFor(async () => {
      expect(await rowTexts('Выполненные ранее')).toEqual(['Утром', 'Вчера', 'Месяц назад']);
    });
  });

  it('ticked back on there, is open on the List; ticked Done again, it is in «Выполнено»', async () => {
    seedHidden();
    const user = userEvent.setup();

    renderApp(`/lists/${chores.id}/done-earlier`);
    await user.click(await screen.findByRole('checkbox', { name: 'Выполнено «Утром»' }));
    await waitFor(async () => {
      expect(await rowTexts('Выполненные ранее')).toEqual(['Вчера', 'Месяц назад']);
    });

    await user.click(screen.getByRole('link', { name: 'Дела по дому' }));
    const toggle = await screen.findByRole('checkbox', { name: 'Выполнено «Утром»' });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);

    await waitFor(async () => {
      expect(await rowTexts('Выполнено')).toEqual(['Утром']);
    });
    await waitFor(() => {
      expect(syncServer.row('item', item(2, '').id)?.doneAt).toBe(NOW.toISOString());
    });
    expect(await rowTexts('Выполнено')).toEqual(['Утром']);
  });

  it('deleted there, is in neither place', async () => {
    seedHidden();
    const user = userEvent.setup();

    renderApp(`/lists/${chores.id}/done-earlier`);
    const earlier = await screen.findByRole('region', { name: 'Выполненные ранее' });
    await within(earlier).findByRole('checkbox', { name: 'Выполнено «Утром»' });
    await user.click(within(earlier).getByRole('button', { name: 'Изменить' }));
    await user.click(within(earlier).getByRole('button', { name: 'Удалить «Утром»' }));
    const sheet = screen.getByRole('dialog', { name: 'Удалить „Утром“?' });
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    await waitFor(async () => {
      expect(await rowTexts('Выполненные ранее')).toEqual(['Вчера', 'Месяц назад']);
    });
    await user.click(within(earlier).getByRole('button', { name: 'Готово' }));
    await user.click(screen.getByRole('link', { name: 'Дела по дому' }));
    await screen.findByRole('checkbox', { name: 'Выполнено «Полить цветы»' });
    expect(screen.queryByText('Утром')).not.toBeInTheDocument();
  });
});

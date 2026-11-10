import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeEventSource } from '@/test/eventSource';
import { anna, boris, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// The next occurrence of a repeating todo item (spec #81, ticket #87, ADR-0009): marked Done, the
// item stays in «Выполнено» without its Repeat, and the server adds the next occurrence as a new
// open item, which the device gets through the pull. Анна is logged in and owns the List.

/** The device's clock (and the fake server's): the afternoon of Tuesday 10 November 2026. */
const NOW = new Date(2026, 10, 10, 15, 30);

const chores = {
  id: '1157a000-0000-4000-8000-000000000001',
  name: 'Дела по дому',
  kind: 'TODO',
  visibility: 'SHARED',
  ownerId: anna.id,
  createdAt: '2026-10-01T10:00:00Z',
};

/** An open Item row as the pull sends it, the `n`th added, with this Due date and Repeat. */
function item(n: number, text: string, dueDate: string | null = null, repeat: string | null = null) {
  return {
    id: `17e40000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    listId: chores.id,
    text,
    description: null as string | null,
    dueDate,
    dueTime: null as string | null,
    repeat,
    assigneeId: null as string | null,
    done: false,
    doneById: null as string | null,
    doneAt: null as string | null,
    creatorId: boris.id,
    createdAt: `2026-10-01T09:00:${String(n).padStart(2, '0')}Z`,
  };
}

/** The names of the open items, top to bottom. */
function openNames() {
  return within(screen.getByRole('region', { name: 'Задачи' }))
    .queryAllByRole<HTMLInputElement>('textbox', { name: /^Задача «/ })
    .map((field) => field.value);
}

/** The text of each row of «Выполнено», top to bottom. */
function doneRows() {
  return within(screen.getByRole('region', { name: 'Выполнено' }))
    .queryAllByRole('listitem')
    .map((row) => row.textContent);
}

/** The small line under the name on the row of the open item `text`. */
function rowLine(text: string) {
  const field = screen.getByRole('textbox', { name: `Задача «${text}»` });
  return field.closest('[role="listitem"]')?.textContent;
}

/** The connection is back: the app notices (browser `online` event) and sends what is waiting. */
function reconnect() {
  syncServer.goOnline();
  window.dispatchEvent(new Event('online'));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
  syncServer.seed('member', [
    { id: boris.id, displayName: 'Даша', grammaticalGender: 'FEMININE' },
    { id: anna.id, displayName: 'Анна', grammaticalGender: 'FEMININE' },
  ]);
  syncServer.seed('list', [chores]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('A repeating item marked Done', () => {
  it('goes to «Выполнено» at once with no connection, and its next occurrence appears in its place after reconnecting', async () => {
    syncServer.seed('item', [
      {
        ...item(1, 'Вынести мусор', '2026-11-03', 'WEEKLY'),
        dueTime: '19:00',
        assigneeId: boris.id,
      },
      item(2, 'Полить цветы', '2026-11-12'),
      item(3, 'Оплатить садик', '2026-11-20'),
      item(4, 'Купить клей'),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${chores.id}`);
    const toggle = await screen.findByRole('checkbox', { name: 'Выполнено «Вынести мусор»' });
    syncServer.goOffline();
    await user.click(toggle);

    await waitFor(() => {
      expect(doneRows()).toEqual(['Вынести мусор3 нояб., 19:00 ↻ · Даша']);
    });
    expect(openNames()).toEqual(['Полить цветы', 'Оплатить садик', 'Купить клей']);

    reconnect();

    // Counted from the old Due date: 3 → 10 (today, not after it) → 17 November, at 19:00.
    await waitFor(() => {
      expect(openNames()).toEqual(['Полить цветы', 'Вынести мусор', 'Оплатить садик', 'Купить клей']);
    });
    expect(rowLine('Вынести мусор')).toBe('17 нояб., 19:00 ↻ · Даша');
    // The Done item keeps no Repeat: it moved to the next occurrence.
    expect(doneRows()).toEqual(['Вынести мусор3 нояб., 19:00 · Даша']);
  });

  it('by the other Member reaches this device live: Done, and the next occurrence open', async () => {
    const rubbish = item(1, 'Вынести мусор', '2026-11-10', 'DAILY');
    syncServer.seed('item', [rubbish, item(2, 'Полить цветы', '2026-11-12')]);

    renderApp(`/lists/${chores.id}`);
    await waitFor(() => {
      expect(openNames()).toEqual(['Вынести мусор', 'Полить цветы']);
    });
    await waitFor(() => {
      expect(FakeEventSource.instances).not.toHaveLength(0);
    });
    const sse = FakeEventSource.latest();
    sse.open();

    // Даша's phone ticks it.
    syncServer.change('item', rubbish.id, {
      done: true,
      doneById: boris.id,
      doneAt: new Date(2026, 10, 10, 15).toISOString(),
    });
    sse.emit('changed', JSON.stringify({ version: syncServer.latestVersion }));

    await waitFor(() => {
      expect(doneRows()).toEqual(['Вынести мусорСегодня']);
    });
    expect(openNames()).toEqual(['Вынести мусор', 'Полить цветы']);
    expect(rowLine('Вынести мусор')).toBe('Завтра ↻');
  });

  it('comes back on the first day after today, landing on the month’s last day when it must', async () => {
    syncServer.seed('item', [
      item(1, 'Давно просрочено', '2026-10-01', 'DAILY'),
      item(2, 'Раньше срока', '2026-11-12', 'WEEKLY'),
      item(3, 'Тридцать первое', '2026-01-31', 'MONTHLY'),
      item(4, 'Високосный день', '2024-02-29', 'YEARLY'),
    ]);
    const user = userEvent.setup();

    renderApp(`/lists/${chores.id}`);
    for (const text of ['Давно просрочено', 'Раньше срока', 'Тридцать первое', 'Високосный день']) {
      await user.click(await screen.findByRole('checkbox', { name: `Выполнено «${text}»` }));
    }

    // One next occurrence however overdue; one step on when ticked early; 31 Jan → 28 Feb → 28
    // Mar → … → 28 Nov; 29 Feb 2024 → 28 Feb 2025 → 28 Feb 2026 → 28 Feb 2027.
    await waitFor(() => {
      expect(openNames()).toEqual([
        'Давно просрочено',
        'Раньше срока',
        'Тридцать первое',
        'Високосный день',
      ]);
    });
    expect(rowLine('Давно просрочено')).toBe('Завтра ↻');
    expect(rowLine('Раньше срока')).toBe('19 нояб. ↻');
    expect(rowLine('Тридцать первое')).toBe('28 нояб. ↻');
    expect(rowLine('Високосный день')).toBe('28 февр. 2027 г. ↻');
  });

  it('ticked back on is an ordinary open item, and the next occurrence stays', async () => {
    syncServer.seed('item', [item(1, 'Вынести мусор', '2026-11-10', 'WEEKLY')]);
    const user = userEvent.setup();

    renderApp(`/lists/${chores.id}`);
    await user.click(await screen.findByRole('checkbox', { name: 'Выполнено «Вынести мусор»' }));
    await waitFor(() => {
      expect(openNames()).toEqual(['Вынести мусор']);
    });
    expect(rowLine('Вынести мусор')).toBe('17 нояб. ↻');

    const doneToggle = within(screen.getByRole('region', { name: 'Выполнено' })).getByRole(
      'checkbox',
      { name: 'Выполнено «Вынести мусор»' },
    );
    await user.click(doneToggle);

    await waitFor(() => {
      expect(openNames()).toEqual(['Вынести мусор', 'Вынести мусор']);
    });
    const lines = within(screen.getByRole('region', { name: 'Задачи' }))
      .getAllByRole('listitem')
      .map((row) => row.textContent);
    expect(lines).toEqual(expect.arrayContaining(['Сегодня', '17 нояб. ↻']));
  });
});

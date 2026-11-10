import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anna, boris, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// The Done window of a Todo list (spec #81, ticket #88): «Выполнено» shows the Items marked Done
// today or in the six calendar days before, by the device clock; older ones are behind the row
// «Выполненные ранее», which opens their own screen. Wish and Shopping lists show every Done Item.

/** The device's clock: the afternoon of 10 November 2026, local time. */
const NOW = new Date(2026, 10, 10, 15, 30);

/** A moment on the device's calendar day `daysAgo` days before today, as the server prints it. */
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

/** The text of each row of the section with this name, top to bottom. */
async function rowTexts(name: string) {
  const rows = within(await screen.findByRole('region', { name })).queryAllByRole('listitem');
  return rows.map((row) => row.textContent);
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

    expect(await screen.findByRole('heading', { name: 'Выполненные ранее' })).toBeInTheDocument();
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
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeEventSource } from '@/test/eventSource';
import { anna, masha, petya, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// «Дети» on Home (spec #81, ticket #89): a tile per Child above «Списки», opening the Child page.

/** «Today» in these tests: Маша (12 April 2019) is 7. */
const TODAY = new Date('2026-11-08T12:00:00');

const sonya: typeof masha = {
  id: '0c3e4a52-0000-4000-8000-000000000013',
  name: 'Соня',
  color: 'green',
  birthday: '2025-11-08',
};

/** The tiles, once Home shows this many. */
async function tiles(count: number) {
  const section = await screen.findByRole('region', { name: 'Дети' });
  const list = within(section).getByRole('list', { name: 'Дети' });
  await waitFor(() => {
    expect(within(list).getAllByRole('listitem')).toHaveLength(count);
  });
  return within(list).getAllByRole('listitem');
}

/** The server announces its latest Version, as after a commit by the other Member. */
async function announce() {
  await waitFor(() => {
    expect(FakeEventSource.instances).not.toHaveLength(0);
  });
  const sse = FakeEventSource.latest();
  sse.open();
  sse.emit('changed', JSON.stringify({ version: syncServer.latestVersion }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: TODAY });
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('«Дети» on Home', () => {
  it('shows a tile per Child, oldest first, with the name and the age', async () => {
    syncServer.seed('child', [petya, sonya, masha]);

    renderApp('/');

    const items = await tiles(3);
    expect(items.map((item) => item.textContent)).toEqual(['Маша7 лет', 'Соня1 год', 'Петя']);
  });

  it('is above «Списки»', async () => {
    syncServer.seed('child', [masha]);

    renderApp('/');
    await tiles(1);

    const headers = screen.getAllByRole('heading', { level: 2 });
    expect(headers.map((header) => header.textContent)).toEqual(['Дети', 'Списки']);
  });

  it('fills a tile with the Child color', async () => {
    syncServer.seed('child', [masha]);

    renderApp('/');

    const [tile] = await tiles(1);
    expect(within(tile as HTMLElement).getByRole('link')).toHaveStyle({
      backgroundColor: '#e07a5f',
    });
  });

  it('is not shown while there are no Children', async () => {
    renderApp('/');

    expect(await screen.findByText('Списков пока нет')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Дети' })).not.toBeInTheDocument();
    expect(screen.queryByText('Дети')).not.toBeInTheDocument();
  });

  it('opens the Child page from a tile, by mouse and by keyboard', async () => {
    syncServer.seed('child', [masha, petya]);
    const user = userEvent.setup();

    const app = renderApp('/');
    const [first] = await tiles(2);
    await user.click(within(first as HTMLElement).getByRole('link', { name: /^Маша/ }));

    expect(app.location()).toBe(`/children/${masha.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Маша' })).toBeInTheDocument();

    await user.click(within(screen.getByRole('banner')).getByRole('link', { name: 'Семья' }));
    await tiles(2);
    const link = screen.getByRole('link', { name: 'Петя' });
    link.focus();
    await user.keyboard('{Enter}');

    expect(app.location()).toBe(`/children/${petya.id}`);
  });

  it('follows the other Member’s changes: a Child added, renamed, recolored, deleted', async () => {
    syncServer.seed('child', [masha]);
    renderApp('/');
    await tiles(1);

    syncServer.seed('child', [petya]);
    await announce();
    expect((await tiles(2)).map((item) => item.textContent)).toEqual(['Маша7 лет', 'Петя']);

    syncServer.change('child', masha.id, { name: 'Мария', color: 'teal' });
    await announce();
    const renamed = await screen.findByRole('link', { name: /^Мария/ });
    expect(renamed).toHaveStyle({ backgroundColor: '#2a9d8f' });

    syncServer.change('child', masha.id, 'deleted');
    await announce();
    expect((await tiles(1)).map((item) => item.textContent)).toEqual(['Петя']);

    syncServer.change('child', petya.id, 'deleted');
    await announce();
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Дети' })).not.toBeInTheDocument();
    });
  });

  it('shows the tiles after a restart with no connection', async () => {
    syncServer.seed('child', [masha]);
    const first = renderApp('/');
    await tiles(1);
    first.unmount();

    renderApp('/', { offline: true });

    expect((await tiles(1)).map((item) => item.textContent)).toEqual(['Маша7 лет']);
  });
});

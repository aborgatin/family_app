import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeEventSource } from '@/test/eventSource';
import {
  anna,
  boris,
  invitesHandler,
  masha,
  membersHandler,
  petya,
  sessionHandler,
} from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// The Child page (spec #81, ticket #89): the Child's name as title, «Изменить», and «Профиль»
// with the birthday and age.

/** «Today» in these tests: Маша (12 April 2019) is 7. */
const TODAY = new Date('2026-11-08T12:00:00');

const MISSING = 'Такого ребёнка нет: возможно, его удалили.';

/** The Child page of this Child is open, after the first sync. */
async function childPageOf(child: typeof masha) {
  syncServer.seed('child', [child]);
  const app = renderApp(`/children/${child.id}`);
  await screen.findByRole('heading', { level: 1, name: child.name });
  return app;
}

async function profile() {
  return screen.findByRole('region', { name: 'Профиль' });
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

describe('The Child page', () => {
  it('is titled with the Child’s name and goes back to Home', async () => {
    const user = userEvent.setup();

    const app = await childPageOf(masha);
    await user.click(within(screen.getByRole('banner')).getByRole('link', { name: 'Семья' }));

    expect(app.location()).toBe('/');
  });

  it('shows the birthday with the age under «Профиль», read-only', async () => {
    await childPageOf(masha);

    const section = await profile();
    expect(within(section).getByText('День рождения')).toBeInTheDocument();
    expect(within(section).getByText('12.04.2019 · 7 лет')).toBeInTheDocument();
    expect(within(section).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(section).queryByLabelText('День рождения')).not.toBeInTheDocument();
  });

  it('shows only the date of a birthday still to come', async () => {
    await childPageOf({ ...masha, birthday: '2026-12-01' });

    expect(within(await profile()).getByText('01.12.2026')).toBeInTheDocument();
  });

  it('says «Не указан» for a Child without a birthday', async () => {
    await childPageOf(petya);

    const section = await profile();
    expect(within(section).getByText('День рождения')).toBeInTheDocument();
    expect(within(section).getByText('Не указан')).toBeInTheDocument();
  });

  it('opens the Child’s screen in Settings with «Изменить»', async () => {
    server.use(membersHandler([anna, boris]), invitesHandler([]));
    const user = userEvent.setup();

    const app = await childPageOf(masha);
    await user.click(within(screen.getByRole('banner')).getByRole('link', { name: 'Изменить' }));

    expect(app.location()).toBe(`/settings/children/${masha.id}`);
    expect(await screen.findByRole('textbox', { name: 'Имя' })).toHaveValue('Маша');
  });

  it('follows the other Member’s changes to the name and the birthday', async () => {
    await childPageOf(masha);

    syncServer.change('child', masha.id, { name: 'Мария', birthday: null });
    await announce();

    expect(await screen.findByRole('heading', { level: 1, name: 'Мария' })).toBeInTheDocument();
    expect(within(await profile()).getByText('Не указан')).toBeInTheDocument();
  });

  it('says the Child is missing once the other Member deleted them', async () => {
    await childPageOf(masha);

    syncServer.change('child', masha.id, 'deleted');
    await announce();

    expect(await screen.findByRole('alert')).toHaveTextContent(MISSING);
    expect(screen.queryByRole('heading', { level: 1, name: 'Маша' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Изменить' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Семья' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('says an unknown Child is missing', async () => {
    renderApp('/children/0c3e4a52-0000-4000-8000-0000000000ff');

    expect(await screen.findByRole('alert')).toHaveTextContent(MISSING);
  });

  it('shows the page after a restart with no connection', async () => {
    const first = await childPageOf(masha);
    await profile();
    first.unmount();

    renderApp(`/children/${masha.id}`, { offline: true });

    expect(await screen.findByRole('heading', { level: 1, name: 'Маша' })).toBeInTheDocument();
    expect(within(await profile()).getByText('12.04.2019 · 7 лет')).toBeInTheDocument();
  });
});

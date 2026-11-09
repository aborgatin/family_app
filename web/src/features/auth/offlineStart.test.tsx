import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anna, boris, invitesHandler, masha, membersHandler, petya } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { network } from '@/test/network';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// A Member who was logged in opens the app with no connection: it starts from the data on the
// device, and checks the session again once the server answers (spec #3 stories 19 and 25,
// ticket #62).

const OFFLINE = 'Нет связи с сервером';
const CSRF = 'XSRF-TOKEN';

type User = ReturnType<typeof userEvent.setup>;

const groceries = {
  id: '1157a000-0000-4000-8000-000000000001',
  name: 'Супермаркет',
  kind: 'SHOPPING',
  visibility: 'SHARED',
  ownerId: anna.id,
  createdAt: '2026-11-01T10:00:00Z',
};

/**
 * The server's auth API: `GET /api/auth/session` answers with `session` and, like the real server,
 * issues the CSRF cookie. Offline is the whole network (`network.goOffline()`).
 */
function authServer() {
  const state = {
    session: { bootstrapRequired: false, member: anna as typeof anna | null },
    sessionRequests: 0,
  };
  server.use(
    http.get('/api/auth/session', () => {
      state.sessionRequests += 1;
      document.cookie = `${CSRF}=token-from-server`;
      return HttpResponse.json(state.session);
    }),
  );
  return {
    state,
    goOffline() {
      network.goOffline();
    },
    /** The server answers again; the app notices on its next request. */
    goOnline() {
      network.goOnline();
    },
    /** The server answers again and the browser says so (`online`). */
    reconnect() {
      this.goOnline();
      window.dispatchEvent(new Event('online'));
    },
  };
}

function clearCsrfCookie() {
  document.cookie = `${CSRF}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

async function listsSection() {
  return screen.findByRole('region', { name: 'Списки' });
}

async function childrenSection() {
  return screen.findByRole('region', { name: 'Дети' });
}

/**
 * Анна uses the app once with the server there, so the device holds her data; then it closes.
 * The next `renderApp(path, { offline: true })` is her restart with no signal.
 */
async function usedOnline() {
  const app = renderApp('/');
  await within(await listsSection()).findByText('Супермаркет');
  app.unmount();
  // A restart: the session's CSRF cookie may be gone with it.
  clearCsrfCookie();
}

async function addList(user: User, name: string) {
  const section = await listsSection();
  await user.click(await within(section).findByRole('button', { name: 'Добавить список' }));
  const sheet = screen.getByRole('dialog', { name: 'Новый список' });
  await user.type(within(sheet).getByRole('textbox', { name: 'Название' }), name);
  await user.click(within(sheet).getByRole('radio', { name: 'Покупки' }));
  await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
  await within(section).findByText(name);
}

beforeEach(() => {
  server.use(membersHandler([anna]), invitesHandler([]));
  syncServer.seed('member', [
    { id: anna.id, displayName: anna.displayName, grammaticalGender: anna.grammaticalGender },
  ]);
  syncServer.seed('child', [masha, petya]);
  syncServer.seed('list', [groceries]);
});
afterEach(() => {
  clearCsrfCookie();
});

describe('Opening the app with no connection', () => {
  it('starts as the Member from the device: Lists, Children and the offline indicator', async () => {
    authServer();
    const user = userEvent.setup();
    await usedOnline();

    renderApp('/', { offline: true });

    expect(await within(await listsSection()).findByText('Супермаркет')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: OFFLINE })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Настройки' }));
    const children = await childrenSection();
    expect(await within(children).findByText('Маша')).toBeInTheDocument();
    expect(within(children).getByText('Петя')).toBeInTheDocument();
  });

  it('keeps a change made then and pushes it once the server answers, after the session', async () => {
    const auth = authServer();
    const user = userEvent.setup();
    await usedOnline();
    const sessionRequestsBefore = auth.state.sessionRequests;

    renderApp('/', { offline: true });
    await addList(user, 'Аптека');
    expect(syncServer.operations('list')).toEqual([]);

    auth.reconnect();

    await waitFor(() => {
      expect(syncServer.operations('list')).toHaveLength(1);
    });
    expect(syncServer.operations('list')[0]?.fields).toMatchObject({ name: 'Аптека' });
    // The session was asked again first, so the push carries the CSRF token it issued.
    expect(auth.state.sessionRequests).toBe(sessionRequestsBefore + 1);
    expect(syncServer.pushes[0]?.csrf).toBe('token-from-server');
    expect(screen.queryByRole('button', { name: OFFLINE })).not.toBeInTheDocument();
  });

  it('finds out by itself when the server is back, without the browser saying so', async () => {
    const auth = authServer();
    const user = userEvent.setup();
    await usedOnline();

    renderApp('/', { offline: true });
    await addList(user, 'Аптека');
    auth.goOnline();

    await waitFor(
      () => {
        expect(syncServer.operations('list')).toHaveLength(1);
      },
      { timeout: 3000 },
    );
  });

  it('shows the login screen when the session turns out to have ended, keeping the change', async () => {
    const auth = authServer();
    const user = userEvent.setup();
    server.use(http.post('/api/auth/login', () => HttpResponse.json(anna)));
    await usedOnline();

    const app = renderApp('/', { offline: true });
    await addList(user, 'Аптека');
    auth.state.session = { bootstrapRequired: false, member: null };
    auth.reconnect();

    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    expect(syncServer.pushes).toEqual([]);

    // The same Member logs in again: the change made offline is still there and goes out.
    await user.type(screen.getByLabelText('Электронная почта'), anna.email);
    await user.type(screen.getByLabelText('Пароль'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await within(await listsSection()).findByText('Аптека')).toBeInTheDocument();
    expect(app.location()).toBe('/');
    await waitFor(() => {
      expect(syncServer.operations('list')).toHaveLength(1);
    });
  });

  it('drops the device’s Member when the server answers with another one', async () => {
    const auth = authServer();
    const user = userEvent.setup();
    await usedOnline();

    renderApp('/', { offline: true });
    await addList(user, 'Аптека');
    // The server has no List now, so «Супермаркет» could only come from Анна's local rows.
    syncServer.change('list', groceries.id, 'deleted');
    auth.state.session = { bootstrapRequired: false, member: boris };
    auth.reconnect();

    // Борис's session never sees Анна's rows nor sends her Outbox.
    await waitFor(() => {
      expect(screen.queryByText('Аптека')).not.toBeInTheDocument();
    });
    await within(await listsSection()).findByRole('button', { name: 'Добавить список' });
    expect(screen.queryByText('Супермаркет')).not.toBeInTheDocument();
    expect(syncServer.operations('list')).toEqual([]);
    // Анна's Version went with her rows: Борис's first pull is a full one.
    expect(syncServer.pulls.at(-1)).toBe(0);
  });

  it('opens the setup screen when the server turns out to need setup', async () => {
    const auth = authServer();
    await usedOnline();

    const app = renderApp('/', { offline: true });
    await within(await listsSection()).findByText('Супермаркет');
    auth.state.session = { bootstrapRequired: true, member: null };
    auth.reconnect();

    await waitFor(() => {
      expect(app.location()).toBe('/setup');
    });
  });
});

describe('Opening the app with no connection, as before', () => {
  it('shows the start-up error after a logout the server hasn’t heard of', async () => {
    const auth = authServer();
    const user = userEvent.setup();
    const first = renderApp('/settings');
    await within(await childrenSection()).findByText('Маша');
    auth.goOffline();
    await user.click(await screen.findByRole('button', { name: 'Выйти' }));
    const sheet = await screen.findByRole('dialog', {
      name: 'Выйти из аккаунта на этом устройстве?',
    });
    await user.click(within(sheet).getByRole('button', { name: 'Выйти' }));
    await screen.findByRole('heading', { name: 'Вход' });
    first.unmount();

    renderApp('/', { offline: true });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
  });

  it('shows the start-up error when the device holds no Member’s data', async () => {
    authServer();

    renderApp('/', { offline: true });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
  });
});

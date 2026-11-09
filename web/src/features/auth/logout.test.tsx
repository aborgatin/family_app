import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

// Logging out never loses unsent changes silently and never leaves the Member's data on the device
// (spec #3 "Client → Logout", ticket #59).

const WARNING = 'Нет соединения с сервером. Несохранённые изменения будут потеряны';

type User = ReturnType<typeof userEvent.setup>;

/** `POST /api/auth/logout` answering 204; `calls` counts it and `pushedBefore` records the push. */
function logoutAnswers() {
  const calls = { count: 0, childOperationsBefore: -1 };
  server.use(
    http.post('/api/auth/logout', () => {
      calls.count += 1;
      calls.childOperationsBefore = syncServer.operations('child').length;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

/**
 * The server's auth API for Анна's device: a session that lasts until it hears of a logout, and
 * that fails like a lost network while offline (the sync API with it). `requests` lists the
 * logouts and logins the server received, in order.
 */
function authServer() {
  let offline = false;
  let member: typeof anna | null = anna;
  const requests: ('logout' | 'login')[] = [];
  server.use(
    http.get('/api/auth/session', () =>
      offline ? HttpResponse.error() : HttpResponse.json({ bootstrapRequired: false, member }),
    ),
    http.post('/api/auth/logout', () => {
      if (offline) return HttpResponse.error();
      requests.push('logout');
      member = null;
      return new HttpResponse(null, { status: 204 });
    }),
    http.post('/api/auth/login', () => {
      if (offline) return HttpResponse.error();
      requests.push('login');
      member = anna;
      return HttpResponse.json(anna);
    }),
  );
  return {
    requests,
    goOffline() {
      offline = true;
      syncServer.goOffline();
    },
    /** The server answers again; the app notices on its next request. */
    goOnline() {
      offline = false;
      syncServer.goOnline();
    },
    /** The server answers again and the browser says so (`online`). */
    reconnect() {
      this.goOnline();
      window.dispatchEvent(new Event('online'));
    },
  };
}

function loginAnswers(member: typeof anna) {
  server.use(http.post('/api/auth/login', () => HttpResponse.json(member)));
}

async function childrenSection() {
  return screen.findByRole('region', { name: 'Дети' });
}

/** Deletes Петя from «Дети» in Settings (context menu, then the action sheet). */
async function deletePetya(user: User) {
  const section = await childrenSection();
  await user.pointer({ keys: '[MouseRight]', target: await within(section).findByText('Петя') });
  await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
  await user.click(
    within(await screen.findByRole('dialog', { name: 'Удалить „Петя“?' })).getByRole('button', {
      name: 'Удалить',
    }),
  );
  await waitFor(() => {
    expect(within(section).queryByText('Петя')).not.toBeInTheDocument();
  });
}

/** Taps the red «Выйти» row in Settings and confirms in the action sheet. */
async function logOut(user: User) {
  await user.click(await screen.findByRole('button', { name: 'Выйти' }));
  const sheet = await screen.findByRole('dialog', {
    name: 'Выйти из аккаунта на этом устройстве?',
  });
  await user.click(within(sheet).getByRole('button', { name: 'Выйти' }));
}

async function logIn(user: User, email: string) {
  await user.type(await screen.findByLabelText('Электронная почта'), email);
  await user.type(screen.getByLabelText('Пароль'), 'secret123');
  await user.click(screen.getByRole('button', { name: 'Войти' }));
}

function reconnect() {
  syncServer.goOnline();
  window.dispatchEvent(new Event('online'));
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
  server.use(membersHandler([anna, boris]), invitesHandler([]));
  syncServer.seed('child', [masha, petya]);
});
afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('Logout with an empty Outbox', () => {
  it('logs out at once and leaves none of the Member’s data on the device', async () => {
    const logout = logoutAnswers();
    loginAnswers(anna);
    const user = userEvent.setup();

    renderApp('/settings');
    await within(await childrenSection()).findByText('Маша');
    await logOut(user);

    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    expect(logout.count).toBe(1);
    expect(syncServer.pushes).toEqual([]);

    // Logging in again while the server can't be reached: the device has nothing left to show.
    syncServer.goOffline();
    await logIn(user, anna.email);
    await user.click(await screen.findByRole('link', { name: 'Настройки' }));
    expect(await within(await childrenSection()).findByText('Детей пока нет')).toBeInTheDocument();
  });
});

describe('Logout with unsent changes', () => {
  it('sends them first, then logs out', async () => {
    const logout = logoutAnswers();
    const user = userEvent.setup();

    renderApp('/settings');
    await within(await childrenSection()).findByText('Петя');
    syncServer.goOffline();
    await deletePetya(user);
    // The server is back, but the app hasn't noticed yet: the delete still waits in the Outbox.
    syncServer.goOnline();
    await logOut(user);

    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    expect(syncServer.row('child', petya.id)).toBeUndefined();
    expect(logout.childOperationsBefore).toBe(1);
  });

  it('warns when they can’t be sent, and «Отменить» keeps them', async () => {
    const logout = logoutAnswers();
    const user = userEvent.setup();

    const app = renderApp('/settings');
    await within(await childrenSection()).findByText('Петя');
    syncServer.goOffline();
    await deletePetya(user);
    await logOut(user);

    const warning = await screen.findByRole('dialog', { name: WARNING });
    await user.click(within(warning).getByRole('button', { name: 'Отменить' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(logout.count).toBe(0);
    expect(app.location()).toBe('/settings');
    expect(within(await childrenSection()).getByText('Маша')).toBeInTheDocument();

    reconnect();

    await waitFor(() => {
      expect(syncServer.row('child', petya.id)).toBeUndefined();
    });
  });

  it('warns when they can’t be sent, and «Выйти» logs out and wipes them', async () => {
    const auth = authServer();
    const user = userEvent.setup();

    renderApp('/settings');
    await within(await childrenSection()).findByText('Петя');
    auth.goOffline();
    await deletePetya(user);
    await logOut(user);
    const warning = await screen.findByRole('dialog', { name: WARNING });
    await user.click(within(warning).getByRole('button', { name: 'Выйти' }));

    // The server can't hear of the logout either: the device logs out on its own at once.
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    expect(auth.requests).toEqual([]);

    // Online again: the server is told, the lost delete is never sent.
    auth.reconnect();
    await waitFor(() => {
      expect(auth.requests).toEqual(['logout']);
    });
    await logIn(user, anna.email);
    await user.click(await screen.findByRole('link', { name: 'Настройки' }));
    expect(await within(await childrenSection()).findByText('Петя')).toBeInTheDocument();
    expect(syncServer.operations('child')).toEqual([]);
  });
});

describe('Logout while the server can’t be reached', () => {
  it('keeps the device logged out across restarts until the server hears of it', async () => {
    const auth = authServer();
    const user = userEvent.setup();

    const first = renderApp('/settings');
    await within(await childrenSection()).findByText('Маша');
    auth.goOffline();
    await logOut(user);
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    first.unmount();

    // Opened again with the server back: the session cookie is still valid there, but the
    // device stays logged out, syncs nothing, and tells the server.
    auth.goOnline();
    const pullsBefore = syncServer.pulls.length;
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    await waitFor(() => {
      expect(auth.requests).toEqual(['logout']);
    });
    expect(syncServer.pulls.length).toBe(pullsBefore);
  });

  it('logging in again ends the pending logout without logging the new session out', async () => {
    const auth = authServer();
    const user = userEvent.setup();

    const first = renderApp('/settings');
    await within(await childrenSection()).findByText('Маша');
    auth.goOffline();
    await logOut(user);
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();

    // The server is back, but the app hasn't noticed before the Member logs in.
    auth.goOnline();
    await logIn(user, anna.email);
    await user.click(await screen.findByRole('link', { name: 'Настройки' }));
    expect(await within(await childrenSection()).findByText('Маша')).toBeInTheDocument();
    first.unmount();

    // Opened again: still logged in, and the server never logged the new session out.
    renderApp('/settings');
    expect(await within(await childrenSection()).findByText('Маша')).toBeInTheDocument();
    expect(auth.requests.at(-1)).toBe('login');
  });
});

describe('A session that ended during sync', () => {
  /**
   * Петя is deleted while the session has already ended (the push answers 401); the app is then
   * opened again, finds itself logged out and shows the login screen.
   */
  async function deleteAfterSessionEnded(user: User) {
    let refused = 0;
    server.use(
      http.post('/api/sync/push', () => {
        refused += 1;
        return HttpResponse.json({ code: 'auth.required', params: {} }, { status: 401 });
      }),
    );
    const first = renderApp('/settings');
    await deletePetya(user);
    await waitFor(() => {
      expect(refused).toBe(1);
    });
    first.unmount();

    server.use(sessionHandler({ bootstrapRequired: false, member: null }).handler);
    // The sync API answers normally again (the fake server, in front of the 401 above).
    server.use(...syncServer.handlers);
    renderApp('/settings');
  }

  it('keeps unsent changes and sends them when the same Member logs in again', async () => {
    loginAnswers(anna);
    const user = userEvent.setup();

    await deleteAfterSessionEnded(user);
    await logIn(user, anna.email);

    await waitFor(() => {
      expect(syncServer.row('child', petya.id)).toBeUndefined();
    });
    expect(await within(await childrenSection()).findByText('Маша')).toBeInTheDocument();
  });

  it('wipes them when another Member logs in', async () => {
    loginAnswers(boris);
    const user = userEvent.setup();

    await deleteAfterSessionEnded(user);
    await logIn(user, boris.email);

    expect(await within(await childrenSection()).findByText('Петя')).toBeInTheDocument();
    expect(syncServer.operations('child')).toEqual([]);
    expect(syncServer.row('child', petya.id)).toBeDefined();
  });

  it('shows the login screen at once and resumes when the same Member logs in', async () => {
    loginAnswers(anna);
    let refused = 0;
    server.use(
      http.post('/api/sync/push', () => {
        refused += 1;
        return HttpResponse.json({ code: 'auth.required', params: {} }, { status: 401 });
      }),
    );
    const user = userEvent.setup();

    const app = renderApp('/settings');
    await deletePetya(user);

    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    expect(refused).toBe(1);

    server.use(...syncServer.handlers);
    await logIn(user, anna.email);

    // Back where the session ended, and the delete made before it is sent.
    await waitFor(() => {
      expect(syncServer.row('child', petya.id)).toBeUndefined();
    });
    expect(app.location()).toBe('/settings');
    expect(within(await childrenSection()).queryByText('Петя')).not.toBeInTheDocument();
  });

  it('logging out with the session already gone warns, and «Выйти» wipes everything', async () => {
    const logout = logoutAnswers();
    loginAnswers(anna);
    const user = userEvent.setup();

    const first = renderApp('/settings');
    await within(await childrenSection()).findByText('Петя');
    syncServer.goOffline();
    await deletePetya(user);
    // The server is back, but the session has ended meanwhile; the app hasn't tried yet.
    server.use(
      http.post('/api/sync/push', () =>
        HttpResponse.json({ code: 'auth.required', params: {} }, { status: 401 }),
      ),
      http.post('/api/auth/logout', () =>
        HttpResponse.json({ code: 'auth.required', params: {} }, { status: 401 }),
      ),
    );
    await logOut(user);
    const warning = await screen.findByRole('dialog', { name: WARNING });
    await user.click(within(warning).getByRole('button', { name: 'Выйти' }));

    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    expect(logout.count).toBe(0);
    first.unmount();

    // Opened again with no connection: nothing of Анна's is left to start from.
    server.use(http.get('/api/auth/session', () => HttpResponse.error()));
    const second = renderApp('/settings');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
    second.unmount();

    // Logging in again as Анна: the lost delete is never sent.
    server.use(
      sessionHandler({ bootstrapRequired: false, member: null }).handler,
      ...syncServer.handlers,
    );
    syncServer.goOnline();
    renderApp('/settings');
    await logIn(user, anna.email);
    expect(await within(await childrenSection()).findByText('Петя')).toBeInTheDocument();
    expect(syncServer.operations('child')).toEqual([]);
  });
});

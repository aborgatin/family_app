import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anna, invitesHandler, membersHandler, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';

function loggedOut() {
  server.use(sessionHandler({ bootstrapRequired: false, member: null }).handler);
}

async function logIn(user: ReturnType<typeof userEvent.setup>, password = 'secret123') {
  await user.type(await screen.findByLabelText('Электронная почта'), 'anna@example.com');
  await user.type(screen.getByLabelText('Пароль'), password);
  await user.click(screen.getByRole('button', { name: 'Войти' }));
}

function loginAnswers(response: () => Response) {
  server.use(http.post('/api/auth/login', response));
}

describe('Login', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=token-from-server';
  });
  afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('sends a logged-out visit to the login screen', async () => {
    loggedOut();

    const app = renderApp('/?list=groceries');

    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    expect(app.location()).toBe('/login');
  });

  it('logs in with Enter from the password field', async () => {
    loggedOut();
    loginAnswers(() => HttpResponse.json(anna));
    const user = userEvent.setup();

    renderApp('/login');
    await user.type(await screen.findByLabelText('Электронная почта'), 'anna@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'secret123{Enter}');

    expect(await screen.findByText('Здесь пока пусто')).toBeInTheDocument();
  });

  it('logs in with the CSRF header and returns to where the Member was going', async () => {
    loggedOut();
    let received: { body: unknown; csrf: string | null } | undefined;
    server.use(
      http.post('/api/auth/login', async ({ request }) => {
        received = { body: await request.json(), csrf: request.headers.get('X-XSRF-TOKEN') };
        return HttpResponse.json(anna);
      }),
    );
    const user = userEvent.setup();

    const app = renderApp('/?list=groceries#top');
    await logIn(user);

    expect(await screen.findByText('Здесь пока пусто')).toBeInTheDocument();
    expect(app.location()).toBe('/?list=groceries#top');
    expect(received).toEqual({
      body: { email: 'anna@example.com', password: 'secret123' },
      csrf: 'token-from-server',
    });
  });

  it('opens the home screen after logging in from /login itself', async () => {
    loggedOut();
    loginAnswers(() => HttpResponse.json(anna));
    const user = userEvent.setup();

    const app = renderApp('/login');
    await logIn(user);

    expect(await screen.findByText('Здесь пока пусто')).toBeInTheDocument();
    expect(app.location()).toBe('/');
  });

  it('keeps a logged-in Member away from the login screen', async () => {
    server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);

    const app = renderApp('/login');

    expect(await screen.findByText('Здесь пока пусто')).toBeInTheDocument();
    expect(app.location()).toBe('/');
  });

  it('sends a fresh installation to registration, not to login', async () => {
    server.use(sessionHandler({ bootstrapRequired: true, member: null }).handler);

    const app = renderApp('/login');

    expect(
      await screen.findByRole('heading', { name: 'Регистрация первого взрослого' }),
    ).toBeInTheDocument();
    expect(app.location()).toBe('/setup');
  });

  it('marks empty fields as required without asking the server', async () => {
    loggedOut();
    const user = userEvent.setup();

    renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Войти' }));

    expect(await screen.findAllByText('Заполните это поле')).toHaveLength(2);
  });

  it('shows one generic message for a wrong email or password', async () => {
    loggedOut();
    loginAnswers(() =>
      HttpResponse.json({ code: 'auth.invalid_credentials', params: {} }, { status: 401 }),
    );
    const user = userEvent.setup();

    renderApp('/login');
    await logIn(user, 'wrong-password');

    expect(await screen.findByRole('alert')).toHaveTextContent('Неверная почта или пароль.');
    expect(screen.getByLabelText('Пароль')).toHaveValue('');
  });

  it('says how long to wait after too many attempts', async () => {
    loggedOut();
    loginAnswers(() =>
      HttpResponse.json(
        { code: 'auth.too_many_attempts', params: { retryAfterSeconds: 241 } },
        { status: 429 },
      ),
    );
    const user = userEvent.setup();

    renderApp('/login');
    await logIn(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Слишком много попыток входа. Попробуйте снова через 5 минут.',
    );
  });

  it('uses the right Russian plural for the wait', async () => {
    loggedOut();
    loginAnswers(() =>
      HttpResponse.json(
        { code: 'auth.too_many_attempts', params: { retryAfterSeconds: 60 } },
        { status: 429 },
      ),
    );
    const user = userEvent.setup();

    renderApp('/login');
    await logIn(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Слишком много попыток входа. Попробуйте снова через 1 минуту.',
    );
  });

  it('says so when the server cannot be reached', async () => {
    loggedOut();
    loginAnswers(() => HttpResponse.error());
    const user = userEvent.setup();

    renderApp('/login');
    await logIn(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
  });

  it('shows a generic Russian message for an unknown error code', async () => {
    loggedOut();
    loginAnswers(() => HttpResponse.json({ code: 'something.new', params: {} }, { status: 500 }));
    const user = userEvent.setup();

    renderApp('/login');
    await logIn(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Что-то пошло не так. Попробуйте ещё раз.');
    expect(alert).not.toHaveTextContent('something.new');
  });
});

describe('Logout', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=token-from-server';
    server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
    server.use(membersHandler([anna]), invitesHandler([]));
  });
  afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  /** Taps the red «Выйти» row in Settings and confirms in the action sheet. */
  async function logOut(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Выйти' }));
    const sheet = await screen.findByRole('dialog', {
      name: 'Выйти из аккаунта на этом устройстве?',
    });
    await user.click(within(sheet).getByRole('button', { name: 'Выйти' }));
  }

  it('is not on the home screen', async () => {
    renderApp('/');

    expect(await screen.findByText('Здесь пока пусто')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument();
  });

  it('logs out from Settings after confirming, and shows the login screen', async () => {
    let csrf: string | null = null;
    server.use(
      http.post('/api/auth/logout', ({ request }) => {
        csrf = request.headers.get('X-XSRF-TOKEN');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();

    const app = renderApp('/settings');
    await logOut(user);

    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    expect(app.location()).toBe('/login');
    expect(csrf).toBe('token-from-server');
  });

  it('stays logged in when the action sheet is cancelled', async () => {
    let calls = 0;
    server.use(
      http.post('/api/auth/logout', () => {
        calls += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();

    const app = renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'Выйти' }));
    await user.click(await screen.findByRole('button', { name: 'Отменить' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls).toBe(0);
    expect(app.location()).toBe('/settings');
  });

  it('closes the action sheet with Esc', async () => {
    const user = userEvent.setup();

    renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'Выйти' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('after logging out and in again, opens the home screen', async () => {
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })));
    loginAnswers(() => HttpResponse.json(anna));
    const user = userEvent.setup();

    const app = renderApp('/settings');
    await logOut(user);
    await logIn(user);

    expect(await screen.findByText('Здесь пока пусто')).toBeInTheDocument();
    expect(app.location()).toBe('/');
  });

  it('treats an already ended session as logged out', async () => {
    server.use(
      http.post('/api/auth/logout', () =>
        HttpResponse.json({ code: 'auth.required', params: {} }, { status: 401 }),
      ),
    );
    const user = userEvent.setup();

    renderApp('/settings');
    await logOut(user);

    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
  });

  it('stays logged in and says so when the server cannot be reached', async () => {
    server.use(http.post('/api/auth/logout', () => HttpResponse.error()));
    const user = userEvent.setup();

    const app = renderApp('/settings');
    await logOut(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
    expect(app.location()).toBe('/settings');
  });
});

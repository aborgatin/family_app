import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anna, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';

function freshInstallation() {
  const session = sessionHandler({ bootstrapRequired: true, member: null });
  server.use(session.handler);
  return session;
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  { choose = true }: { choose?: boolean } = {},
) {
  await user.type(await screen.findByLabelText('Электронная почта'), 'Anna@Example.com');
  await user.type(screen.getByLabelText('Пароль'), 'secret123');
  await user.type(screen.getByLabelText('Имя'), 'Анна');
  if (choose) {
    await user.click(screen.getByRole('radio', { name: 'Добавила' }));
  }
}

function submit(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }));
}

describe('First Member registration', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=token-from-server';
  });
  afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('sends a fresh installation to the registration screen', async () => {
    freshInstallation();

    renderApp('/');

    expect(
      await screen.findByRole('heading', { name: 'Регистрация первого взрослого' }),
    ).toBeInTheDocument();
  });

  it('asks the server for the session only once', async () => {
    const session = freshInstallation();
    const user = userEvent.setup();

    renderApp('/');
    await fillForm(user);

    expect(session.calls.count).toBe(1);
  });

  it('offers «Добавил» / «Добавила» with nothing pre-selected', async () => {
    freshInstallation();

    renderApp('/setup');

    const masculine = await screen.findByRole('radio', { name: 'Добавил' });
    const feminine = screen.getByRole('radio', { name: 'Добавила' });
    expect(masculine).not.toBeChecked();
    expect(feminine).not.toBeChecked();
  });

  it('requires the «Добавил» / «Добавила» choice before sending', async () => {
    freshInstallation();
    let sent = false;
    server.use(
      http.post('/api/auth/bootstrap', () => {
        sent = true;
        return HttpResponse.json(anna, { status: 201 });
      }),
    );
    const user = userEvent.setup();

    renderApp('/setup');
    await fillForm(user, { choose: false });
    await submit(user);

    expect(await screen.findByText('Выберите вариант')).toBeInTheDocument();
    expect(sent).toBe(false);
  });

  it('registers the first Member with the CSRF header and opens the home screen', async () => {
    freshInstallation();
    let received: { body: unknown; csrf: string | null } | undefined;
    server.use(
      http.post('/api/auth/bootstrap', async ({ request }) => {
        received = { body: await request.json(), csrf: request.headers.get('X-XSRF-TOKEN') };
        return HttpResponse.json(anna, { status: 201 });
      }),
    );
    const user = userEvent.setup();

    renderApp('/setup');
    await fillForm(user);
    await submit(user);

    expect(await screen.findByText('Здесь пока пусто')).toBeInTheDocument();
    expect(received).toEqual({
      body: {
        email: 'Anna@Example.com',
        password: 'secret123',
        displayName: 'Анна',
        grammaticalGender: 'FEMININE',
      },
      csrf: 'token-from-server',
    });
  });

  it('shows the server’s field errors in Russian next to the fields', async () => {
    freshInstallation();
    server.use(
      http.post('/api/auth/bootstrap', () =>
        HttpResponse.json(
          {
            code: 'validation.failed',
            params: {
              errors: [
                { field: 'email', code: 'email.invalid' },
                { field: 'password', code: 'password.too_short' },
                { field: 'displayName', code: 'too_long' },
              ],
            },
          },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();

    renderApp('/setup');
    await fillForm(user);
    await submit(user);

    expect(await screen.findByText('Введите правильный адрес почты')).toBeInTheDocument();
    expect(screen.getByText('Пароль должен быть не короче 8 символов')).toBeInTheDocument();
    expect(screen.getByText('Слишком длинно')).toBeInTheDocument();
    expect(screen.getByLabelText('Электронная почта')).toHaveAccessibleDescription(
      'Введите правильный адрес почты',
    );
  });

  it('marks empty fields as required without asking the server', async () => {
    freshInstallation();
    const user = userEvent.setup();

    renderApp('/setup');
    await screen.findByLabelText('Электронная почта');
    await submit(user);

    expect(await screen.findAllByText('Заполните это поле')).toHaveLength(3);
    expect(screen.getByText('Выберите вариант')).toBeInTheDocument();
  });

  it('explains when registration is already closed', async () => {
    freshInstallation();
    server.use(
      http.post('/api/auth/bootstrap', () =>
        HttpResponse.json({ code: 'auth.bootstrap_closed', params: {} }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();

    renderApp('/setup');
    await fillForm(user);
    await submit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Регистрация закрыта: первый взрослый уже зарегистрирован',
    );
  });

  it('shows a generic Russian message for an unknown error code', async () => {
    freshInstallation();
    server.use(
      http.post('/api/auth/bootstrap', () =>
        HttpResponse.json({ code: 'something.new', params: {} }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();

    renderApp('/setup');
    await fillForm(user);
    await submit(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Что-то пошло не так. Попробуйте ещё раз.');
    expect(alert).not.toHaveTextContent('something.new');
  });

  it('says so when the server cannot be reached', async () => {
    freshInstallation();
    server.use(http.post('/api/auth/bootstrap', () => HttpResponse.error()));
    const user = userEvent.setup();

    renderApp('/setup');
    await fillForm(user);
    await submit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
  });
});

describe('Route guard', () => {
  it('keeps a registered installation away from the registration screen', async () => {
    server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);

    renderApp('/setup');

    expect(await screen.findByText('Здесь пока пусто')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Регистрация первого взрослого' })).toBeNull();
  });

  it('says so when the session cannot be loaded, and retries', async () => {
    server.use(http.get('/api/auth/session', () => HttpResponse.error()));
    const user = userEvent.setup();

    renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );

    server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
    await user.click(screen.getByRole('button', { name: 'Повторить' }));

    await waitFor(() => {
      expect(screen.getByText('Здесь пока пусто')).toBeInTheDocument();
    });
  });
});

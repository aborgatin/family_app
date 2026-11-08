import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  anna,
  boris,
  childFieldsHandler,
  childrenHandler,
  invitesHandler,
  membersHandler,
  sessionHandler,
} from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(
    sessionHandler({ bootstrapRequired: false, member: anna }).handler,
    membersHandler([anna, boris]),
    invitesHandler([]),
    childFieldsHandler([]),
    childrenHandler([]),
  );
});
afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('Opening the password screen', () => {
  it('opens from «Изменить пароль» in «Ваш профиль»', async () => {
    const user = userEvent.setup();

    const app = renderApp('/settings');
    const profile = await screen.findByRole('region', { name: 'Ваш профиль' });
    await user.click(within(profile).getByRole('link', { name: 'Изменить пароль' }));

    expect(
      await screen.findByRole('heading', { name: 'Изменить пароль', level: 1 }),
    ).toBeInTheDocument();
    expect(app.location()).toBe('/settings/password');
  });

  it('opens from a deep link, and only when logged in', async () => {
    server.use(sessionHandler({ bootstrapRequired: false, member: null }).handler);

    const app = renderApp('/settings/password');

    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    expect(app.location()).toBe('/login');
  });
});

/** Answers `POST /api/members/me/password` and records what was sent. */
function passwordAnswers(response: () => Response) {
  const received: { body: unknown; csrf: string | null }[] = [];
  server.use(
    http.post('/api/members/me/password', async ({ request }) => {
      received.push({ body: await request.json(), csrf: request.headers.get('X-XSRF-TOKEN') });
      return response();
    }),
  );
  return received;
}

const changed = () => new HttpResponse(null, { status: 204 });

async function openScreen() {
  const app = renderApp('/settings/password');
  await screen.findByRole('heading', { name: 'Изменить пароль', level: 1 });
  return app;
}

function current() {
  return screen.getByLabelText('Текущий пароль');
}
function next() {
  return screen.getByLabelText('Новый пароль');
}
function done() {
  return screen.getByRole('button', { name: 'Готово' });
}

describe('Changing the password', () => {
  it('has «Текущий пароль» and «Новый пароль»; «Готово» waits until both are filled', async () => {
    passwordAnswers(changed);
    const user = userEvent.setup();

    await openScreen();
    expect(current()).toHaveAttribute('type', 'password');
    expect(next()).toHaveAttribute('type', 'password');
    expect(done()).toBeDisabled();
    await user.type(current(), 'secret123');
    expect(done()).toBeDisabled();
    await user.type(next(), 'brand-new-pass');
    expect(done()).toBeEnabled();
    await user.clear(current());
    expect(done()).toBeDisabled();
  });

  it('on «Готово» changes it and goes back to Settings, saying «Пароль изменён»', async () => {
    const received = passwordAnswers(changed);
    const user = userEvent.setup();

    const app = await openScreen();
    await user.type(current(), 'secret123');
    await user.type(next(), 'brand-new-pass');
    await user.click(done());

    const profile = await screen.findByRole('region', { name: 'Ваш профиль' });
    expect(within(profile).getByRole('status')).toHaveTextContent('Пароль изменён');
    expect(app.location()).toBe('/settings');
    expect(received).toEqual([
      {
        body: { currentPassword: 'secret123', newPassword: 'brand-new-pass' },
        csrf: 'token-from-server',
      },
    ]);
  });

  it('submits on Enter', async () => {
    const received = passwordAnswers(changed);
    const user = userEvent.setup();

    const app = await openScreen();
    await user.type(current(), 'secret123');
    await user.type(next(), 'brand-new-pass{Enter}');

    await waitFor(() => {
      expect(app.location()).toBe('/settings');
    });
    expect(received).toHaveLength(1);
  });

  it('does nothing on Enter until both are filled', async () => {
    const received = passwordAnswers(changed);
    const user = userEvent.setup();

    const app = await openScreen();
    await user.type(current(), 'secret123{Enter}');

    expect(app.location()).toBe('/settings/password');
    expect(received).toEqual([]);
  });

  it('Settings opened the usual way says nothing about the password', async () => {
    renderApp('/settings');

    const profile = await screen.findByRole('region', { name: 'Ваш профиль' });
    expect(within(profile).queryByText('Пароль изменён')).not.toBeInTheDocument();
  });
});

describe('Leaving without saving', () => {
  it('Esc goes back to Settings and sends nothing', async () => {
    const received = passwordAnswers(changed);
    const user = userEvent.setup();

    const app = await openScreen();
    await user.type(current(), 'secret123');
    await user.keyboard('{Escape}');

    expect(await screen.findByRole('region', { name: 'Ваш профиль' })).toBeInTheDocument();
    expect(app.location()).toBe('/settings');
    expect(screen.queryByText('Пароль изменён')).not.toBeInTheDocument();
    expect(received).toEqual([]);
  });

  it('the back button goes back to Settings and sends nothing', async () => {
    const received = passwordAnswers(changed);
    const user = userEvent.setup();

    const app = await openScreen();
    await user.type(current(), 'secret123');
    await user.click(screen.getByRole('link', { name: 'Настройки' }));

    expect(await screen.findByRole('region', { name: 'Ваш профиль' })).toBeInTheDocument();
    expect(app.location()).toBe('/settings');
    expect(received).toEqual([]);
  });
});

describe('When the change fails', () => {
  async function tryChange(currentPassword: string, newPassword: string) {
    const user = userEvent.setup();
    const app = await openScreen();
    await user.type(current(), currentPassword);
    await user.type(next(), newPassword);
    await user.click(done());
    return app;
  }

  it('says the current password is wrong under the fields, and empties it', async () => {
    passwordAnswers(() =>
      HttpResponse.json({ code: 'auth.invalid_credentials', params: {} }, { status: 400 }),
    );

    const app = await tryChange('not-my-password', 'brand-new-pass');

    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный текущий пароль');
    expect(current()).toHaveAccessibleDescription('Неверный текущий пароль');
    expect(current()).toHaveValue('');
    expect(next()).toHaveValue('brand-new-pass');
    expect(done()).toBeDisabled();
    expect(app.location()).toBe('/settings/password');
  });

  it('shows the server’s rule for a too short new password', async () => {
    passwordAnswers(() =>
      HttpResponse.json(
        {
          code: 'validation.failed',
          params: { errors: [{ field: 'newPassword', code: 'password.too_short' }] },
        },
        { status: 400 },
      ),
    );

    await tryChange('secret123', 'short');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Пароль должен быть не короче 8 символов',
    );
    expect(next()).toHaveAccessibleDescription('Пароль должен быть не короче 8 символов');
    expect(next()).toHaveValue('short');
  });

  it('says the server cannot be reached, keeping what was typed', async () => {
    passwordAnswers(() => HttpResponse.error());

    await tryChange('secret123', 'brand-new-pass');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
    expect(current()).toHaveValue('secret123');
    expect(next()).toHaveValue('brand-new-pass');
    expect(done()).toBeEnabled();
  });

  it('shows a generic Russian message for an unknown error code', async () => {
    passwordAnswers(() =>
      HttpResponse.json({ code: 'something.new', params: {} }, { status: 500 }),
    );

    await tryChange('secret123', 'brand-new-pass');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Что-то пошло не так. Попробуйте ещё раз.');
    expect(alert).not.toHaveTextContent('something.new');
  });
});

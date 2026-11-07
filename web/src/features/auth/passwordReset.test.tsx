import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anna, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';

const TOKEN = 'k3J9xQ_abc-DEF0123456789abcdefghijklmnopqrs';
const LINK = `/reset-password/${TOKEN}`;

function loggedOut() {
  server.use(sessionHandler({ bootstrapRequired: false, member: null }).handler);
}

function linkAnswers(response: () => Response) {
  server.use(http.get(`/api/password-resets/by-token/${TOKEN}`, response));
}

function workingLink() {
  linkAnswers(() => HttpResponse.json({ expiresAt: '2026-11-07T11:00:00Z' }));
}

function completeAnswers(response: () => Response) {
  server.use(http.post(`/api/password-resets/by-token/${TOKEN}/complete`, response));
}

function gone(code: string) {
  return () => HttpResponse.json({ code, params: {} }, { status: 410 });
}

async function setPassword(user: ReturnType<typeof userEvent.setup>, password: string) {
  await user.type(await screen.findByLabelText('Новый пароль'), password);
  await user.click(screen.getByRole('button', { name: 'Сохранить и войти' }));
}

describe('Password reset', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=token-from-server';
  });
  afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('sets a new password from the link and opens the app logged in', async () => {
    loggedOut();
    workingLink();
    let received: { body: unknown; csrf: string | null } | undefined;
    server.use(
      http.post(`/api/password-resets/by-token/${TOKEN}/complete`, async ({ request }) => {
        received = { body: await request.json(), csrf: request.headers.get('X-XSRF-TOKEN') };
        return HttpResponse.json(anna);
      }),
    );
    const user = userEvent.setup();

    const app = renderApp(LINK);
    expect(await screen.findByRole('heading', { name: 'Новый пароль' })).toBeInTheDocument();
    expect(app.location()).toBe(LINK);
    await setPassword(user, 'brand-new-secret');

    expect(await screen.findByText('Здесь пока пусто')).toBeInTheDocument();
    expect(app.location()).toBe('/');
    expect(received).toEqual({
      body: { newPassword: 'brand-new-secret' },
      csrf: 'token-from-server',
    });
  });

  it('works on a device that is already logged in', async () => {
    server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
    workingLink();

    const app = renderApp(LINK);

    expect(await screen.findByLabelText('Новый пароль')).toBeInTheDocument();
    expect(app.location()).toBe(LINK);
  });

  it.each([
    [
      'expired',
      gone('password_reset.expired'),
      'Срок действия ссылки истёк. Попросите новую ссылку для сброса пароля.',
    ],
    [
      'used',
      gone('password_reset.used'),
      'Эта ссылка уже использована. Если нужно сменить пароль ещё раз, попросите новую ссылку.',
    ],
    [
      'unknown',
      () => HttpResponse.json({ code: 'password_reset.not_found', params: {} }, { status: 404 }),
      'Ссылка не найдена. Проверьте, что она скопирована целиком, или попросите новую.',
    ],
  ])('explains a link that is %s instead of showing the form', async (_, answer, message) => {
    loggedOut();
    linkAnswers(answer);

    renderApp(LINK);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByLabelText('Новый пароль')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ко входу' })).toHaveAttribute('href', '/login');
  });

  it('asks for a password before sending anything', async () => {
    loggedOut();
    workingLink();
    let sent = false;
    completeAnswers(() => {
      sent = true;
      return HttpResponse.json(anna);
    });
    const user = userEvent.setup();

    renderApp(LINK);
    await user.click(await screen.findByRole('button', { name: 'Сохранить и войти' }));

    expect(await screen.findByText('Заполните это поле')).toBeInTheDocument();
    expect(sent).toBe(false);
  });

  it('shows the server’s password rule next to the field', async () => {
    loggedOut();
    workingLink();
    completeAnswers(() =>
      HttpResponse.json(
        {
          code: 'validation.failed',
          params: { errors: [{ field: 'newPassword', code: 'password.too_short' }] },
        },
        { status: 400 },
      ),
    );
    const user = userEvent.setup();

    const app = renderApp(LINK);
    await setPassword(user, 'short');

    expect(await screen.findByText('Пароль должен быть не короче 8 символов')).toBeInTheDocument();
    expect(app.location()).toBe(LINK);
  });

  it('explains a link that stopped working while the form was open', async () => {
    loggedOut();
    workingLink();
    completeAnswers(gone('password_reset.used'));
    const user = userEvent.setup();

    renderApp(LINK);
    await setPassword(user, 'brand-new-secret');

    expect(
      await screen.findByText(
        'Эта ссылка уже использована. Если нужно сменить пароль ещё раз, попросите новую ссылку.',
      ),
    ).toBeInTheDocument();
  });

  it('says so when the link cannot be checked, and checks it again on retry', async () => {
    loggedOut();
    let calls = 0;
    linkAnswers(() => {
      calls += 1;
      return calls === 1
        ? HttpResponse.error()
        : HttpResponse.json({ expiresAt: '2026-11-07T11:00:00Z' });
    });
    const user = userEvent.setup();

    renderApp(LINK);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
    expect(screen.queryByLabelText('Новый пароль')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByLabelText('Новый пароль')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the network message when the server cannot be reached', async () => {
    loggedOut();
    workingLink();
    completeAnswers(() => HttpResponse.error());
    const user = userEvent.setup();

    renderApp(LINK);
    await setPassword(user, 'brand-new-secret');

    expect(
      await screen.findByText('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'),
    ).toBeInTheDocument();
  });
});

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anna, boris, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';

const TOKEN = 'Zm9vYmFyYmF6cXV4_-0123456789abcdefghijklmno';
const LINK = `/invite/${TOKEN}`;

function loggedOut() {
  server.use(sessionHandler({ bootstrapRequired: false, member: null }).handler);
}

function linkAnswers(response: () => Response) {
  server.use(http.get(`/api/invites/by-token/${TOKEN}`, response));
}

function workingLink() {
  linkAnswers(() => HttpResponse.json({ expiresAt: '2026-11-14T12:00:00Z' }));
}

function acceptAnswers(response: () => Response) {
  server.use(http.post(`/api/invites/by-token/${TOKEN}/accept`, response));
}

function gone(code: string) {
  return () => HttpResponse.json({ code, params: {} }, { status: 410 });
}

async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Электронная почта'), 'boris@example.com');
  await user.type(screen.getByLabelText('Пароль'), 'boris-pass');
  await user.type(screen.getByLabelText('Имя'), 'Борис');
  await user.click(screen.getByRole('radio', { name: 'Мужской' }));
}

function join(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: 'Присоединиться' }));
}

describe('Invite link', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=token-from-server';
  });
  afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('says the person is invited to the Family and registers them, logged in', async () => {
    loggedOut();
    workingLink();
    let received: { body: unknown; csrf: string | null } | undefined;
    server.use(
      http.post(`/api/invites/by-token/${TOKEN}/accept`, async ({ request }) => {
        received = { body: await request.json(), csrf: request.headers.get('X-XSRF-TOKEN') };
        return HttpResponse.json(boris, { status: 201 });
      }),
    );
    const user = userEvent.setup();

    const app = renderApp(LINK);
    expect(await screen.findByRole('heading', { name: 'Приглашение в семью' })).toBeInTheDocument();
    expect(
      await screen.findByText('Вас пригласили в семью. Зарегистрируйтесь, чтобы присоединиться.'),
    ).toBeInTheDocument();
    expect(app.location()).toBe(LINK);
    await fillIn(user);
    await join(user);

    expect(await screen.findByText('Списков пока нет')).toBeInTheDocument();
    expect(app.location()).toBe('/');
    expect(received).toEqual({
      body: {
        email: 'boris@example.com',
        password: 'boris-pass',
        displayName: 'Борис',
        grammaticalGender: 'MASCULINE',
      },
      csrf: 'token-from-server',
    });
  });

  it('opens on a device that is already logged in', async () => {
    server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
    workingLink();

    const app = renderApp(LINK);

    expect(await screen.findByLabelText('Электронная почта')).toBeInTheDocument();
    expect(app.location()).toBe(LINK);
  });

  it('requires the «Пол» choice («Мужской» / «Женский»), with nothing pre-selected', async () => {
    loggedOut();
    workingLink();
    let sent = false;
    acceptAnswers(() => {
      sent = true;
      return HttpResponse.json(boris, { status: 201 });
    });
    const user = userEvent.setup();

    renderApp(LINK);
    await user.type(await screen.findByLabelText('Электронная почта'), 'boris@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'boris-pass');
    await user.type(screen.getByLabelText('Имя'), 'Борис');
    const choice = screen.getByRole('radiogroup', { name: 'Пол' });
    expect(within(choice).getByRole('radio', { name: 'Мужской' })).not.toBeChecked();
    expect(within(choice).getByRole('radio', { name: 'Женский' })).not.toBeChecked();
    await join(user);

    expect(await screen.findByText('Выберите вариант')).toBeInTheDocument();
    expect(sent).toBe(false);
  });

  it('says it is checking the link until the server answers', async () => {
    loggedOut();
    linkAnswers(() => delay('infinite') as never);

    renderApp(LINK);

    expect(await screen.findByText('Проверяем ссылку…')).toHaveRole('status');
    expect(screen.getByRole('heading', { name: 'Приглашение в семью' })).toBeInTheDocument();
  });

  it.each([
    ['expired', gone('invite.expired'), 'Срок действия приглашения истёк. Попросите новое.'],
    ['used', gone('invite.used'), 'Это приглашение уже использовано. Попросите новое.'],
    ['revoked', gone('invite.revoked'), 'Это приглашение отозвано. Попросите новое.'],
    [
      'unknown',
      () => HttpResponse.json({ code: 'invite.not_found', params: {} }, { status: 404 }),
      'Приглашение не найдено. Проверьте, что ссылка скопирована целиком, или попросите новую.',
    ],
  ])('explains a link that is %s instead of showing the form', async (_, answer, message) => {
    loggedOut();
    linkAnswers(answer);

    renderApp(LINK);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByLabelText('Электронная почта')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ко входу' })).toHaveAttribute('href', '/login');
  });

  it('explains a link that stopped working while the form was open', async () => {
    loggedOut();
    workingLink();
    acceptAnswers(gone('invite.used'));
    const user = userEvent.setup();

    renderApp(LINK);
    await fillIn(user);
    await join(user);

    expect(
      await screen.findByText('Это приглашение уже использовано. Попросите новое.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Электронная почта')).not.toBeInTheDocument();
  });

  it('says so next to the email when it already belongs to a Member', async () => {
    loggedOut();
    workingLink();
    acceptAnswers(() =>
      HttpResponse.json({ code: 'member.email_taken', params: {} }, { status: 409 }),
    );
    const user = userEvent.setup();

    const app = renderApp(LINK);
    await fillIn(user);
    await join(user);

    expect(
      await screen.findByText('Эта почта уже зарегистрирована. Войдите с ней или укажите другую.'),
    ).toBeInTheDocument();
    expect(app.location()).toBe(LINK);
  });

  it('shows the server’s field rules next to the fields', async () => {
    loggedOut();
    workingLink();
    acceptAnswers(() =>
      HttpResponse.json(
        {
          code: 'validation.failed',
          params: { errors: [{ field: 'password', code: 'password.too_short' }] },
        },
        { status: 400 },
      ),
    );
    const user = userEvent.setup();

    renderApp(LINK);
    await fillIn(user);
    await join(user);

    expect(await screen.findByText('Пароль должен быть не короче 8 символов')).toBeInTheDocument();
  });

  it('shows the network message when the server cannot be reached, and retries', async () => {
    loggedOut();
    let calls = 0;
    linkAnswers(() => {
      calls += 1;
      return calls === 1
        ? HttpResponse.error()
        : HttpResponse.json({ expiresAt: '2026-11-14T12:00:00Z' });
    });
    const user = userEvent.setup();

    renderApp(LINK);
    expect(
      await screen.findByText('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByLabelText('Электронная почта')).toBeInTheDocument();
  });

  it('shows the generic message for an unknown error code', async () => {
    loggedOut();
    workingLink();
    acceptAnswers(() => HttpResponse.json({ code: 'something.new', params: {} }, { status: 500 }));
    const user = userEvent.setup();

    renderApp(LINK);
    await fillIn(user);
    await join(user);

    expect(await screen.findByText('Что-то пошло не так. Попробуйте ещё раз.')).toBeInTheDocument();
  });
});

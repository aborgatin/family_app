import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anna, boris, membersHandler, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';

const NO_CONNECTION = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';

async function membersSection() {
  return screen.findByRole('region', { name: 'Взрослые' });
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
});
afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('Members list', () => {
  it('shows every Member with display name and email', async () => {
    server.use(membersHandler([anna, boris]));

    renderApp('/settings');

    const list = await within(await membersSection()).findByRole('list', { name: 'Взрослые' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Анна (вы)');
    expect(items[0]).toHaveTextContent('anna@example.com');
    expect(items[1]).toHaveTextContent('Борис');
    expect(items[1]).not.toHaveTextContent('(вы)');
    expect(items[1]).toHaveTextContent('boris@example.com');
  });

  it('says so when the Members cannot be loaded, and loads them on retry', async () => {
    let calls = 0;
    server.use(
      http.get('/api/members', () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : HttpResponse.json([anna, boris]);
      }),
    );
    const user = userEvent.setup();

    renderApp('/settings');
    const section = await membersSection();
    expect(await within(section).findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    await user.click(within(section).getByRole('button', { name: 'Повторить' }));

    expect(await within(section).findByText('boris@example.com')).toBeInTheDocument();
  });
});

describe('Own profile', () => {
  async function profileForm() {
    return screen.findByRole('form', { name: 'Ваш профиль' });
  }

  function profileAnswers(response: (body: unknown) => Response) {
    const received: { body: unknown; csrf: string | null }[] = [];
    server.use(
      http.patch('/api/members/me', async ({ request }) => {
        const body = await request.json();
        received.push({ body, csrf: request.headers.get('X-XSRF-TOKEN') });
        return response(body);
      }),
    );
    return received;
  }

  beforeEach(() => {
    server.use(membersHandler([anna, boris]));
  });

  it('starts with the own display name and «Добавил» / «Добавила» choice', async () => {
    renderApp('/settings');
    const form = await profileForm();

    expect(within(form).getByLabelText('Имя')).toHaveValue('Анна');
    expect(within(form).getByRole('radio', { name: 'Добавила' })).toBeChecked();
    expect(within(form).getByRole('radio', { name: 'Добавил' })).not.toBeChecked();
  });

  it('renames the Member, sending only the name, and shows the new name in the list', async () => {
    const received = profileAnswers(() => HttpResponse.json({ ...anna, displayName: 'Аня' }));
    const user = userEvent.setup();

    renderApp('/settings');
    const form = await profileForm();
    await user.clear(within(form).getByLabelText('Имя'));
    await user.type(within(form).getByLabelText('Имя'), 'Аня');
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));

    expect(await within(form).findByRole('status')).toHaveTextContent('Сохранено');
    expect(received).toEqual([{ body: { displayName: 'Аня' }, csrf: 'token-from-server' }]);
    const list = screen.getByRole('list', { name: 'Взрослые' });
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Аня (вы)');
  });

  it('changes only the «Добавил» / «Добавила» choice', async () => {
    const received = profileAnswers(() =>
      HttpResponse.json({ ...anna, grammaticalGender: 'MASCULINE' }),
    );
    const user = userEvent.setup();

    renderApp('/settings');
    const form = await profileForm();
    await user.click(within(form).getByRole('radio', { name: 'Добавил' }));
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));

    expect(await within(form).findByRole('status')).toHaveTextContent('Сохранено');
    expect(received.map((r) => r.body)).toEqual([{ grammaticalGender: 'MASCULINE' }]);
  });

  it('asks for a name without calling the server', async () => {
    const received = profileAnswers(() => HttpResponse.json(anna));
    const user = userEvent.setup();

    renderApp('/settings');
    const form = await profileForm();
    await user.clear(within(form).getByLabelText('Имя'));
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));

    expect(await within(form).findByText('Заполните это поле')).toBeInTheDocument();
    expect(received).toEqual([]);
  });

  it('shows the server’s field errors in Russian', async () => {
    profileAnswers(() =>
      HttpResponse.json(
        {
          code: 'validation.failed',
          params: { errors: [{ field: 'displayName', code: 'too_long' }] },
        },
        { status: 400 },
      ),
    );
    const user = userEvent.setup();

    renderApp('/settings');
    const form = await profileForm();
    await user.type(within(form).getByLabelText('Имя'), 'Я'.repeat(10));
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));

    expect(await within(form).findByText('Слишком длинно')).toBeInTheDocument();
  });

  it('says the change was not saved when the server cannot be reached', async () => {
    profileAnswers(() => HttpResponse.error());
    const user = userEvent.setup();

    renderApp('/settings');
    const form = await profileForm();
    await user.type(within(form).getByLabelText('Имя'), '!');
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    expect(within(form).getByLabelText('Имя')).toHaveValue('Анна!');
  });
});

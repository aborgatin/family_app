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

const NO_CONNECTION = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';

async function membersSection() {
  return screen.findByRole('region', { name: 'Взрослые' });
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(
    sessionHandler({ bootstrapRequired: false, member: anna }).handler,
    invitesHandler([]),
    childFieldsHandler([]),
    childrenHandler([]),
  );
});
afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('Members list', () => {
  it('shows a row per Member with display name and email, «(вы)» on the own one', async () => {
    server.use(membersHandler([anna, boris]));

    renderApp('/settings');

    const section = await membersSection();
    await within(section).findByText('boris@example.com');
    expect(within(section).getByText('Анна (вы)')).toBeInTheDocument();
    expect(within(section).getByText('anna@example.com')).toBeInTheDocument();
    expect(within(section).getByText('Борис')).toBeInTheDocument();
    expect(within(section).queryByText('Борис (вы)')).not.toBeInTheDocument();
  });

  it('rows are not tappable', async () => {
    server.use(membersHandler([anna, boris]));

    renderApp('/settings');

    const section = await membersSection();
    await within(section).findByText('boris@example.com');
    expect(within(section).queryByRole('button')).not.toBeInTheDocument();
    expect(within(section).queryByRole('link')).not.toBeInTheDocument();
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
  const NOT_SAVED = 'Не удалось сохранить. Проверьте соединение.';

  async function profile() {
    return screen.findByRole('region', { name: 'Ваш профиль' });
  }

  function profileAnswers(response: (body: unknown) => Response | Promise<Response>) {
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

  /** Answers like the server: the Member with the sent fields changed. */
  function savedAsSent(body: unknown) {
    return HttpResponse.json({ ...anna, ...(body as object) });
  }

  beforeEach(() => {
    server.use(membersHandler([anna, boris]));
  });

  it('starts with the own display name and «Пол» choice', async () => {
    renderApp('/settings');
    const section = await profile();

    expect(within(section).getByRole('textbox', { name: 'Имя' })).toHaveValue('Анна');
    const choice = within(section).getByRole('radiogroup', { name: 'Пол' });
    expect(within(choice).getByRole('radio', { name: 'Женский' })).toBeChecked();
    expect(within(choice).getByRole('radio', { name: 'Мужской' })).not.toBeChecked();
    expect(within(section).queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
  });

  it('saves the name when leaving the field, sending only the name', async () => {
    const received = profileAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    const name = within(await profile()).getByRole('textbox', { name: 'Имя' });
    await user.clear(name);
    await user.type(name, 'Аня');
    await user.tab();

    const members = await membersSection();
    expect(await within(members).findByText('Аня (вы)')).toBeInTheDocument();
    expect(received).toEqual([{ body: { displayName: 'Аня' }, csrf: 'token-from-server' }]);
    expect(name).toHaveValue('Аня');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('saves the name on Enter, once', async () => {
    const received = profileAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    const name = within(await profile()).getByRole('textbox', { name: 'Имя' });
    await user.type(name, '!{Enter}');
    await waitFor(() => {
      expect(received).toHaveLength(1);
    });
    await user.tab();

    expect(received.map((r) => r.body)).toEqual([{ displayName: 'Анна!' }]);
  });

  it('puts the saved name back on Esc and sends nothing', async () => {
    const received = profileAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    const name = within(await profile()).getByRole('textbox', { name: 'Имя' });
    await user.type(name, 'xyz{Escape}');
    await user.tab();

    expect(name).toHaveValue('Анна');
    expect(received).toEqual([]);
  });

  it('asks for a name in the footer without calling the server', async () => {
    const received = profileAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    const section = await profile();
    await user.clear(within(section).getByRole('textbox', { name: 'Имя' }));
    await user.tab();

    expect(await within(section).findByRole('alert')).toHaveTextContent('Заполните это поле');
    expect(within(section).getByRole('textbox', { name: 'Имя' })).toHaveAccessibleDescription(
      'Заполните это поле',
    );
    expect(within(section).queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument();
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
    const section = await profile();
    await user.type(within(section).getByRole('textbox', { name: 'Имя' }), 'Я'.repeat(10));
    await user.tab();

    expect(await within(section).findByRole('alert')).toHaveTextContent('Слишком длинно');
  });

  it('keeps the typed name when the server cannot be reached, and saves it on «Повторить»', async () => {
    let calls = 0;
    const received = profileAnswers((body) => {
      calls += 1;
      return calls === 1 ? HttpResponse.error() : savedAsSent(body);
    });
    const user = userEvent.setup();

    renderApp('/settings');
    const section = await profile();
    const name = within(section).getByRole('textbox', { name: 'Имя' });
    await user.type(name, '!');
    await user.tab();

    expect(await within(section).findByRole('alert')).toHaveTextContent(NOT_SAVED);
    expect(name).toHaveValue('Анна!');
    await user.click(within(section).getByRole('button', { name: 'Повторить' }));

    await waitFor(() => {
      expect(within(section).queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(received.map((r) => r.body)).toEqual([
      { displayName: 'Анна!' },
      { displayName: 'Анна!' },
    ]);
  });

  it('says it once when both rows fail, and «Повторить» saves both', async () => {
    let calls = 0;
    const received = profileAnswers((body) => {
      calls += 1;
      return calls <= 2 ? HttpResponse.error() : savedAsSent(body);
    });
    const user = userEvent.setup();

    renderApp('/settings');
    const section = await profile();
    await user.type(within(section).getByRole('textbox', { name: 'Имя' }), '!');
    await user.click(within(section).getByRole('radio', { name: 'Мужской' }));

    await waitFor(() => {
      expect(received).toHaveLength(2);
    });
    expect(await within(section).findByRole('alert')).toHaveTextContent(NOT_SAVED);
    expect(within(section).getAllByRole('alert')).toHaveLength(1);
    await user.click(within(section).getByRole('button', { name: 'Повторить' }));

    await waitFor(() => {
      expect(within(section).getByRole('radio', { name: 'Мужской' })).toBeChecked();
    });
    expect(received.slice(2).map((r) => r.body)).toEqual(
      expect.arrayContaining([{ displayName: 'Анна!' }, { grammaticalGender: 'MASCULINE' }]),
    );
  });

  it('shows a spinner only when saving takes longer than a moment', async () => {
    let answer: (response: Response) => void = () => undefined;
    profileAnswers(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );
    const user = userEvent.setup();

    renderApp('/settings');
    const section = await profile();
    await user.type(within(section).getByRole('textbox', { name: 'Имя' }), '!');
    await user.tab();

    expect(within(section).queryByRole('img', { name: 'Сохраняем…' })).not.toBeInTheDocument();
    expect(await within(section).findByRole('img', { name: 'Сохраняем…' })).toBeInTheDocument();
    answer(HttpResponse.json({ ...anna, displayName: 'Анна!' }));
    await waitFor(() => {
      expect(within(section).queryByRole('img', { name: 'Сохраняем…' })).not.toBeInTheDocument();
    });
  });

  it('saves «Пол» on tap, sending only the choice', async () => {
    const received = profileAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    const section = await profile();
    await user.click(within(section).getByRole('radio', { name: 'Мужской' }));

    await waitFor(() => {
      expect(received.map((r) => r.body)).toEqual([{ grammaticalGender: 'MASCULINE' }]);
    });
    expect(within(section).getByRole('radio', { name: 'Мужской' })).toBeChecked();
  });

  it('puts «Пол» back when saving the choice fails, and saves it on «Повторить»', async () => {
    let calls = 0;
    const received = profileAnswers((body) => {
      calls += 1;
      return calls === 1 ? HttpResponse.error() : savedAsSent(body);
    });
    const user = userEvent.setup();

    renderApp('/settings');
    const section = await profile();
    await user.click(within(section).getByRole('radio', { name: 'Мужской' }));

    expect(await within(section).findByRole('alert')).toHaveTextContent(NOT_SAVED);
    expect(within(section).getByRole('radio', { name: 'Женский' })).toBeChecked();
    await user.click(within(section).getByRole('button', { name: 'Повторить' }));

    await waitFor(() => {
      expect(within(section).getByRole('radio', { name: 'Мужской' })).toBeChecked();
    });
    expect(within(section).queryByRole('alert')).not.toBeInTheDocument();
    expect(received).toHaveLength(2);
  });
});

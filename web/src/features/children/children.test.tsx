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
  masha,
  membersHandler,
  petya,
  sessionHandler,
} from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';

const NO_CONNECTION = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';

async function childrenSection() {
  return screen.findByRole('region', { name: 'Дети' });
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
  server.use(membersHandler([anna, boris]));
  server.use(invitesHandler([]), childFieldsHandler([]));
});
afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('Children list', () => {
  it('shows every Child with name, color and birthday, in the server’s order', async () => {
    server.use(childrenHandler([masha, petya]));

    renderApp('/settings');

    const section = await childrenSection();
    const list = await within(section).findByRole('list', { name: 'Дети' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Маша');
    expect(items[0]).toHaveTextContent('Коралловый');
    expect(items[0]).toHaveTextContent('12 апреля 2019');
    expect(items[1]).toHaveTextContent('Петя');
    expect(items[1]).toHaveTextContent('Синий');
  });

  it('says when there are no Children yet', async () => {
    server.use(childrenHandler([]));

    renderApp('/settings');

    expect(await within(await childrenSection()).findByText('Детей пока нет')).toBeInTheDocument();
  });

  it('says so when the Children cannot be loaded, and loads them on retry', async () => {
    let calls = 0;
    server.use(
      http.get('/api/children', () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : HttpResponse.json([masha]);
      }),
    );
    const user = userEvent.setup();

    renderApp('/settings');
    const section = await childrenSection();
    expect(await within(section).findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    await user.click(within(section).getByRole('button', { name: 'Повторить' }));

    expect(await within(section).findByText('Маша')).toBeInTheDocument();
  });
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface PutRequest {
  id: string;
  body: unknown;
  csrf: string | null;
}

/** `PUT /api/children/:id` answering with `response`; records every request. */
function putAnswers(response: (id: string, body: Record<string, unknown>) => Response) {
  const received: PutRequest[] = [];
  server.use(
    http.put('/api/children/:id', async ({ request, params }) => {
      const id = String(params.id);
      const body = (await request.json()) as Record<string, unknown>;
      received.push({ id, body, csrf: request.headers.get('X-XSRF-TOKEN') });
      return response(id, body);
    }),
  );
  return received;
}

/** Echoes the saved Child back as the API would. */
function savedChild(id: string, body: Record<string, unknown>) {
  return HttpResponse.json({ ...body, id, version: 99, updatedAt: '2026-11-07T12:00:00Z' });
}

describe('Adding a Child', () => {
  async function openAddForm(user: ReturnType<typeof userEvent.setup>) {
    const section = await childrenSection();
    await user.click(await within(section).findByRole('button', { name: 'Добавить ребёнка' }));
    return within(section).getByRole('form', { name: 'Новый ребёнок' });
  }

  it('adds a Child with a client-generated id, and shows it in birthday order', async () => {
    server.use(childrenHandler([masha, petya]));
    const received = putAnswers(savedChild);
    const user = userEvent.setup();

    renderApp('/settings');
    const form = await openAddForm(user);
    await user.type(within(form).getByLabelText('Имя'), 'Ваня');
    await user.click(within(form).getByRole('radio', { name: 'Зелёный' }));
    await user.type(within(form).getByLabelText('День рождения (необязательно)'), '2021-06-01');
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));

    const list = await within(await childrenSection()).findByRole('list', { name: 'Дети' });
    await within(list).findByText('Ваня');
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Маша'),
      expect.stringContaining('Ваня'),
      expect.stringContaining('Петя'),
    ]);
    expect(items[1]).toHaveTextContent('Зелёный');
    expect(items[1]).toHaveTextContent('1 июня 2021');
    expect(received).toHaveLength(1);
    expect(received[0]?.id).toMatch(UUID);
    expect(received[0]?.body).toEqual({ name: 'Ваня', color: 'green', birthday: '2021-06-01' });
    expect(received[0]?.csrf).toBe('token-from-server');
    expect(screen.queryByRole('form', { name: 'Новый ребёнок' })).not.toBeInTheDocument();
  });

  it('offers every palette color and sends no birthday when none is given', async () => {
    server.use(childrenHandler([]));
    const received = putAnswers(savedChild);
    const user = userEvent.setup();

    renderApp('/settings');
    const form = await openAddForm(user);
    const colors = within(form).getByRole('group', { name: 'Цвет' });
    expect(
      within(colors)
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('value')),
    ).toEqual(['coral', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink']);
    for (const name of ['Коралловый', 'Бирюзовый', 'Розовый']) {
      expect(within(colors).getByRole('radio', { name })).not.toBeChecked();
    }
    await user.type(within(form).getByLabelText('Имя'), 'Ваня');
    await user.click(within(colors).getByRole('radio', { name: 'Фиолетовый' }));
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));

    expect(await within(await childrenSection()).findByText('Ваня')).toBeInTheDocument();
    expect(received.map((r) => r.body)).toEqual([
      { name: 'Ваня', color: 'purple', birthday: null },
    ]);
  });

  it('asks for a name and a color without calling the server', async () => {
    server.use(childrenHandler([]));
    const received = putAnswers(savedChild);
    const user = userEvent.setup();

    renderApp('/settings');
    const form = await openAddForm(user);
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));

    expect(await within(form).findByText('Заполните это поле')).toBeInTheDocument();
    expect(within(form).getByText('Выберите вариант')).toBeInTheDocument();
    expect(received).toEqual([]);
  });

  it('shows the server’s field errors in Russian', async () => {
    server.use(childrenHandler([]));
    putAnswers(() =>
      HttpResponse.json(
        {
          code: 'validation.failed',
          params: { errors: [{ field: 'color', code: 'color.invalid' }] },
        },
        { status: 400 },
      ),
    );
    const user = userEvent.setup();

    renderApp('/settings');
    const form = await openAddForm(user);
    await user.type(within(form).getByLabelText('Имя'), 'Ваня');
    await user.click(within(form).getByRole('radio', { name: 'Синий' }));
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));

    expect(await within(form).findByText('Выберите цвет из списка')).toBeInTheDocument();
  });

  it('says the Child was not saved when the server cannot be reached, keeping the input', async () => {
    server.use(childrenHandler([]));
    putAnswers(() => HttpResponse.error());
    const user = userEvent.setup();

    renderApp('/settings');
    const form = await openAddForm(user);
    await user.type(within(form).getByLabelText('Имя'), 'Ваня');
    await user.click(within(form).getByRole('radio', { name: 'Синий' }));
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    expect(within(form).getByLabelText('Имя')).toHaveValue('Ваня');
    expect(screen.queryByText('Детей пока нет')).toBeInTheDocument();
  });

  it('retries with the same id, so a repeated save cannot create a second Child', async () => {
    server.use(childrenHandler([]));
    let calls = 0;
    const received = putAnswers((id, body) => {
      calls += 1;
      return calls === 1 ? HttpResponse.error() : savedChild(id, body);
    });
    const user = userEvent.setup();

    renderApp('/settings');
    const form = await openAddForm(user);
    await user.type(within(form).getByLabelText('Имя'), 'Ваня');
    await user.click(within(form).getByRole('radio', { name: 'Синий' }));
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));
    await within(form).findByRole('alert');
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));

    expect(await within(await childrenSection()).findByText('Ваня')).toBeInTheDocument();
    expect(received).toHaveLength(2);
    expect(received[1]?.id).toBe(received[0]?.id);
  });

  it('can be cancelled', async () => {
    server.use(childrenHandler([]));
    const received = putAnswers(savedChild);
    const user = userEvent.setup();

    renderApp('/settings');
    const form = await openAddForm(user);
    await user.type(within(form).getByLabelText('Имя'), 'Ваня');
    await user.click(within(form).getByRole('button', { name: 'Отмена' }));

    expect(screen.queryByRole('form', { name: 'Новый ребёнок' })).not.toBeInTheDocument();
    expect(received).toEqual([]);
  });
});

describe('Editing a Child', () => {
  async function openEditForm(user: ReturnType<typeof userEvent.setup>, name: string) {
    const section = await childrenSection();
    await user.click(await within(section).findByRole('button', { name: `Изменить: ${name}` }));
    return within(section).getByRole('form', { name: `Изменить: ${name}` });
  }

  it('starts with the Child’s current name, color and birthday', async () => {
    server.use(childrenHandler([masha, petya]));
    const user = userEvent.setup();

    renderApp('/settings');
    const form = await openEditForm(user, 'Маша');

    expect(within(form).getByLabelText('Имя')).toHaveValue('Маша');
    expect(within(form).getByRole('radio', { name: 'Коралловый' })).toBeChecked();
    expect(within(form).getByLabelText('День рождения (необязательно)')).toHaveValue('2019-04-12');
  });

  it('replaces the Child under its own id and re-sorts the list', async () => {
    server.use(childrenHandler([masha, petya]));
    const received = putAnswers(savedChild);
    const user = userEvent.setup();

    renderApp('/settings');
    const form = await openEditForm(user, 'Маша');
    await user.clear(within(form).getByLabelText('Имя'));
    await user.type(within(form).getByLabelText('Имя'), 'Мария');
    await user.click(within(form).getByRole('radio', { name: 'Бирюзовый' }));
    await user.clear(within(form).getByLabelText('День рождения (необязательно)'));
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));

    const list = await within(await childrenSection()).findByRole('list', { name: 'Дети' });
    await within(list).findByText('Мария');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Мария');
    expect(items[0]).toHaveTextContent('Бирюзовый');
    expect(items[1]).toHaveTextContent('Петя');
    expect(received).toEqual([
      {
        id: masha.id,
        body: { name: 'Мария', color: 'teal', birthday: null },
        csrf: 'token-from-server',
      },
    ]);
    expect(screen.queryByRole('form', { name: 'Изменить: Маша' })).not.toBeInTheDocument();
  });

  it('says so when the other Member has removed the Child meanwhile', async () => {
    server.use(childrenHandler([masha]));
    putAnswers(() => HttpResponse.json({ code: 'child.deleted', params: {} }, { status: 409 }));
    const user = userEvent.setup();

    renderApp('/settings');
    const form = await openEditForm(user, 'Маша');
    await user.type(within(form).getByLabelText('Имя'), '!');
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Этого ребёнка уже удалили. Откройте настройки заново, чтобы увидеть актуальный список.',
    );
  });
});

describe('Removing a Child', () => {
  function deleteAnswers(response: () => Response) {
    const received: { id: string; csrf: string | null }[] = [];
    server.use(
      http.delete('/api/children/:id', ({ request, params }) => {
        received.push({ id: String(params.id), csrf: request.headers.get('X-XSRF-TOKEN') });
        return response();
      }),
    );
    return received;
  }

  it('removes the Child after confirmation', async () => {
    server.use(childrenHandler([masha, petya]));
    const received = deleteAnswers(() => new HttpResponse(null, { status: 204 }));
    const user = userEvent.setup();

    renderApp('/settings');
    const section = await childrenSection();
    await user.click(await within(section).findByRole('button', { name: 'Удалить: Маша' }));
    expect(received).toEqual([]);
    expect(within(section).getByText('Удалить ребёнка «Маша»?')).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Да, удалить' }));

    await waitFor(() => {
      expect(within(section).queryByText('Маша')).not.toBeInTheDocument();
    });
    expect(within(section).getByText('Петя')).toBeInTheDocument();
    expect(received).toEqual([{ id: masha.id, csrf: 'token-from-server' }]);
  });

  it('keeps the Child when the removal is cancelled', async () => {
    server.use(childrenHandler([masha]));
    const received = deleteAnswers(() => new HttpResponse(null, { status: 204 }));
    const user = userEvent.setup();

    renderApp('/settings');
    const section = await childrenSection();
    await user.click(await within(section).findByRole('button', { name: 'Удалить: Маша' }));
    await user.click(within(section).getByRole('button', { name: 'Отмена' }));

    expect(within(section).queryByText('Удалить ребёнка «Маша»?')).not.toBeInTheDocument();
    expect(within(section).getByText('Маша')).toBeInTheDocument();
    expect(received).toEqual([]);
  });

  it('keeps the Child and says so when the server cannot be reached', async () => {
    server.use(childrenHandler([masha]));
    deleteAnswers(() => HttpResponse.error());
    const user = userEvent.setup();

    renderApp('/settings');
    const section = await childrenSection();
    await user.click(await within(section).findByRole('button', { name: 'Удалить: Маша' }));
    await user.click(within(section).getByRole('button', { name: 'Да, удалить' }));

    expect(await within(section).findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    expect(within(section).getByText('Маша')).toBeInTheDocument();
  });
});

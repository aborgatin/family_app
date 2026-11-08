import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const SAVE_FAILED = 'Не удалось сохранить. Проверьте соединение.';

/** «Today» in these tests: Маша (12 April 2019) is 7. */
const TODAY = new Date('2026-11-08T12:00:00');

const sonya: typeof masha = {
  id: '0c3e4a52-0000-4000-8000-000000000013',
  name: 'Соня',
  color: 'green',
  birthday: '2025-11-08',
  version: 12,
  updatedAt: '2026-11-07T11:10:00Z',
};

async function childrenSection() {
  return screen.findByRole('region', { name: 'Дети' });
}

async function childrenList() {
  return within(await childrenSection()).findByRole('list', { name: 'Дети' });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: TODAY });
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
  server.use(membersHandler([anna, boris]));
  server.use(invitesHandler([]), childFieldsHandler([]));
});
afterEach(() => {
  vi.useRealTimers();
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('«Дети» in Settings', () => {
  it('shows a row per Child with name and age, opening the Child’s screen', async () => {
    server.use(childrenHandler([masha, sonya, petya]));

    renderApp('/settings');

    const items = within(await childrenList()).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Маша7 лет', 'Соня1 год', 'Петя']);
    expect(within(items[0] as HTMLElement).getByRole('link', { name: /Маша/ })).toHaveAttribute(
      'href',
      `/settings/children/${masha.id}`,
    );
  });

  it('shows months under a year, «меньше месяца» under one, nothing before birth', async () => {
    server.use(
      childrenHandler([
        { ...sonya, id: `${sonya.id.slice(0, -2)}21`, name: 'Лиза', birthday: '2026-06-09' },
        { ...sonya, id: `${sonya.id.slice(0, -2)}22`, name: 'Оля', birthday: '2025-12-01' },
        { ...sonya, id: `${sonya.id.slice(0, -2)}23`, name: 'Тима', birthday: '2026-12-01' },
        { ...sonya, id: `${sonya.id.slice(0, -2)}24`, name: 'Ваня', birthday: '2026-10-20' },
      ]),
    );

    renderApp('/settings');

    const items = within(await childrenList()).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Лиза4 месяца',
      'Оля11 месяцев',
      'Тима',
      'Ваняменьше месяца',
    ]);
  });

  it('says when there are no Children yet, still offering to add one', async () => {
    server.use(childrenHandler([]));

    renderApp('/settings');

    const section = await childrenSection();
    expect(await within(section).findByText('Детей пока нет')).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Добавить ребёнка' })).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument();
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

  it('deletes from edit mode after the action sheet, leaving edit mode with the last one', async () => {
    server.use(childrenHandler([masha]));
    const deleted = deleteAnswers(() => new HttpResponse(null, { status: 204 }));
    const user = userEvent.setup();

    renderApp('/settings');
    const section = await childrenSection();
    await within(section).findByRole('list', { name: 'Дети' });
    await user.click(within(section).getByRole('button', { name: 'Изменить' }));
    expect(within(section).queryByRole('link', { name: /Маша/ })).not.toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Удалить «Маша»' }));
    const sheet = screen.getByRole('dialog', { name: 'Удалить „Маша“?' });
    expect(deleted).toEqual([]);
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    expect(await within(section).findByText('Детей пока нет')).toBeInTheDocument();
    expect(deleted).toEqual([{ id: masha.id, csrf: 'token-from-server' }]);
    expect(within(section).queryByRole('button', { name: 'Готово' })).not.toBeInTheDocument();
  });

  it('deletes with right-click → «Удалить», after the action sheet', async () => {
    server.use(childrenHandler([masha, petya]));
    const deleted = deleteAnswers(() => new HttpResponse(null, { status: 204 }));
    const user = userEvent.setup();

    renderApp('/settings');
    const list = await childrenList();
    await user.pointer({ keys: '[MouseRight]', target: within(list).getByText('Петя') });
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    const sheet = await screen.findByRole('dialog', { name: 'Удалить „Петя“?' });
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    });
    expect(deleted).toEqual([{ id: petya.id, csrf: 'token-from-server' }]);
  });

  it('keeps the Child and says so when deleting fails', async () => {
    server.use(childrenHandler([masha]));
    deleteAnswers(() => HttpResponse.error());
    const user = userEvent.setup();

    renderApp('/settings');
    const section = await childrenSection();
    await within(section).findByRole('list', { name: 'Дети' });
    await user.click(within(section).getByRole('button', { name: 'Изменить' }));
    await user.click(within(section).getByRole('button', { name: 'Удалить «Маша»' }));
    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(await within(section).findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    expect(within(section).getByText('Маша')).toBeInTheDocument();
  });
});

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

describe('The Child screen', () => {
  it('opens from the row in Settings, with the Child’s name, colour and birthday', async () => {
    server.use(childrenHandler([masha, petya]));
    const user = userEvent.setup();

    const { location } = renderApp('/settings');
    await user.click(within(await childrenList()).getByRole('link', { name: /Маша/ }));

    expect(location()).toBe(`/settings/children/${masha.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Маша' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Имя' })).toHaveValue('Маша');
    const colors = screen.getByRole('radiogroup', { name: 'Цвет' });
    expect(
      within(colors)
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('aria-label')),
    ).toEqual([
      'Коралловый',
      'Оранжевый',
      'Жёлтый',
      'Зелёный',
      'Бирюзовый',
      'Синий',
      'Фиолетовый',
      'Розовый',
    ]);
    expect(within(colors).getByRole('radio', { name: 'Коралловый' })).toBeChecked();
    expect(screen.getByLabelText('День рождения')).toHaveValue('2019-04-12');
    expect(screen.getByRole('link', { name: 'Настройки' })).toHaveAttribute('href', '/settings');
  });

  it('saves the name on blur, sending the whole Child', async () => {
    server.use(childrenHandler([masha]));
    const received = putAnswers(savedChild);
    const user = userEvent.setup();

    renderApp(`/settings/children/${masha.id}`);
    const name = await screen.findByRole('textbox', { name: 'Имя' });
    await user.clear(name);
    await user.type(name, 'Мария');
    await user.tab();

    expect(await screen.findByRole('heading', { level: 1, name: 'Мария' })).toBeInTheDocument();
    expect(received).toEqual([
      {
        id: masha.id,
        body: { name: 'Мария', color: 'coral', birthday: '2019-04-12' },
        csrf: 'token-from-server',
      },
    ]);
  });

  it('asks for a name instead of saving an empty one', async () => {
    server.use(childrenHandler([masha]));
    const received = putAnswers(savedChild);
    const user = userEvent.setup();

    renderApp(`/settings/children/${masha.id}`);
    await user.clear(await screen.findByRole('textbox', { name: 'Имя' }));
    await user.tab();

    expect(await screen.findByText('Заполните это поле')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Имя' })).toHaveAccessibleDescription(
      'Заполните это поле',
    );
    expect(received).toEqual([]);
  });

  it('saves a colour on tap, on top of the name saved before', async () => {
    server.use(childrenHandler([masha]));
    const received = putAnswers(savedChild);
    const user = userEvent.setup();

    renderApp(`/settings/children/${masha.id}`);
    const name = await screen.findByRole('textbox', { name: 'Имя' });
    await user.type(name, '{End}ня{Enter}');
    await screen.findByRole('heading', { level: 1, name: 'Машаня' });
    await user.click(screen.getByRole('radio', { name: 'Бирюзовый' }));

    await waitFor(() => {
      expect(received).toHaveLength(2);
    });
    expect(received[1]?.body).toEqual({ name: 'Машаня', color: 'teal', birthday: '2019-04-12' });
    expect(screen.getByRole('radio', { name: 'Бирюзовый' })).toBeChecked();
  });

  it('arrow keys only move between colours; Space or Enter saves the one reached', async () => {
    server.use(childrenHandler([masha]));
    const received = putAnswers(savedChild);
    const user = userEvent.setup();

    renderApp(`/settings/children/${masha.id}`);
    await user.click(await screen.findByLabelText('День рождения'));
    await user.tab({ shift: true });
    expect(screen.getByRole('radio', { name: 'Коралловый' })).toHaveFocus();

    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Жёлтый' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Коралловый' })).toBeChecked();
    await user.keyboard(' ');
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Жёлтый' })).toBeChecked();
    });

    await user.keyboard('{ArrowLeft}{Enter}');
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Оранжевый' })).toBeChecked();
    });
    expect(received.map((r) => r.body)).toEqual([
      { name: 'Маша', color: 'yellow', birthday: '2019-04-12' },
      { name: 'Маша', color: 'orange', birthday: '2019-04-12' },
    ]);
  });

  it('goes back to the previous colour when saving it fails, offering «Повторить»', async () => {
    server.use(childrenHandler([masha]));
    let calls = 0;
    const received = putAnswers((id, body) => {
      calls += 1;
      return calls === 1 ? HttpResponse.error() : savedChild(id, body);
    });
    const user = userEvent.setup();

    renderApp(`/settings/children/${masha.id}`);
    await user.click(await screen.findByRole('radio', { name: 'Синий' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(SAVE_FAILED);
    expect(screen.getByRole('radio', { name: 'Коралловый' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Синий' })).toBeChecked();
    });
    expect(received.map((r) => r.body)).toEqual([
      { name: 'Маша', color: 'blue', birthday: '2019-04-12' },
      { name: 'Маша', color: 'blue', birthday: '2019-04-12' },
    ]);
  });

  it('clears the birthday, and the list then shows no age', async () => {
    server.use(childrenHandler([masha]));
    const received = putAnswers(savedChild);
    const user = userEvent.setup();

    renderApp(`/settings/children/${masha.id}`);
    await user.click(await screen.findByRole('button', { name: 'Очистить «День рождения»' }));

    await waitFor(() => {
      expect(received.map((r) => r.body)).toEqual([
        { name: 'Маша', color: 'coral', birthday: null },
      ]);
    });
    expect(screen.getByLabelText('День рождения')).toHaveValue('');
    expect(
      screen.queryByRole('button', { name: 'Очистить «День рождения»' }),
    ).not.toBeInTheDocument();
  });

  it('saves a new birthday when leaving the field', async () => {
    server.use(childrenHandler([petya]));
    const received = putAnswers(savedChild);
    const user = userEvent.setup();

    renderApp(`/settings/children/${petya.id}`);
    await user.type(await screen.findByLabelText('День рождения'), '2020-02-29');
    await user.tab();

    await waitFor(() => {
      expect(received.map((r) => r.body)).toEqual([
        { name: 'Петя', color: 'blue', birthday: '2020-02-29' },
      ]);
    });
  });

  it('deletes the Child after the action sheet and goes back to Settings', async () => {
    server.use(childrenHandler([masha, petya]));
    const deleted = deleteAnswers(() => new HttpResponse(null, { status: 204 }));
    const user = userEvent.setup();

    const { location } = renderApp(`/settings/children/${masha.id}`);
    await user.click(await screen.findByRole('button', { name: 'Удалить ребёнка' }));
    const sheet = screen.getByRole('dialog', { name: 'Удалить „Маша“?' });
    expect(deleted).toEqual([]);
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(location()).toBe('/settings');
    });
    expect(deleted).toEqual([{ id: masha.id, csrf: 'token-from-server' }]);
    expect(await within(await childrenList()).findByText('Петя')).toBeInTheDocument();
  });

  it('stays and says so when deleting fails', async () => {
    server.use(childrenHandler([masha]));
    deleteAnswers(() => HttpResponse.error());
    const user = userEvent.setup();

    const { location } = renderApp(`/settings/children/${masha.id}`);
    await user.click(await screen.findByRole('button', { name: 'Удалить ребёнка' }));
    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    expect(location()).toBe(`/settings/children/${masha.id}`);
  });

  it('says so when the Child doesn’t exist (any more)', async () => {
    server.use(childrenHandler([masha]));

    renderApp('/settings/children/0c3e4a52-0000-4000-8000-000000000099');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Такого ребёнка нет: возможно, его удалили.',
    );
  });
});

/** `DELETE /api/children/:id` answering with `response`; records every request. */
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('The «Новый ребёнок» sheet', () => {
  async function openSheet(user: ReturnType<typeof userEvent.setup>) {
    const section = await childrenSection();
    await user.click(await within(section).findByRole('button', { name: 'Добавить ребёнка' }));
    return screen.getByRole('dialog', { name: 'Новый ребёнок' });
  }

  it('adds a Child with «Готово», under an id made on the client, and lists it in order', async () => {
    server.use(childrenHandler([masha, petya]));
    const received = putAnswers(savedChild);
    const user = userEvent.setup();

    renderApp('/settings');
    const sheet = await openSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: 'Имя' }), 'Ваня');
    await user.click(within(sheet).getByRole('radio', { name: 'Зелёный' }));
    await user.type(within(sheet).getByLabelText('День рождения'), '2021-06-01');
    expect(received).toEqual([]);
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Новый ребёнок' })).not.toBeInTheDocument();
    });
    const items = within(await childrenList()).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Маша7 лет', 'Ваня5 лет', 'Петя']);
    expect(received).toHaveLength(1);
    expect(received[0]?.id).toMatch(UUID);
    expect(received[0]?.body).toEqual({ name: 'Ваня', color: 'green', birthday: '2021-06-01' });
    expect(received[0]?.csrf).toBe('token-from-server');
  });

  it('sends no birthday when none is given, trims the name, and saves on Enter in it', async () => {
    server.use(childrenHandler([]));
    const received = putAnswers(savedChild);
    const user = userEvent.setup();

    renderApp('/settings');
    const sheet = await openSheet(user);
    expect(within(sheet).queryAllByRole('radio', { checked: true })).toEqual([]);
    await user.click(within(sheet).getByRole('radio', { name: 'Фиолетовый' }));
    await user.type(within(sheet).getByRole('textbox', { name: 'Имя' }), '  Ваня {Enter}');

    expect(await within(await childrenList()).findByText('Ваня')).toBeInTheDocument();
    expect(received.map((r) => r.body)).toEqual([
      { name: 'Ваня', color: 'purple', birthday: null },
    ]);
  });

  it('asks for a name and a colour without calling the server', async () => {
    server.use(childrenHandler([]));
    const received = putAnswers(savedChild);
    const user = userEvent.setup();

    renderApp('/settings');
    const sheet = await openSheet(user);
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(within(sheet).getByRole('textbox', { name: 'Имя' })).toHaveAccessibleDescription(
      'Заполните это поле',
    );
    expect(within(sheet).getByRole('radiogroup', { name: 'Цвет' })).toHaveAccessibleDescription(
      'Выберите вариант',
    );
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
    const sheet = await openSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: 'Имя' }), 'Ваня');
    await user.click(within(sheet).getByRole('radio', { name: 'Синий' }));
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(await within(sheet).findByText('Выберите цвет из списка')).toBeInTheDocument();
  });

  it('keeps what was entered when the server cannot be reached, and retries with the same id', async () => {
    server.use(childrenHandler([]));
    let calls = 0;
    const received = putAnswers((id, body) => {
      calls += 1;
      return calls === 1 ? HttpResponse.error() : savedChild(id, body);
    });
    const user = userEvent.setup();

    renderApp('/settings');
    const sheet = await openSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: 'Имя' }), 'Ваня');
    await user.click(within(sheet).getByRole('radio', { name: 'Синий' }));
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(await within(sheet).findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    expect(within(sheet).getByRole('textbox', { name: 'Имя' })).toHaveValue('Ваня');
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(await within(await childrenList()).findByText('Ваня')).toBeInTheDocument();
    expect(received).toHaveLength(2);
    expect(received[1]?.id).toBe(received[0]?.id);
  });

  it('closes with «Отмена» or Esc without saving, and starts empty next time', async () => {
    server.use(childrenHandler([]));
    const received = putAnswers(savedChild);
    const user = userEvent.setup();

    renderApp('/settings');
    let sheet = await openSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: 'Имя' }), 'Ваня');
    await user.click(within(sheet).getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    sheet = await openSheet(user);
    expect(within(sheet).getByRole('textbox', { name: 'Имя' })).toHaveValue('');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(received).toEqual([]);
  });
});

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  anna,
  boris,
  childFieldsHandler,
  childrenHandler,
  height,
  invitesHandler,
  membersHandler,
  sessionHandler,
  weight,
} from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';

const NO_CONNECTION = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const shoeSize: typeof weight = {
  id: '7a2d3d2f-0000-4000-8000-000000000003',
  name: 'Размер обуви',
  valueType: 'TEXT',
  position: 3,
  version: 5,
  updatedAt: '2026-11-07T09:30:00Z',
};

async function section() {
  return screen.findByRole('region', { name: 'Поля профиля' });
}

async function fieldList() {
  return within(await section()).findByRole('list', { name: 'Поля профиля' });
}

async function rows() {
  return within(await fieldList()).getAllByRole('listitem');
}

/** Answers every `PUT /api/child-fields/:id` with `response` and records what was sent. */
function putAnswers(response: (id: string, body: Record<string, unknown>) => Response) {
  const received: { id: string; body: Record<string, unknown>; csrf: string | null }[] = [];
  server.use(
    http.put('/api/child-fields/:id', async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>;
      const id = String(params.id);
      received.push({ id, body, csrf: request.headers.get('X-XSRF-TOKEN') });
      return response(id, body);
    }),
  );
  return received;
}

/** Echoes the body back as the saved Child field, the way the server answers. */
function savedAsSent(id: string, body: Record<string, unknown>) {
  return HttpResponse.json({ ...body, id, version: 10, updatedAt: '2026-11-07T11:00:00Z' });
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
  server.use(membersHandler([anna, boris]));
  server.use(invitesHandler([]), childrenHandler([]));
});
afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('Child fields list', () => {
  it('shows the Child fields in order with their value type', async () => {
    server.use(
      childFieldsHandler([
        weight,
        height,
        { ...shoeSize, name: 'Последний визит к врачу', valueType: 'DATE' },
      ]),
    );

    renderApp('/settings');

    const items = await rows();
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Вес');
    expect(items[0]).toHaveTextContent('Текст');
    expect(items[1]).toHaveTextContent('Рост');
    expect(items[2]).toHaveTextContent('Последний визит к врачу');
    expect(items[2]).toHaveTextContent('Дата');
  });

  it('says so when there are no Child fields', async () => {
    server.use(childFieldsHandler([]));

    renderApp('/settings');

    expect(await within(await section()).findByText('Полей пока нет')).toBeInTheDocument();
  });

  it('says so when the Child fields cannot be loaded, and loads them on retry', async () => {
    let calls = 0;
    server.use(
      http.get('/api/child-fields', () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : HttpResponse.json([weight, height]);
      }),
    );
    const user = userEvent.setup();

    renderApp('/settings');
    const fields = await section();
    expect(await within(fields).findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    await user.click(within(fields).getByRole('button', { name: 'Повторить' }));

    expect(await within(fields).findByText('Рост')).toBeInTheDocument();
  });
});

describe('Adding a Child field', () => {
  async function addForm() {
    return within(await section()).findByRole('form', { name: 'Новое поле' });
  }

  it('adds a field of the chosen value type at the end, with an id made on the device', async () => {
    server.use(childFieldsHandler([weight, height]));
    const received = putAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    const form = await addForm();
    await user.type(within(form).getByLabelText('Название поля'), 'Последний визит к врачу');
    await user.click(within(form).getByRole('radio', { name: 'Дата' }));
    await user.click(within(form).getByRole('button', { name: 'Добавить поле' }));

    const items = await within(await fieldList()).findAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[2]).toHaveTextContent('Последний визит к врачу');
    expect(items[2]).toHaveTextContent('Дата');
    expect(received).toHaveLength(1);
    expect(received[0]?.id).toMatch(UUID);
    expect(received[0]?.body).toEqual({
      name: 'Последний визит к врачу',
      valueType: 'DATE',
      position: 3,
    });
    expect(received[0]?.csrf).toBe('token-from-server');
    expect(within(form).getByLabelText('Название поля')).toHaveValue('');
  });

  it('offers «Текст» unless the Member picks «Дата»', async () => {
    server.use(childFieldsHandler([]));
    const received = putAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    const form = await addForm();
    expect(within(form).getByRole('radio', { name: 'Текст' })).toBeChecked();
    await user.type(within(form).getByLabelText('Название поля'), 'Размер обуви');
    await user.click(within(form).getByRole('button', { name: 'Добавить поле' }));

    expect(await within(await fieldList()).findByText('Размер обуви')).toBeInTheDocument();
    expect(received[0]?.body).toEqual({ name: 'Размер обуви', valueType: 'TEXT', position: 1 });
  });

  it('asks for a name without calling the server', async () => {
    server.use(childFieldsHandler([weight]));
    const received = putAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    const form = await addForm();
    await user.click(within(form).getByRole('button', { name: 'Добавить поле' }));

    expect(await within(form).findByText('Заполните это поле')).toBeInTheDocument();
    expect(received).toEqual([]);
  });

  it('shows the server’s field errors in Russian', async () => {
    server.use(childFieldsHandler([]));
    putAnswers(() =>
      HttpResponse.json(
        { code: 'validation.failed', params: { errors: [{ field: 'name', code: 'too_long' }] } },
        { status: 400 },
      ),
    );
    const user = userEvent.setup();

    renderApp('/settings');
    const form = await addForm();
    await user.type(within(form).getByLabelText('Название поля'), 'Я'.repeat(10));
    await user.click(within(form).getByRole('button', { name: 'Добавить поле' }));

    expect(await within(form).findByText('Слишком длинно')).toBeInTheDocument();
  });

  it('says the change did not save when offline', async () => {
    server.use(childFieldsHandler([]));
    putAnswers(() => HttpResponse.error());
    const user = userEvent.setup();

    renderApp('/settings');
    const form = await addForm();
    await user.type(within(form).getByLabelText('Название поля'), 'Размер обуви');
    await user.click(within(form).getByRole('button', { name: 'Добавить поле' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    expect(within(await section()).queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('Renaming a Child field', () => {
  it('renames a field, keeping its value type and position', async () => {
    server.use(childFieldsHandler([weight, height]));
    const received = putAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'Переименовать «Рост»' }));
    const row = (await rows())[1];
    if (row === undefined) throw new Error('no row');
    const name = within(row).getByLabelText('Название поля');
    await user.clear(name);
    await user.type(name, 'Рост, см');
    await user.click(within(row).getByRole('button', { name: 'Сохранить' }));

    expect(await within(await fieldList()).findByText('Рост, см')).toBeInTheDocument();
    expect(received).toEqual([
      {
        id: height.id,
        body: { name: 'Рост, см', valueType: 'TEXT', position: 2 },
        csrf: 'token-from-server',
      },
    ]);
  });

  it('cancels without calling the server', async () => {
    server.use(childFieldsHandler([weight]));
    const received = putAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'Переименовать «Вес»' }));
    await user.type(screen.getByLabelText('Название поля', { selector: 'li input' }), '!!!');
    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect((await rows())[0]).toHaveTextContent('Вес');
    expect(received).toEqual([]);
  });

  it('never offers to change the value type of an existing field', async () => {
    server.use(childFieldsHandler([weight]));
    const user = userEvent.setup();

    renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'Переименовать «Вес»' }));

    const row = (await rows())[0];
    if (row === undefined) throw new Error('no row');
    expect(within(row).queryByRole('radio')).not.toBeInTheDocument();
    expect(within(row).queryByRole('combobox')).not.toBeInTheDocument();
    expect(row).toHaveTextContent('Текст');
  });

  it('tells the Member when the field was removed on another device', async () => {
    server.use(childFieldsHandler([weight]));
    putAnswers(() =>
      HttpResponse.json({ code: 'child_field.deleted', params: {} }, { status: 409 }),
    );
    const user = userEvent.setup();

    renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'Переименовать «Вес»' }));
    const row = (await rows())[0];
    if (row === undefined) throw new Error('no row');
    await user.type(within(row).getByLabelText('Название поля'), ', кг');
    await user.click(within(row).getByRole('button', { name: 'Сохранить' }));

    expect(await within(await section()).findByRole('alert')).toHaveTextContent(
      'Это поле уже удалено.',
    );
  });
});

describe('Reordering Child fields', () => {
  it('moves a field up between its new neighbours, sending only that field', async () => {
    server.use(childFieldsHandler([weight, height, shoeSize]));
    const received = putAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    await user.click(
      await screen.findByRole('button', { name: 'Переместить «Размер обуви» выше' }),
    );

    await expect
      .poll(async () => (await rows()).map((row) => row.textContent))
      .toEqual([
        expect.stringContaining('Вес'),
        expect.stringContaining('Размер обуви'),
        expect.stringContaining('Рост'),
      ]);
    expect(received.map((r) => [r.id, r.body])).toEqual([
      [shoeSize.id, { name: 'Размер обуви', valueType: 'TEXT', position: 1.5 }],
    ]);
  });

  it('moves the first field down by placing it between the second and third', async () => {
    server.use(childFieldsHandler([weight, height, shoeSize]));
    const received = putAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'Переместить «Вес» ниже' }));

    await expect.poll(async () => (await rows())[0]?.textContent).toContain('Рост');
    expect(received.map((r) => r.body.position)).toEqual([2.5]);
  });

  it('moves a field to the very top or bottom past the end neighbour', async () => {
    server.use(childFieldsHandler([weight, height, shoeSize]));
    const received = putAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'Переместить «Рост» выше' }));
    await expect.poll(async () => (await rows())[0]?.textContent).toContain('Рост');
    // Now «Рост» 0, «Вес» 1, «Размер обуви» 3.
    await user.click(screen.getByRole('button', { name: 'Переместить «Вес» ниже' }));
    await expect.poll(async () => (await rows())[2]?.textContent).toContain('Вес');

    // To the top: one below the first position. To the bottom: one above the last.
    expect(received.map((r) => r.body.position)).toEqual([0, 4]);
  });

  it('cannot move the first field up or the last field down', async () => {
    server.use(childFieldsHandler([weight, height]));

    renderApp('/settings');

    expect(await screen.findByRole('button', { name: 'Переместить «Вес» выше' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Переместить «Рост» ниже' })).toBeDisabled();
  });
});

describe('Removing a Child field', () => {
  function deleteAnswers(response: () => Response) {
    const removed: string[] = [];
    server.use(
      http.delete('/api/child-fields/:id', ({ params }) => {
        removed.push(String(params.id));
        return response();
      }),
    );
    return removed;
  }

  it('removes a field after the Member confirms', async () => {
    server.use(childFieldsHandler([weight, height]));
    const removed = deleteAnswers(() => new HttpResponse(null, { status: 204 }));
    const user = userEvent.setup();

    renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'Удалить «Вес»' }));
    expect(removed).toEqual([]);
    const confirmation = await screen.findByRole('alertdialog', { name: 'Удалить поле «Вес»?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Удалить' }));

    await expect
      .poll(async () => (await rows()).map((row) => row.textContent))
      .toEqual([expect.stringContaining('Рост')]);
    expect(removed).toEqual([weight.id]);
  });

  it('keeps the field when the Member changes their mind', async () => {
    server.use(childFieldsHandler([weight, height]));
    const removed = deleteAnswers(() => new HttpResponse(null, { status: 204 }));
    const user = userEvent.setup();

    renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'Удалить «Вес»' }));
    const confirmation = await screen.findByRole('alertdialog', { name: 'Удалить поле «Вес»?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Отмена' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(await rows()).toHaveLength(2);
    expect(removed).toEqual([]);
  });

  it('keeps the field and says why when removing fails', async () => {
    server.use(childFieldsHandler([weight]));
    deleteAnswers(() => HttpResponse.error());
    const user = userEvent.setup();

    renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'Удалить «Вес»' }));
    const confirmation = await screen.findByRole('alertdialog', { name: 'Удалить поле «Вес»?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Удалить' }));

    expect(await within(await section()).findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    expect(await rows()).toHaveLength(1);
  });
});

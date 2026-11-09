import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  anna,
  boris,
  childFieldsHandler,
  height,
  invitesHandler,
  membersHandler,
  sessionHandler,
  weight,
} from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';

const NO_CONNECTION = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
const SAVE_FAILED = 'Не удалось сохранить. Проверьте соединение.';
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

/** The names shown in the list, top to bottom (an input out of edit mode, text in edit mode). */
async function names() {
  return (await rows()).map(
    (row) => row.querySelector('input')?.value ?? row.textContent.replace(/(Текст|Дата)$/, ''),
  );
}

async function nameField(name: string) {
  return within(await fieldList()).findByRole('textbox', { name: `Название поля «${name}»` });
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

async function startEditing(user: ReturnType<typeof userEvent.setup>) {
  const fields = await section();
  await within(fields).findByRole('list', { name: 'Поля профиля' });
  await user.click(within(fields).getByRole('button', { name: 'Изменить' }));
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
  server.use(membersHandler([anna, boris]));
  server.use(invitesHandler([]));
});
afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('Child fields list', () => {
  it('shows the Child fields in order, each with its value type on the right', async () => {
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
    expect(await names()).toEqual(['Вес', 'Рост', 'Последний визит к врачу']);
    expect(items[0]).toHaveTextContent('Текст');
    expect(items[1]).toHaveTextContent('Текст');
    expect(items[2]).toHaveTextContent('Дата');
  });

  it('says so when there are no Child fields, still offering to add one', async () => {
    server.use(childFieldsHandler([]));

    renderApp('/settings');

    const fields = await section();
    expect(await within(fields).findByText('Полей пока нет')).toBeInTheDocument();
    expect(within(fields).getByRole('button', { name: 'Добавить поле' })).toBeInTheDocument();
    expect(within(fields).queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument();
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

    expect(await nameField('Рост')).toHaveValue('Рост');
  });
});

describe('Renaming a Child field', () => {
  it('renames a field in place when the Member leaves it, keeping its value type and position', async () => {
    server.use(childFieldsHandler([weight, height]));
    const received = putAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    const name = await nameField('Рост');
    await user.clear(name);
    await user.type(name, 'Рост, см');
    await user.tab();

    await waitFor(() => {
      expect(received).toEqual([
        {
          id: height.id,
          body: { name: 'Рост, см', valueType: 'TEXT', position: 2 },
          csrf: 'token-from-server',
        },
      ]);
    });
    expect(name).toHaveValue('Рост, см');
  });

  it('saves on Enter, and Esc puts the saved name back without calling the server', async () => {
    server.use(childFieldsHandler([weight]));
    const received = putAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    const name = await nameField('Вес');
    await user.type(name, '!!!{Escape}');
    expect(name).toHaveValue('Вес');
    expect(received).toEqual([]);

    await user.type(name, ', кг{Enter}');
    await waitFor(() => {
      expect(received.map((r) => r.body.name)).toEqual(['Вес, кг']);
    });
  });

  it('asks for a name without calling the server', async () => {
    server.use(childFieldsHandler([weight]));
    const received = putAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    const name = await nameField('Вес');
    await user.clear(name);
    await user.tab();

    expect(name).toHaveAccessibleDescription('Заполните это поле');
    expect(name).toBeInvalid();
    expect(received).toEqual([]);
  });

  it('keeps the typed name when saving fails, and saves it with «Повторить»', async () => {
    server.use(childFieldsHandler([weight]));
    let fail = true;
    const received = putAnswers((id, body) =>
      fail ? HttpResponse.error() : savedAsSent(id, body),
    );
    const user = userEvent.setup();

    renderApp('/settings');
    const name = await nameField('Вес');
    await user.type(name, ', кг');
    await user.tab();

    const fields = await section();
    expect(await within(fields).findByRole('alert')).toHaveTextContent(SAVE_FAILED);
    expect(name).toHaveValue('Вес, кг');
    fail = false;
    await user.click(within(fields).getByRole('button', { name: 'Повторить' }));

    await waitFor(() => {
      expect(within(fields).queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(received.map((r) => r.body.name)).toEqual(['Вес, кг', 'Вес, кг']);
  });

  it('tells the Member when the field was removed on another device', async () => {
    server.use(childFieldsHandler([weight]));
    putAnswers(() =>
      HttpResponse.json({ code: 'child_field.deleted', params: {} }, { status: 409 }),
    );
    const user = userEvent.setup();

    renderApp('/settings');
    await user.type(await nameField('Вес'), ', кг{Enter}');

    expect(await within(await section()).findByRole('alert')).toHaveTextContent(
      'Это поле уже удалено.',
    );
  });

  it('never offers to change the value type of an existing field', async () => {
    server.use(childFieldsHandler([weight]));

    renderApp('/settings');

    const row = (await rows())[0];
    expect(row).toHaveTextContent('Текст');
    expect(within(row as HTMLElement).queryByRole('radio')).not.toBeInTheDocument();
    expect(within(row as HTMLElement).queryByRole('combobox')).not.toBeInTheDocument();
  });
});

describe('The «Новое поле» sheet', () => {
  async function openSheet(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await within(await section()).findByRole('button', { name: 'Добавить поле' }));
    return screen.getByRole('dialog', { name: 'Новое поле' });
  }

  it('adds a field of the chosen value type at the end, with an id made on the device', async () => {
    server.use(childFieldsHandler([weight, height]));
    const received = putAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    const sheet = await openSheet(user);
    await user.type(
      within(sheet).getByRole('textbox', { name: 'Название' }),
      'Последний визит к врачу',
    );
    await user.click(within(sheet).getByText('Дата'));
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Новое поле' })).not.toBeInTheDocument();
    });
    expect(await names()).toEqual(['Вес', 'Рост', 'Последний визит к врачу']);
    expect((await rows())[2]).toHaveTextContent('Дата');
    expect(received).toHaveLength(1);
    expect(received[0]?.id).toMatch(UUID);
    expect(received[0]?.body).toEqual({
      name: 'Последний визит к врачу',
      valueType: 'DATE',
      position: 3,
    });
    expect(received[0]?.csrf).toBe('token-from-server');
  });

  it('offers «Текст» unless the Member picks «Дата», and Enter is «Готово»', async () => {
    server.use(childFieldsHandler([]));
    const received = putAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    const sheet = await openSheet(user);
    expect(within(sheet).getByRole('radio', { name: 'Текст' })).toBeChecked();
    await user.type(
      within(sheet).getByRole('textbox', { name: 'Название' }),
      'Размер обуви{Enter}',
    );

    expect(await nameField('Размер обуви')).toBeInTheDocument();
    expect(received[0]?.body).toEqual({ name: 'Размер обуви', valueType: 'TEXT', position: 1 });
  });

  it('asks for a name without calling the server', async () => {
    server.use(childFieldsHandler([weight]));
    const received = putAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    const sheet = await openSheet(user);
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(within(sheet).getByRole('textbox', { name: 'Название' })).toHaveAccessibleDescription(
      'Заполните это поле',
    );
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
    const sheet = await openSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: 'Название' }), 'Я'.repeat(10));
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(await within(sheet).findByText('Слишком длинно')).toBeInTheDocument();
  });

  it('stays open when offline, and «Готово» again repeats the same field', async () => {
    server.use(childFieldsHandler([]));
    let fail = true;
    const received = putAnswers((id, body) =>
      fail ? HttpResponse.error() : savedAsSent(id, body),
    );
    const user = userEvent.setup();

    renderApp('/settings');
    const sheet = await openSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: 'Название' }), 'Размер обуви');
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(await within(sheet).findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    fail = false;
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(await nameField('Размер обуви')).toBeInTheDocument();
    expect(received).toHaveLength(2);
    expect(received[1]?.id).toBe(received[0]?.id);
  });

  it('«Отмена» closes it without saving', async () => {
    server.use(childFieldsHandler([weight]));
    const received = putAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    const sheet = await openSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: 'Название' }), 'Рост');
    await user.click(within(sheet).getByRole('button', { name: 'Отмена' }));

    expect(screen.queryByRole('dialog', { name: 'Новое поле' })).not.toBeInTheDocument();
    expect(await rows()).toHaveLength(1);
    expect(received).toEqual([]);
  });
});

describe('Reordering Child fields', () => {
  // jsdom has no layout: lay the list out as a column of 44px rows, so dnd-kit can tell which
  // row the dragged one is over and keep it inside the list.
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const role = this.getAttribute('role');
      if (role === 'list') {
        return DOMRect.fromRect({ x: 0, y: 0, width: 390, height: this.children.length * 44 });
      }
      if (role !== 'listitem') return new DOMRect(); // jsdom's own answer
      const top = [...(this.parentElement?.children ?? [])].indexOf(this) * 44;
      return DOMRect.fromRect({ x: 0, y: top, width: 390, height: 44 });
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows drag handles only in edit mode', async () => {
    server.use(childFieldsHandler([weight, height]));
    const user = userEvent.setup();

    renderApp('/settings');
    const list = await fieldList();
    expect(within(list).queryByRole('button', { name: 'Переместить «Вес»' })).toBeNull();
    await startEditing(user);

    expect(within(list).getByRole('button', { name: 'Переместить «Вес»' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Переместить «Рост»' })).toBeInTheDocument();
  });

  it('moves a field up with the keyboard, between its new neighbours, sending only that field', async () => {
    server.use(childFieldsHandler([weight, height, shoeSize]));
    const received = putAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    await startEditing(user);
    screen.getByRole('button', { name: 'Переместить «Размер обуви»' }).focus();
    await user.keyboard('[Space]');
    await user.keyboard('[ArrowUp]');
    await user.keyboard('[Space]');

    await waitFor(async () => {
      expect(await names()).toEqual(['Вес', 'Размер обуви', 'Рост']);
    });
    expect(received.map((r) => [r.id, r.body])).toEqual([
      [shoeSize.id, { name: 'Размер обуви', valueType: 'TEXT', position: 1.5 }],
    ]);
  });

  it('moves a field to the very top or bottom past the end neighbour', async () => {
    server.use(childFieldsHandler([weight, height, shoeSize]));
    const received = putAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    await startEditing(user);
    screen.getByRole('button', { name: 'Переместить «Рост»' }).focus();
    await user.keyboard('[Space][ArrowUp][Space]');
    await waitFor(async () => {
      expect(await names()).toEqual(['Рост', 'Вес', 'Размер обуви']);
    });
    // Now «Рост» 0, «Вес» 1, «Размер обуви» 3.
    screen.getByRole('button', { name: 'Переместить «Вес»' }).focus();
    await user.keyboard('[Space][ArrowDown][Space]');
    await waitFor(async () => {
      expect(await names()).toEqual(['Рост', 'Размер обуви', 'Вес']);
    });

    // To the top: one below the first position. To the bottom: one above the last.
    expect(received.map((r) => r.body.position)).toEqual([0, 4]);
  });

  it('puts the field back on Esc without calling the server', async () => {
    server.use(childFieldsHandler([weight, height]));
    const received = putAnswers(savedAsSent);
    const user = userEvent.setup();

    renderApp('/settings');
    await startEditing(user);
    screen.getByRole('button', { name: 'Переместить «Рост»' }).focus();
    await user.keyboard('[Space][ArrowUp][Escape]');

    expect(await names()).toEqual(['Вес', 'Рост']);
    expect(received).toEqual([]);
  });

  it('leaves the order as it was and says why when the move fails', async () => {
    server.use(childFieldsHandler([weight, height]));
    const received = putAnswers(() => HttpResponse.error());
    const user = userEvent.setup();

    renderApp('/settings');
    await startEditing(user);
    screen.getByRole('button', { name: 'Переместить «Рост»' }).focus();
    await user.keyboard('[Space][ArrowUp][Space]');

    expect(await within(await section()).findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    expect(await names()).toEqual(['Вес', 'Рост']);
    expect(received).toHaveLength(1);
  });
});

describe('Deleting a Child field', () => {
  it('deletes from edit mode after the action sheet, leaving edit mode with the last one', async () => {
    server.use(childFieldsHandler([weight]));
    const removed = deleteAnswers(() => new HttpResponse(null, { status: 204 }));
    const user = userEvent.setup();

    renderApp('/settings');
    await startEditing(user);
    const fields = await section();
    await user.click(within(fields).getByRole('button', { name: 'Удалить «Вес»' }));
    const sheet = screen.getByRole('dialog', { name: 'Удалить поле „Вес“?' });
    expect(removed).toEqual([]);
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    expect(await within(fields).findByText('Полей пока нет')).toBeInTheDocument();
    expect(removed).toEqual([weight.id]);
    expect(within(fields).queryByRole('button', { name: 'Готово' })).not.toBeInTheDocument();
  });

  it('deletes with right-click → «Удалить», after the action sheet', async () => {
    server.use(childFieldsHandler([weight, height]));
    const removed = deleteAnswers(() => new HttpResponse(null, { status: 204 }));
    const user = userEvent.setup();

    renderApp('/settings');
    const row = (await rows())[1];
    await user.pointer({
      keys: '[MouseRight]',
      target: within(row as HTMLElement).getByText('Текст'),
    });
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    const sheet = await screen.findByRole('dialog', { name: 'Удалить поле „Рост“?' });
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    await waitFor(async () => {
      expect(await names()).toEqual(['Вес']);
    });
    expect(removed).toEqual([height.id]);
  });

  it('keeps the field when the Member changes their mind', async () => {
    server.use(childFieldsHandler([weight, height]));
    const removed = deleteAnswers(() => new HttpResponse(null, { status: 204 }));
    const user = userEvent.setup();

    renderApp('/settings');
    await startEditing(user);
    await user.click(screen.getByRole('button', { name: 'Удалить «Вес»' }));
    const sheet = screen.getByRole('dialog', { name: 'Удалить поле „Вес“?' });
    await user.click(within(sheet).getByRole('button', { name: 'Отменить' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await rows()).toHaveLength(2);
    expect(removed).toEqual([]);
  });

  it('keeps the field and says why when deleting fails', async () => {
    server.use(childFieldsHandler([weight]));
    deleteAnswers(() => HttpResponse.error());
    const user = userEvent.setup();

    renderApp('/settings');
    await startEditing(user);
    await user.click(screen.getByRole('button', { name: 'Удалить «Вес»' }));
    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(await within(await section()).findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    expect(await names()).toEqual(['Вес']);
  });
});

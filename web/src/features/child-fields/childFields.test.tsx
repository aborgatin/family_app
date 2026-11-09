import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  anna,
  boris,
  height,
  invitesHandler,
  membersHandler,
  sessionHandler,
  weight,
} from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// Child fields live in the local store and reach the server through the Outbox (spec #3, ticket
// #53): changes show at once, also offline, and are pushed when the server is reachable.

const NOT_SAVED = 'Не удалось сохранить';
const OFFLINE = 'Нет связи с сервером';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const shoeSize: typeof weight = {
  id: '7a2d3d2f-0000-4000-8000-000000000003',
  name: 'Размер обуви',
  valueType: 'TEXT',
  position: 3,
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

/** Waits until the list shows these names. */
async function showing(expected: string[]) {
  await waitFor(async () => {
    expect(await names()).toEqual(expected);
  });
}

async function nameField(name: string) {
  return within(await fieldList()).findByRole('textbox', { name: `Название поля «${name}»` });
}

/** The connection is back: the app notices (browser `online` event) and sends what is waiting. */
function reconnect() {
  syncServer.goOnline();
  window.dispatchEvent(new Event('online'));
}

/** The app comes back to the foreground (e.g. switching back to it on the phone). */
function bringToForeground() {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
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
    syncServer.seed('child_field', [
      { ...shoeSize, name: 'Последний визит к врачу', valueType: 'DATE' },
      height,
      weight,
    ]);

    renderApp('/settings');

    await showing(['Вес', 'Рост', 'Последний визит к врачу']);
    const items = await rows();
    expect(items[0]).toHaveTextContent('Текст');
    expect(items[1]).toHaveTextContent('Текст');
    expect(items[2]).toHaveTextContent('Дата');
  });

  it('breaks ties in position by id', async () => {
    syncServer.seed('child_field', [
      { ...shoeSize, position: 1 },
      { ...height, position: 1 },
      { ...weight, position: 2 },
    ]);

    renderApp('/settings');

    // «Рост» (…02) before «Размер обуви» (…03): same position, lower id first.
    await showing(['Рост', 'Размер обуви', 'Вес']);
  });

  it('says so when there are no Child fields, still offering to add one', async () => {
    renderApp('/settings');

    const fields = await section();
    expect(await within(fields).findByText('Полей пока нет')).toBeInTheDocument();
    expect(within(fields).getByRole('button', { name: 'Добавить поле' })).toBeInTheDocument();
    expect(within(fields).queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument();
  });

  it('keeps the Child fields on the device: after a restart they show without the server', async () => {
    syncServer.seed('child_field', [weight, height]);
    const first = renderApp('/settings');
    expect(await nameField('Рост')).toBeInTheDocument();
    first.unmount();

    syncServer.goOffline();
    renderApp('/settings');

    expect(await nameField('Рост')).toHaveValue('Рост');
  });

  it('shows the other Member’s changes once the app pulls', async () => {
    syncServer.seed('child_field', [weight, height]);
    renderApp('/settings');
    await nameField('Рост');

    syncServer.seed('child_field', [shoeSize]);
    syncServer.change('child_field', weight.id, { name: 'Вес, кг' });
    syncServer.change('child_field', height.id, 'deleted');
    bringToForeground();

    await showing(['Вес, кг', 'Размер обуви']);
  });
});

describe('Renaming a Child field', () => {
  it('renames a field in place when the Member leaves it, sending only the name', async () => {
    syncServer.seed('child_field', [weight, height]);
    const user = userEvent.setup();

    renderApp('/settings');
    const name = await nameField('Рост');
    await user.clear(name);
    await user.type(name, 'Рост, см');
    await user.tab();

    await waitFor(() => {
      expect(syncServer.operations('child_field')).toEqual([
        { table: 'child_field', id: height.id, op: 'upsert', fields: { name: 'Рост, см' } },
      ]);
    });
    expect(syncServer.pushes[0]?.csrf).toBe('token-from-server');
    expect(name).toHaveValue('Рост, см');
  });

  it('saves on Enter, and Esc puts the saved name back without sending anything', async () => {
    syncServer.seed('child_field', [weight]);
    const user = userEvent.setup();

    renderApp('/settings');
    const name = await nameField('Вес');
    await user.type(name, '!!!{Escape}');
    expect(name).toHaveValue('Вес');

    await user.type(name, ', кг{Enter}');
    await waitFor(() => {
      expect(syncServer.operations('child_field').map((op) => op.fields?.name)).toEqual([
        'Вес, кг',
      ]);
    });
  });

  it('asks for a name without sending anything', async () => {
    syncServer.seed('child_field', [weight]);
    const user = userEvent.setup();

    renderApp('/settings');
    const name = await nameField('Вес');
    await user.clear(name);
    await user.tab();

    expect(name).toHaveAccessibleDescription('Заполните это поле');
    expect(name).toBeInvalid();
    expect(syncServer.operations('child_field')).toEqual([]);
  });

  it('renames offline at once and sends the new name when the server is back', async () => {
    syncServer.seed('child_field', [weight]);
    const user = userEvent.setup();

    renderApp('/settings');
    const name = await nameField('Вес');
    syncServer.goOffline();
    await user.type(name, ', кг');
    await user.tab();

    expect(await screen.findByRole('button', { name: OFFLINE })).toBeInTheDocument();
    expect(name).toHaveValue('Вес, кг');
    expect(syncServer.row('child_field', weight.id)).toEqual(weight);

    reconnect();

    await waitFor(() => {
      expect(syncServer.row('child_field', weight.id)).toEqual({ ...weight, name: 'Вес, кг' });
    });
    expect(within(await section()).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lets the delete win quietly when the other Member removed the field meanwhile', async () => {
    syncServer.seed('child_field', [weight, height]);
    const user = userEvent.setup();

    renderApp('/settings');
    const name = await nameField('Вес');
    syncServer.change('child_field', weight.id, 'deleted');
    await user.type(name, ', кг{Enter}');

    await showing(['Рост']);
    expect(syncServer.row('child_field', weight.id)).toBeUndefined();
    expect(within(await section()).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says «Не удалось сохранить» once when the server rejects it, and shows its name', async () => {
    syncServer.seed('child_field', [weight]);
    syncServer.rejectWhen((op) => op.fields?.name === 'Вес, кг');
    const user = userEvent.setup();

    renderApp('/settings');
    await user.type(await nameField('Вес'), ', кг{Enter}');

    const fields = await section();
    expect(await within(fields).findByText(NOT_SAVED)).toBeInTheDocument();
    await waitFor(async () => {
      expect(await nameField('Вес')).toHaveValue('Вес');
    });
    expect(within(fields).getAllByText(NOT_SAVED)).toHaveLength(1);
  });

  it('never offers to change the value type of an existing field', async () => {
    syncServer.seed('child_field', [weight]);

    renderApp('/settings');

    await nameField('Вес');
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
    syncServer.seed('child_field', [weight, height]);
    const user = userEvent.setup();

    renderApp('/settings');
    await nameField('Рост');
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
    await showing(['Вес', 'Рост', 'Последний визит к врачу']);
    expect((await rows())[2]).toHaveTextContent('Дата');
    await waitFor(() => {
      expect(syncServer.operations('child_field')).toHaveLength(1);
    });
    const [added] = syncServer.operations('child_field');
    expect(added?.id).toMatch(UUID);
    expect(added?.op).toBe('upsert');
    expect(added?.fields).toEqual({
      name: 'Последний визит к врачу',
      valueType: 'DATE',
      position: 3,
    });
  });

  it('offers «Текст» unless the Member picks «Дата», and Enter is «Готово»', async () => {
    const user = userEvent.setup();

    renderApp('/settings');
    await within(await section()).findByText('Полей пока нет');
    const sheet = await openSheet(user);
    expect(within(sheet).getByRole('radio', { name: 'Текст' })).toBeChecked();
    await user.type(
      within(sheet).getByRole('textbox', { name: 'Название' }),
      'Размер обуви{Enter}',
    );

    expect(await nameField('Размер обуви')).toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.operations('child_field')[0]?.fields).toEqual({
        name: 'Размер обуви',
        valueType: 'TEXT',
        position: 1,
      });
    });
  });

  it('asks for a name without sending anything', async () => {
    syncServer.seed('child_field', [weight]);
    const user = userEvent.setup();

    renderApp('/settings');
    await nameField('Вес');
    const sheet = await openSheet(user);
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(within(sheet).getByRole('textbox', { name: 'Название' })).toHaveAccessibleDescription(
      'Заполните это поле',
    );
    expect(syncServer.operations('child_field')).toEqual([]);
  });

  it('adds a field offline: it shows at once and is pushed on reconnect', async () => {
    syncServer.seed('child_field', [weight]);
    const user = userEvent.setup();

    renderApp('/settings');
    await nameField('Вес');
    syncServer.goOffline();
    const sheet = await openSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: 'Название' }), 'Размер обуви');
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(await nameField('Размер обуви')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Новое поле' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: OFFLINE })).toBeInTheDocument();
    expect(syncServer.operations('child_field')).toEqual([]);

    reconnect();

    await waitFor(() => {
      expect(syncServer.operations('child_field')).toHaveLength(1);
    });
    const [added] = syncServer.operations('child_field');
    expect(syncServer.row('child_field', added?.id ?? '')).toEqual({
      id: added?.id,
      name: 'Размер обуви',
      valueType: 'TEXT',
      position: 2,
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: OFFLINE })).not.toBeInTheDocument();
    });
  });

  it('says «Не удалось сохранить» when the server rejects a new field, which then goes', async () => {
    syncServer.rejectWhen((op) => op.fields?.name === 'Я'.repeat(10));
    const user = userEvent.setup();

    renderApp('/settings');
    const fields = await section();
    await within(fields).findByText('Полей пока нет');
    const sheet = await openSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: 'Название' }), 'Я'.repeat(10));
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(await within(fields).findByText(NOT_SAVED)).toBeInTheDocument();
    expect(await within(fields).findByText('Полей пока нет')).toBeInTheDocument();
  });

  it('«Отмена» closes it without saving', async () => {
    syncServer.seed('child_field', [weight]);
    const user = userEvent.setup();

    renderApp('/settings');
    await nameField('Вес');
    const sheet = await openSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: 'Название' }), 'Рост');
    await user.click(within(sheet).getByRole('button', { name: 'Отмена' }));

    expect(screen.queryByRole('dialog', { name: 'Новое поле' })).not.toBeInTheDocument();
    expect(await rows()).toHaveLength(1);
    expect(syncServer.operations('child_field')).toEqual([]);
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
    syncServer.seed('child_field', [weight, height]);
    const user = userEvent.setup();

    renderApp('/settings');
    await nameField('Рост');
    const list = await fieldList();
    expect(within(list).queryByRole('button', { name: 'Переместить «Вес»' })).toBeNull();
    await startEditing(user);

    expect(within(list).getByRole('button', { name: 'Переместить «Вес»' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Переместить «Рост»' })).toBeInTheDocument();
  });

  it('moves a field up with the keyboard, between its new neighbours, sending only its position', async () => {
    syncServer.seed('child_field', [weight, height, shoeSize]);
    const user = userEvent.setup();

    renderApp('/settings');
    await nameField('Размер обуви');
    await startEditing(user);
    screen.getByRole('button', { name: 'Переместить «Размер обуви»' }).focus();
    await user.keyboard('[Space]');
    await user.keyboard('[ArrowUp]');
    await user.keyboard('[Space]');

    await showing(['Вес', 'Размер обуви', 'Рост']);
    await waitFor(() => {
      expect(syncServer.operations('child_field')).toEqual([
        { table: 'child_field', id: shoeSize.id, op: 'upsert', fields: { position: 1.5 } },
      ]);
    });
  });

  it('moves a field to the very top or bottom past the end neighbour', async () => {
    syncServer.seed('child_field', [weight, height, shoeSize]);
    const user = userEvent.setup();

    renderApp('/settings');
    await nameField('Размер обуви');
    await startEditing(user);
    screen.getByRole('button', { name: 'Переместить «Рост»' }).focus();
    await user.keyboard('[Space][ArrowUp][Space]');
    await showing(['Рост', 'Вес', 'Размер обуви']);
    // Now «Рост» 0, «Вес» 1, «Размер обуви» 3.
    screen.getByRole('button', { name: 'Переместить «Вес»' }).focus();
    await user.keyboard('[Space][ArrowDown][Space]');
    await showing(['Рост', 'Размер обуви', 'Вес']);

    // To the top: one below the first position. To the bottom: one above the last.
    await waitFor(() => {
      expect(syncServer.operations('child_field').map((op) => op.fields?.position)).toEqual([0, 4]);
    });
  });

  it('puts the field back on Esc without sending anything', async () => {
    syncServer.seed('child_field', [weight, height]);
    const user = userEvent.setup();

    renderApp('/settings');
    await nameField('Рост');
    await startEditing(user);
    screen.getByRole('button', { name: 'Переместить «Рост»' }).focus();
    await user.keyboard('[Space][ArrowUp][Escape]');

    expect(await names()).toEqual(['Вес', 'Рост']);
    expect(syncServer.operations('child_field')).toEqual([]);
  });

  it('moves offline at once and sends the new position when the server is back', async () => {
    syncServer.seed('child_field', [weight, height]);
    const user = userEvent.setup();

    renderApp('/settings');
    await nameField('Рост');
    syncServer.goOffline();
    await startEditing(user);
    screen.getByRole('button', { name: 'Переместить «Рост»' }).focus();
    await user.keyboard('[Space][ArrowUp][Space]');

    await showing(['Рост', 'Вес']);
    expect(await screen.findByRole('button', { name: OFFLINE })).toBeInTheDocument();
    expect(within(await section()).queryByRole('alert')).not.toBeInTheDocument();

    reconnect();

    await waitFor(() => {
      expect(syncServer.row('child_field', height.id)).toEqual({ ...height, position: 0 });
    });
  });
});

describe('Deleting a Child field', () => {
  it('deletes from edit mode after the action sheet, leaving edit mode with the last one', async () => {
    syncServer.seed('child_field', [weight]);
    const user = userEvent.setup();

    renderApp('/settings');
    await nameField('Вес');
    await startEditing(user);
    const fields = await section();
    await user.click(within(fields).getByRole('button', { name: 'Удалить «Вес»' }));
    const sheet = screen.getByRole('dialog', { name: 'Удалить поле „Вес“?' });
    expect(syncServer.operations('child_field')).toEqual([]);
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    expect(await within(fields).findByText('Полей пока нет')).toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.operations('child_field')).toEqual([
        { table: 'child_field', id: weight.id, op: 'delete' },
      ]);
    });
    expect(within(fields).queryByRole('button', { name: 'Готово' })).not.toBeInTheDocument();
  });

  it('deletes with right-click → «Удалить», after the action sheet', async () => {
    syncServer.seed('child_field', [weight, height]);
    const user = userEvent.setup();

    renderApp('/settings');
    await nameField('Рост');
    const row = (await rows())[1];
    await user.pointer({
      keys: '[MouseRight]',
      target: within(row as HTMLElement).getByText('Текст'),
    });
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    const sheet = await screen.findByRole('dialog', { name: 'Удалить поле „Рост“?' });
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    await showing(['Вес']);
    await waitFor(() => {
      expect(syncServer.row('child_field', height.id)).toBeUndefined();
    });
  });

  it('keeps the field when the Member changes their mind', async () => {
    syncServer.seed('child_field', [weight, height]);
    const user = userEvent.setup();

    renderApp('/settings');
    await nameField('Рост');
    await startEditing(user);
    await user.click(screen.getByRole('button', { name: 'Удалить «Вес»' }));
    const sheet = screen.getByRole('dialog', { name: 'Удалить поле „Вес“?' });
    await user.click(within(sheet).getByRole('button', { name: 'Отменить' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await rows()).toHaveLength(2);
    expect(syncServer.operations('child_field')).toEqual([]);
  });

  it('deletes offline at once and sends the delete when the server is back', async () => {
    syncServer.seed('child_field', [weight, height]);
    const user = userEvent.setup();

    renderApp('/settings');
    await nameField('Рост');
    syncServer.goOffline();
    await startEditing(user);
    await user.click(screen.getByRole('button', { name: 'Удалить «Вес»' }));
    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    await showing(['Рост']);
    expect(await screen.findByRole('button', { name: OFFLINE })).toBeInTheDocument();
    expect(syncServer.row('child_field', weight.id)).toBeDefined();

    reconnect();

    await waitFor(() => {
      expect(syncServer.row('child_field', weight.id)).toBeUndefined();
    });
  });
});

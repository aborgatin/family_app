import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { anna, boris, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// Lists live in the local store and reach the server through the Outbox (spec #3, tickets #55, #56):
// Home lists them, «Новый список» creates one (offline too), a List opens its own screen, and its
// «Настройки списка» screen (#63) renames it, changes its Visibility and deletes it (both Owner
// only, #64).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A List row as the pull sends it. */
function list(
  n: number,
  name: string,
  kind: 'SHOPPING' | 'TODO' | 'WISH',
  visibility: 'PRIVATE' | 'SHARED' = 'SHARED',
) {
  return {
    id: `1157a000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    name,
    kind,
    visibility,
    ownerId: anna.id,
    createdAt: '2026-11-01T10:00:00Z',
  };
}

const groceries = list(1, 'Супермаркет', 'SHOPPING');

/** An open Item row as the pull sends it. */
function openItem(n: number, text: string, listId: string) {
  return {
    id: `17e40000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    listId,
    text,
    note: null,
    done: false,
    doneById: null,
    doneAt: null,
    creatorId: boris.id,
    createdAt: '2026-11-01T09:00:00Z',
  };
}

/** The connection is back: the app notices (browser `online` event) and sends what is waiting. */
function reconnect() {
  syncServer.goOnline();
  window.dispatchEvent(new Event('online'));
}

async function listsSection() {
  return screen.findByRole('region', { name: 'Списки' });
}

/** The text of each List row on Home, top to bottom. */
async function listRows() {
  return within(await listsSection())
    .queryAllByRole('link')
    .map((row) => row.textContent);
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
});

describe('«Списки» on Home', () => {
  it('lists every List by name, ties by id, with its kind and « · Личный» when Private', async () => {
    syncServer.seed('list', [
      list(4, 'Ёлка', 'TODO'),
      list(2, 'Аптека', 'SHOPPING'),
      list(3, 'Подарки', 'WISH'),
      list(6, 'Дела', 'TODO', 'PRIVATE'),
      list(5, 'Дела', 'SHOPPING'),
      list(7, 'Елена', 'WISH'),
    ]);

    renderApp('/');

    await waitFor(async () => {
      expect(await listRows()).toEqual([
        'АптекаПокупки0',
        'ДелаПокупки0',
        'ДелаTODO-список · Личный0',
        'ЕленаЖелания0',
        'ЁлкаTODO-список0',
        'ПодаркиЖелания0',
      ]);
    });
  });

  it('shows each List’s count of open Items, following the Items as they change', async () => {
    const pharmacy = list(2, 'Аптека', 'SHOPPING');
    syncServer.seed('list', [groceries, pharmacy]);
    syncServer.seed('item', [
      openItem(1, 'Молоко', groceries.id),
      openItem(2, 'Хлеб', groceries.id),
      { ...openItem(3, 'Сыр', groceries.id), done: true, doneById: boris.id },
      openItem(4, 'Аспирин', pharmacy.id),
    ]);

    renderApp('/');

    await waitFor(async () => {
      expect(await listRows()).toEqual(['АптекаПокупки1', 'СупермаркетПокупки2']);
    });

    // Boris ticks Хлеб off and adds Йод to the pharmacy List.
    syncServer.change('item', openItem(2, '', '').id, { done: true, doneById: boris.id });
    syncServer.seed('item', [openItem(5, 'Йод', pharmacy.id)]);
    window.dispatchEvent(new Event('online'));

    await waitFor(async () => {
      expect(await listRows()).toEqual(['АптекаПокупки2', 'СупермаркетПокупки1']);
    });
  });

  it('says when there are no Lists yet, still offering to add one', async () => {
    renderApp('/');

    const section = await listsSection();
    expect(await within(section).findByText('Списков пока нет')).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Добавить список' })).toBeInTheDocument();
    expect(screen.queryByText('Здесь пока пусто')).not.toBeInTheDocument();
  });

  it('shows a List the other Member shared once the pull brings it', async () => {
    renderApp('/');
    await within(await listsSection()).findByText('Списков пока нет');

    syncServer.seed('list', [{ ...groceries, ownerId: boris.id }]);
    window.dispatchEvent(new Event('online'));

    expect(await within(await listsSection()).findByText('Супермаркет')).toBeInTheDocument();
  });
});

describe('The «Новый список» sheet', () => {
  async function openSheet(user: ReturnType<typeof userEvent.setup>) {
    const section = await listsSection();
    await user.click(await within(section).findByRole('button', { name: 'Добавить список' }));
    return screen.getByRole('dialog', { name: 'Новый список' });
  }

  it('creates a Shared List by default, under an id made on the client', async () => {
    const user = userEvent.setup();

    renderApp('/');
    const sheet = await openSheet(user);
    // The Visibility row shows no label, but screen readers still hear its name.
    const visibility = within(sheet).getByRole('radiogroup', { name: 'Видимость' });
    expect(within(visibility).getByRole('radio', { name: 'Общий' })).toBeChecked();
    await user.type(within(sheet).getByRole('textbox', { name: 'Название' }), '  Аптека ');
    await user.click(within(sheet).getByRole('radio', { name: 'Покупки' }));
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await waitFor(async () => {
      expect(await listRows()).toEqual(['АптекаПокупки0']);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.operations('list')).toHaveLength(1);
    });
    const [created] = syncServer.operations('list');
    expect(created?.id).toMatch(UUID);
    expect(created?.op).toBe('upsert');
    expect(created?.fields).toEqual({ name: 'Аптека', kind: 'SHOPPING', visibility: 'SHARED' });
    expect(syncServer.pushes[0]?.csrf).toBe('token-from-server');
  });

  it('creates a List offline at once, and sends it under the same id when the server is back', async () => {
    const user = userEvent.setup();

    renderApp('/');
    await within(await listsSection()).findByText('Списков пока нет');
    syncServer.goOffline();
    const sheet = await openSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: 'Название' }), 'Ремонт');
    await user.click(within(sheet).getByRole('radio', { name: 'TODO' }));
    await user.click(within(sheet).getByRole('radio', { name: 'Личный' }));
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await waitFor(async () => {
      expect(await listRows()).toEqual(['РемонтTODO-список · Личный0']);
    });
    expect(syncServer.pushes).toEqual([]);

    reconnect();

    await waitFor(() => {
      expect(syncServer.operations('list')).toHaveLength(1);
    });
    const id = syncServer.operations('list')[0]?.id ?? '';
    expect(syncServer.row('list', id)).toEqual({
      id,
      name: 'Ремонт',
      kind: 'TODO',
      visibility: 'PRIVATE',
    });
  });

  it('hides Visibility while «Желания» is chosen: a Wish list is always Shared', async () => {
    const user = userEvent.setup();

    renderApp('/');
    const sheet = await openSheet(user);
    await user.click(within(sheet).getByRole('radio', { name: 'Личный' }));
    await user.click(within(sheet).getByRole('radio', { name: 'Желания' }));
    expect(within(sheet).queryByRole('radio', { name: 'Личный' })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('radio', { name: 'Общий' })).not.toBeInTheDocument();
    await user.type(
      within(sheet).getByRole('textbox', { name: 'Название' }),
      'Желания Маши{Enter}',
    );

    await waitFor(() => {
      expect(syncServer.operations('list').map((op) => op.fields)).toEqual([
        { name: 'Желания Маши', kind: 'WISH', visibility: 'SHARED' },
      ]);
    });
  });

  it('asks for a name and a kind without saving anything', async () => {
    const user = userEvent.setup();

    renderApp('/');
    const sheet = await openSheet(user);
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(within(sheet).getByRole('textbox', { name: 'Название' })).toHaveAccessibleDescription(
      'Заполните это поле',
    );
    expect(within(sheet).getByRole('radiogroup', { name: 'Вид' })).toHaveAccessibleDescription(
      'Выберите вариант',
    );
    expect(screen.getByRole('dialog', { name: 'Новый список' })).toBeInTheDocument();
    expect(syncServer.operations('list')).toEqual([]);
  });

  it('takes a rejected new List off Home and says why it wasn’t saved', async () => {
    syncServer.rejectWhen(() => ({ code: 'list.wish_shared_only' }));
    const user = userEvent.setup();

    renderApp('/');
    const sheet = await openSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: 'Название' }), 'Аптека');
    await user.click(within(sheet).getByRole('radio', { name: 'Покупки' }));
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    const section = await listsSection();
    expect(
      await screen.findByText('Не удалось сохранить: список желаний всегда общий'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(within(section).queryByText('Аптека')).not.toBeInTheDocument();
    });
  });
});

describe('The List screen', () => {
  it.each([
    ['SHOPPING', 'Товаров пока нет'],
    ['TODO', 'Задач пока нет'],
    ['WISH', 'Желаний пока нет'],
  ] as const)('opens from Home: a %s List, still empty, says «%s»', async (kind, empty) => {
    const opened = list(9, 'Мой список', kind);
    syncServer.seed('list', [opened]);
    const user = userEvent.setup();

    const app = renderApp('/');
    await user.click(await within(await listsSection()).findByRole('link', { name: /Мой список/ }));

    expect(app.location()).toBe(`/lists/${opened.id}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Мой список' }),
    ).toBeInTheDocument();
    expect(await screen.findByText(empty)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Семья' }));
    expect(app.location()).toBe('/');
  });

  it('says so when the List doesn’t exist (any more)', async () => {
    renderApp(`/lists/${groceries.id}`);

    expect(
      await screen.findByText('Такого списка нет: возможно, его удалили.'),
    ).toBeInTheDocument();
  });
});

describe('The «Настройки списка» screen', () => {
  const settingsPath = `/lists/${groceries.id}/settings`;

  it('opens from the settings icon on the List screen, which shows only the Items, and goes back to the List', async () => {
    syncServer.seed('list', [groceries]);
    const user = userEvent.setup();

    const app = renderApp(`/lists/${groceries.id}`);
    await screen.findByRole('heading', { level: 1, name: 'Супермаркет' });
    expect(await screen.findByText('Товаров пока нет')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Настройки списка' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Название' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить список' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Настройки списка' }));

    expect(app.location()).toBe(settingsPath);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Настройки списка' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Название' })).toHaveValue('Супермаркет');
    await user.click(screen.getByRole('link', { name: 'Супермаркет' }));
    expect(app.location()).toBe(`/lists/${groceries.id}`);
  });

  it('renames the List from «Название», whoever owns it, sending only the name', async () => {
    syncServer.seed('list', [{ ...groceries, ownerId: boris.id }]);
    const user = userEvent.setup();

    renderApp(settingsPath);
    const name = await screen.findByRole('textbox', { name: 'Название' });
    expect(name).toHaveValue('Супермаркет');
    await user.clear(name);
    await user.type(name, 'Ашан{Enter}');

    // The back link names the List: renamed at once.
    expect(await screen.findByRole('link', { name: 'Ашан' })).toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.operations('list')).toEqual([
        { table: 'list', id: groceries.id, op: 'upsert', fields: { name: 'Ашан' } },
      ]);
    });
  });

  it('lets the Owner make a Shared List Private and Shared again', async () => {
    syncServer.seed('list', [groceries]);
    const user = userEvent.setup();

    renderApp(settingsPath);
    const visibility = await screen.findByRole('radiogroup', { name: 'Видимость' });
    expect(within(visibility).getByRole('radio', { name: 'Общий' })).toBeChecked();
    await user.click(within(visibility).getByRole('radio', { name: 'Личный' }));

    await waitFor(() => {
      expect(syncServer.row('list', groceries.id)).toMatchObject({ visibility: 'PRIVATE' });
    });
    await user.click(within(visibility).getByRole('radio', { name: 'Общий' }));
    await waitFor(() => {
      expect(syncServer.operations('list').map((op) => op.fields)).toEqual([
        { visibility: 'PRIVATE' },
        { visibility: 'SHARED' },
      ]);
    });
  });

  it.each([
    ['another Member’s List', { ...groceries, ownerId: boris.id }],
    ['a Wish list', list(3, 'Подарки', 'WISH')],
  ])('shows no Visibility for %s', async (_, shown) => {
    syncServer.seed('list', [shown]);

    renderApp(`/lists/${shown.id}/settings`);

    expect(await screen.findByRole('textbox', { name: 'Название' })).toHaveValue(shown.name);
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Личный' })).not.toBeInTheDocument();
  });

  it.each([
    ['shows', 'the Owner', groceries.ownerId, true],
    ['hides', 'another Member', boris.id, false],
  ])('%s «Удалить список» for %s', async (_, __, ownerId, shown) => {
    syncServer.seed('list', [{ ...groceries, ownerId }]);

    renderApp(settingsPath);

    expect(await screen.findByRole('textbox', { name: 'Название' })).toHaveValue('Супермаркет');
    expect(screen.queryByRole('button', { name: 'Удалить список' }) !== null).toBe(shown);
  });

  it('counts a List created here as the Member’s own before the pull brings its Owner', async () => {
    const user = userEvent.setup();

    renderApp('/');
    await within(await listsSection()).findByText('Списков пока нет');
    syncServer.goOffline();
    await user.click(
      await within(await listsSection()).findByRole('button', { name: 'Добавить список' }),
    );
    const sheet = screen.getByRole('dialog', { name: 'Новый список' });
    await user.type(within(sheet).getByRole('textbox', { name: 'Название' }), 'Ремонт');
    await user.click(within(sheet).getByRole('radio', { name: 'TODO' }));
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
    await user.click(await within(await listsSection()).findByRole('link', { name: /Ремонт/ }));
    await user.click(await screen.findByRole('link', { name: 'Настройки списка' }));

    expect(await screen.findByRole('button', { name: 'Удалить список' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Видимость' })).toBeInTheDocument();
  });

  it('says only the Owner may do it when the server rejects deleting the List', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.rejectWhen((op) => op.op === 'delete' && { code: 'list.owner_only' });
    const user = userEvent.setup();

    renderApp(settingsPath);
    await user.click(await screen.findByRole('button', { name: 'Удалить список' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));

    expect(
      await screen.findByText('Не удалось сохранить: это может сделать только владелец списка'),
    ).toBeInTheDocument();
    await waitFor(async () => {
      expect(await listRows()).toEqual(['СупермаркетПокупки0']);
    });
  });

  it('deletes the List after the action sheet and goes back to Home', async () => {
    syncServer.seed('list', [groceries, list(2, 'Аптека', 'SHOPPING')]);
    const user = userEvent.setup();

    const app = renderApp(settingsPath);
    await user.click(await screen.findByRole('button', { name: 'Удалить список' }));
    const sheet = screen.getByRole('dialog', {
      name: 'Удалить „Супермаркет“ со всем содержимым?',
    });
    expect(syncServer.operations('list')).toEqual([]);
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(app.location()).toBe('/');
    });
    await waitFor(async () => {
      expect(await listRows()).toEqual(['АптекаПокупки0']);
    });
    await waitFor(() => {
      expect(syncServer.operations('list')).toEqual([
        { table: 'list', id: groceries.id, op: 'delete' },
      ]);
    });
  });

  it('doesn’t bring back a List deleted on the server with a change made during a full pull', async () => {
    syncServer.seed('list', [{ ...groceries, ownerId: boris.id }, list(2, 'Аптека', 'SHOPPING')]);
    const user = userEvent.setup();

    const app = renderApp(`/lists/${groceries.id}`);
    await screen.findByRole('heading', { level: 1, name: 'Супермаркет' });
    // Boris deletes it; this device hasn't pulled since.
    syncServer.change('list', groceries.id, 'deleted');
    // A rejected Item makes the next pull a full one, which leaves deleted Lists out; it waits.
    syncServer.rejectWhen((op) => op.table === 'item');
    const release = syncServer.holdPulls();
    const pullsBefore = syncServer.pulls.length;
    await user.type(await screen.findByRole('textbox', { name: 'Новый товар' }), 'Хлеб{Enter}');
    await waitFor(() => {
      expect(syncServer.pulls.slice(pullsBefore)).toContain(0);
    });
    // Renamed while that pull is under way: the rename is still in the Outbox when it lands.
    await user.click(screen.getByRole('link', { name: 'Настройки списка' }));
    const name = await screen.findByRole('textbox', { name: 'Название' });
    await user.clear(name);
    await user.type(name, 'Ашан{Enter}');
    release();

    expect(
      await screen.findByText('Такого списка нет: возможно, его удалили.'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.operations('list')).toHaveLength(1);
    });
    await user.click(screen.getByRole('link', { name: 'Семья' }));
    expect(app.location()).toBe('/');
    await waitFor(async () => {
      expect(await listRows()).toEqual(['АптекаПокупки0']);
    });
  });

  it.each([
    ['the List screen', `/lists/${groceries.id}`, 'Новый товар'],
    ['«Настройки списка»', settingsPath, 'Название'],
  ])(
    'says the List is gone when it disappears while %s is open, with the way back to Home',
    async (_, path, field) => {
      syncServer.seed('list', [{ ...groceries, ownerId: boris.id }]);
      const user = userEvent.setup();

      const app = renderApp(path);
      await screen.findByRole('textbox', { name: field });

      // Deleted, or made Private by Boris: either way the pull brings a tombstone.
      syncServer.change('list', groceries.id, 'deleted');
      window.dispatchEvent(new Event('online'));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Такого списка нет: возможно, его удалили.',
      );
      expect(screen.queryByRole('textbox', { name: field })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Удалить список' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('link', { name: 'Семья' }));
      expect(app.location()).toBe('/');
    },
  );
});

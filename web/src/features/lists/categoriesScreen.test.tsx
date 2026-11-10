import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anna, boris, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// The «Категории» screen of a Shopping list (spec #4, ticket #72): add, rename, reorder and delete
// its Categories; the Unnamed category («Без категории») can only be moved.

/** A List row as the pull sends it. */
function list(n: number, name: string, kind: 'SHOPPING' | 'TODO' | 'WISH', unnamed = 0) {
  return {
    id: `1157a000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    name,
    kind,
    visibility: 'SHARED',
    unnamedCategoryPosition: unnamed,
    ownerId: boris.id,
    createdAt: '2026-11-01T10:00:00Z',
  };
}

const groceries = list(1, 'Супермаркет', 'SHOPPING', 2);
const categoriesPath = `/lists/${groceries.id}/categories`;

/** A Category row as the pull sends it. */
function category(n: number, name: string, position: number, listId = groceries.id) {
  return {
    id: `ca7e0000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    listId,
    name,
    position,
  };
}

const food = category(1, 'Еда', 1);
const chemicals = category(2, 'Бытовая химия', 3);
const pets = category(3, 'Для кошки', 4);

/** An Item row as the pull sends it, in a Category or the Unnamed one. */
function item(n: number, text: string, categoryId: string | null, done = false) {
  return {
    id: `17e40000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    listId: groceries.id,
    text,
    categoryId,
    description: null,
    done,
    doneById: done ? boris.id : null,
    doneAt: done ? '2026-11-01T09:30:00Z' : null,
    creatorId: boris.id,
    createdAt: `2026-11-01T09:0${String(n)}:00Z`,
  };
}

async function categoryList() {
  return screen.findByRole('list', { name: 'Категории' });
}

/** The rows' names, top to bottom (a field out of edit mode, text in it, the Unnamed row's text). */
async function names() {
  return within(await categoryList())
    .getAllByRole('listitem')
    .map((row) => row.querySelector('input')?.value ?? row.textContent);
}

async function showing(expected: string[]) {
  await waitFor(async () => {
    expect(await names()).toEqual(expected);
  });
}

async function startEditing(user: ReturnType<typeof userEvent.setup>) {
  await categoryList();
  await user.click(screen.getByRole('button', { name: 'Изменить' }));
}

/** The open Items' texts in the List screen's section named `name`, top to bottom. */
async function itemTexts(name: string) {
  const rows = within(await screen.findByRole('region', { name })).queryAllByRole('listitem');
  return rows.map((row) => within(row).queryByRole('textbox')?.getAttribute('value') ?? '');
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
});

describe('The «Категории» row in «Настройки списка»', () => {
  it('opens the «Категории» screen of a Shopping list', async () => {
    syncServer.seed('list', [groceries]);
    const user = userEvent.setup();

    const app = renderApp(`/lists/${groceries.id}/settings`);
    await user.click(await screen.findByRole('link', { name: 'Категории' }));

    expect(app.location()).toBe(categoriesPath);
    expect(await screen.findByRole('heading', { level: 1, name: 'Категории' })).toBeInTheDocument();
  });

  it.each(['TODO', 'WISH'] as const)('is not on a %s List', async (kind) => {
    const chores = list(4, 'Дела', kind);
    syncServer.seed('list', [chores]);

    renderApp(`/lists/${chores.id}/settings`);

    await screen.findByRole('textbox', { name: 'Название' });
    expect(screen.queryByRole('link', { name: 'Категории' })).not.toBeInTheDocument();
  });
});

describe('The «Категории» screen', () => {
  it('shows the Categories and «Без категории» in walking order', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [chemicals, food]);

    renderApp(categoriesPath);

    await showing(['Еда', 'Без категории', 'Бытовая химия']);
  });

  it('renames a Category in place, sending only its name', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [food]);
    const user = userEvent.setup();

    renderApp(categoriesPath);
    const name = await screen.findByRole('textbox', { name: 'Категория „Еда“' });
    await user.clear(name);
    await user.type(name, 'Продукты{Enter}');

    await waitFor(() => {
      expect(syncServer.operations('category')).toEqual([
        { table: 'category', id: food.id, op: 'upsert', fields: { name: 'Продукты' } },
      ]);
    });
  });

  it('has no rename and no delete for «Без категории»', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [food]);
    const user = userEvent.setup();

    renderApp(categoriesPath);
    await showing(['Еда', 'Без категории']);
    expect(screen.queryByRole('textbox', { name: /Без категории/ })).not.toBeInTheDocument();
    await startEditing(user);

    expect(screen.getByRole('button', { name: 'Удалить «Еда»' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить «Без категории»' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Переместить «Без категории»' })).toBeInTheDocument();
  });

  it('adds a Category at the end from «Новая категория», offline too', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [food, chemicals]);
    const user = userEvent.setup();

    renderApp(categoriesPath);
    await showing(['Еда', 'Без категории', 'Бытовая химия']);
    syncServer.goOffline();
    await user.type(screen.getByRole('textbox', { name: 'Новая категория' }), 'Для кошки{Enter}');

    await showing(['Еда', 'Без категории', 'Бытовая химия', 'Для кошки']);
    syncServer.goOnline();
    window.dispatchEvent(new Event('online'));
    await waitFor(() => {
      expect(syncServer.operations('category').map((op) => op.fields)).toEqual([
        { listId: groceries.id, name: 'Для кошки', position: 4 },
      ]);
    });
  });
});

describe('Reordering on the «Категории» screen', () => {
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

  it('moves a Category between its new neighbours, sending only its position', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [food, chemicals, pets]);
    const user = userEvent.setup();

    renderApp(categoriesPath);
    await showing(['Еда', 'Без категории', 'Бытовая химия', 'Для кошки']);
    await startEditing(user);
    screen.getByRole('button', { name: 'Переместить «Для кошки»' }).focus();
    await user.keyboard('[Space][ArrowUp][ArrowUp][Space]');

    await showing(['Еда', 'Для кошки', 'Без категории', 'Бытовая химия']);
    await waitFor(() => {
      expect(syncServer.operations('category')).toEqual([
        { table: 'category', id: pets.id, op: 'upsert', fields: { position: 1.5 } },
      ]);
    });
    expect(syncServer.operations('list')).toEqual([]);
  });

  it('moves «Без категории» by sending only the List’s place for it', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [food, chemicals]);
    const user = userEvent.setup();

    renderApp(categoriesPath);
    await showing(['Еда', 'Без категории', 'Бытовая химия']);
    await startEditing(user);
    screen.getByRole('button', { name: 'Переместить «Без категории»' }).focus();
    await user.keyboard('[Space][ArrowUp][Space]');

    await showing(['Без категории', 'Еда', 'Бытовая химия']);
    await waitFor(() => {
      expect(syncServer.operations('list')).toEqual([
        {
          table: 'list',
          id: groceries.id,
          op: 'upsert',
          fields: { unnamedCategoryPosition: 0 },
        },
      ]);
    });
    expect(syncServer.operations('category')).toEqual([]);
  });
});

describe('Deleting a Category', () => {
  it('asks first, saying how many Items stay in the list without a Category', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [food]);
    syncServer.seed('item', [
      item(1, 'Молоко', food.id),
      item(2, 'Сыр', food.id),
      item(3, 'Хлеб', food.id, true),
      item(4, 'Мыло', null),
    ]);
    const user = userEvent.setup();

    renderApp(categoriesPath);
    await showing(['Еда', 'Без категории']);
    await startEditing(user);
    await user.click(screen.getByRole('button', { name: 'Удалить «Еда»' }));

    const sheet = screen.getByRole('dialog', { name: 'Удалить „Еда“?' });
    expect(
      within(sheet).getByText('3 товара останутся в списке без категории'),
    ).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Отменить' })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    await showing(['Без категории']);
    await waitFor(() => {
      expect(syncServer.operations('category')).toEqual([
        { table: 'category', id: food.id, op: 'delete' },
      ]);
    });
  });

  it.each([
    [1, '1 товар останется в списке без категории'],
    [5, '5 товаров останутся в списке без категории'],
  ])('says so for %i Item(s)', async (count, message) => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [food]);
    syncServer.seed(
      'item',
      Array.from({ length: count }, (_, n) => item(n + 1, `Товар ${String(n)}`, food.id)),
    );
    const user = userEvent.setup();

    renderApp(categoriesPath);
    await showing(['Еда', 'Без категории']);
    await user.pointer({
      keys: '[MouseRight]',
      target: await screen.findByRole('textbox', { name: 'Категория „Еда“' }),
    });
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));

    const sheet = await screen.findByRole('dialog', { name: 'Удалить „Еда“?' });
    expect(within(sheet).getByText(message)).toBeInTheDocument();
  });

  it('asks without a message when the Category is empty', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [food]);
    syncServer.seed('item', [item(1, 'Мыло', null)]);
    const user = userEvent.setup();

    renderApp(categoriesPath);
    await showing(['Еда', 'Без категории']);
    await startEditing(user);
    await user.click(screen.getByRole('button', { name: 'Удалить «Еда»' }));

    const sheet = screen.getByRole('dialog', { name: 'Удалить „Еда“?' });
    expect(within(sheet).queryByText(/без категории/)).not.toBeInTheDocument();
  });

  it('leaves its Items on the List screen, in the Unnamed category', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [food, chemicals]);
    syncServer.seed('item', [item(1, 'Молоко', food.id), item(2, 'Хлеб', null)]);
    const user = userEvent.setup();

    renderApp(categoriesPath);
    await showing(['Еда', 'Без категории', 'Бытовая химия']);
    await startEditing(user);
    await user.click(screen.getByRole('button', { name: 'Удалить «Еда»' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Удалить „Еда“?' })).getByRole('button', {
        name: 'Удалить',
      }),
    );
    await showing(['Без категории', 'Бытовая химия']);
    await user.click(screen.getByRole('link', { name: 'Настройки списка' }));
    await user.click(await screen.findByRole('link', { name: 'Супермаркет' }));

    await waitFor(async () => {
      expect(await itemTexts('Без категории')).toEqual(['Молоко', 'Хлеб']);
    });
    expect(screen.queryByRole('region', { name: 'Еда' })).not.toBeInTheDocument();
  });

  it('shows «Без категории» on the chip of an Item still naming the deleted Category', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [food, chemicals]);
    syncServer.seed('item', [item(1, 'Молоко', food.id)]);
    const user = userEvent.setup();

    renderApp(categoriesPath);
    await showing(['Еда', 'Без категории', 'Бытовая химия']);
    syncServer.goOffline();
    await startEditing(user);
    await user.click(screen.getByRole('button', { name: 'Удалить «Еда»' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Удалить „Еда“?' })).getByRole('button', {
        name: 'Удалить',
      }),
    );
    await showing(['Без категории', 'Бытовая химия']);
    await user.click(screen.getByRole('link', { name: 'Настройки списка' }));
    await user.click(await screen.findByRole('link', { name: 'Супермаркет' }));
    await user.click(await screen.findByRole('textbox', { name: 'Товар «Молоко»' }));

    expect(screen.getByRole('button', { name: 'Категория: Без категории' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Категория: Без категории' }));
    const choices = within(await screen.findByRole('menu')).getAllByRole('menuitemradio');
    expect(choices.map((choice) => choice.textContent)).toEqual(['Без категории', 'Бытовая химия']);
    expect(screen.getByRole('menuitemradio', { name: 'Без категории' })).toBeChecked();
  });

  it('shows an Item moved to the Unnamed category by the other device’s delete there after a pull', async () => {
    syncServer.seed('list', [groceries]);
    syncServer.seed('category', [food, chemicals]);
    syncServer.seed('item', [item(1, 'Молоко', food.id), item(2, 'Хлеб', null)]);

    renderApp(`/lists/${groceries.id}`);
    await waitFor(async () => {
      expect(await itemTexts('Еда')).toEqual(['Молоко']);
    });

    syncServer.change('category', food.id, 'deleted');
    syncServer.change('item', item(1, '', null).id, { categoryId: null });
    window.dispatchEvent(new Event('online'));

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Еда' })).not.toBeInTheDocument();
    });
    expect(await itemTexts('Без категории')).toEqual(['Молоко', 'Хлеб']);
  });
});

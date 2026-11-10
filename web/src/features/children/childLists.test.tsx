import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { localStore } from '@/shared/sync/localStore';
import {
  anna,
  boris,
  invitesHandler,
  masha,
  membersHandler,
  petya,
  sessionHandler,
} from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// Child lists (spec #81, ticket #90): Todo lists and Wish lists created on a Child page, always
// Shared, tied to that Child, absent from Home's «Списки», and deleted with the Child.

/** A Child list row as the pull sends it. */
function childList(n: number, name: string, kind: 'TODO' | 'WISH', child = masha, owner = anna) {
  return {
    id: `c41d1157-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    name,
    kind,
    visibility: 'SHARED',
    childId: child.id as string | null,
    ownerId: owner.id,
    createdAt: '2026-11-01T10:00:00Z',
  };
}

const school = childList(1, 'Школа', 'TODO');
const wishes = childList(2, 'Желания', 'WISH');
/** An ordinary List, tied to no Child. */
const chores = { ...childList(3, 'Дела по дому', 'TODO'), childId: null };

/** An Item row as the pull sends it. */
function item(n: number, text: string, listId: string, done = false) {
  return {
    id: `17e40000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    listId,
    text,
    description: null,
    done,
    doneById: done ? anna.id : null,
    doneAt: done ? '2026-11-02T09:00:00Z' : null,
    creatorId: anna.id,
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

/** The text of each List row of «Списки», top to bottom. */
async function listRows() {
  return within(await listsSection())
    .queryAllByRole('link')
    .map((row) => row.textContent);
}

/** The Child page of Маша is open, after the first sync. */
async function mashasPage() {
  const app = renderApp(`/children/${masha.id}`);
  await screen.findByRole('heading', { level: 1, name: 'Маша' });
  return app;
}

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  const section = await listsSection();
  await user.click(await within(section).findByRole('button', { name: 'Добавить список' }));
  return screen.getByRole('dialog', { name: 'Новый список' });
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
  syncServer.seed('child', [masha, petya]);
});

describe('«Списки» on the Child page', () => {
  it('starts without lists on a new Child’s page, offering to add one', async () => {
    syncServer.seed('list', [chores, childList(4, 'Желания Пети', 'WISH', petya)]);

    await mashasPage();

    const section = await listsSection();
    expect(await within(section).findByText('Списков пока нет')).toBeInTheDocument();
    expect(await listRows()).toEqual([]);
    expect(within(section).getByRole('button', { name: 'Добавить список' })).toBeInTheDocument();
  });

  it('has a row per Child list of this Child: its kind and its count of open Items', async () => {
    syncServer.seed('list', [school, wishes, chores, childList(4, 'Желания Пети', 'WISH', petya)]);
    syncServer.seed('item', [
      item(1, 'Уроки', school.id),
      item(2, 'Форма', school.id),
      item(3, 'Дневник', school.id, true),
      item(4, 'Посуда', chores.id),
    ]);

    await mashasPage();

    await waitFor(async () => {
      expect(await listRows()).toEqual(['ЖеланияЖелания0', 'ШколаTODO-список2']);
    });
  });
});

describe('«Списки» on Home', () => {
  it('leaves out the Lists of a Child', async () => {
    syncServer.seed('list', [school, wishes, chores]);

    renderApp('/');

    await waitFor(async () => {
      expect(await listRows()).toEqual(['Дела по домуTODO-список0']);
    });
  });
});

describe('«Новый список» on the Child page', () => {
  it('asks Название and Вид (TODO / Желания only), no Visibility, and creates a Shared Child list', async () => {
    const user = userEvent.setup();

    await mashasPage();
    const sheet = await openSheet(user);
    expect(
      within(within(sheet).getByRole('radiogroup', { name: 'Вид' }))
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('value')),
    ).toEqual(['TODO', 'WISH']);
    expect(within(sheet).queryByRole('radiogroup', { name: 'Видимость' })).not.toBeInTheDocument();
    await user.type(within(sheet).getByRole('textbox', { name: 'Название' }), ' Школа ');
    await user.click(within(sheet).getByRole('radio', { name: 'TODO' }));
    expect(within(sheet).queryByRole('radiogroup', { name: 'Видимость' })).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await waitFor(async () => {
      expect(await listRows()).toEqual(['ШколаTODO-список0']);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.operations('list').map((op) => op.fields)).toEqual([
        { name: 'Школа', kind: 'TODO', visibility: 'SHARED', childId: masha.id },
      ]);
    });
  });

  it('keeps a Child list created with no connection through a restart and sends it on reconnect', async () => {
    const user = userEvent.setup();

    const first = await mashasPage();
    await within(await listsSection()).findByText('Списков пока нет');
    syncServer.goOffline();
    const sheet = await openSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: 'Название' }), 'Желания');
    await user.click(within(sheet).getByRole('radio', { name: 'Желания' }));
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
    await waitFor(async () => {
      expect(await listRows()).toEqual(['ЖеланияЖелания0']);
    });
    first.unmount();

    renderApp(`/children/${masha.id}`, { offline: true });

    await waitFor(async () => {
      expect(await listRows()).toEqual(['ЖеланияЖелания0']);
    });
    expect(syncServer.pushes).toEqual([]);

    reconnect();

    await waitFor(() => {
      expect(syncServer.operations('list')).toHaveLength(1);
    });
    const id = syncServer.operations('list')[0]?.id ?? '';
    expect(syncServer.row('list', id)).toEqual({
      id,
      name: 'Желания',
      kind: 'WISH',
      visibility: 'SHARED',
      childId: masha.id,
    });
  });
});

describe('A Child list', () => {
  it('opens the usual List screen from the Child page, which leads back to the Child page', async () => {
    syncServer.seed('list', [school]);
    syncServer.seed('item', [item(1, 'Уроки', school.id)]);
    const user = userEvent.setup();

    const app = await mashasPage();
    await user.click(await within(await listsSection()).findByRole('link', { name: /Школа/ }));

    expect(app.location()).toBe(`/lists/${school.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Школа' })).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Задача «Уроки»' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Новая задача' })).toBeInTheDocument();
    const banner = screen.getByRole('banner');
    expect(within(banner).queryByRole('link', { name: 'Семья' })).not.toBeInTheDocument();
    await user.click(within(banner).getByRole('link', { name: 'Маша' }));

    expect(app.location()).toBe(`/children/${masha.id}`);
  });

  it('has no Visibility in its settings, and either Member renames it', async () => {
    syncServer.seed('list', [{ ...school, ownerId: boris.id }]);
    const user = userEvent.setup();

    renderApp(`/lists/${school.id}/settings`);
    const name = await screen.findByRole('textbox', { name: 'Название' });
    expect(screen.queryByRole('radiogroup', { name: 'Видимость' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить список' })).not.toBeInTheDocument();
    await user.clear(name);
    await user.type(name, 'Уроки{Enter}');

    await waitFor(() => {
      expect(syncServer.operations('list')).toEqual([
        { table: 'list', id: school.id, op: 'upsert', fields: { name: 'Уроки' } },
      ]);
    });
  });

  it('shows its Owner no Visibility either, and goes to the Child page once deleted', async () => {
    syncServer.seed('list', [school, wishes]);
    const user = userEvent.setup();

    const app = renderApp(`/lists/${school.id}/settings`);
    const remove = await screen.findByRole('button', { name: 'Удалить список' });
    // Asked before the sheet opens: an open sheet hides the screen behind it from queries.
    expect(screen.queryByRole('radiogroup', { name: 'Видимость' })).not.toBeInTheDocument();
    await user.click(remove);
    const sheet = screen.getByRole('dialog', { name: 'Удалить „Школа“ со всем содержимым?' });
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(app.location()).toBe(`/children/${masha.id}`);
    });
    await waitFor(async () => {
      expect(await listRows()).toEqual(['ЖеланияЖелания0']);
    });
    await waitFor(() => {
      expect(syncServer.operations('list')).toEqual([
        { table: 'list', id: school.id, op: 'delete' },
      ]);
    });
  });
});

describe('Deleting a Child in Settings', () => {
  const QUESTION = 'Удалить „Маша“?';
  const WARNING = 'Списки и профиль ребёнка тоже будут удалены.';

  beforeEach(() => {
    server.use(membersHandler([anna, boris]), invitesHandler([]));
  });

  it('warns on the Child’s screen that the lists and the profile go too, then deletes them', async () => {
    syncServer.seed('list', [school, { ...wishes, ownerId: boris.id }, chores]);
    syncServer.seed('item', [item(1, 'Уроки', school.id), item(4, 'Посуда', chores.id)]);
    const user = userEvent.setup();

    const app = renderApp(`/settings/children/${masha.id}`);
    await user.click(await screen.findByRole('button', { name: 'Удалить ребёнка' }));
    const sheet = screen.getByRole('dialog', { name: QUESTION });
    expect(sheet).toHaveAccessibleDescription(WARNING);
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(app.location()).toBe('/settings');
    });
    // The server deletes the Child lists and their Items with the Child, whoever owns them.
    await waitFor(() => {
      expect(syncServer.row('child', masha.id)).toBeUndefined();
    });
    expect(syncServer.row('list', school.id)).toBeUndefined();
    expect(syncServer.row('list', wishes.id)).toBeUndefined();
    expect(syncServer.row('item', item(1, 'Уроки', school.id).id)).toBeUndefined();
    expect(syncServer.row('list', chores.id)).toBeDefined();
    expect(syncServer.row('item', item(4, 'Посуда', chores.id).id)).toBeDefined();
    expect(syncServer.operations('list')).toEqual([]);
  });

  it('warns the same way in the «Дети» list', async () => {
    const user = userEvent.setup();

    renderApp('/settings');
    const section = await screen.findByRole('region', { name: 'Дети' });
    await within(section).findByText('Маша');
    await user.click(within(section).getByRole('button', { name: 'Изменить' }));
    await user.click(within(section).getByRole('button', { name: 'Удалить «Маша»' }));

    expect(screen.getByRole('dialog', { name: QUESTION })).toHaveAccessibleDescription(WARNING);
  });

  it('takes a Child list off the device when the other Member deletes the Child', async () => {
    syncServer.seed('list', [school]);
    renderApp(`/lists/${school.id}`);
    await screen.findByRole('heading', { level: 1, name: 'Школа' });

    syncServer.change('child', masha.id, 'deleted');
    window.dispatchEvent(new Event('online'));

    expect(
      await screen.findByText('Такого списка нет: возможно, его удалили.'),
    ).toBeInTheDocument();
  });
});

describe('The store upgrade that adds Child lists', () => {
  it('sends a List still waiting in the store of the app version before Child lists', async () => {
    // The store as the app before Child lists created it (schema version 5), with a List added
    // offline and not sent yet.
    localStore.close();
    await Dexie.delete(localStore.name);
    const older = new Dexie(localStore.name);
    older.version(1).stores({ member: 'id', child: 'id', outbox: '++seq', meta: 'key' });
    older.version(2).stores({ child_field: 'id', list: 'id' });
    older.version(3).stores({ item: 'id, listId' });
    older.version(4).stores({ category: 'id, listId' });
    older.version(5).stores({ item_history: 'id, listId' });
    const { id, name, kind, visibility } = chores;
    await older.table('list').put({ id, name, kind, visibility });
    await older
      .table('outbox')
      .add({ table: 'list', id, op: 'upsert', fields: { name, kind, visibility }, creates: true });
    older.close();
    await localStore.open();

    renderApp('/');

    await waitFor(async () => {
      expect(await listRows()).toEqual(['Дела по домуTODO-список0']);
    });
    await waitFor(() => {
      expect(syncServer.row('list', id)).toEqual({ id, name, kind, visibility });
    });
  });
});

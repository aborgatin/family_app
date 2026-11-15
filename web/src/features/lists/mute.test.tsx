import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { anna, sessionHandler } from '@/test/fixtures';
import { upgradeStoreFrom } from '@/test/olderStore';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// Mute (spec #104, ticket #111): «Без уведомлений» in «Настройки списка» on a Shared list stops
// Notifications about Items added there for this Member. It is a synced row of its own, written
// through the Outbox like any other setting, so it works offline.

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
const chores = list(2, 'Дом', 'TODO');

/** A Mute row as the pull sends it (only the Member's own ever arrive). */
function mute(n: number, listId: string) {
  return { id: `30e70000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`, listId };
}

async function openSettings(listId: string) {
  renderApp(`/lists/${listId}/settings`);
  await screen.findByRole('heading', { level: 1, name: 'Настройки списка' });
}

function muteSwitch() {
  return screen.findByRole('switch', { name: 'Без уведомлений' });
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
});

describe('«Без уведомлений» in «Настройки списка»', () => {
  it.each([
    ['a Shopping list', groceries, 'товарах'],
    ['a Todo list', chores, 'задачах'],
    ['a Wish list', list(3, 'Подарки', 'WISH'), 'желаниях'],
  ])('is off on %s, with a footer naming its Items', async (_, shown, noun) => {
    syncServer.seed('list', [shown]);

    await openSettings(shown.id);

    expect(await muteSwitch()).not.toBeChecked();
    expect(
      screen.getByText(
        `Не присылать уведомления о новых ${noun} в этом списке. Напоминания и назначенные вам задачи придут.`,
      ),
    ).toBeInTheDocument();
  });

  it('Mutes the List under an id made on the client, and unmutes it again', async () => {
    syncServer.seed('list', [chores]);
    const user = userEvent.setup();

    await openSettings(chores.id);
    await user.click(await muteSwitch());

    await waitFor(async () => {
      expect(await muteSwitch()).toBeChecked();
    });
    await waitFor(() => {
      expect(syncServer.operations('mute')).toHaveLength(1);
    });
    const [created] = syncServer.operations('mute');
    expect(created).toMatchObject({ table: 'mute', op: 'upsert', fields: { listId: chores.id } });
    expect(created?.id).toMatch(UUID);
    const muteId = created?.id;

    await user.click(await muteSwitch());

    await waitFor(async () => {
      expect(await muteSwitch()).not.toBeChecked();
    });
    await waitFor(() => {
      expect(syncServer.operations('mute')).toHaveLength(2);
    });
    expect(syncServer.operations('mute')[1]).toEqual({ table: 'mute', id: muteId, op: 'delete' });
  });

  it('is on for a List the pull brings a Mute of, and unmuting deletes every Mute of it', async () => {
    // Muted on two devices while offline: two rows for the same List.
    syncServer.seed('list', [chores, groceries]);
    syncServer.seed('mute', [mute(1, chores.id), mute(2, chores.id), mute(3, groceries.id)]);
    const user = userEvent.setup();

    await openSettings(chores.id);
    await waitFor(async () => {
      expect(await muteSwitch()).toBeChecked();
    });
    await user.click(await muteSwitch());

    await waitFor(async () => {
      expect(await muteSwitch()).not.toBeChecked();
    });
    await waitFor(() => {
      expect(syncServer.operations('mute')).toEqual([
        { table: 'mute', id: mute(1, chores.id).id, op: 'delete' },
        { table: 'mute', id: mute(2, chores.id).id, op: 'delete' },
      ]);
    });
  });

  it('works offline at once and is sent when the server is back', async () => {
    syncServer.seed('list', [chores]);
    const user = userEvent.setup();

    await openSettings(chores.id);
    await muteSwitch();
    syncServer.goOffline();
    await user.click(await muteSwitch());

    await waitFor(async () => {
      expect(await muteSwitch()).toBeChecked();
    });
    expect(syncServer.operations('mute')).toEqual([]);

    syncServer.goOnline();
    window.dispatchEvent(new Event('online'));
    await waitFor(() => {
      expect(syncServer.operations('mute')).toHaveLength(1);
    });
    expect(await muteSwitch()).toBeChecked();
  });

  it('is shown on a Child list, which is always Shared', async () => {
    const school = { ...list(4, 'Школа', 'TODO'), childId: 'c41d0000-0000-4000-8000-000000000001' };
    syncServer.seed('child', [
      { id: school.childId, name: 'Маша', color: 'coral', birthDate: null },
    ]);
    syncServer.seed('list', [school]);

    await openSettings(school.id);

    expect(await muteSwitch()).not.toBeChecked();
  });

  it('is absent on a Private list', async () => {
    const mine = list(5, 'Моё', 'TODO', 'PRIVATE');
    syncServer.seed('list', [mine]);

    await openSettings(mine.id);

    expect(await screen.findByRole('textbox', { name: 'Название' })).toHaveValue('Моё');
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText(/Не присылать уведомления/)).not.toBeInTheDocument();
  });

  it('says why when the server rejects Muting a List made Private meanwhile', async () => {
    syncServer.seed('list', [chores]);
    syncServer.rejectWhen((op) => op.table === 'mute' && { code: 'mute.private_list' });
    const user = userEvent.setup();

    await openSettings(chores.id);
    await user.click(await muteSwitch());

    expect(
      await screen.findByText('Не удалось сохранить: в личном списке уведомлений нет'),
    ).toBeInTheDocument();
    await waitFor(async () => {
      expect(await muteSwitch()).not.toBeChecked();
    });
  });
});

describe('A Muted List that leaves the phone', () => {
  it('takes its Mute with it: shared again, it is not Muted', async () => {
    syncServer.seed('list', [chores]);
    syncServer.seed('mute', [mute(1, chores.id)]);

    await openSettings(chores.id);
    await waitFor(async () => {
      expect(await muteSwitch()).toBeChecked();
    });

    // Its Owner makes it Private: the pull brings the List's tombstone.
    syncServer.change('list', chores.id, 'deleted');
    window.dispatchEvent(new Event('online'));
    await screen.findByText('Такого списка нет: возможно, его удалили.');

    syncServer.change('list', chores.id, {});
    window.dispatchEvent(new Event('online'));

    expect(await muteSwitch()).not.toBeChecked();
  });
});

describe('The store upgrade that adds Mutes', () => {
  it('sends a change still waiting in the store of the app version before them', async () => {
    // The store as the app before Mutes created it (schema version 7), with a List renamed
    // offline and not sent yet.
    await upgradeStoreFrom(7, async (older) => {
      await older.table('list').put({ ...chores, name: 'Дача' });
      await older
        .table('outbox')
        .add({ table: 'list', id: chores.id, op: 'upsert', fields: { name: 'Дача' } });
    });
    syncServer.seed('list', [chores]);
    const user = userEvent.setup();

    await openSettings(chores.id);

    await waitFor(() => {
      expect(syncServer.row('list', chores.id)).toMatchObject({ name: 'Дача' });
    });
    // The upgraded store has the new table: the List can be Muted.
    await user.click(await muteSwitch());
    await waitFor(() => {
      expect(syncServer.operations('mute')).toHaveLength(1);
    });
    expect(within(document.body).getByRole('switch', { name: 'Без уведомлений' })).toBeChecked();
  });
});

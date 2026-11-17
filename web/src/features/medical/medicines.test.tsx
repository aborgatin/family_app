import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  anna,
  boris,
  fixtureId,
  invitesHandler,
  membersHandler,
  sessionHandler,
} from '@/test/fixtures';
import { medicineRow } from '@/test/medical';
import { upgradeStoreFrom } from '@/test/olderStore';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// Medicines in Settings (spec #128, ticket #130): the Family's list «Лекарства», built like Child
// fields. A name is unique ignoring case; a deleted Medicine leaves the list.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
  server.use(membersHandler([anna, boris]));
  server.use(invitesHandler([]));
});
afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

async function section() {
  return screen.findByRole('region', { name: 'Лекарства' });
}

/** The names in the list, top to bottom. */
async function names() {
  const list = await within(await section()).findByRole('list', { name: 'Лекарства' });
  return within(list)
    .getAllByRole('listitem')
    .map((row) => row.querySelector('input')?.value ?? row.textContent);
}

async function showing(expected: string[]) {
  await waitFor(async () => {
    expect(await names()).toEqual(expected);
  });
}

async function openNewSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await within(await section()).findByRole('button', { name: 'Добавить лекарство' }),
  );
  return screen.findByRole('dialog', { name: 'Новое лекарство' });
}

describe('«Лекарства» in Settings', () => {
  it('lists the Medicines by name, leaving out deleted ones', async () => {
    syncServer.seed('medicine', [
      medicineRow('Парацетамол 120 мг/5 мл'),
      medicineRow('Нурофен', true),
      medicineRow('Ибупрофен 20 мг/мл'),
    ]);

    renderApp('/settings');

    await showing(['Ибупрофен 20 мг/мл', 'Парацетамол 120 мг/5 мл']);
  });

  it('says so when there are none, still offering to add one', async () => {
    renderApp('/settings');

    const medicines = await section();
    expect(await within(medicines).findByText('Лекарств пока нет')).toBeInTheDocument();
    expect(
      within(medicines).getByRole('button', { name: 'Добавить лекарство' }),
    ).toBeInTheDocument();
  });
});

describe('The «Новое лекарство» sheet', () => {
  it('adds a Medicine with an id made on the device, its name trimmed', async () => {
    const user = userEvent.setup();
    renderApp('/settings');

    const sheet = await openNewSheet(user);
    const name = within(sheet).getByRole('textbox', { name: 'Название' });
    expect(name).toHaveAttribute('placeholder', 'Ибупрофен 20 мг/мл');
    await user.type(name, '  Ибупрофен 20 мг/мл ');
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await showing(['Ибупрофен 20 мг/мл']);
    await waitFor(() => {
      expect(syncServer.operations('medicine')).toHaveLength(1);
    });
    const [added] = syncServer.operations('medicine');
    expect(added?.id).toMatch(UUID);
    expect(added?.fields).toEqual({ name: 'Ибупрофен 20 мг/мл' });
  });

  it('refuses a name the list already has, in any letter case', async () => {
    syncServer.seed('medicine', [medicineRow('Ибупрофен'), medicineRow('Нурофен', true)]);
    const user = userEvent.setup();
    renderApp('/settings');
    await showing(['Ибупрофен']);

    const sheet = await openNewSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: 'Название' }), 'ибупрофен');
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(await within(sheet).findByText('Такое лекарство уже есть')).toBeInTheDocument();
    expect(syncServer.operations('medicine')).toHaveLength(0);

    // A deleted one's name is free.
    await user.clear(within(sheet).getByRole('textbox', { name: 'Название' }));
    await user.type(within(sheet).getByRole('textbox', { name: 'Название' }), 'нурофен');
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
    await showing(['Ибупрофен', 'нурофен']);
  });

  it('asks for a name without sending anything', async () => {
    const user = userEvent.setup();
    renderApp('/settings');

    const sheet = await openNewSheet(user);
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(await within(sheet).findByText('Заполните это поле')).toBeInTheDocument();
    expect(syncServer.operations('medicine')).toHaveLength(0);
  });
});

describe('Renaming and deleting a Medicine', () => {
  it('renames in place, sending only the name', async () => {
    const ibuprofen = medicineRow('Ибупрофен');
    syncServer.seed('medicine', [ibuprofen]);
    const user = userEvent.setup();
    renderApp('/settings');

    const field = await within(await section()).findByRole('textbox', {
      name: 'Название лекарства «Ибупрофен»',
    });
    await user.clear(field);
    await user.type(field, 'Ибупрофен 20 мг/мл{Enter}');

    await waitFor(() => {
      expect(syncServer.operations('medicine')).toHaveLength(1);
    });
    expect(syncServer.operations('medicine')[0]).toMatchObject({
      id: ibuprofen.id,
      fields: { name: 'Ибупрофен 20 мг/мл' },
    });
  });

  it('refuses to rename to another Medicine’s name', async () => {
    syncServer.seed('medicine', [medicineRow('Ибупрофен'), medicineRow('Парацетамол')]);
    const user = userEvent.setup();
    renderApp('/settings');

    const field = await within(await section()).findByRole('textbox', {
      name: 'Название лекарства «Парацетамол»',
    });
    await user.clear(field);
    await user.type(field, 'ИБУПРОФЕН{Enter}');

    expect(
      await within(await section()).findByText('Такое лекарство уже есть'),
    ).toBeInTheDocument();
    expect(syncServer.operations('medicine')).toHaveLength(0);
  });

  it('says why when the server refuses a rename to a name the other Member added meanwhile', async () => {
    syncServer.seed('medicine', [medicineRow('Ибупрофен')]);
    syncServer.rejectWhen((operation) =>
      operation.table === 'medicine' ? { code: 'medicine.duplicate' } : false,
    );
    const user = userEvent.setup();
    renderApp('/settings');

    const field = await within(await section()).findByRole('textbox', {
      name: 'Название лекарства «Ибупрофен»',
    });
    await user.clear(field);
    await user.type(field, 'Нурофен{Enter}');

    expect(
      await screen.findByText('Не удалось сохранить: такое лекарство уже есть'),
    ).toBeInTheDocument();
  });

  it('deletes after the confirmation: it leaves the list', async () => {
    const ibuprofen = medicineRow('Ибупрофен');
    syncServer.seed('medicine', [ibuprofen, medicineRow('Парацетамол')]);
    const user = userEvent.setup();
    renderApp('/settings');
    const medicines = await section();
    await showing(['Ибупрофен', 'Парацетамол']);

    await user.click(within(medicines).getByRole('button', { name: 'Изменить' }));
    await user.click(within(medicines).getByRole('button', { name: 'Удалить «Ибупрофен»' }));
    const confirm = screen.getByRole('dialog', { name: 'Удалить лекарство „Ибупрофен“?' });
    await user.click(within(confirm).getByRole('button', { name: 'Удалить' }));

    await showing(['Парацетамол']);
    await waitFor(() => {
      expect(syncServer.operations('medicine')).toEqual([
        { table: 'medicine', id: ibuprofen.id, op: 'delete' },
      ]);
    });
    // The server keeps it, deleted, with its name.
    await showing(['Парацетамол']);
  });
});

describe('The store upgrade that adds Medicines', () => {
  it('sends a change still waiting in the store of the app version before them', async () => {
    // The store as the app before Medical cards created it (schema version 8), with an operation
    // waiting in its Outbox.
    const cold = {
      id: fixtureId('3ed1ffff', 1),
      memberId: anna.id,
      kind: 'ILLNESS',
      name: 'ОРВИ',
    };
    await upgradeStoreFrom(8, async (older) => {
      await older.table('outbox').add({
        table: 'illness',
        id: cold.id,
        op: 'upsert',
        fields: { memberId: anna.id, kind: 'ILLNESS', name: 'ОРВИ' },
        creates: true,
      });
    });
    const user = userEvent.setup();

    renderApp('/settings');

    await waitFor(() => {
      expect(syncServer.row('illness', cold.id)).toMatchObject({ name: 'ОРВИ' });
    });
    // The upgraded store has the new table: a Medicine can be added.
    const sheet = await openNewSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: 'Название' }), 'Ибупрофен');
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
    await waitFor(() => {
      expect(syncServer.operations('medicine')).toHaveLength(1);
    });
  });
});

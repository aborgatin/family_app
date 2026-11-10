import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeEventSource } from '@/test/eventSource';
import {
  anna,
  boris,
  height,
  invitesHandler,
  masha,
  membersHandler,
  petya,
  sessionHandler,
  weight,
} from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';
import { upgradeStoreFrom } from '@/test/olderStore';

// Child field values (spec #81, ticket #91; ADR-0007): «Профиль» on the Child page shows every
// Child field with this Child's value, edited in place and auto-saved. Each save appends an entry
// to the value's timeline; the profile shows the latest one.

/** A text Child field after the Defaults «Вес» and «Рост». */
const shoeSize = {
  id: '7a2d3d2f-0000-4000-8000-000000000003',
  name: 'Размер обуви',
  valueType: 'TEXT',
  position: 3,
};

/** A date Child field, the last one. */
const lastVisit = {
  id: '7a2d3d2f-0000-4000-8000-000000000004',
  name: 'Последний визит к врачу',
  valueType: 'DATE',
  position: 4,
};

/** An entry of a value's timeline as the sync pull returns its fields. */
function entry(n: number, child: { id: string }, field: { id: string }, value: string) {
  return {
    id: `9b4e5f60-0000-4000-8000-${String(n).padStart(12, '0')}`,
    childId: child.id,
    childFieldId: field.id,
    value,
    recordedAt: `2026-11-0${String(n)}T10:00:00Z`,
  };
}

/** Маша's Child page is open, after the first sync. */
async function mashasPage() {
  const app = renderApp(`/children/${masha.id}`);
  await screen.findByRole('heading', { level: 1, name: 'Маша' });
  return app;
}

async function profile() {
  return screen.findByRole('region', { name: 'Профиль' });
}

/** The entries the app pushed, in order, without their ids. */
function pushedEntries() {
  return syncServer.operations('child_field_value').map(({ op, fields }) => ({ op, fields }));
}

/** The server announces its latest Version, as after a commit by the other Member. */
async function announce() {
  await waitFor(() => {
    expect(FakeEventSource.instances).not.toHaveLength(0);
  });
  const sse = FakeEventSource.latest();
  sse.open();
  sse.emit('changed', JSON.stringify({ version: syncServer.latestVersion }));
}

/** The connection is back: the app notices (browser `online` event) and sends what is waiting. */
function reconnect() {
  syncServer.goOnline();
  window.dispatchEvent(new Event('online'));
}

beforeEach(() => {
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
  syncServer.seed('child', [masha, petya]);
});

describe('«Профиль» on the Child page', () => {
  it('lists every Child field in the Settings order with this Child’s latest value', async () => {
    // Seeded out of order: the page orders them by position.
    syncServer.seed('child_field', [lastVisit, height, shoeSize, weight]);
    syncServer.seed('child_field_value', [
      entry(1, masha, shoeSize, '30'),
      entry(2, masha, lastVisit, '2026-10-03'),
      entry(3, petya, shoeSize, '27'),
      entry(4, masha, shoeSize, '31'),
    ]);

    await mashasPage();

    const section = await profile();
    expect(await within(section).findByRole('textbox', { name: 'Размер обуви' })).toHaveValue('31');
    expect(within(section).getByRole('textbox', { name: 'Вес' })).toHaveValue('');
    expect(within(section).getByRole('textbox', { name: 'Рост' })).toHaveValue('');
    expect(within(section).getByLabelText('Последний визит к врачу')).toHaveValue('2026-10-03');
    const labels = within(section)
      .getAllByText(/^(День рождения|Вес|Рост|Размер обуви|Последний визит к врачу)$/)
      .map((label) => label.textContent);
    expect(labels).toEqual([
      'День рождения',
      'Вес',
      'Рост',
      'Размер обуви',
      'Последний визит к врачу',
    ]);
  });

  it('saves a text value typed in place as a new entry of its timeline', async () => {
    syncServer.seed('child_field', [shoeSize]);
    syncServer.seed('child_field_value', [entry(1, masha, shoeSize, '30')]);
    const user = userEvent.setup();
    await mashasPage();

    const field = await within(await profile()).findByRole('textbox', { name: 'Размер обуви' });
    await user.clear(field);
    await user.type(field, '  31 {Enter}');

    await waitFor(() => {
      expect(pushedEntries()).toEqual([
        { op: 'upsert', fields: { childId: masha.id, childFieldId: shoeSize.id, value: '31' } },
      ]);
    });
    expect(field).toHaveValue('31');
    // The earlier entry stays: the timeline only grows.
    expect(syncServer.row('child_field_value', entry(1, masha, shoeSize, '').id)).toMatchObject({
      value: '30',
    });
    expect(screen.queryByText(/Не удалось сохранить/)).not.toBeInTheDocument();
  });

  it('edits a date field with the date picker', async () => {
    syncServer.seed('child_field', [lastVisit]);
    const user = userEvent.setup();
    await mashasPage();

    const field = await within(await profile()).findByLabelText('Последний визит к врачу');
    expect(field).toHaveAttribute('type', 'date');
    await user.type(field, '2026-10-03');
    await user.tab();

    await waitFor(() => {
      expect(pushedEntries()).toEqual([
        {
          op: 'upsert',
          fields: { childId: masha.id, childFieldId: lastVisit.id, value: '2026-10-03' },
        },
      ]);
    });
    expect(field).toHaveValue('2026-10-03');
  });

  it('saves a cleared value as an entry too', async () => {
    syncServer.seed('child_field', [shoeSize, lastVisit]);
    syncServer.seed('child_field_value', [
      entry(1, masha, shoeSize, '31'),
      entry(2, masha, lastVisit, '2026-10-03'),
    ]);
    const user = userEvent.setup();
    await mashasPage();

    const section = await profile();
    const text = await within(section).findByRole('textbox', { name: 'Размер обуви' });
    await user.clear(text);
    await user.tab();
    await user.click(
      within(section).getByRole('button', { name: 'Очистить «Последний визит к врачу»' }),
    );

    await waitFor(() => {
      expect(pushedEntries()).toEqual([
        { op: 'upsert', fields: { childId: masha.id, childFieldId: shoeSize.id, value: '' } },
        { op: 'upsert', fields: { childId: masha.id, childFieldId: lastVisit.id, value: '' } },
      ]);
    });
    expect(text).toHaveValue('');
    expect(within(section).getByLabelText('Последний визит к врачу')).toHaveValue('');
  });

  it('records nothing when a field is left unchanged', async () => {
    syncServer.seed('child_field', [weight, shoeSize]);
    syncServer.seed('child_field_value', [entry(1, masha, shoeSize, '31')]);
    const user = userEvent.setup();
    await mashasPage();

    const section = await profile();
    const filled = await within(section).findByRole('textbox', { name: 'Размер обуви' });
    // Left as it was, retyped the same, and only spaces in a field without a value.
    await user.click(filled);
    await user.tab();
    await user.clear(filled);
    await user.type(filled, ' 31{Enter}');
    await user.type(within(section).getByRole('textbox', { name: 'Вес' }), '   {Enter}');
    // A change that is saved shows the earlier ones were handled, in order, without an entry.
    await user.type(within(section).getByRole('textbox', { name: 'Вес' }), '25 кг{Enter}');

    await waitFor(() => {
      expect(pushedEntries()).toEqual([
        { op: 'upsert', fields: { childId: masha.id, childFieldId: weight.id, value: '25 кг' } },
      ]);
    });
    expect(filled).toHaveValue('31');
  });

  it('refuses a text over 1000 characters without sending it', async () => {
    syncServer.seed('child_field', [shoeSize]);
    const user = userEvent.setup();
    await mashasPage();

    const field = await within(await profile()).findByRole('textbox', { name: 'Размер обуви' });
    await user.click(field);
    await user.paste('я'.repeat(1001));
    await user.tab();

    expect(await screen.findByRole('alert')).toHaveTextContent('Слишком длинно');
    await user.clear(field);
    await user.paste('😀'.repeat(1000));
    await user.tab();

    await waitFor(() => {
      expect(pushedEntries()).toHaveLength(1);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says to add Child fields in Settings when there are none', async () => {
    await mashasPage();

    const section = await profile();
    expect(
      await within(section).findByText('Полей профиля нет. Добавьте их в Настройках.'),
    ).toBeInTheDocument();
    expect(within(section).getByText('День рождения')).toBeInTheDocument();
    expect(within(section).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('has no such hint while there are Child fields', async () => {
    syncServer.seed('child_field', [weight]);
    await mashasPage();

    const section = await profile();
    await within(section).findByRole('textbox', { name: 'Вес' });
    expect(within(section).queryByText(/Полей профиля нет/)).not.toBeInTheDocument();
  });
});

describe('The latest value', () => {
  it('is the entry the server received last, whatever time it carries', async () => {
    syncServer.seed('child_field', [shoeSize]);
    // The second entry reached the server later (a higher Version) but claims an earlier time.
    syncServer.seed('child_field_value', [
      { ...entry(1, masha, shoeSize, '31'), recordedAt: '2026-11-08T10:00:00Z' },
      { ...entry(2, masha, shoeSize, '32'), recordedAt: '2026-11-01T10:00:00Z' },
    ]);

    await mashasPage();

    expect(
      await within(await profile()).findByRole('textbox', { name: 'Размер обуви' }),
    ).toHaveValue('32');
  });

  it('is the last one saved with no connection, shown after a restart and sent on reconnect', async () => {
    syncServer.seed('child_field', [shoeSize]);
    syncServer.seed('child_field_value', [entry(1, masha, shoeSize, '30')]);
    const user = userEvent.setup();
    const first = await mashasPage();
    const field = await within(await profile()).findByRole('textbox', { name: 'Размер обуви' });
    await waitFor(() => {
      expect(field).toHaveValue('30');
    });

    syncServer.goOffline();
    await user.clear(field);
    await user.type(field, '31{Enter}');
    await user.clear(field);
    await user.type(field, '32{Enter}');
    expect(field).toHaveValue('32');
    expect(screen.queryByText(/Не удалось сохранить/)).not.toBeInTheDocument();
    first.unmount();

    renderApp(`/children/${masha.id}`, { offline: true });
    expect(
      await within(await profile()).findByRole('textbox', { name: 'Размер обуви' }),
    ).toHaveValue('32');
    expect(pushedEntries()).toEqual([]);

    reconnect();
    await waitFor(() => {
      expect(pushedEntries().map(({ fields }) => fields?.value)).toEqual(['31', '32']);
    });
    await waitFor(() => {
      expect(syncServer.pulls.length).toBeGreaterThan(1);
    });
    expect(screen.getByRole('textbox', { name: 'Размер обуви' })).toHaveValue('32');
  });

  it('gives way to a value the other Member saved later', async () => {
    syncServer.seed('child_field', [shoeSize, lastVisit]);
    const user = userEvent.setup();
    await mashasPage();
    const field = await within(await profile()).findByRole('textbox', { name: 'Размер обуви' });
    await user.type(field, '31{Enter}');
    await waitFor(() => {
      expect(pushedEntries()).toHaveLength(1);
    });

    syncServer.seed('child_field_value', [
      entry(7, masha, shoeSize, '32'),
      entry(8, masha, lastVisit, '2026-10-03'),
    ]);
    await announce();

    await waitFor(() => {
      expect(field).toHaveValue('32');
    });
    expect(screen.getByLabelText('Последний визит к врачу')).toHaveValue('2026-10-03');
  });
});

describe('Child fields changed on the other Member’s device', () => {
  /** The labels of the Child field rows, top to bottom. */
  async function fieldLabels() {
    return within(await profile())
      .queryAllByText(/^(Вес|Рост|Размер обуви|Обувь)$/)
      .map((label) => label.textContent);
  }

  it('show up live: added, renamed, reordered and deleted, each keeping its value', async () => {
    syncServer.seed('child_field', [weight, height]);
    syncServer.seed('child_field_value', [entry(1, masha, height, '120 см')]);
    await mashasPage();
    await within(await profile()).findByRole('textbox', { name: 'Рост' });

    syncServer.seed('child_field', [shoeSize]);
    await announce();
    await waitFor(async () => {
      expect(await fieldLabels()).toEqual(['Вес', 'Рост', 'Размер обуви']);
    });

    syncServer.change('child_field', shoeSize.id, { name: 'Обувь' });
    await announce();
    await waitFor(async () => {
      expect(await fieldLabels()).toEqual(['Вес', 'Рост', 'Обувь']);
    });

    syncServer.change('child_field', height.id, { position: 0.5 });
    await announce();
    await waitFor(async () => {
      expect(await fieldLabels()).toEqual(['Рост', 'Вес', 'Обувь']);
    });
    expect(screen.getByRole('textbox', { name: 'Рост' })).toHaveValue('120 см');

    syncServer.change('child_field', weight.id, 'deleted');
    await announce();
    await waitFor(async () => {
      expect(await fieldLabels()).toEqual(['Рост', 'Обувь']);
    });

    syncServer.change('child_field', height.id, 'deleted');
    syncServer.change('child_field', shoeSize.id, 'deleted');
    await announce();
    expect(
      await within(await profile()).findByText('Полей профиля нет. Добавьте их в Настройках.'),
    ).toBeInTheDocument();
  });

  it('drops a value saved with no connection for a Child field deleted meanwhile', async () => {
    syncServer.seed('child_field', [weight, shoeSize]);
    const user = userEvent.setup();
    await mashasPage();
    const field = await within(await profile()).findByRole('textbox', { name: 'Размер обуви' });

    syncServer.goOffline();
    await user.type(field, '31{Enter}');
    syncServer.change('child_field', shoeSize.id, 'deleted');
    reconnect();

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'Размер обуви' })).not.toBeInTheDocument();
    });
    const [pushed] = syncServer.operations('child_field_value');
    expect(pushed).toMatchObject({ fields: { value: '31' } });
    expect(syncServer.row('child_field_value', pushed?.id ?? '')).toBeUndefined();
    expect(screen.queryByText(/Не удалось сохранить/)).not.toBeInTheDocument();
  });
});

describe('Deleting in Settings', () => {
  const mashasShoes = entry(1, masha, shoeSize, '31');
  const mashasWeight = entry(2, masha, weight, '25 кг');
  const petyasShoes = entry(3, petya, shoeSize, '27');

  beforeEach(() => {
    server.use(membersHandler([anna, boris]), invitesHandler([]));
    syncServer.seed('child_field', [weight, shoeSize]);
    syncServer.seed('child_field_value', [mashasShoes, mashasWeight, petyasShoes]);
  });

  it('a Child deletes their values, not the other Children’s', async () => {
    const user = userEvent.setup();
    renderApp(`/settings/children/${masha.id}`);

    await user.click(await screen.findByRole('button', { name: 'Удалить ребёнка' }));
    await user.click(
      within(screen.getByRole('dialog', { name: /Удалить „Маша“\?/ })).getByRole('button', {
        name: 'Удалить',
      }),
    );

    await waitFor(() => {
      expect(syncServer.row('child', masha.id)).toBeUndefined();
    });
    expect(syncServer.row('child_field_value', mashasShoes.id)).toBeUndefined();
    expect(syncServer.row('child_field_value', mashasWeight.id)).toBeUndefined();
    expect(syncServer.row('child_field_value', petyasShoes.id)).toMatchObject({ value: '27' });
  });

  it('a Child field deletes its values for every Child, not the other fields’', async () => {
    const user = userEvent.setup();
    renderApp('/settings');
    const fields = await screen.findByRole('region', { name: 'Поля профиля' });
    await within(fields).findByRole('textbox', { name: 'Название поля «Размер обуви»' });

    await user.click(within(fields).getByRole('button', { name: 'Изменить' }));
    await user.click(within(fields).getByRole('button', { name: 'Удалить «Размер обуви»' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Удалить поле „Размер обуви“?' })).getByRole(
        'button',
        { name: 'Удалить' },
      ),
    );

    await waitFor(() => {
      expect(syncServer.row('child_field', shoeSize.id)).toBeUndefined();
    });
    expect(syncServer.row('child_field_value', mashasShoes.id)).toBeUndefined();
    expect(syncServer.row('child_field_value', petyasShoes.id)).toBeUndefined();
    expect(syncServer.row('child_field_value', mashasWeight.id)).toMatchObject({
      value: '25 кг',
    });
  });
});

describe('The store upgrade that adds Child field values', () => {
  it('sends a change still waiting in the store of the app version before them', async () => {
    // The store as the app before Child field values created it (schema version 6), with a Child
    // renamed offline and not sent yet.
    await upgradeStoreFrom(6, async (older) => {
      await older.table('child').put({ ...masha, name: 'Мария' });
      await older
        .table('outbox')
        .add({ table: 'child', id: masha.id, op: 'upsert', fields: { name: 'Мария' } });
    });
    syncServer.seed('child_field', [shoeSize]);

    renderApp(`/children/${masha.id}`);

    await waitFor(() => {
      expect(syncServer.row('child', masha.id)).toMatchObject({ name: 'Мария' });
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Мария' })).toBeInTheDocument();
    // The upgraded store has the new table: a value can be saved.
    const user = userEvent.setup();
    await user.type(
      await within(await profile()).findByRole('textbox', { name: 'Размер обуви' }),
      '31{Enter}',
    );
    await waitFor(() => {
      expect(pushedEntries()).toHaveLength(1);
    });
  });
});

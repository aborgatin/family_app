import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  anna,
  boris,
  childFieldsHandler,
  invitesHandler,
  masha,
  membersHandler,
  petya,
  sessionHandler,
} from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// Children live in the local store and reach the server through the Outbox (spec #3, ticket
// #52): changes show at once, also offline, and are pushed when the server is reachable.

const NOT_SAVED = 'Не удалось сохранить';
const OFFLINE = 'Нет связи с сервером';

/** «Today» in these tests: Маша (12 April 2019) is 7. */
const TODAY = new Date('2026-11-08T12:00:00');

const sonya: typeof masha = {
  id: '0c3e4a52-0000-4000-8000-000000000013',
  name: 'Соня',
  color: 'green',
  birthday: '2025-11-08',
};

async function childrenSection() {
  return screen.findByRole('region', { name: 'Дети' });
}

async function childrenList() {
  return within(await childrenSection()).findByRole('list', { name: 'Дети' });
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
    syncServer.seed('child', [petya, sonya, masha]);

    renderApp('/settings');

    const list = await childrenList();
    await waitFor(() => {
      expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Маша7 лет', 'Соня1 год', 'Петя']);
    expect(within(items[0] as HTMLElement).getByRole('link', { name: /Маша/ })).toHaveAttribute(
      'href',
      `/settings/children/${masha.id}`,
    );
  });

  it('shows months under a year, «меньше месяца» under one, nothing before birth', async () => {
    syncServer.seed('child', [
      { ...sonya, id: `${sonya.id.slice(0, -2)}21`, name: 'Лиза', birthday: '2026-06-09' },
      { ...sonya, id: `${sonya.id.slice(0, -2)}22`, name: 'Оля', birthday: '2025-12-01' },
      { ...sonya, id: `${sonya.id.slice(0, -2)}23`, name: 'Тима', birthday: '2026-12-01' },
      { ...sonya, id: `${sonya.id.slice(0, -2)}24`, name: 'Ваня', birthday: '2026-10-20' },
    ]);

    renderApp('/settings');

    const list = await childrenList();
    await waitFor(() => {
      expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Оля11 месяцев', 'Лиза4 месяца', 'Ваняменьше месяца', 'Тима']);
  });

  it('says when there are no Children yet, still offering to add one', async () => {
    renderApp('/settings');

    const section = await childrenSection();
    expect(await within(section).findByText('Детей пока нет')).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Добавить ребёнка' })).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument();
  });

  it('keeps the Children on the device: after a restart they show without the server', async () => {
    syncServer.seed('child', [masha]);
    const first = renderApp('/settings');
    expect(await within(await childrenList()).findByText('Маша')).toBeInTheDocument();
    first.unmount();

    syncServer.goOffline();
    renderApp('/settings');

    expect(await within(await childrenList()).findByText('Маша')).toBeInTheDocument();
  });

  it('deletes from edit mode after the action sheet, leaving edit mode with the last one', async () => {
    syncServer.seed('child', [masha]);
    const user = userEvent.setup();

    renderApp('/settings');
    const section = await childrenSection();
    await within(section).findByText('Маша');
    await user.click(within(section).getByRole('button', { name: 'Изменить' }));
    expect(within(section).queryByRole('link', { name: /Маша/ })).not.toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Удалить «Маша»' }));
    const sheet = screen.getByRole('dialog', { name: 'Удалить „Маша“?' });
    expect(syncServer.operations('child')).toEqual([]);
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    expect(await within(section).findByText('Детей пока нет')).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Готово' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.row('child', masha.id)).toBeUndefined();
    });
    expect(syncServer.operations('child')).toEqual([
      { table: 'child', id: masha.id, op: 'delete' },
    ]);
    expect(syncServer.pushes[0]?.csrf).toBe('token-from-server');
  });

  it('deletes with right-click → «Удалить», after the action sheet', async () => {
    syncServer.seed('child', [masha, petya]);
    const user = userEvent.setup();

    renderApp('/settings');
    const list = await childrenList();
    await user.pointer({ keys: '[MouseRight]', target: await within(list).findByText('Петя') });
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    const sheet = await screen.findByRole('dialog', { name: 'Удалить „Петя“?' });
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    });
    await waitFor(() => {
      expect(syncServer.row('child', petya.id)).toBeUndefined();
    });
  });

  it('deletes offline at once and sends the delete when the server is back', async () => {
    syncServer.seed('child', [masha, petya]);
    const user = userEvent.setup();

    renderApp('/settings');
    const list = await childrenList();
    await within(list).findByText('Петя');
    syncServer.goOffline();
    await user.pointer({ keys: '[MouseRight]', target: within(list).getByText('Петя') });
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Удалить „Петя“?' })).getByRole('button', {
        name: 'Удалить',
      }),
    );

    await waitFor(() => {
      expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    });
    expect(await screen.findByRole('button', { name: OFFLINE })).toBeInTheDocument();
    expect(syncServer.row('child', petya.id)).toBeDefined();

    reconnect();

    await waitFor(() => {
      expect(syncServer.row('child', petya.id)).toBeUndefined();
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: OFFLINE })).not.toBeInTheDocument();
    });
  });
});

describe('The Child screen', () => {
  it('opens from the row in Settings, with the Child’s name, colour and birthday', async () => {
    syncServer.seed('child', [masha, petya]);
    const user = userEvent.setup();

    const { location } = renderApp('/settings');
    await user.click(await within(await childrenList()).findByRole('link', { name: /Маша/ }));

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

  it('saves the name on blur, sending only the name', async () => {
    syncServer.seed('child', [masha]);
    const user = userEvent.setup();

    renderApp(`/settings/children/${masha.id}`);
    const name = await screen.findByRole('textbox', { name: 'Имя' });
    await user.clear(name);
    await user.type(name, 'Мария');
    await user.tab();

    expect(await screen.findByRole('heading', { level: 1, name: 'Мария' })).toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.operations('child')).toEqual([
        { table: 'child', id: masha.id, op: 'upsert', fields: { name: 'Мария' } },
      ]);
    });
    expect(syncServer.row('child', masha.id)).toEqual({ ...masha, name: 'Мария' });
  });

  it('asks for a name instead of saving an empty one', async () => {
    syncServer.seed('child', [masha]);
    const user = userEvent.setup();

    renderApp(`/settings/children/${masha.id}`);
    await user.clear(await screen.findByRole('textbox', { name: 'Имя' }));
    await user.tab();

    expect(await screen.findByText('Заполните это поле')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Имя' })).toHaveAccessibleDescription(
      'Заполните это поле',
    );
    expect(syncServer.operations('child')).toEqual([]);
  });

  it('saves a colour on tap, after the name saved before', async () => {
    syncServer.seed('child', [masha]);
    const user = userEvent.setup();

    renderApp(`/settings/children/${masha.id}`);
    const name = await screen.findByRole('textbox', { name: 'Имя' });
    await user.type(name, '{End}ня{Enter}');
    await screen.findByRole('heading', { level: 1, name: 'Машаня' });
    await user.click(screen.getByRole('radio', { name: 'Бирюзовый' }));

    await waitFor(() => {
      expect(syncServer.operations('child').map((op) => op.fields)).toEqual([
        { name: 'Машаня' },
        { color: 'teal' },
      ]);
    });
    expect(screen.getByRole('radio', { name: 'Бирюзовый' })).toBeChecked();
  });

  it('arrow keys only move between colours; Space or Enter saves the one reached', async () => {
    syncServer.seed('child', [masha]);
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
    await waitFor(() => {
      expect(syncServer.operations('child').map((op) => op.fields)).toEqual([
        { color: 'yellow' },
        { color: 'orange' },
      ]);
    });
  });

  it('edits offline at once and sends the change when the server is back', async () => {
    syncServer.seed('child', [masha]);
    const user = userEvent.setup();

    renderApp(`/settings/children/${masha.id}`);
    await screen.findByRole('heading', { level: 1, name: 'Маша' });
    syncServer.goOffline();
    await user.click(screen.getByRole('radio', { name: 'Синий' }));
    const name = screen.getByRole('textbox', { name: 'Имя' });
    await user.clear(name);
    await user.type(name, 'Мария{Enter}');

    expect(await screen.findByRole('heading', { level: 1, name: 'Мария' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Синий' })).toBeChecked();
    expect(screen.queryByText(/Не удалось сохранить/)).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: OFFLINE })).toBeInTheDocument();
    expect(syncServer.row('child', masha.id)).toEqual(masha);

    reconnect();

    await waitFor(() => {
      expect(syncServer.row('child', masha.id)).toEqual({ ...masha, name: 'Мария', color: 'blue' });
    });
  });

  it('sends a colour changed back after the other Member changed it', async () => {
    syncServer.seed('child', [masha]);
    const user = userEvent.setup();

    renderApp(`/settings/children/${masha.id}`);
    await screen.findByRole('heading', { level: 1, name: 'Маша' });
    await user.click(screen.getByRole('radio', { name: 'Синий' }));
    await waitFor(() => {
      expect(syncServer.row('child', masha.id)).toEqual({ ...masha, color: 'blue' });
    });
    // Boris makes her teal; Anna sees it and picks blue again.
    syncServer.change('child', masha.id, { color: 'teal' });
    bringToForeground();
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Бирюзовый' })).toBeChecked();
    });
    await user.click(screen.getByRole('radio', { name: 'Синий' }));

    await waitFor(() => {
      expect(syncServer.row('child', masha.id)).toEqual({ ...masha, color: 'blue' });
    });
    expect(screen.getByRole('radio', { name: 'Синий' })).toBeChecked();
  });

  it('keeps an edit not sent yet when a pull brings the other Member’s change', async () => {
    syncServer.seed('child', [masha]);
    const user = userEvent.setup();

    renderApp(`/settings/children/${masha.id}`);
    await screen.findByRole('heading', { level: 1, name: 'Маша' });
    await waitFor(() => {
      expect(syncServer.pulls).toHaveLength(1);
    });
    // A pull is on its way when Boris renames Маша and changes her colour, and Anna renames her.
    const release = syncServer.holdPulls();
    bringToForeground();
    await waitFor(() => {
      expect(syncServer.pulls).toHaveLength(2);
    });
    syncServer.change('child', masha.id, { name: 'Маня', color: 'teal' });
    const name = screen.getByRole('textbox', { name: 'Имя' });
    await user.clear(name);
    await user.type(name, 'Мария{Enter}');
    release();

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Бирюзовый' })).toBeChecked();
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Мария' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Имя' })).toHaveValue('Мария');
    await waitFor(() => {
      expect(syncServer.row('child', masha.id)).toEqual({ ...masha, name: 'Мария', color: 'teal' });
    });
  });

  it('says «Не удалось сохранить» once and shows the server’s value when a change is rejected', async () => {
    syncServer.seed('child', [masha]);
    syncServer.rejectWhen((op) => op.fields?.name === 'Мария');
    const user = userEvent.setup();

    renderApp(`/settings/children/${masha.id}`);
    const name = await screen.findByRole('textbox', { name: 'Имя' });
    await user.clear(name);
    await user.type(name, 'Мария{Enter}');

    expect(await screen.findByText(NOT_SAVED)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: 'Маша' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Имя' })).toHaveValue('Маша');
    });
    expect(screen.getAllByText(NOT_SAVED)).toHaveLength(1);

    // The next change goes through, and only it is sent.
    await user.click(screen.getByRole('radio', { name: 'Синий' }));
    await waitFor(() => {
      expect(syncServer.row('child', masha.id)).toEqual({ ...masha, color: 'blue' });
    });
    expect(syncServer.operations('child').at(-1)?.fields).toEqual({ color: 'blue' });
    expect(screen.queryByText(NOT_SAVED)).not.toBeInTheDocument();
  });

  it('clears the birthday, and the list then shows no age', async () => {
    syncServer.seed('child', [masha]);
    const user = userEvent.setup();

    renderApp(`/settings/children/${masha.id}`);
    await user.click(await screen.findByRole('button', { name: 'Очистить «День рождения»' }));

    await waitFor(() => {
      expect(syncServer.operations('child').map((op) => op.fields)).toEqual([{ birthday: null }]);
    });
    expect(screen.getByLabelText('День рождения')).toHaveValue('');
    expect(
      screen.queryByRole('button', { name: 'Очистить «День рождения»' }),
    ).not.toBeInTheDocument();
  });

  it('saves a new birthday when leaving the field', async () => {
    syncServer.seed('child', [petya]);
    const user = userEvent.setup();

    renderApp(`/settings/children/${petya.id}`);
    await user.type(await screen.findByLabelText('День рождения'), '2020-02-29');
    await user.tab();

    await waitFor(() => {
      expect(syncServer.operations('child').map((op) => op.fields)).toEqual([
        { birthday: '2020-02-29' },
      ]);
    });
  });

  it('deletes the Child after the action sheet and goes back to Settings', async () => {
    syncServer.seed('child', [masha, petya]);
    const user = userEvent.setup();

    const { location } = renderApp(`/settings/children/${masha.id}`);
    await user.click(await screen.findByRole('button', { name: 'Удалить ребёнка' }));
    const sheet = screen.getByRole('dialog', { name: 'Удалить „Маша“?' });
    expect(syncServer.operations('child')).toEqual([]);
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(location()).toBe('/settings');
    });
    expect(await within(await childrenList()).findByText('Петя')).toBeInTheDocument();
    expect(within(await childrenList()).queryByText('Маша')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.operations('child')).toEqual([
        { table: 'child', id: masha.id, op: 'delete' },
      ]);
    });
  });

  it('says so when the Child doesn’t exist (any more)', async () => {
    syncServer.seed('child', [masha]);

    renderApp('/settings/children/0c3e4a52-0000-4000-8000-000000000099');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Такого ребёнка нет: возможно, его удалили.',
    );
  });
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('The «Новый ребёнок» sheet', () => {
  async function openSheet(user: ReturnType<typeof userEvent.setup>) {
    const section = await childrenSection();
    await user.click(await within(section).findByRole('button', { name: 'Добавить ребёнка' }));
    return screen.getByRole('dialog', { name: 'Новый ребёнок' });
  }

  it('adds a Child with «Готово», under an id made on the client, and lists it in order', async () => {
    syncServer.seed('child', [masha, petya]);
    const user = userEvent.setup();

    renderApp('/settings');
    await within(await childrenList()).findByText('Петя');
    const sheet = await openSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: 'Имя' }), 'Ваня');
    await user.click(within(sheet).getByRole('radio', { name: 'Зелёный' }));
    await user.type(within(sheet).getByLabelText('День рождения'), '2021-06-01');
    expect(syncServer.operations('child')).toEqual([]);
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Новый ребёнок' })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(
        within(screen.getByRole('list', { name: 'Дети' }))
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Маша7 лет', 'Ваня5 лет', 'Петя']);
    });
    await waitFor(() => {
      expect(syncServer.operations('child')).toHaveLength(1);
    });
    const [added] = syncServer.operations('child');
    expect(added?.id).toMatch(UUID);
    expect(added?.op).toBe('upsert');
    expect(added?.fields).toEqual({ name: 'Ваня', color: 'green', birthday: '2021-06-01' });
    expect(syncServer.pushes[0]?.csrf).toBe('token-from-server');
  });

  it('sends no birthday when none is given, trims the name, and saves on Enter in it', async () => {
    const user = userEvent.setup();

    renderApp('/settings');
    const sheet = await openSheet(user);
    expect(within(sheet).queryAllByRole('radio', { checked: true })).toEqual([]);
    await user.click(within(sheet).getByRole('radio', { name: 'Фиолетовый' }));
    await user.type(within(sheet).getByRole('textbox', { name: 'Имя' }), '  Ваня {Enter}');

    expect(await within(await childrenList()).findByText('Ваня')).toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.operations('child').map((op) => op.fields)).toEqual([
        { name: 'Ваня', color: 'purple', birthday: null },
      ]);
    });
  });

  it('asks for a name and a colour without saving anything', async () => {
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
    expect(syncServer.operations('child')).toEqual([]);
  });

  it('adds a Child offline at once, and sends it under the same id when the server is back', async () => {
    const user = userEvent.setup();

    renderApp('/settings');
    await within(await childrenSection()).findByText('Детей пока нет');
    syncServer.goOffline();
    const sheet = await openSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: 'Имя' }), 'Ваня');
    await user.click(within(sheet).getByRole('radio', { name: 'Синий' }));
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(await within(await childrenList()).findByText('Ваня')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(syncServer.pushes).toEqual([]);

    reconnect();

    await waitFor(() => {
      expect(syncServer.operations('child')).toHaveLength(1);
    });
    const id = syncServer.operations('child')[0]?.id ?? '';
    expect(syncServer.row('child', id)).toEqual({
      id,
      name: 'Ваня',
      color: 'blue',
      birthday: null,
    });
  });

  it('takes a rejected new Child off the list and says «Не удалось сохранить»', async () => {
    syncServer.seed('child', [masha]);
    syncServer.rejectWhen((op) => op.fields?.name === 'Ваня');
    const user = userEvent.setup();

    renderApp('/settings');
    await within(await childrenList()).findByText('Маша');
    const sheet = await openSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: 'Имя' }), 'Ваня');
    await user.click(within(sheet).getByRole('radio', { name: 'Синий' }));
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    const section = await childrenSection();
    expect(await within(section).findByText(NOT_SAVED)).toBeInTheDocument();
    await waitFor(() => {
      expect(within(section).queryByText('Ваня')).not.toBeInTheDocument();
    });
    expect(within(section).getByText('Маша')).toBeInTheDocument();
  });

  it('closes with «Отмена» or Esc without saving, and starts empty next time', async () => {
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
    expect(syncServer.operations('child')).toEqual([]);
  });
});

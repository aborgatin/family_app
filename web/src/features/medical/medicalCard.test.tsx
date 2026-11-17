import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  anna,
  boris,
  invitesHandler,
  masha,
  membersHandler,
  sessionHandler,
} from '@/test/fixtures';
import { illnessRow, selectedText, temperatureRow } from '@/test/medical';
import { upgradeStoreFrom } from '@/test/olderStore';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// Medical cards (spec #128, ticket #129): a Member's own card from Home, a Child's from the Child
// page; «Записать температуру» files a Temperature into an Illness; «Болезни» lists them, and
// «+ Новая болезнь» adds one by hand (review follow-up C4).

/** «Now» in these tests: Wednesday 2 December 2026, 22:00. */
const NOW = new Date('2026-12-02T22:00:00');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
});
afterEach(() => {
  vi.useRealTimers();
});

async function cardTitle() {
  return screen.findByRole('heading', { level: 1, name: 'Медкарта' });
}

function backLink() {
  return within(screen.getByRole('banner')).getAllByRole('link')[0];
}

/** Anna's card is open, after the first sync. */
async function annasCard() {
  const app = renderApp('/medical');
  await cardTitle();
  return app;
}

async function illnessRows() {
  const section = await screen.findByRole('region', { name: 'Болезни' });
  return within(section)
    .queryAllByRole('link')
    .map((row) => row.textContent);
}

/**
 * Opens the Temperature sheet from the card, once it shows: a Child's card says «Медкарта» while
 * the Child is still being read, before the button is there.
 */
async function openTemperatureSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Записать температуру' }));
  return screen.findByRole('dialog', { name: 'Температура' });
}

function addTo(sheet: HTMLElement) {
  return within(sheet).getByRole('combobox', { name: 'Добавить к' });
}

describe('Opening a Medical card', () => {
  it('opens the Member’s own card from the «Медкарта» row on Home', async () => {
    const user = userEvent.setup();
    const app = renderApp('/');

    await user.click(await screen.findByRole('link', { name: 'Медкарта' }));

    await cardTitle();
    expect(app.location()).toBe('/medical');
    expect(backLink()).toHaveAccessibleName('Семья');
  });

  it('opens a Child’s card from the «Медкарта» row on the Child page', async () => {
    syncServer.seed('child', [masha]);
    const user = userEvent.setup();
    const app = renderApp(`/children/${masha.id}`);
    await screen.findByRole('heading', { level: 1, name: 'Маша' });

    await user.click(screen.getByRole('link', { name: 'Медкарта' }));

    await cardTitle();
    expect(app.location()).toBe(`/children/${masha.id}/medical`);
    expect(backLink()).toHaveAccessibleName('Маша');
  });

  it('shows «Записать температуру» and the «Болезни» section', async () => {
    renderApp('/medical');

    await cardTitle();
    expect(screen.getByRole('button', { name: 'Записать температуру' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Болезни' })).toBeInTheDocument();
    });
  });
});

describe('The Temperature sheet', () => {
  it('defaults to 37,0 °C and now, with a wheel from 34,0 to 43,0', async () => {
    const user = userEvent.setup();
    await annasCard();

    const sheet = await openTemperatureSheet(user);

    const wheel = within(sheet).getByRole('combobox', { name: 'Температура' });
    expect(selectedText(wheel)).toBe('37,0\u00a0°C');
    const options = within(wheel).getAllByRole('option');
    expect(options).toHaveLength(91);
    expect(options[0]).toHaveTextContent('34,0 °C');
    expect(options[90]).toHaveTextContent('43,0 °C');
    expect(within(sheet).getByLabelText('Дата')).toHaveValue('2026-12-02');
    expect(within(sheet).getByLabelText('Время')).toHaveValue('22:00');
    expect(within(sheet).getByRole('textbox', { name: 'Описание' })).toBeInTheDocument();
  });

  it('joins the Illness whose latest event is the latest, within 48 hours', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    const older = illnessRow({ memberId: anna.id }, 'Отит');
    syncServer.seed('illness', [older, cold]);
    syncServer.seed('illness_event', [
      temperatureRow(cold, '2026-11-30', '22:00', 38.0),
      temperatureRow(older, '2026-11-20', '10:00', 37.5),
      temperatureRow(older, '2026-11-30', '22:00', 37.5),
      temperatureRow(cold, '2026-12-01', '10:00', 38.0),
      temperatureRow(older, '2026-12-01', '09:00', 37.5),
    ]);
    const user = userEvent.setup();
    await annasCard();
    await screen.findByText('ОРВИ');

    const sheet = await openTemperatureSheet(user);
    expect(selectedText(addTo(sheet))).toBe('ОРВИ');
    await user.selectOptions(within(sheet).getByRole('combobox', { name: 'Температура' }), '38.5');
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await waitFor(() => {
      expect(syncServer.operations('illness_event')).toHaveLength(1);
    });
    expect(syncServer.operations('illness')).toHaveLength(0);
    expect(syncServer.operations('illness_event')[0]?.fields).toEqual({
      illnessId: cold.id,
      kind: 'TEMPERATURE',
      temperature: 38.5,
      date: '2026-12-02',
      time: '22:00',
      description: null,
    });
  });

  it('starts a new Illness, named after the event’s date, when the latest event is older than 48 hours', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('illness', [cold]);
    syncServer.seed('illness_event', [temperatureRow(cold, '2026-11-30', '21:59', 38.0)]);
    const user = userEvent.setup();
    await annasCard();
    await screen.findByText('ОРВИ');

    const sheet = await openTemperatureSheet(user);
    expect(selectedText(addTo(sheet))).toBe('Новая болезнь');
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await waitFor(() => {
      expect(syncServer.operations('illness_event')).toHaveLength(1);
    });
    // One push: the Illness, then its first event.
    const push = syncServer.pushes.find(({ operations }) =>
      operations.some(({ table }) => table === 'illness'),
    );
    expect(push?.operations.map(({ table }) => table)).toEqual(['illness', 'illness_event']);
    const illness = push?.operations[0];
    expect(illness?.fields).toEqual({
      memberId: anna.id,
      kind: 'ILLNESS',
      name: 'Болезнь 2 декабря 2026',
    });
    expect(push?.operations[1]?.fields).toMatchObject({ illnessId: illness?.id });
  });

  it('still joins an Illness whose latest event was exactly 48 hours ago', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('illness', [cold]);
    syncServer.seed('illness_event', [temperatureRow(cold, '2026-11-30', '22:00', 38.0)]);
    const user = userEvent.setup();
    await annasCard();
    await screen.findByText('ОРВИ');

    const sheet = await openTemperatureSheet(user);

    expect(selectedText(addTo(sheet))).toBe('ОРВИ');
  });

  it('counts an event without a time as 00:00 of its day', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('illness', [cold]);
    // 30 November without a time is 00:00, more than 48 hours before 2 December 22:00.
    syncServer.seed('illness_event', [temperatureRow(cold, '2026-11-30', null, 38.0)]);
    const user = userEvent.setup();
    await annasCard();
    await screen.findByText('ОРВИ');

    const sheet = await openTemperatureSheet(user);

    expect(selectedText(addTo(sheet))).toBe('Новая болезнь');
  });

  it('names the new Illness after the date chosen for the event', async () => {
    const user = userEvent.setup();
    await annasCard();

    const sheet = await openTemperatureSheet(user);
    const date = within(sheet).getByLabelText('Дата');
    await user.clear(date);
    await user.type(date, '2026-11-28');
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await waitFor(() => {
      expect(syncServer.operations('illness')).toHaveLength(1);
    });
    expect(syncServer.operations('illness')[0]?.fields).toMatchObject({
      name: 'Болезнь 28 ноября 2026',
    });
  });

  it('adds to another of the person’s Illnesses with «Другая…»', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    const older = illnessRow({ memberId: anna.id }, 'Отит');
    syncServer.seed('illness', [cold, older]);
    syncServer.seed('illness_event', [
      temperatureRow(cold, '2026-12-02', '08:00', 38.0),
      temperatureRow(older, '2026-11-20', '10:00', 37.5),
    ]);
    const user = userEvent.setup();
    await annasCard();
    await screen.findByText('Отит');

    const sheet = await openTemperatureSheet(user);
    await user.selectOptions(addTo(sheet), 'Другая…');
    const other = within(sheet).getByRole('combobox', { name: 'Болезнь' });
    expect(
      within(other)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Отит']);
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await waitFor(() => {
      expect(syncServer.operations('illness_event')).toHaveLength(1);
    });
    expect(syncServer.operations('illness_event')[0]?.fields).toMatchObject({
      illnessId: older.id,
    });
  });

  it('is saved offline to the Outbox, a new Illness included, and synced later', async () => {
    const user = userEvent.setup();
    const first = await annasCard();
    first.unmount();
    renderApp('/medical', { offline: true });
    await cardTitle();

    const sheet = await openTemperatureSheet(user);
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(await illnessRows()).toEqual(['Болезнь 2 декабря 2026с 2 декабря · 1 событие']);
    expect(syncServer.operations('illness')).toHaveLength(0);
    syncServer.goOnline();
    window.dispatchEvent(new Event('online'));
    await waitFor(() => {
      expect(syncServer.operations('illness_event')).toHaveLength(1);
    });
    expect(syncServer.operations('illness')).toHaveLength(1);
  });
});

describe('«+ Новая болезнь»', () => {
  it('adds an empty Illness by hand on a Child’s card and opens it', async () => {
    syncServer.seed('child', [masha]);
    const user = userEvent.setup();
    const app = renderApp(`/children/${masha.id}/medical`);
    await screen.findByText('Болезней пока нет');

    const illnesses = screen.getByRole('region', { name: 'Болезни' });
    await user.click(within(illnesses).getByRole('button', { name: '+ Новая болезнь' }));
    const sheet = await screen.findByRole('dialog', { name: 'Новая болезнь' });
    const name = within(sheet).getByRole('textbox', { name: 'Название' });
    expect(name).toHaveAttribute('placeholder', 'Например: ОРВИ, Отит');
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
    expect(await within(sheet).findByText('Заполните это поле')).toBeInTheDocument();
    expect(syncServer.operations('illness')).toEqual([]);

    await user.type(name, '  Отит ');
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Отит' })).toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.operations('illness')).toHaveLength(1);
    });
    const [added] = syncServer.operations('illness');
    expect(added?.fields).toEqual({ childId: masha.id, kind: 'ILLNESS', name: 'Отит' });
    expect(app.location()).toBe(`/children/${masha.id}/medical/illnesses/${added?.id ?? ''}`);
  });

  it('is saved offline to the Outbox on the Member’s own card, and synced later', async () => {
    syncServer.seed('illness', [illnessRow({ memberId: anna.id }, 'ОРВИ')]);
    const user = userEvent.setup();
    const first = await annasCard();
    await screen.findByText('ОРВИ');
    first.unmount();
    renderApp('/medical', { offline: true });
    await cardTitle();

    await user.click(await screen.findByRole('button', { name: '+ Новая болезнь' }));
    const sheet = await screen.findByRole('dialog', { name: 'Новая болезнь' });
    await user.type(within(sheet).getByRole('textbox', { name: 'Название' }), 'Грипп');
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Грипп' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Медкарта' }));
    expect(await illnessRows()).toEqual(['ГриппНет событий', 'ОРВИНет событий']);
    expect(syncServer.operations('illness')).toHaveLength(0);
    syncServer.goOnline();
    window.dispatchEvent(new Event('online'));
    await waitFor(() => {
      expect(syncServer.operations('illness')).toHaveLength(1);
    });
    expect(syncServer.operations('illness')[0]?.fields).toEqual({
      memberId: anna.id,
      kind: 'ILLNESS',
      name: 'Грипп',
    });
  });
});

describe('«Болезни» on the card', () => {
  it('shows each Illness with its first day and its events, the year only when not this year', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    const otitis = illnessRow({ memberId: anna.id }, 'Отит');
    const flu = illnessRow({ memberId: anna.id }, 'Грипп');
    syncServer.seed('illness', [cold, otitis, flu]);
    syncServer.seed('illness_event', [
      temperatureRow(cold, '2026-12-01', '08:00', 38.0),
      temperatureRow(cold, '2026-12-02', '08:00', 37.8),
      temperatureRow(otitis, '2026-11-20', '10:00', 37.5),
      ...['01', '02', '03', '04', '05'].map((day) =>
        temperatureRow(flu, `2025-03-${day}`, null, 38.2),
      ),
    ]);

    await annasCard();

    await waitFor(async () => {
      expect(await illnessRows()).toEqual([
        'ОРВИс 1 декабря · 2 события',
        'Отитс 20 ноября · 1 событие',
        'Гриппс 1 марта 2025 · 5 событий',
      ]);
    });
  });

  it('orders Illnesses by their latest event, newest first, and an empty one by when it was made', async () => {
    const early = illnessRow({ memberId: anna.id }, 'Ранняя');
    const late = illnessRow({ memberId: anna.id }, 'Поздняя');
    const empty = illnessRow({ memberId: anna.id }, 'Пустая', '2026-11-25T10:00:00Z');
    syncServer.seed('illness', [late, empty, early]);
    syncServer.seed('illness_event', [
      // Started earlier, but its latest event is the newest.
      temperatureRow(early, '2026-11-10', '08:00', 38.0),
      temperatureRow(early, '2026-12-01', '08:00', 38.0),
      temperatureRow(late, '2026-11-20', '08:00', 38.0),
    ]);

    await annasCard();

    await waitFor(async () => {
      expect(await illnessRows()).toEqual([
        'Ранняяс 10 ноября · 2 события',
        'ПустаяНет событий',
        'Поздняяс 20 ноября · 1 событие',
      ]);
    });
  });

  it('shows only the Member’s own card: not the other Member’s, nor a Child’s', async () => {
    syncServer.seed('child', [masha]);
    syncServer.seed('illness', [
      illnessRow({ memberId: anna.id }, 'Моя'),
      { ...illnessRow({ memberId: anna.id }, 'Борина'), memberId: boris.id },
      { ...illnessRow({ memberId: anna.id }, 'Машина'), memberId: null, childId: masha.id },
    ]);

    await annasCard();

    await waitFor(async () => {
      expect(await illnessRows()).toEqual(['МояНет событий']);
    });
  });
});

describe('The Illness screen', () => {
  it('shows the name, the first day, «Температура» and the events, newest first', async () => {
    const cold = {
      ...illnessRow({ memberId: anna.id }, 'ОРВИ'),
      memberId: null,
      childId: masha.id,
    };
    syncServer.seed('child', [masha]);
    syncServer.seed('illness', [cold]);
    syncServer.seed('illness_event', [
      temperatureRow(cold, '2026-12-01', '08:00', 38.0),
      temperatureRow(cold, '2026-12-02', null, 37.1),
      temperatureRow(cold, '2026-12-02', '22:00', 38.5),
      temperatureRow(cold, '2026-12-02', '09:30', 37.8),
    ]);
    const user = userEvent.setup();
    const app = renderApp(`/children/${masha.id}/medical`);
    await cardTitle();

    await user.click(await screen.findByRole('link', { name: /ОРВИ/ }));

    expect(await screen.findByRole('heading', { level: 1, name: 'ОРВИ' })).toBeInTheDocument();
    expect(app.location()).toBe(`/children/${masha.id}/medical/illnesses/${cold.id}`);
    expect(screen.getByText('с 1 декабря 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Температура' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'События' }))
        .getAllByRole('button')
        .map((row) => row.textContent),
    ).toEqual([
      '38,5\u00a0°C' + '2 декабря, 22:00',
      '37,8\u00a0°C' + '2 декабря, 09:30',
      '37,1\u00a0°C' + '2 декабря',
      '38,0\u00a0°C' + '1 декабря, 08:00',
    ]);
  });

  it('adds a Temperature to this Illness', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('illness', [cold]);
    syncServer.seed('illness_event', [temperatureRow(cold, '2026-11-01', '08:00', 38.0)]);
    const user = userEvent.setup();
    renderApp(`/medical/illnesses/${cold.id}`);
    await screen.findByRole('heading', { level: 1, name: 'ОРВИ' });

    await user.click(screen.getByRole('button', { name: 'Температура' }));
    const sheet = await screen.findByRole('dialog', { name: 'Температура' });
    expect(within(sheet).queryByRole('combobox', { name: 'Добавить к' })).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    // The row (a button), not the wheel's «37,0 °C» option in the sheet, which may still be closing.
    expect(await screen.findByRole('button', { name: /^37,0\s°C/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.operations('illness_event')[0]?.fields).toMatchObject({
        illnessId: cold.id,
      });
    });
  });

  it('says so when the Illness is deleted while it is open', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('illness', [cold]);
    renderApp(`/medical/illnesses/${cold.id}`);
    await screen.findByRole('heading', { level: 1, name: 'ОРВИ' });

    syncServer.change('illness', cold.id, 'deleted');
    window.dispatchEvent(new Event('online'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Такой болезни нет: возможно, её удалили.',
    );
  });

  it('says so for an Illness that isn’t there', async () => {
    renderApp('/medical/illnesses/5e1d0000-0000-4000-8000-999999999999');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Такой болезни нет: возможно, её удалили.',
    );
  });
});

describe('Deleting a Child', () => {
  it('deletes the Child’s Illnesses and their events', async () => {
    server.use(membersHandler([anna, boris]), invitesHandler([]));
    const cold = {
      ...illnessRow({ memberId: anna.id }, 'ОРВИ'),
      memberId: null,
      childId: masha.id,
    };
    const event = temperatureRow(cold, '2026-12-01', '08:00', 38.0);
    const mine = illnessRow({ memberId: anna.id }, 'Моя');
    const myEvent = temperatureRow(mine, '2026-12-01', '08:00', 37.5);
    syncServer.seed('child', [masha]);
    syncServer.seed('illness', [cold, mine]);
    syncServer.seed('illness_event', [event, myEvent]);
    const user = userEvent.setup();

    renderApp(`/settings/children/${masha.id}`);
    await user.click(await screen.findByRole('button', { name: 'Удалить ребёнка' }));
    const confirmation = screen.getByRole('dialog', { name: 'Удалить „Маша“?' });
    expect(confirmation).toHaveAccessibleDescription(
      'Списки, профиль и медкарта ребёнка тоже будут удалены.',
    );
    await user.click(within(confirmation).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(syncServer.row('child', masha.id)).toBeUndefined();
    });
    expect(syncServer.row('illness', cold.id)).toBeUndefined();
    expect(syncServer.row('illness_event', event.id)).toBeUndefined();
    expect(syncServer.row('illness', mine.id)).toBeDefined();
    expect(syncServer.row('illness_event', myEvent.id)).toBeDefined();
  });
});

describe('A server rejection on a Medical card', () => {
  it('says the record isn’t there', async () => {
    syncServer.rejectWhen((operation) =>
      operation.table === 'illness' ? { code: 'medical.not_found' } : false,
    );
    const user = userEvent.setup();
    await annasCard();

    const sheet = await openTemperatureSheet(user);
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(await screen.findByText(/такой записи в медкарте нет/)).toBeInTheDocument();
  });
});

describe('The store upgrade that adds Medical cards', () => {
  it('sends a change still waiting in the store of the app version before them', async () => {
    // The store as the app before Medical cards created it (schema version 8), with a Child
    // renamed offline and not sent yet.
    await upgradeStoreFrom(8, async (older) => {
      await older.table('child').put({ ...masha, name: 'Маша Б.' });
      await older
        .table('outbox')
        .add({ table: 'child', id: masha.id, op: 'upsert', fields: { name: 'Маша Б.' } });
    });
    syncServer.seed('child', [masha]);
    const user = userEvent.setup();

    renderApp(`/children/${masha.id}/medical`);
    await cardTitle();

    await waitFor(() => {
      expect(syncServer.row('child', masha.id)).toMatchObject({ name: 'Маша Б.' });
    });
    // The upgraded store has the new tables: a Temperature can be logged.
    const sheet = await openTemperatureSheet(user);
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
    await waitFor(() => {
      expect(syncServer.operations('illness_event')).toHaveLength(1);
    });
    expect(syncServer.operations('illness')[0]?.fields).toMatchObject({ childId: masha.id });
  });
});

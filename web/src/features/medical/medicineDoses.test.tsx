import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anna, fixtureId, masha, sessionHandler } from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// Medicine doses (spec #128, ticket #130): «Добавить приём лекарства» on the card and «Приём
// лекарства» on an Illness screen log a dose of a Medicine from the Family's list (or one typed
// in), its amount prefilled from the person's latest dose of it.

/** «Now» in these tests: Wednesday 2 December 2026, 22:00. */
const NOW = new Date('2026-12-02T22:00:00');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
});
afterEach(() => {
  vi.useRealTimers();
});

let ids = 0;
function nextId() {
  ids += 1;
  return fixtureId('d05e0000', ids);
}

function medicine(name: string, deleted = false) {
  return { id: nextId(), name, deleted };
}

function illnessOf(person: { memberId: string } | { childId: string }, name: string) {
  return {
    id: nextId(),
    memberId: null,
    childId: null,
    ...person,
    kind: 'ILLNESS',
    name,
    description: null,
    ended: false,
    position: null,
    createdAt: '2026-11-01T10:00:00Z',
  };
}

function doseIn(
  illness: { id: string },
  of: { id: string },
  amount: string,
  date: string,
  time: string | null,
  temperature: number | null = null,
) {
  return {
    id: nextId(),
    illnessId: illness.id,
    kind: 'MEDICINE_DOSE',
    date,
    time,
    medicineId: of.id,
    amount,
    temperature,
    title: null,
    description: null,
  };
}

type User = ReturnType<typeof userEvent.setup>;

async function openDoseSheetFromCard(user: User, path = '/medical') {
  renderApp(path);
  await user.click(await screen.findByRole('button', { name: 'Добавить приём лекарства' }));
  return screen.findByRole('dialog', { name: 'Приём лекарства' });
}

function medicineField(sheet: HTMLElement) {
  return within(sheet).getByRole('textbox', { name: 'Лекарство' });
}

function amountField(sheet: HTMLElement) {
  return within(sheet).getByRole('textbox', { name: 'Количество' });
}

function wheel(sheet: HTMLElement) {
  return within(sheet).getByRole('combobox', { name: 'Температура' });
}

function selectedText(select: HTMLElement) {
  return (select as HTMLSelectElement).selectedOptions[0]?.textContent;
}

/** The picker's rows under «Лекарство», top to bottom. */
function pickerRows(sheet: HTMLElement) {
  const group = within(sheet).queryByRole('group', { name: 'Подсказки' });
  return group === null
    ? []
    : within(group)
        .getAllByRole('button')
        .map((row) => row.textContent);
}

async function done(user: User, sheet: HTMLElement) {
  await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
}

describe('Where a dose is logged', () => {
  it('offers «Добавить приём лекарства» on the card and «Приём лекарства» on an Illness', async () => {
    const cold = illnessOf({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('illness', [cold]);
    const user = userEvent.setup();

    const fromCard = await openDoseSheetFromCard(user);
    expect(within(fromCard).getByRole('combobox', { name: 'Добавить к' })).toBeInTheDocument();
    await user.click(within(fromCard).getByRole('button', { name: 'Отмена' }));

    await user.click(await screen.findByRole('link', { name: /ОРВИ/ }));
    await user.click(await screen.findByRole('button', { name: 'Приём лекарства' }));
    const fromIllness = await screen.findByRole('dialog', { name: 'Приём лекарства' });
    expect(
      within(fromIllness).queryByRole('combobox', { name: 'Добавить к' }),
    ).not.toBeInTheDocument();
  });
});

describe('The dose sheet', () => {
  it('has «Лекарство», «Количество», an optional temperature, «Дата», «Время» and «Описание»', async () => {
    const user = userEvent.setup();

    const sheet = await openDoseSheetFromCard(user);

    expect(medicineField(sheet)).toHaveValue('');
    expect(amountField(sheet)).toHaveValue('');
    expect(amountField(sheet)).toHaveAttribute('placeholder', 'например, 5 мл');
    expect(within(sheet).getByLabelText('Дата')).toHaveValue('2026-12-02');
    expect(within(sheet).getByLabelText('Время')).toHaveValue('22:00');
    expect(within(sheet).getByRole('textbox', { name: 'Описание' })).toBeInTheDocument();
  });

  it('shows «—» on the temperature wheel until it is turned, then 34,0–43,0 from 37,0', async () => {
    const user = userEvent.setup();

    const sheet = await openDoseSheetFromCard(user);

    expect(selectedText(wheel(sheet))).toBe('—');
    const options = within(wheel(sheet))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toHaveLength(92);
    expect(options[0]).toBe('34,0 °C');
    expect(options.at(-1)).toBe('43,0 °C');
    // The wheel turns from «—» straight to 37,0 (one step down) or 36,9 (one step up).
    expect(options.slice(29, 32)).toEqual(['36,9 °C', '—', '37,0 °C']);
  });

  it('asks for the Medicine and the amount without saving anything', async () => {
    const user = userEvent.setup();

    const sheet = await openDoseSheetFromCard(user);
    await done(user, sheet);

    expect(medicineField(sheet)).toHaveAccessibleDescription('Заполните это поле');
    expect(amountField(sheet)).toHaveAccessibleDescription('Заполните это поле');
    expect(syncServer.operations('illness_event')).toHaveLength(0);
  });
});

describe('Picking the Medicine', () => {
  it('lists the Family’s Medicines, without deleted ones, and narrows them as you type', async () => {
    syncServer.seed('medicine', [
      medicine('Парацетамол 120 мг/5 мл'),
      medicine('Нурофен', true),
      medicine('Ибупрофен 20 мг/мл'),
    ]);
    const user = userEvent.setup();
    const sheet = await openDoseSheetFromCard(user);

    await waitFor(() => {
      expect(pickerRows(sheet)).toEqual(['Ибупрофен 20 мг/мл', 'Парацетамол 120 мг/5 мл']);
    });
    await user.type(medicineField(sheet), 'про');

    expect(pickerRows(sheet)).toEqual(['Ибупрофен 20 мг/мл', '+ про']);
  });

  it('logs a dose of the Medicine picked from the list', async () => {
    const ibuprofen = medicine('Ибупрофен 20 мг/мл');
    syncServer.seed('medicine', [ibuprofen]);
    const user = userEvent.setup();
    const sheet = await openDoseSheetFromCard(user);

    await user.click(await within(sheet).findByRole('button', { name: 'Ибупрофен 20 мг/мл' }));
    expect(medicineField(sheet)).toHaveValue('Ибупрофен 20 мг/мл');
    expect(pickerRows(sheet)).toEqual([]);
    await user.type(amountField(sheet), ' 5 мл ');
    await user.selectOptions(wheel(sheet), '38,5 °C');
    await done(user, sheet);

    await waitFor(() => {
      expect(syncServer.operations('illness_event')).toHaveLength(1);
    });
    expect(syncServer.operations('medicine')).toHaveLength(0);
    const illness = syncServer.operations('illness')[0];
    expect(illness?.fields).toMatchObject({ name: 'Болезнь 2 декабря 2026' });
    expect(syncServer.operations('illness_event')[0]?.fields).toEqual({
      illnessId: illness?.id,
      kind: 'MEDICINE_DOSE',
      medicineId: ibuprofen.id,
      amount: '5 мл',
      temperature: 38.5,
      date: '2026-12-02',
      time: '22:00',
      description: null,
    });
  });

  it('picks an existing Medicine when its name is typed in any letter case', async () => {
    const ibuprofen = medicine('Ибупрофен');
    syncServer.seed('medicine', [ibuprofen]);
    const user = userEvent.setup();
    const sheet = await openDoseSheetFromCard(user);
    await within(sheet).findByRole('button', { name: 'Ибупрофен' });

    await user.type(medicineField(sheet), ' иБУПРОФЕН');
    expect(pickerRows(sheet)).toEqual([]);
    await user.type(amountField(sheet), '5 мл');
    await done(user, sheet);

    await waitFor(() => {
      expect(syncServer.operations('illness_event')).toHaveLength(1);
    });
    expect(syncServer.operations('medicine')).toHaveLength(0);
    expect(syncServer.operations('illness_event')[0]?.fields).toMatchObject({
      medicineId: ibuprofen.id,
      temperature: null,
    });
  });

  it('adds a typed Medicine with «+ …», and it is in the list next time', async () => {
    const user = userEvent.setup();
    const sheet = await openDoseSheetFromCard(user);

    await user.type(medicineField(sheet), 'Нурофен 100 мг/5 мл');
    await user.click(within(sheet).getByRole('button', { name: '+ Нурофен 100 мг/5 мл' }));
    expect(pickerRows(sheet)).toEqual([]);
    await user.type(amountField(sheet), '5 мл');
    await done(user, sheet);

    await waitFor(() => {
      expect(syncServer.operations('illness_event')).toHaveLength(1);
    });
    const [added] = syncServer.operations('medicine');
    expect(added?.fields).toEqual({ name: 'Нурофен 100 мг/5 мл' });
    expect(syncServer.operations('illness_event')[0]?.fields).toMatchObject({
      medicineId: added?.id,
    });

    await user.click(await screen.findByRole('button', { name: 'Добавить приём лекарства' }));
    const next = await screen.findByRole('dialog', { name: 'Приём лекарства' });
    expect(pickerRows(next)).toEqual(['Нурофен 100 мг/5 мл']);
  });
});

describe('The prefilled amount', () => {
  async function amountFor(name: string) {
    const user = userEvent.setup();
    const sheet = await openDoseSheetFromCard(user);
    await user.click(await within(sheet).findByRole('button', { name }));
    return sheet;
  }

  it('is empty the first time this person gets the Medicine', async () => {
    const ibuprofen = medicine('Ибупрофен');
    const mashas = illnessOf({ childId: masha.id }, 'ОРВИ');
    syncServer.seed('child', [masha]);
    syncServer.seed('medicine', [ibuprofen]);
    syncServer.seed('illness', [mashas]);
    syncServer.seed('illness_event', [doseIn(mashas, ibuprofen, '5 мл', '2026-12-02', '08:00')]);

    const sheet = await amountFor('Ибупрофен');

    expect(amountField(sheet)).toHaveValue('');
    expect(within(sheet).queryByText('как в прошлый раз')).not.toBeInTheDocument();
  });

  it('is the amount of this person’s latest dose of it, by its own date and time', async () => {
    const ibuprofen = medicine('Ибупрофен');
    const paracetamol = medicine('Парацетамол');
    const cold = illnessOf({ memberId: anna.id }, 'ОРВИ');
    const otitis = illnessOf({ memberId: anna.id }, 'Отит');
    syncServer.seed('medicine', [ibuprofen, paracetamol]);
    syncServer.seed('illness', [cold, otitis]);
    syncServer.seed('illness_event', [
      doseIn(otitis, ibuprofen, '7,5 мл', '2026-12-01', null),
      doseIn(cold, ibuprofen, '5 мл', '2026-11-30', '23:00'),
      doseIn(cold, paracetamol, '1 таблетка', '2026-12-02', '20:00'),
      // Backfilled later, but given earlier: it doesn't change the suggestion.
      doseIn(cold, ibuprofen, '2,5 мл', '2026-11-29', '10:00'),
    ]);

    const sheet = await amountFor('Ибупрофен');

    // An untimed dose counts as 00:00 of its day: still after 30 November, 23:00.
    expect(amountField(sheet)).toHaveValue('7,5 мл');
    expect(amountField(sheet)).toHaveAccessibleDescription('как в прошлый раз');
  });

  it('goes to the dose the server got last when two have the same date and time', async () => {
    const ibuprofen = medicine('Ибупрофен');
    const cold = illnessOf({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('medicine', [ibuprofen]);
    syncServer.seed('illness', [cold]);
    syncServer.seed('illness_event', [doseIn(cold, ibuprofen, '10 мл', '2026-12-01', '22:00')]);
    syncServer.seed('illness_event', [doseIn(cold, ibuprofen, '5 мл', '2026-12-01', '22:00')]);

    const sheet = await amountFor('Ибупрофен');

    expect(amountField(sheet)).toHaveValue('5 мл');
  });

  it('follows a changed amount next time, and not a dose backfilled before it', async () => {
    const ibuprofen = medicine('Ибупрофен');
    const cold = illnessOf({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('medicine', [ibuprofen]);
    syncServer.seed('illness', [cold]);
    syncServer.seed('illness_event', [doseIn(cold, ibuprofen, '5 мл', '2026-12-02', '08:00')]);
    const user = userEvent.setup();

    let sheet = await openDoseSheetFromCard(user);
    await user.click(await within(sheet).findByRole('button', { name: 'Ибупрофен' }));
    await user.clear(amountField(sheet));
    await user.type(amountField(sheet), '7,5 мл');
    expect(amountField(sheet)).not.toHaveAccessibleDescription('как в прошлый раз');
    await done(user, sheet);

    await user.click(await screen.findByRole('button', { name: 'Добавить приём лекарства' }));
    sheet = await screen.findByRole('dialog', { name: 'Приём лекарства' });
    await user.click(within(sheet).getByRole('button', { name: 'Ибупрофен' }));
    expect(amountField(sheet)).toHaveValue('7,5 мл');
    // A dose given yesterday, logged now.
    await user.clear(amountField(sheet));
    await user.type(amountField(sheet), '2 мл');
    await user.clear(within(sheet).getByLabelText('Дата'));
    await user.type(within(sheet).getByLabelText('Дата'), '2026-12-01');
    await done(user, sheet);

    await user.click(await screen.findByRole('button', { name: 'Добавить приём лекарства' }));
    sheet = await screen.findByRole('dialog', { name: 'Приём лекарства' });
    await user.click(within(sheet).getByRole('button', { name: 'Ибупрофен' }));
    expect(amountField(sheet)).toHaveValue('7,5 мл');
  });
});

describe('Dose rows on the Illness screen', () => {
  it('read «22:00 · Ибупрофен 20 мг/мл — 5 мл · 38,5 °C», a deleted Medicine’s name included', async () => {
    const ibuprofen = medicine('Ибупрофен 20 мг/мл');
    const nurofen = medicine('Нурофен', true);
    const cold = illnessOf({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('medicine', [ibuprofen, nurofen]);
    syncServer.seed('illness', [cold]);
    syncServer.seed('illness_event', [
      doseIn(cold, ibuprofen, '5 мл', '2026-12-02', '22:00', 38.5),
      doseIn(cold, nurofen, '1 таблетка', '2026-12-02', null),
    ]);

    renderApp(`/medical/illnesses/${cold.id}`);

    const day = await screen.findByRole('region', { name: '2 декабря' });
    await waitFor(() => {
      expect(day).toHaveTextContent(
        '2 декабря' + '22:00 · Ибупрофен 20 мг/мл — 5 мл · 38,5 °C' + 'Нурофен — 1 таблетка',
        { normalizeWhitespace: false },
      );
    });
  });

  it('keep the name of a Medicine deleted in Settings, offline too', async () => {
    const ibuprofen = medicine('Ибупрофен');
    const cold = illnessOf({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('medicine', [ibuprofen]);
    syncServer.seed('illness', [cold]);
    syncServer.seed('illness_event', [doseIn(cold, ibuprofen, '5 мл', '2026-12-02', '20:00')]);
    const user = userEvent.setup();
    const first = renderApp('/settings');
    const medicines = await screen.findByRole('region', { name: 'Лекарства' });
    await within(medicines).findByRole('button', { name: 'Изменить' });
    first.unmount();
    const settings = renderApp('/settings', { offline: true });
    await user.click(
      await within(await screen.findByRole('region', { name: 'Лекарства' })).findByRole('button', {
        name: 'Изменить',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Удалить «Ибупрофен»' }));
    const confirm = screen.getByRole('dialog', { name: 'Удалить лекарство „Ибупрофен“?' });
    await user.click(within(confirm).getByRole('button', { name: 'Удалить' }));
    expect(await screen.findByText('Лекарств пока нет')).toBeInTheDocument();
    settings.unmount();

    const illness = renderApp(`/medical/illnesses/${cold.id}`, { offline: true });
    expect(await screen.findByText('20:00 · Ибупрофен — 5 мл')).toBeInTheDocument();
    illness.unmount();

    // Synced: the server keeps it, deleted, with its name.
    syncServer.goOnline();
    renderApp(`/medical/illnesses/${cold.id}`);
    await waitFor(() => {
      expect(syncServer.operations('medicine')).toHaveLength(1);
    });
    expect(await screen.findByText('20:00 · Ибупрофен — 5 мл')).toBeInTheDocument();
  });
});

describe('Offline', () => {
  it('saves a dose that adds its Medicine inline, and syncs both later', async () => {
    const user = userEvent.setup();
    const first = renderApp('/medical');
    await screen.findByRole('button', { name: 'Добавить приём лекарства' });
    first.unmount();
    renderApp('/medical', { offline: true });
    await user.click(await screen.findByRole('button', { name: 'Добавить приём лекарства' }));
    const sheet = await screen.findByRole('dialog', { name: 'Приём лекарства' });

    await user.type(medicineField(sheet), 'Ибупрофен');
    await user.type(amountField(sheet), '5 мл');
    await done(user, sheet);

    await user.click(await screen.findByRole('link', { name: /Болезнь 2 декабря 2026/ }));
    expect(await screen.findByText('22:00 · Ибупрофен — 5 мл')).toBeInTheDocument();
    expect(syncServer.operations('medicine')).toHaveLength(0);
    syncServer.goOnline();
    window.dispatchEvent(new Event('online'));
    await waitFor(() => {
      expect(syncServer.operations('illness_event')).toHaveLength(1);
    });
    const [added] = syncServer.operations('medicine');
    expect(syncServer.row('medicine', added?.id ?? '')).toMatchObject({ name: 'Ибупрофен' });
    expect(syncServer.operations('illness')).toHaveLength(1);
  });
});

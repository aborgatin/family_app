import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anna, masha, sessionHandler } from '@/test/fixtures';
import {
  doseRow,
  illnessRow,
  medicineRow,
  noteEventRow,
  selectedText,
  temperatureRow,
} from '@/test/medical';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// Working inside an Illness (spec #128, ticket #131): its name and Description, «Заметка», editing,
// moving and deleting events, and deleting the Illness.

/** «Now» in these tests: Wednesday 2 December 2026, 22:00. */
const NOW = new Date('2026-12-02T22:00:00');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
});
afterEach(() => {
  vi.useRealTimers();
});

type User = ReturnType<typeof userEvent.setup>;

/** Anna's Illness screen of `illness`, once it shows. */
async function openIllness(illness: { id: string; name: string }) {
  const app = renderApp(`/medical/illnesses/${illness.id}`);
  await screen.findByRole('heading', { level: 1, name: illness.name });
  return app;
}

function wheel(sheet: HTMLElement) {
  return within(sheet).getByRole('combobox', { name: 'Температура' });
}

async function done(user: User, sheet: HTMLElement) {
  await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
}

describe('The Illness’s name and Description', () => {
  it('are edited in place and saved', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('illness', [cold]);
    const user = userEvent.setup();
    await openIllness(cold);

    const name = screen.getByRole('textbox', { name: 'Название' });
    await user.clear(name);
    await user.type(name, 'Грипп{Enter}');
    await user.click(screen.getByRole('textbox', { name: 'Описание' }));
    await user.keyboard('Тип А, лечим дома');
    await user.tab();

    expect(await screen.findByRole('heading', { level: 1, name: 'Грипп' })).toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.row('illness', cold.id)).toMatchObject({
        name: 'Грипп',
        description: 'Тип А, лечим дома',
      });
    });
  });

  it('refuses an empty name without saving it', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('illness', [cold]);
    const user = userEvent.setup();
    await openIllness(cold);

    await user.clear(screen.getByRole('textbox', { name: 'Название' }));
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Заполните это поле')).toBeInTheDocument();
    expect(syncServer.operations('illness')).toEqual([]);
  });
});

describe('Deleting an Illness', () => {
  it('asks with the number of its events, then deletes it with them', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    const events = [1, 2, 3, 4, 5, 6].map((hour) =>
      temperatureRow(cold, '2026-12-01', `0${String(hour)}:00`, 38.0),
    );
    syncServer.seed('illness', [cold]);
    syncServer.seed('illness_event', events);
    const user = userEvent.setup();
    const app = await openIllness(cold);

    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    const question = screen.getByRole('dialog', { name: 'Удалить «ОРВИ»?' });
    expect(question).toHaveAccessibleDescription('Вместе с ней удалятся 6 событий.');
    await user.click(within(question).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(app.location()).toBe('/medical');
    });
    await waitFor(() => {
      expect(syncServer.row('illness', cold.id)).toBeUndefined();
    });
    expect(events.map(({ id }) => syncServer.row('illness_event', id))).toEqual(
      events.map(() => undefined),
    );
  });

  it('asks without a count when it has no events', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('illness', [cold]);
    const user = userEvent.setup();
    await openIllness(cold);

    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(
      screen.getByRole('dialog', { name: 'Удалить «ОРВИ»?' }),
    ).not.toHaveAccessibleDescription();
  });

  it('says «удалится 1 событие» for one', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('illness', [cold]);
    syncServer.seed('illness_event', [temperatureRow(cold, '2026-12-01', '08:00', 38.0)]);
    const user = userEvent.setup();
    await openIllness(cold);

    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(screen.getByRole('dialog', { name: 'Удалить «ОРВИ»?' })).toHaveAccessibleDescription(
      'Вместе с ней удалится 1 событие.',
    );
  });
});

describe('The Note sheet', () => {
  async function openNoteEventSheet(user: User) {
    await user.click(screen.getByRole('button', { name: 'Заметка' }));
    return screen.findByRole('dialog', { name: 'Заметка' });
  }

  it('has «Название», «Дата» today, an empty «Время» and «Описание»', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('illness', [cold]);
    const user = userEvent.setup();
    await openIllness(cold);

    const sheet = await openNoteEventSheet(user);

    expect(within(sheet).getByRole('textbox', { name: 'Название' })).toHaveValue('');
    expect(within(sheet).getByLabelText('Дата')).toHaveValue('2026-12-02');
    expect(within(sheet).getByLabelText('Время')).toHaveValue('');
    expect(within(sheet).getByRole('textbox', { name: 'Описание' })).toBeInTheDocument();
  });

  it('asks for the title without saving anything', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('illness', [cold]);
    const user = userEvent.setup();
    await openIllness(cold);

    const sheet = await openNoteEventSheet(user);
    await done(user, sheet);

    expect(within(sheet).getByText('Заполните это поле')).toBeInTheDocument();
    expect(syncServer.operations('illness_event')).toEqual([]);
  });

  it('adds a Note without a time: its title, then its day and Description', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('illness', [cold]);
    const user = userEvent.setup();
    await openIllness(cold);

    const sheet = await openNoteEventSheet(user);
    await user.type(within(sheet).getByRole('textbox', { name: 'Название' }), 'Сходили к доктору');
    await user.type(within(sheet).getByRole('textbox', { name: 'Описание' }), 'Сказал пить больше');
    await done(user, sheet);

    expect(
      await screen.findByRole('button', {
        name: /^Сходили к доктору2 декабря · Сказал пить больше$/,
      }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.operations('illness_event')[0]?.fields).toEqual({
        illnessId: cold.id,
        kind: 'NOTE',
        title: 'Сходили к доктору',
        date: '2026-12-02',
        time: null,
        description: 'Сказал пить больше',
      });
    });
  });
});

describe('The events of an Illness', () => {
  /** The text of each event row: its title, then its date line. */
  function eventRows() {
    return within(screen.getByRole('region', { name: 'События' }))
      .getAllByRole('button')
      .map((row) => row.textContent);
  }

  it('go in one list without day headers, newest first; within a day timed ones, latest first, then untimed ones', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('illness', [cold]);
    syncServer.seed('illness_event', [
      noteEventRow(cold, '2026-12-01', null, 'Вызвали врача'),
      temperatureRow(cold, '2026-12-01', '07:00', 38.0),
      { ...temperatureRow(cold, '2026-12-02', '09:30', 37.8), description: 'После сна' },
      noteEventRow(cold, '2026-12-02', '21:00', 'Купили лекарства'),
      noteEventRow(cold, '2025-12-31', '23:00', 'Чихал'),
    ]);
    await openIllness(cold);

    expect(eventRows()).toEqual([
      'Купили лекарства' + '2 декабря, 21:00',
      '37,8\u00a0°C' + '2 декабря, 09:30 · После сна',
      '38,0\u00a0°C' + '1 декабря, 07:00',
      'Вызвали врача' + '1 декабря',
      'Чихал' + '31 декабря 2025, 23:00',
    ]);
    expect(screen.queryByRole('region', { name: '2 декабря' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^37,8\u00a0°C/ })).toBeInTheDocument();
  });

  it('say «Нет событий» while there are none', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('illness', [cold]);
    await openIllness(cold);

    expect(screen.getByText('Нет событий')).toBeInTheDocument();
  });
});

describe('Editing an event', () => {
  it('opens a Temperature’s sheet with its values, and saves only what changed', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    const fever = { ...temperatureRow(cold, '2026-12-01', '08:00', 38.5), description: 'Ночью' };
    syncServer.seed('illness', [cold]);
    syncServer.seed('illness_event', [fever]);
    const user = userEvent.setup();
    await openIllness(cold);

    await user.click(screen.getByRole('button', { name: /^38,5\u00a0°C/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Температура' });
    expect(selectedText(wheel(sheet))).toBe('38,5\u00a0°C');
    expect(within(sheet).getByLabelText('Дата')).toHaveValue('2026-12-01');
    expect(within(sheet).getByLabelText('Время')).toHaveValue('08:00');
    expect(within(sheet).getByRole('textbox', { name: 'Описание' })).toHaveValue('Ночью');
    expect(within(sheet).queryByRole('combobox', { name: 'Добавить к' })).not.toBeInTheDocument();
    await user.selectOptions(wheel(sheet), '37.2');
    await user.clear(within(sheet).getByLabelText('Время'));
    await done(user, sheet);

    expect(await screen.findByRole('button', { name: /^37,2\u00a0°C/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.operations('illness_event')).toEqual([
        {
          table: 'illness_event',
          id: fever.id,
          op: 'upsert',
          fields: { temperature: 37.2, time: null },
        },
      ]);
    });
  });

  it('changes a dose’s Medicine and amount', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    const ibuprofen = medicineRow('Ибупрофен 20 мг/мл');
    const paracetamol = medicineRow('Парацетамол');
    const dose = doseRow(cold, ibuprofen, '5 мл', '2026-12-02', '21:00');
    syncServer.seed('medicine', [ibuprofen, paracetamol]);
    syncServer.seed('illness', [cold]);
    syncServer.seed('illness_event', [dose]);
    const user = userEvent.setup();
    await openIllness(cold);

    await user.click(await screen.findByRole('button', { name: /^Ибупрофен 20 мг\/мл — 5 мл/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Приём лекарства' });
    expect(within(sheet).getByRole('textbox', { name: 'Лекарство' })).toHaveValue(
      'Ибупрофен 20 мг/мл',
    );
    expect(within(sheet).getByRole('textbox', { name: 'Количество' })).toHaveValue('5 мл');
    expect(selectedText(wheel(sheet))).toBe('—');
    await user.clear(within(sheet).getByRole('textbox', { name: 'Лекарство' }));
    await user.type(within(sheet).getByRole('textbox', { name: 'Лекарство' }), 'Парацетамол');
    await user.clear(within(sheet).getByRole('textbox', { name: 'Количество' }));
    await user.type(within(sheet).getByRole('textbox', { name: 'Количество' }), '10 мл');
    await done(user, sheet);

    expect(await screen.findByRole('button', { name: /^Парацетамол — 10 мл/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.operations('illness_event')[0]?.fields).toEqual({
        medicineId: paracetamol.id,
        amount: '10 мл',
      });
    });
  });

  it('keeps a dose’s deleted Medicine when only the amount changes', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    const gone = medicineRow('Нурофен', true);
    const dose = doseRow(cold, gone, '5 мл', '2026-12-02', '21:00');
    syncServer.seed('medicine', [gone]);
    syncServer.seed('illness', [cold]);
    syncServer.seed('illness_event', [dose]);
    const user = userEvent.setup();
    await openIllness(cold);

    await user.click(await screen.findByRole('button', { name: /Нурофен — 5 мл/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Приём лекарства' });
    await user.type(
      within(sheet).getByRole('textbox', { name: 'Количество' }),
      '{Backspace}{Backspace}{Backspace}{Backspace}7 мл',
    );
    await done(user, sheet);

    await waitFor(() => {
      expect(syncServer.operations('illness_event')[0]?.fields).toEqual({ amount: '7 мл' });
    });
    expect(syncServer.operations('medicine')).toEqual([]);
  });

  it('changes a Note’s title, and refuses an empty one', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    const visit = noteEventRow(cold, '2026-12-02', null, 'Врач');
    syncServer.seed('illness', [cold]);
    syncServer.seed('illness_event', [visit]);
    const user = userEvent.setup();
    await openIllness(cold);

    await user.click(screen.getByRole('button', { name: /^Врач/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Заметка' });
    const title = within(sheet).getByRole('textbox', { name: 'Название' });
    expect(title).toHaveValue('Врач');
    expect(within(sheet).getByLabelText('Время')).toHaveValue('');
    await user.clear(title);
    await done(user, sheet);
    expect(within(sheet).getByText('Заполните это поле')).toBeInTheDocument();
    await user.type(title, 'Сходили к доктору');
    await done(user, sheet);

    expect(await screen.findByRole('button', { name: /^Сходили к доктору/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.operations('illness_event')[0]?.fields).toEqual({
        title: 'Сходили к доктору',
      });
    });
  });
});

describe('«Перенести в…»', () => {
  /** Anna's «ОРВИ» with a 38,5 °C on 1 December, and her other Illnesses. */
  function seedCard() {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    const flu = illnessRow({ memberId: anna.id }, 'Грипп');
    const ended = { ...illnessRow({ memberId: anna.id }, 'Ангина'), ended: true };
    const childs = {
      ...illnessRow({ memberId: anna.id }, 'Ветрянка'),
      memberId: null,
      childId: masha.id,
    };
    const fever = temperatureRow(cold, '2026-12-01', '08:00', 38.5);
    syncServer.seed('child', [masha]);
    syncServer.seed('illness', [cold, flu, ended, childs]);
    syncServer.seed('illness_event', [fever]);
    return { cold, flu, fever };
  }

  async function openMove(user: User) {
    await user.click(screen.getByRole('button', { name: /^38,5\u00a0°C/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Температура' });
    await user.click(within(sheet).getByRole('button', { name: 'Перенести в…' }));
    return screen.getByRole('dialog', { name: 'Перенести в…' });
  }

  it('lists the person’s other Illnesses that aren’t Ended, and «Новая болезнь»', async () => {
    const { cold } = seedCard();
    const user = userEvent.setup();
    await openIllness(cold);

    const choices = await openMove(user);

    expect(
      within(choices)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Грипп', 'Новая болезнь', 'Отменить']);
  });

  it('moves the event to another Illness', async () => {
    const { cold, flu, fever } = seedCard();
    const user = userEvent.setup();
    await openIllness(cold);

    await user.click(within(await openMove(user)).getByRole('button', { name: 'Грипп' }));

    await waitFor(() => {
      expect(screen.queryByText(/38,5 °C/)).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.row('illness_event', fever.id)).toMatchObject({ illnessId: flu.id });
    });
    expect(syncServer.operations('illness_event')[0]?.fields).toEqual({ illnessId: flu.id });
  });

  it('moves the event to a new Illness named after its date', async () => {
    const { cold, fever } = seedCard();
    const user = userEvent.setup();
    await openIllness(cold);

    await user.click(within(await openMove(user)).getByRole('button', { name: 'Новая болезнь' }));

    await waitFor(() => {
      expect(syncServer.operations('illness')).toHaveLength(1);
    });
    const created = syncServer.operations('illness')[0];
    expect(created?.fields).toEqual({
      memberId: anna.id,
      kind: 'ILLNESS',
      name: 'Болезнь 1 декабря 2026',
    });
    await waitFor(() => {
      expect(syncServer.row('illness_event', fever.id)).toMatchObject({ illnessId: created?.id });
    });
    await user.click(screen.getByRole('link', { name: 'Медкарта' }));
    expect(
      await screen.findByRole('link', { name: /Болезнь 1 декабря 2026.*1 событие/ }),
    ).toBeInTheDocument();
  });
});

describe('Deleting an event', () => {
  it('asks, then deletes it; the Illness left empty stays', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    const fever = temperatureRow(cold, '2026-12-01', '08:00', 38.5);
    syncServer.seed('illness', [cold]);
    syncServer.seed('illness_event', [fever]);
    const user = userEvent.setup();
    await openIllness(cold);

    await user.click(screen.getByRole('button', { name: /^38,5\u00a0°C/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Температура' });
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));
    const question = screen.getByRole('dialog', { name: 'Удалить событие?' });
    await user.click(within(question).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByText(/38,5 °C/)).not.toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 1, name: 'ОРВИ' })).toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.row('illness_event', fever.id)).toBeUndefined();
    });
    expect(syncServer.row('illness', cold.id)).toBeDefined();

    await user.click(screen.getByRole('link', { name: 'Медкарта' }));
    expect(await screen.findByRole('link', { name: /ОРВИ.*Нет событий/ })).toBeInTheDocument();
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anna, sessionHandler } from '@/test/fixtures';
import { conditionRow, ended, illnessRow, selectedText, temperatureRow } from '@/test/medical';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// Ended, and Diagnoses/observations (spec #128, ticket #132): «Завершить» and «Возобновить», the
// collapsed «Завершённые», Conditions in «Диагнозы/наблюдения», and the kind switch.

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

const me = { memberId: anna.id };

async function annasCard() {
  const app = renderApp('/medical');
  await screen.findByRole('heading', { level: 1, name: 'Медкарта' });
  return app;
}

async function openIllness(illness: { id: string; name: string }) {
  const app = renderApp(`/medical/illnesses/${illness.id}`);
  await screen.findByRole('heading', { level: 1, name: illness.name });
  return app;
}

/** The text of each row (link) of the card's section `name`. */
async function rowsOf(name: string) {
  const section = await screen.findByRole('region', { name });
  return within(section)
    .queryAllByRole('link')
    .map((row) => row.textContent);
}

describe('The card’s sections', () => {
  it('go: the buttons, «Диагнозы/наблюдения», «Болезни», then a collapsed «Завершённые»', async () => {
    const vision = conditionRow(me, 'Зрение', 1);
    const cold = illnessRow(me, 'ОРВИ');
    const angina = ended(illnessRow(me, 'Ангина'));
    syncServer.seed('illness', [angina, cold, vision]);
    const user = userEvent.setup();
    await annasCard();
    await screen.findByText('Зрение');

    const headers = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headers).toEqual(['Диагнозы/наблюдения', 'Болезни', 'Завершённые']);
    expect(await rowsOf('Диагнозы/наблюдения')).toEqual(['ЗрениеНет событий']);
    expect(await rowsOf('Болезни')).toEqual(['ОРВИНет событий']);
    expect(await rowsOf('Завершённые')).toEqual([]);

    const show = screen.getByRole('button', { name: 'Показать' });
    expect(show).toHaveAttribute('aria-expanded', 'false');
    await user.click(show);

    expect(await rowsOf('Завершённые')).toEqual(['АнгинаНет событий']);
    expect(screen.getByRole('button', { name: 'Скрыть' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('has no «Завершённые» while nothing is Ended', async () => {
    syncServer.seed('illness', [illnessRow(me, 'ОРВИ')]);
    await annasCard();
    await screen.findByText('ОРВИ');

    expect(screen.queryByRole('region', { name: 'Завершённые' })).not.toBeInTheDocument();
  });

  it('lists the Ended ones of both kinds together, by latest event, newest first', async () => {
    const angina = ended(illnessRow(me, 'Ангина'));
    const teeth = ended(conditionRow(me, 'Зубы', 1));
    const flu = ended(illnessRow(me, 'Грипп'));
    syncServer.seed('illness', [angina, teeth, flu]);
    syncServer.seed('illness_event', [
      temperatureRow(angina, '2026-10-01', '08:00', 38.0),
      temperatureRow(teeth, '2026-11-03', null, 36.6),
      temperatureRow(flu, '2025-03-01', '08:00', 39.0),
      temperatureRow(flu, '2025-03-02', '08:00', 38.0),
    ]);
    const user = userEvent.setup();
    await annasCard();
    await user.click(await screen.findByRole('button', { name: 'Показать' }));

    expect(await rowsOf('Завершённые')).toEqual([
      'Зубыпоследнее: 3 ноября',
      'Ангинас 1 октября · 1 событие',
      'Гриппс 1 марта 2025 · 2 события',
    ]);
  });
});

describe('«Диагнозы/наблюдения» on the card', () => {
  it('shows each Condition by its place, with «последнее: …», the year only when not this year', async () => {
    const teeth = conditionRow(me, 'Зубы', 2);
    const vision = conditionRow(me, 'Зрение', 1);
    const asthma = conditionRow(me, 'Астма', 3);
    syncServer.seed('illness', [teeth, vision, asthma]);
    syncServer.seed('illness_event', [
      temperatureRow(teeth, '2026-03-03', '10:00', 36.6),
      temperatureRow(teeth, '2026-01-10', null, 36.6),
      temperatureRow(asthma, '2025-05-20', null, 37.0),
    ]);
    await annasCard();

    await waitFor(async () => {
      expect(await rowsOf('Диагнозы/наблюдения')).toEqual([
        'ЗрениеНет событий',
        'Зубыпоследнее: 3 марта',
        'Астмапоследнее: 20 мая 2025',
      ]);
    });
  });

  it('adds a Condition by hand with «+ Добавить», last', async () => {
    const vision = conditionRow(me, 'Зрение', 1);
    syncServer.seed('illness', [vision]);
    const user = userEvent.setup();
    await annasCard();
    await screen.findByText('Зрение');

    await user.click(screen.getByRole('button', { name: '+ Добавить' }));
    const sheet = await screen.findByRole('dialog', { name: 'Диагноз/наблюдение' });
    const name = within(sheet).getByRole('textbox', { name: 'Название' });
    expect(name).toHaveAttribute('placeholder', 'Например: Астма, Зрение, Зубы');
    await user.type(name, '  Астма ');
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await waitFor(async () => {
      expect(await rowsOf('Диагнозы/наблюдения')).toEqual([
        'ЗрениеНет событий',
        'АстмаНет событий',
      ]);
    });
    await waitFor(() => {
      expect(syncServer.operations('illness')).toHaveLength(1);
    });
    expect(syncServer.operations('illness')[0]?.fields).toEqual({
      memberId: anna.id,
      kind: 'CONDITION',
      name: 'Астма',
      position: 2,
    });
  });

  it('asks for the name without saving anything', async () => {
    const user = userEvent.setup();
    await annasCard();

    await user.click(await screen.findByRole('button', { name: '+ Добавить' }));
    const sheet = await screen.findByRole('dialog', { name: 'Диагноз/наблюдение' });
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(await within(sheet).findByText('Заполните это поле')).toBeInTheDocument();
    expect(syncServer.operations('illness')).toEqual([]);
  });
});

describe('Reordering Conditions', () => {
  // jsdom has no layout: lay the list out as a column of 44px rows, as the Child fields tests do.
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const role = this.getAttribute('role');
      if (role === 'list') {
        return DOMRect.fromRect({ x: 0, y: 0, width: 390, height: this.children.length * 44 });
      }
      if (role !== 'listitem') return new DOMRect();
      const top = [...(this.parentElement?.children ?? [])].indexOf(this) * 44;
      return DOMRect.fromRect({ x: 0, y: top, width: 390, height: 44 });
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('moves a Condition with the drag handle in «Изменить», sending only its position', async () => {
    const vision = conditionRow(me, 'Зрение', 1);
    const teeth = conditionRow(me, 'Зубы', 2);
    const asthma = conditionRow(me, 'Астма', 3);
    syncServer.seed('illness', [vision, teeth, asthma]);
    const user = userEvent.setup();
    await annasCard();
    await screen.findByText('Астма');

    const section = screen.getByRole('region', { name: 'Диагнозы/наблюдения' });
    expect(within(section).queryByRole('button', { name: 'Переместить «Астма»' })).toBeNull();
    await user.click(within(section).getByRole('button', { name: 'Изменить' }));
    within(section).getByRole('button', { name: 'Переместить «Астма»' }).focus();
    await user.keyboard('[Space][ArrowUp][Space]');

    await waitFor(() => {
      expect(syncServer.operations('illness')).toEqual([
        { table: 'illness', id: asthma.id, op: 'upsert', fields: { position: 1.5 } },
      ]);
    });
    await user.click(within(section).getByRole('button', { name: 'Готово' }));
    expect(await rowsOf('Диагнозы/наблюдения')).toEqual([
      'ЗрениеНет событий',
      'АстмаНет событий',
      'ЗубыНет событий',
    ]);
  });
});

describe('Ending and resuming', () => {
  it('«Завершить» moves an Illness to «Завершённые», and «Возобновить» brings it back', async () => {
    const cold = illnessRow(me, 'ОРВИ');
    syncServer.seed('illness', [cold]);
    syncServer.seed('illness_event', [temperatureRow(cold, '2026-12-01', '08:00', 38.0)]);
    const user = userEvent.setup();
    await openIllness(cold);

    await user.click(screen.getByRole('button', { name: 'Завершить' }));
    expect(await screen.findByRole('button', { name: 'Возобновить' })).toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.row('illness', cold.id)).toMatchObject({ ended: true });
    });
    expect(syncServer.operations('illness')[0]?.fields).toEqual({ ended: true });

    await user.click(screen.getByRole('link', { name: 'Медкарта' }));
    expect(await rowsOf('Болезни')).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Показать' }));
    await user.click(await screen.findByRole('link', { name: /ОРВИ/ }));

    await user.click(await screen.findByRole('button', { name: 'Возобновить' }));
    await waitFor(() => {
      expect(syncServer.row('illness', cold.id)).toMatchObject({ ended: false });
    });
    await user.click(screen.getByRole('link', { name: 'Медкарта' }));
    expect(await rowsOf('Болезни')).toEqual(['ОРВИс 1 декабря · 1 событие']);
    expect(screen.queryByRole('region', { name: 'Завершённые' })).not.toBeInTheDocument();
  });

  it('keeps an Ended one fully editable: new events, edits and moves, its events untouched', async () => {
    const angina = ended(illnessRow(me, 'Ангина'));
    const flu = illnessRow(me, 'Грипп');
    const fever = temperatureRow(angina, '2026-11-20', '08:00', 38.5);
    syncServer.seed('illness', [angina, flu]);
    syncServer.seed('illness_event', [fever]);
    const user = userEvent.setup();
    await openIllness(angina);

    const name = screen.getByRole('textbox', { name: 'Название' });
    await user.clear(name);
    await user.type(name, 'Тонзиллит{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Тонзиллит' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Заметка' }));
    const newEvent = await screen.findByRole('dialog', { name: 'Заметка' });
    await user.type(within(newEvent).getByRole('textbox', { name: 'Название' }), 'Анализы готовы');
    await user.click(within(newEvent).getByRole('button', { name: 'Готово' }));
    expect(await screen.findByRole('button', { name: /Анализы готовы/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /08:00 · 38,5 °C/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Температура' });
    await user.click(within(sheet).getByRole('button', { name: 'Перенести в…' }));
    const choices = screen.getByRole('dialog', { name: 'Перенести в…' });
    await user.click(within(choices).getByRole('button', { name: 'Грипп' }));

    await waitFor(() => {
      expect(syncServer.row('illness_event', fever.id)).toMatchObject({ illnessId: flu.id });
    });
    expect(syncServer.row('illness', angina.id)).toMatchObject({
      name: 'Тонзиллит',
      ended: true,
    });
    const added = syncServer.operations('illness_event').find(({ id }) => id !== fever.id);
    expect(syncServer.row('illness_event', added?.id ?? '')).toMatchObject({
      illnessId: angina.id,
      title: 'Анализы готовы',
    });
  });
});

describe('The kind switch', () => {
  it('turns an Illness into a Condition, last among them, and back', async () => {
    const vision = conditionRow(me, 'Зрение', 4);
    const otitis = illnessRow(me, 'Отит');
    syncServer.seed('illness', [vision, otitis]);
    syncServer.seed('illness_event', [temperatureRow(otitis, '2026-11-20', '08:00', 38.0)]);
    const user = userEvent.setup();
    await openIllness(otitis);
    expect(screen.getByText('с 20 ноября 2026')).toBeInTheDocument();

    const kind = screen.getByRole('radiogroup', { name: 'Тип' });
    expect(within(kind).getByRole('radio', { name: 'Болезнь' })).toBeChecked();
    await user.click(within(kind).getByRole('radio', { name: 'Диагноз/наблюдение' }));

    await waitFor(() => {
      expect(syncServer.row('illness', otitis.id)).toMatchObject({
        kind: 'CONDITION',
        position: 5,
      });
    });
    // A Condition shows no start date.
    expect(screen.queryByText('с 20 ноября 2026')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Медкарта' }));
    expect(await rowsOf('Диагнозы/наблюдения')).toEqual([
      'ЗрениеНет событий',
      'Отитпоследнее: 20 ноября',
    ]);
    expect(await rowsOf('Болезни')).toEqual([]);

    await user.click(screen.getByRole('link', { name: /Отит/ }));
    await user.click(
      within(await screen.findByRole('radiogroup', { name: 'Тип' })).getByRole('radio', {
        name: 'Болезнь',
      }),
    );
    await waitFor(() => {
      expect(syncServer.row('illness', otitis.id)).toMatchObject({ kind: 'ILLNESS' });
    });
    await user.click(screen.getByRole('link', { name: 'Медкарта' }));
    expect(await rowsOf('Болезни')).toEqual(['Отитс 20 ноября · 1 событие']);
  });
});

describe('«Добавить к» and «Перенести в…» with Conditions and Ended ones', () => {
  async function openTemperatureSheet(user: User) {
    await user.click(await screen.findByRole('button', { name: 'Записать температуру' }));
    return screen.findByRole('dialog', { name: 'Температура' });
  }

  it('never preselects a recent Condition', async () => {
    const asthma = conditionRow(me, 'Астма', 1);
    syncServer.seed('illness', [asthma]);
    syncServer.seed('illness_event', [temperatureRow(asthma, '2026-12-02', '20:00', 37.0)]);
    const user = userEvent.setup();
    await annasCard();
    await screen.findByText('Астма');

    const sheet = await openTemperatureSheet(user);
    expect(selectedText(within(sheet).getByRole('combobox', { name: 'Добавить к' }))).toBe(
      'Новая болезнь',
    );
  });

  it('never preselects a recent Ended Illness', async () => {
    const angina = ended(illnessRow(me, 'Ангина'));
    syncServer.seed('illness', [angina]);
    syncServer.seed('illness_event', [temperatureRow(angina, '2026-12-02', '20:00', 38.0)]);
    const user = userEvent.setup();
    await annasCard();

    const sheet = await openTemperatureSheet(user);
    const addTo = within(sheet).getByRole('combobox', { name: 'Добавить к' });
    expect(selectedText(addTo)).toBe('Новая болезнь');
    expect(within(addTo).queryByRole('option', { name: 'Другая…' })).toBeNull();
  });

  it('«Другая…» lists every Illness and Condition that isn’t Ended', async () => {
    const cold = illnessRow(me, 'ОРВИ');
    const asthma = conditionRow(me, 'Астма', 1);
    const teeth = ended(conditionRow(me, 'Зубы', 2));
    const angina = ended(illnessRow(me, 'Ангина'));
    syncServer.seed('illness', [cold, asthma, teeth, angina]);
    syncServer.seed('illness_event', [temperatureRow(cold, '2026-12-02', '08:00', 38.0)]);
    const user = userEvent.setup();
    await annasCard();
    await screen.findByText('Астма');

    const sheet = await openTemperatureSheet(user);
    await user.selectOptions(
      within(sheet).getByRole('combobox', { name: 'Добавить к' }),
      'Другая…',
    );
    const other = within(sheet).getByRole('combobox', { name: 'Болезнь' });
    expect(
      within(other)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Астма']);
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await waitFor(() => {
      expect(syncServer.operations('illness_event')[0]?.fields).toMatchObject({
        illnessId: asthma.id,
      });
    });
  });

  it('«Перенести в…» offers Conditions too', async () => {
    const cold = illnessRow(me, 'ОРВИ');
    const asthma = conditionRow(me, 'Астма', 1);
    const teeth = ended(conditionRow(me, 'Зубы', 2));
    syncServer.seed('illness', [cold, asthma, teeth]);
    syncServer.seed('illness_event', [temperatureRow(cold, '2026-12-01', '08:00', 38.5)]);
    const user = userEvent.setup();
    await openIllness(cold);

    await user.click(screen.getByRole('button', { name: /08:00 · 38,5 °C/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Температура' });
    await user.click(within(sheet).getByRole('button', { name: 'Перенести в…' }));

    expect(
      within(screen.getByRole('dialog', { name: 'Перенести в…' }))
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Астма', 'Новая болезнь', 'Отменить']);
  });
});

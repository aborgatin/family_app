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
import {
  documentRow,
  documentsServer,
  illnessRow,
  medicineRow,
  noteEventRow,
  temperatureRow,
} from '@/test/medical';
import { FakeEventSource } from '@/test/eventSource';
import { network } from '@/test/network';
import { upgradeStoreFrom } from '@/test/olderStore';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// Documents on Illness events (spec #128, ticket #134): «Документ» in the dose, Temperature and
// Note sheets, a paperclip on an event's row, «Документы (n)» of an Illness, the Illness's name on the
// card's Documents, and an event's Document going with it when it is deleted or moved.

/** «Now» in these tests: Wednesday 2 December 2026, 22:00. */
const NOW = new Date('2026-12-02T22:00:00');
const PDF_BYTES = new TextEncoder().encode('%PDF-1.7 Анализ крови');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
  server.use(membersHandler([anna, boris]));
  server.use(invitesHandler([]));
});
afterEach(() => {
  vi.useRealTimers();
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

type User = ReturnType<typeof userEvent.setup>;

function pdf(name = 'Анализ крови.pdf') {
  return new File([PDF_BYTES], name, { type: 'application/pdf' });
}

/** Anna's Illness screen of `illness`, once it shows. */
async function openIllness(illness: { id: string; name: string }) {
  const app = renderApp(`/medical/illnesses/${illness.id}`);
  await screen.findByRole('heading', { level: 1, name: illness.name });
  return app;
}

async function openSheet(user: User, row: string, title: string) {
  await user.click(await screen.findByRole('button', { name: row }));
  return screen.findByRole('dialog', { name: title });
}

async function done(user: User, sheet: HTMLElement) {
  await user.click(within(sheet).getByRole('button', { name: 'Готово' }));
}

async function closed() {
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
}

describe('«Документ» in the event sheets', () => {
  it('uploads the file with the new Temperature, once the Temperature is on the server', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('illness', [cold]);
    const documents = documentsServer();
    const user = userEvent.setup();
    await openIllness(cold);
    const sheet = await openSheet(user, 'Температура', 'Температура');

    await user.upload(within(sheet).getByLabelText('Документ'), pdf());
    expect(within(sheet).getByLabelText('Документ').closest('label')).toHaveTextContent(
      'Анализ крови.pdf',
    );
    await done(user, sheet);

    await closed();
    const [event] = syncServer.operations('illness_event');
    expect(documents.uploads).toHaveLength(1);
    const upload = documents.uploads[0];
    expect(upload?.get('illnessEventId')).toBe(event?.id);
    expect(upload?.get('memberId')).toBe(anna.id);
    expect(upload?.get('title')).toBe('Анализ крови');
    expect(upload?.get('date')).toBe('2026-12-02');
    expect(upload?.get('replaces')).toBeUndefined();
    await waitFor(() => {
      expect(syncServer.rows('document')).toMatchObject([{ illnessEventId: event?.id }]);
    });
  });

  it('attaches to a dose logged from the card into a new Illness', async () => {
    syncServer.seed('child', [masha]);
    const ibuprofen = medicineRow('Ибупрофен');
    syncServer.seed('medicine', [ibuprofen]);
    const documents = documentsServer();
    const user = userEvent.setup();
    renderApp(`/children/${masha.id}/medical`);
    await screen.findByRole('heading', { level: 1, name: 'Медкарта' });
    const sheet = await openSheet(user, 'Добавить приём лекарства', 'Приём лекарства');

    await user.type(within(sheet).getByRole('textbox', { name: 'Лекарство' }), 'Ибупрофен');
    await user.type(within(sheet).getByRole('textbox', { name: 'Количество' }), '5 мл');
    await user.upload(within(sheet).getByLabelText('Документ'), pdf('Рецепт.pdf'));
    await done(user, sheet);

    await closed();
    const [event] = syncServer.operations('illness_event');
    expect(documents.uploads[0]?.get('illnessEventId')).toBe(event?.id);
    expect(documents.uploads[0]?.get('childId')).toBe(masha.id);
    expect(documents.uploads[0]?.get('title')).toBe('Рецепт');
  });

  it('attaches to a Note', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('illness', [cold]);
    const documents = documentsServer();
    const user = userEvent.setup();
    await openIllness(cold);
    const sheet = await openSheet(user, 'Заметка', 'Заметка');

    await user.type(within(sheet).getByRole('textbox', { name: 'Название' }), 'Сходили к доктору');
    await user.upload(within(sheet).getByLabelText('Документ'), pdf('Заключение.pdf'));
    await done(user, sheet);

    await closed();
    const [event] = syncServer.operations('illness_event');
    expect(documents.uploads[0]?.get('illnessEventId')).toBe(event?.id);
    expect(documents.uploads[0]?.get('title')).toBe('Заключение');
  });

  it('offline saves the event, says the file needs the internet, and attaches it once online', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    syncServer.seed('illness', [cold]);
    const documents = documentsServer();
    const user = userEvent.setup();
    await openIllness(cold);
    const sheet = await openSheet(user, 'Температура', 'Температура');
    await user.upload(within(sheet).getByLabelText('Документ'), pdf());
    network.goOffline();

    await done(user, sheet);

    expect(
      await within(sheet).findByText('Нужен интернет, чтобы прикрепить файл'),
    ).toBeInTheDocument();
    expect(documents.uploads).toHaveLength(0);
    // Behind the sheet: the Illness screen lists the saved Temperature.
    expect(
      await screen.findByRole('button', { name: /^37,0\u00a0°C/, hidden: true }),
    ).toBeInTheDocument();

    network.goOnline();
    await done(user, sheet);

    await closed();
    expect(documents.uploads).toHaveLength(1);
    expect(syncServer.rows('illness_event')).toHaveLength(1);
    expect(documents.uploads[0]?.get('illnessEventId')).toBe(
      syncServer.rows('illness_event')[0]?.id,
    );
  });

  it('attaching again after offline keeps the one new Illness the event went into', async () => {
    const documents = documentsServer();
    const user = userEvent.setup();
    renderApp('/medical');
    const sheet = await openSheet(user, 'Записать температуру', 'Температура');
    await user.upload(within(sheet).getByLabelText('Документ'), pdf());
    network.goOffline();
    await done(user, sheet);
    await within(sheet).findByText('Нужен интернет, чтобы прикрепить файл');

    network.goOnline();
    await done(user, sheet);

    await closed();
    expect(syncServer.rows('illness')).toMatchObject([{ name: 'Болезнь 2 декабря 2026' }]);
    expect(syncServer.rows('illness_event')).toHaveLength(1);
    expect(documents.uploads).toHaveLength(1);
  });

  it('replaces the Document an event carries, and the old one goes', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    const fever = temperatureRow(cold, '2026-12-02', '20:00', 38.5);
    const old = {
      ...documentRow({ memberId: anna.id }, 'Анализ', '2026-12-02'),
      illnessEventId: fever.id,
    };
    syncServer.seed('illness', [cold]);
    syncServer.seed('illness_event', [fever]);
    syncServer.seed('document', [old]);
    const documents = documentsServer();
    const user = userEvent.setup();
    await openIllness(cold);
    await user.click(screen.getByRole('button', { name: /^38,5\u00a0°C/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Температура' });
    expect(within(sheet).getByRole('link', { name: 'Открыть «Анализ»' })).toBeInTheDocument();

    await user.upload(within(sheet).getByLabelText('Заменить файл'), pdf('Новый анализ.pdf'));
    await done(user, sheet);

    await closed();
    expect(documents.uploads[0]?.get('replaces')).toBe(old.id);
    expect(syncServer.row('document', old.id)).toBeUndefined();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Документы (1)' })).toBeInTheDocument();
    });
  });
});

/** A Document on Anna's card that the event carries. */
function documentOf(event: { id: string }, title: string, date = '2026-12-02') {
  return { ...documentRow({ memberId: anna.id }, title, date), illnessEventId: event.id };
}

/** Anna's «ОРВИ» with two Temperatures, the first carrying «Анализ крови». */
function orviWithADocument() {
  const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
  const fever = temperatureRow(cold, '2026-12-02', '20:00', 38.5);
  const later = temperatureRow(cold, '2026-12-02', '21:00', 38.0);
  const analysis = documentOf(fever, 'Анализ крови');
  syncServer.seed('illness', [cold]);
  syncServer.seed('illness_event', [fever, later]);
  syncServer.seed('document', [analysis]);
  return { cold, analysis };
}

describe('The paperclip on an event’s row', () => {
  it('marks the events carrying a Document, and opens the file', async () => {
    const { cold, analysis } = orviWithADocument();
    const documents = documentsServer();
    documents.keep(analysis, PDF_BYTES);
    const user = userEvent.setup();
    const app = await openIllness(cold);

    const opener = await screen.findByRole('link', { name: 'Открыть «Анализ крови»' });
    expect(screen.getAllByRole('link', { name: /^Открыть/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^38,5\u00a0°C/ })).not.toContainElement(opener);
    await user.click(opener);

    expect(app.location()).toBe(`/medical/illnesses/${cold.id}/documents/${analysis.id}`);
    await waitFor(() => {
      expect(documents.fileRequests).toEqual([analysis.id]);
    });
  });

  it('goes back to the Illness it was opened from', async () => {
    const { cold, analysis } = orviWithADocument();
    documentsServer().keep(analysis, PDF_BYTES);
    const user = userEvent.setup();
    const app = await openIllness(cold);

    await user.click(await screen.findByRole('link', { name: 'Открыть «Анализ крови»' }));
    await screen.findByRole('heading', { level: 1, name: 'Анализ крови' });
    await user.click(within(screen.getByRole('banner')).getByRole('link', { name: 'ОРВИ' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'ОРВИ' })).toBeInTheDocument();
    expect(app.location()).toBe(`/medical/illnesses/${cold.id}`);
  });
});

describe('The Document in an event’s sheet', () => {
  it('opens from its name, and the Illness is where back goes', async () => {
    const { cold, analysis } = orviWithADocument();
    const documents = documentsServer();
    documents.keep(analysis, PDF_BYTES);
    const user = userEvent.setup();
    const app = await openIllness(cold);
    await user.click(screen.getByRole('button', { name: /^38,5\u00a0°C/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Температура' });

    await user.click(within(sheet).getByRole('link', { name: 'Открыть «Анализ крови»' }));

    expect(app.location()).toBe(`/medical/illnesses/${cold.id}/documents/${analysis.id}`);
    expect(screen.queryByRole('dialog', { name: 'Температура' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(documents.fileRequests).toEqual([analysis.id]);
    });
    await user.click(within(screen.getByRole('banner')).getByRole('link', { name: 'ОРВИ' }));
    expect(app.location()).toBe(`/medical/illnesses/${cold.id}`);
  });

  it('is chosen with «Документ» while the event has none', async () => {
    const { cold } = orviWithADocument();
    documentsServer();
    const user = userEvent.setup();
    await openIllness(cold);
    await user.click(screen.getByRole('button', { name: /^38,0\u00a0°C/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Температура' });

    expect(within(sheet).getByLabelText('Документ')).toBeInTheDocument();
    expect(within(sheet).queryByRole('link', { name: /^Открыть/ })).not.toBeInTheDocument();
  });
});

describe('«Документы (n)» of an Illness', () => {
  it('lists only its events’ Documents, back to the Illness', async () => {
    const { cold } = orviWithADocument();
    const flu = illnessRow({ memberId: anna.id }, 'Грипп');
    const fluFever = temperatureRow(flu, '2026-11-10', '08:00', 39.0);
    syncServer.seed('illness', [flu]);
    syncServer.seed('illness_event', [fluFever]);
    syncServer.seed('document', [
      documentOf(fluFever, 'Рецепт', '2026-11-10'),
      documentRow({ memberId: anna.id }, 'Флюорография', '2026-10-10'),
    ]);
    const user = userEvent.setup();
    const app = await openIllness(cold);

    await user.click(await screen.findByRole('link', { name: 'Документы (1)' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Документы' })).toBeInTheDocument();
    expect(app.location()).toBe(`/medical/illnesses/${cold.id}/documents`);
    expect(within(screen.getByRole('banner')).getAllByRole('link')[0]).toHaveAccessibleName('ОРВИ');
    const section = screen.getByRole('region', { name: 'Документы' });
    expect(
      within(section)
        .getAllByRole('link')
        .map((row) => row.textContent),
    ).toEqual(['Анализ крови2 декабря']);
    expect(screen.queryByRole('button', { name: '+ Документ' })).not.toBeInTheDocument();
  });
});

describe('The card’s Documents screen', () => {
  it('names the Illness or Condition a Document belongs to', async () => {
    orviWithADocument();
    syncServer.seed('document', [documentRow({ memberId: anna.id }, 'Флюорография', '2026-10-10')]);
    documentsServer();

    renderApp('/medical/documents');

    const section = await screen.findByRole('region', { name: 'Документы' });
    await waitFor(() => {
      expect(
        within(section)
          .getAllByRole('link')
          .map((row) => row.textContent),
      ).toEqual(['Анализ крови2 декабря · ОРВИ', 'Флюорография10 октября']);
    });
  });
});

describe('Deleting', () => {
  it('asks with the number of Documents that go with the Illness', async () => {
    const { cold } = orviWithADocument();
    const user = userEvent.setup();
    const app = await openIllness(cold);

    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    const question = screen.getByRole('dialog', { name: 'Удалить «ОРВИ»?' });
    expect(question).toHaveAccessibleDescription('Вместе с ней удалятся 2 события и 1 документ.');
    await user.click(within(question).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(app.location()).toBe('/medical');
    });
    expect(await screen.findByRole('link', { name: 'Документы (0)' })).toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.rows('document')).toEqual([]);
    });
  });

  it('takes an event’s Document with the event', async () => {
    const { cold } = orviWithADocument();
    const user = userEvent.setup();
    await openIllness(cold);

    await user.click(screen.getByRole('button', { name: /^38,5\u00a0°C/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Температура' });
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Удалить событие?' })).getByRole('button', {
        name: 'Удалить',
      }),
    );

    expect(await screen.findByRole('link', { name: 'Документы (0)' })).toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.rows('document')).toEqual([]);
    });
  });
});

describe('Deleting offline', () => {
  it('takes the Documents off this device at once', async () => {
    const { cold } = orviWithADocument();
    const user = userEvent.setup();
    await openIllness(cold);
    await screen.findByRole('link', { name: 'Документы (1)' });
    network.goOffline();

    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Удалить «ОРВИ»?' })).getByRole('button', {
        name: 'Удалить',
      }),
    );

    expect(await screen.findByRole('link', { name: 'Документы (0)' })).toBeInTheDocument();
  });
});

describe('The local store', () => {
  it('upgrades a version 8 store: its unsent change is still sent, and an Illness deleted on the server takes its events’ Documents', async () => {
    const { cold } = orviWithADocument();
    const visit = noteEventRow(cold, '2026-12-02', null, 'Сходили к доктору');
    await upgradeStoreFrom(8, async (older) => {
      await older.table('outbox').add({
        table: 'illness_event',
        id: visit.id,
        op: 'upsert',
        fields: { illnessId: cold.id, kind: 'NOTE', date: visit.date, title: visit.title },
        creates: true,
      });
    });
    renderApp('/medical');
    expect(await screen.findByRole('link', { name: 'Документы (1)' })).toBeInTheDocument();
    await waitFor(() => {
      expect(syncServer.row('illness_event', visit.id)).toMatchObject({
        title: 'Сходили к доктору',
      });
    });

    // Boris deletes «ОРВИ»; the server announces it.
    await waitFor(() => {
      expect(FakeEventSource.instances).not.toHaveLength(0);
    });
    const sse = FakeEventSource.latest();
    sse.open();
    syncServer.change('illness', cold.id, 'deleted');
    sse.emit('changed', JSON.stringify({ version: syncServer.latestVersion }));

    expect(await screen.findByRole('link', { name: 'Документы (0)' })).toBeInTheDocument();
  });
});

describe('«Перенести в…»', () => {
  it('moves the event’s Document with it', async () => {
    const { cold } = orviWithADocument();
    const flu = illnessRow({ memberId: anna.id }, 'Грипп');
    syncServer.seed('illness', [flu]);
    const user = userEvent.setup();
    await openIllness(cold);

    await user.click(screen.getByRole('button', { name: /^38,5\u00a0°C/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Температура' });
    await user.click(within(sheet).getByRole('button', { name: 'Перенести в…' }));
    await user.click(await screen.findByRole('button', { name: 'Грипп' }));

    expect(await screen.findByRole('link', { name: 'Документы (0)' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Медкарта' }));
    await user.click(await screen.findByRole('link', { name: /^Грипп/ }));
    expect(await screen.findByRole('link', { name: 'Документы (1)' })).toBeInTheDocument();
  });
});

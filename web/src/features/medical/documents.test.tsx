import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeCaches } from '@/test/cacheStorage';
import {
  anna,
  boris,
  invitesHandler,
  masha,
  membersHandler,
  sessionHandler,
} from '@/test/fixtures';
import { documentRow, documentsServer, illnessRow } from '@/test/medical';
import { network } from '@/test/network';
import { upgradeStoreFrom } from '@/test/olderStore';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// Documents on a Medical card (spec #128, ticket #133): «Документы (n)» on the card opens the
// Documents screen, «+ Документ» uploads a PDF or photo (online only), and a Document opens full
// screen, from the device's file cache once it has been opened.

/** «Now» in these tests: Wednesday 2 December 2026, 22:00. */
const NOW = new Date('2026-12-02T22:00:00');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PDF_BYTES = new TextEncoder().encode('%PDF-1.7 Анализ крови');
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
/** The Cache Storage cache opened files are kept in. */
const FILE_CACHE = 'family-app-documents';

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

function pdf(name = 'Анализ крови.pdf', bytes: Uint8Array<ArrayBuffer> = PDF_BYTES) {
  return new File([bytes], name, { type: 'application/pdf' });
}

async function documentsTitle() {
  return screen.findByRole('heading', { level: 1, name: 'Документы' });
}

/** The Documents listed, top to bottom: each row's text. */
async function documentRows() {
  const section = await screen.findByRole('region', { name: 'Документы' });
  return within(section)
    .queryAllByRole('link')
    .map((row) => row.textContent);
}

async function openNewDocumentSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '+ Документ' }));
  return screen.findByRole('dialog', { name: 'Документ' });
}

describe('«Документы (n)» on the card', () => {
  it('counts the card’s Documents and opens the Documents screen, newest first', async () => {
    syncServer.seed('child', [masha]);
    syncServer.seed('document', [
      documentRow({ childId: masha.id }, 'Анализ крови', '2026-11-20'),
      documentRow({ childId: masha.id }, 'Выписка', '2026-12-01'),
      documentRow({ childId: masha.id }, 'Справка в сад', '2025-09-01'),
      documentRow({ memberId: anna.id }, 'Флюорография', '2026-10-10'),
    ]);
    const user = userEvent.setup();
    const app = renderApp(`/children/${masha.id}/medical`);

    await user.click(await screen.findByRole('link', { name: 'Документы (3)' }));

    await documentsTitle();
    expect(app.location()).toBe(`/children/${masha.id}/medical/documents`);
    expect(within(screen.getByRole('banner')).getAllByRole('link')[0]).toHaveAccessibleName(
      'Медкарта',
    );
    expect(await documentRows()).toEqual([
      'Выписка1 декабря',
      'Анализ крови20 ноября',
      'Справка в сад1 сентября 2025',
    ]);
  });

  it('says so when the card has none, still offering to add one', async () => {
    const user = userEvent.setup();
    renderApp('/medical');

    await user.click(await screen.findByRole('link', { name: 'Документы (0)' }));

    expect(await screen.findByText('Документов пока нет')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Документ' })).toBeInTheDocument();
  });

  it('leaves out a deleted Document', async () => {
    syncServer.seed('child', [masha]);
    const deleted = documentRow({ memberId: anna.id }, 'Старый анализ', '2026-11-01');
    syncServer.seed('document', [
      deleted,
      documentRow({ memberId: anna.id }, 'Флюорография', '2026-10-10'),
    ]);
    syncServer.change('document', deleted.id, 'deleted');

    renderApp('/medical');

    expect(await screen.findByRole('link', { name: 'Документы (1)' })).toBeInTheDocument();
  });
});

describe('Adding a Document', () => {
  it('uploads the file with its title (the file’s name), today’s date and description', async () => {
    syncServer.seed('child', [masha]);
    const documents = documentsServer();
    const user = userEvent.setup();
    renderApp(`/children/${masha.id}/medical/documents`);
    const sheet = await openNewDocumentSheet(user);

    await user.upload(within(sheet).getByLabelText('Файл'), pdf());
    expect(within(sheet).getByRole('textbox', { name: 'Название' })).toHaveValue('Анализ крови');
    expect(within(sheet).getByLabelText('Дата')).toHaveValue('2026-12-02');
    await user.type(within(sheet).getByRole('textbox', { name: 'Описание' }), 'Натощак');
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(documents.uploads).toHaveLength(1);
    const upload = documents.uploads[0];
    expect(upload?.get('id')).toMatch(UUID);
    expect(upload?.get('childId')).toBe(masha.id);
    expect(upload?.get('memberId')).toBeUndefined();
    expect(upload?.get('title')).toBe('Анализ крови');
    expect(upload?.get('date')).toBe('2026-12-02');
    expect(upload?.get('description')).toBe('Натощак');
    const file = upload?.get('file');
    expect(file).toMatchObject({ name: 'Анализ крови.pdf', type: 'application/pdf' });
    expect(typeof file === 'object' && new TextDecoder().decode(file.bytes)).toBe(
      '%PDF-1.7 Анализ крови',
    );
    await waitFor(async () => {
      expect(await documentRows()).toEqual(['Анализ крови2 декабря']);
    });
  });

  it('keeps a title typed before choosing the file', async () => {
    documentsServer();
    const user = userEvent.setup();
    renderApp('/medical/documents');
    const sheet = await openNewDocumentSheet(user);

    await user.type(within(sheet).getByRole('textbox', { name: 'Название' }), 'Флюорография');
    await user.upload(within(sheet).getByLabelText('Файл'), pdf('IMG_0001.pdf'));

    expect(within(sheet).getByRole('textbox', { name: 'Название' })).toHaveValue('Флюорография');
  });

  it('needs a file', async () => {
    const documents = documentsServer();
    const user = userEvent.setup();
    renderApp('/medical/documents');
    const sheet = await openNewDocumentSheet(user);

    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(await within(sheet).findByText('Выберите файл')).toBeInTheDocument();
    expect(documents.uploads).toHaveLength(0);
  });

  it('needs the internet: offline it says so and keeps the sheet', async () => {
    const documents = documentsServer();
    const user = userEvent.setup();
    renderApp('/medical/documents');
    const sheet = await openNewDocumentSheet(user);
    await user.upload(within(sheet).getByLabelText('Файл'), pdf());
    network.goOffline();

    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(
      await within(sheet).findByText('Нужен интернет, чтобы прикрепить файл'),
    ).toBeInTheDocument();
    expect(documents.uploads).toHaveLength(0);
    expect(screen.getByRole('dialog', { name: 'Документ' })).toBeInTheDocument();
  });

  it('refuses a file over 20 MB before uploading it', async () => {
    const documents = documentsServer();
    const user = userEvent.setup();
    renderApp('/medical/documents');
    const sheet = await openNewDocumentSheet(user);

    await user.upload(
      within(sheet).getByLabelText('Файл'),
      pdf('Скан.pdf', new Uint8Array(20 * 1024 * 1024 + 1)),
    );
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(await within(sheet).findByText('Файл больше 20 МБ')).toBeInTheDocument();
    expect(documents.uploads).toHaveLength(0);
  });

  it.each([
    [413, 'document.too_large', 'Файл больше 20 МБ'],
    [415, 'document.unsupported_type', 'Можно прикрепить PDF или фото'],
  ])('shows the server’s %i %s as «%s»', async (status, code, message) => {
    const documents = documentsServer();
    documents.failUploadsWith(status, code);
    const user = userEvent.setup();
    renderApp('/medical/documents');
    const sheet = await openNewDocumentSheet(user);
    await user.upload(within(sheet).getByLabelText('Файл'), pdf());

    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    expect(await within(sheet).findByText(message)).toBeInTheDocument();
  });
});

describe('Opening a Document', () => {
  it('shows a photo full screen, and again offline from the device', async () => {
    const photo = documentRow({ memberId: anna.id }, 'Рецепт', '2026-11-20', {
      contentType: 'image/jpeg',
    });
    syncServer.seed('document', [photo]);
    const documents = documentsServer();
    documents.keep(photo, JPEG_BYTES);
    const user = userEvent.setup();
    const app = renderApp('/medical/documents');

    await user.click(await screen.findByRole('link', { name: /Рецепт/ }));

    expect(app.location()).toBe(`/medical/documents/${photo.id}`);
    expect(await screen.findByRole('img', { name: 'Рецепт' })).toHaveAttribute(
      'src',
      expect.stringMatching(/^blob:/),
    );
    expect(documents.fileRequests).toEqual([photo.id]);
    expect(fakeCaches.urls(FILE_CACHE)).toHaveLength(1);

    app.unmount();
    renderApp('/medical/documents', { offline: true });
    await user.click(await screen.findByRole('link', { name: /Рецепт/ }));

    expect(await screen.findByRole('img', { name: 'Рецепт' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(documents.fileRequests).toEqual([photo.id]);
  });

  // An iPhone shows only the first page of a PDF embedded in a page: a PDF opens in a window of
  // its own, from the downloaded copy, where the browser's viewer shows every page.
  it('opens a PDF in a window of its own, also offline', async () => {
    const analysis = documentRow({ memberId: anna.id }, 'Анализ крови', '2026-11-20');
    syncServer.seed('document', [analysis]);
    const documents = documentsServer();
    documents.keep(analysis, PDF_BYTES);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const user = userEvent.setup();
    const app = renderApp('/medical/documents');
    await user.click(await screen.findByRole('link', { name: /Анализ крови/ }));

    await user.click(await screen.findByRole('button', { name: 'Открыть PDF' }));

    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^blob:/), '_blank');
    expect(document.querySelector('iframe')).toBeNull();
    expect(documents.fileRequests).toEqual([analysis.id]);

    app.unmount();
    renderApp('/medical/documents', { offline: true });
    await user.click(await screen.findByRole('link', { name: /Анализ крови/ }));
    await user.click(await screen.findByRole('button', { name: 'Открыть PDF' }));

    expect(open).toHaveBeenCalledTimes(2);
    expect(documents.fileRequests).toEqual([analysis.id]);
  });

  it('says «Файл недоступен» when the file is gone', async () => {
    const lost = documentRow({ memberId: anna.id }, 'Анализ крови', '2026-11-20');
    syncServer.seed('document', [lost]);
    documentsServer();
    const user = userEvent.setup();
    renderApp('/medical/documents');

    await user.click(await screen.findByRole('link', { name: /Анализ крови/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Файл недоступен');
  });

  it('forgets every opened file when the Member logs out', async () => {
    const analysis = documentRow({ memberId: anna.id }, 'Анализ крови', '2026-11-20');
    syncServer.seed('document', [analysis]);
    documentsServer().keep(analysis, PDF_BYTES);
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })));
    const user = userEvent.setup();
    const app = renderApp('/medical/documents');
    await user.click(await screen.findByRole('link', { name: /Анализ крови/ }));
    await screen.findByRole('button', { name: 'Открыть PDF' });
    expect(fakeCaches.cacheNames()).toContain(FILE_CACHE);
    app.unmount();

    renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'Выйти' }));
    const confirm = await screen.findByRole('dialog', {
      name: 'Выйти из аккаунта на этом устройстве?',
    });
    await user.click(within(confirm).getByRole('button', { name: 'Выйти' }));

    await waitFor(() => {
      expect(fakeCaches.cacheNames()).not.toContain(FILE_CACHE);
    });
  });
});

describe('Editing and deleting a Document', () => {
  it('changes the title, date and description through sync', async () => {
    const analysis = documentRow({ memberId: anna.id }, 'Анализ крови', '2026-11-20');
    syncServer.seed('document', [analysis]);
    documentsServer().keep(analysis, PDF_BYTES);
    const user = userEvent.setup();
    renderApp(`/medical/documents/${analysis.id}`);

    await user.click(await screen.findByRole('button', { name: 'Изменить' }));
    const sheet = await screen.findByRole('dialog', { name: 'Документ' });
    expect(within(sheet).getByText('PDF, 47 КБ')).toBeInTheDocument();
    const title = within(sheet).getByRole('textbox', { name: 'Название' });
    await user.clear(title);
    await user.type(title, 'Общий анализ крови');
    await user.click(within(sheet).getByRole('button', { name: 'Готово' }));

    await waitFor(() => {
      expect(syncServer.row('document', analysis.id)).toMatchObject({
        title: 'Общий анализ крови',
      });
    });
    expect(syncServer.operations('document')).toEqual([
      { table: 'document', id: analysis.id, op: 'upsert', fields: { title: 'Общий анализ крови' } },
    ]);
  });

  it('deletes it with its kept file, back on the Documents screen', async () => {
    const analysis = documentRow({ memberId: anna.id }, 'Анализ крови', '2026-11-20');
    const kept = documentRow({ memberId: anna.id }, 'Выписка', '2026-11-21');
    syncServer.seed('document', [analysis, kept]);
    const documents = documentsServer();
    documents.keep(analysis, PDF_BYTES);
    documents.keep(kept, PDF_BYTES);
    const user = userEvent.setup();
    const app = renderApp('/medical/documents');
    await user.click(await screen.findByRole('link', { name: /Выписка/ }));
    await screen.findByRole('button', { name: 'Открыть PDF' }); // «Выписка» is open
    await user.click(screen.getByRole('link', { name: 'Документы' }));
    await user.click(await screen.findByRole('link', { name: /Анализ крови/ }));
    await screen.findByRole('button', { name: 'Открыть PDF' }); // «Анализ крови» is open
    expect(fakeCaches.urls(FILE_CACHE)).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Изменить' }));
    const sheet = await screen.findByRole('dialog', { name: 'Документ' });
    await user.click(within(sheet).getByRole('button', { name: 'Удалить документ' }));
    const confirm = await screen.findByRole('dialog', { name: 'Удалить «Анализ крови»?' });
    await user.click(within(confirm).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(app.location()).toBe('/medical/documents');
    });
    await waitFor(async () => {
      expect(await documentRows()).toEqual(['Выписка21 ноября']);
    });
    await waitFor(() => {
      expect(syncServer.row('document', analysis.id)).toBeUndefined();
    });
    await waitFor(() => {
      expect(fakeCaches.urls(FILE_CACHE)).toEqual([
        expect.stringContaining(`/api/documents/${kept.id}/file`),
      ]);
    });
  });

  it('forgets the kept file of a Document deleted on another device', async () => {
    const analysis = documentRow({ memberId: anna.id }, 'Анализ крови', '2026-11-20');
    syncServer.seed('document', [analysis]);
    documentsServer().keep(analysis, PDF_BYTES);
    const user = userEvent.setup();
    const app = renderApp('/medical/documents');
    await user.click(await screen.findByRole('link', { name: /Анализ крови/ }));
    await screen.findByRole('button', { name: 'Открыть PDF' }); // «Анализ крови» is open
    app.unmount();
    syncServer.change('document', analysis.id, 'deleted');

    renderApp('/medical/documents');

    expect(await screen.findByText('Документов пока нет')).toBeInTheDocument();
    await waitFor(() => {
      expect(fakeCaches.urls(FILE_CACHE)).toEqual([]);
    });
  });
});

describe('The local store', () => {
  it('upgrades a version 10 store: its unsent change is still sent, and Documents arrive', async () => {
    const cold = illnessRow({ memberId: anna.id }, 'ОРВИ');
    await upgradeStoreFrom(10, async (older) => {
      await older.table('outbox').add({
        table: 'illness',
        id: cold.id,
        op: 'upsert',
        fields: { memberId: anna.id, kind: 'ILLNESS', name: 'ОРВИ' },
        creates: true,
      });
    });
    syncServer.seed('document', [documentRow({ memberId: anna.id }, 'Флюорография', '2026-10-10')]);

    renderApp('/medical');

    await waitFor(() => {
      expect(syncServer.row('illness', cold.id)).toMatchObject({ name: 'ОРВИ' });
    });
    expect(await screen.findByRole('link', { name: 'Документы (1)' })).toBeInTheDocument();
  });
});

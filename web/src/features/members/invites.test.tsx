import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  anna,
  boris,
  childFieldsHandler,
  childrenHandler,
  invitesHandler,
  membersHandler,
  sessionHandler,
  type InviteFixture,
} from '@/test/fixtures';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';

const NO_CONNECTION = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
const URL = 'https://family.example.com/invite/Zm9vYmFyYmF6cXV4_-0123456789abcdefghijklmno';
const INVITE = 'Пригласить взрослого…';

const older: InviteFixture = {
  id: '0b6b9f2e-0000-4000-8000-000000000001',
  createdBy: anna.id,
  createdAt: '2026-11-05T12:00:00Z',
  expiresAt: '2026-11-12T12:00:00Z',
};
const newer: InviteFixture = {
  id: '0b6b9f2e-0000-4000-8000-000000000002',
  createdBy: boris.id,
  createdAt: '2026-11-06T12:00:00Z',
  expiresAt: '2026-11-13T12:00:00Z',
};
const created: InviteFixture = {
  id: '0b6b9f2e-0000-4000-8000-000000000003',
  createdBy: anna.id,
  createdAt: '2026-11-07T12:00:00Z',
  expiresAt: '2026-11-14T12:00:00Z',
};

function membersRegion() {
  return screen.findByRole('region', { name: 'Взрослые' });
}

/** «Приглашения» once its Invites have loaded. */
async function invitesRegion() {
  const region = await screen.findByRole('region', { name: 'Приглашения' });
  await waitFor(() => {
    expect(within(region).queryByText('Загрузка…')).not.toBeInTheDocument();
  });
  return region;
}

function createAnswers(response: () => Response) {
  const calls: (string | null)[] = [];
  server.use(
    http.post('/api/invites', ({ request }) => {
      calls.push(request.headers.get('X-XSRF-TOKEN'));
      return response();
    }),
  );
  return calls;
}

function createdWithUrl() {
  return createAnswers(() => HttpResponse.json({ ...created, url: URL }, { status: 201 }));
}

/** What the page put on the clipboard, item by item (each item's text/plain, once resolved). */
interface Clipboard {
  written: Promise<string>[];
  writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;
  /** Whether `write` was called before the create request got its answer. */
  calledSynchronously: boolean[];
}

/**
 * Gives the browser `ClipboardItem` and `navigator.clipboard` for one test (after
 * `userEvent.setup()`, which installs its own clipboard). `write` reads the item the way a browser
 * does and fails when `fails` says so; `writeText` (the «Скопировать» row) as `writeTextFails`.
 */
function browserClipboard({
  fails = false,
  writeTextFails = false,
  pending,
}: { fails?: boolean; writeTextFails?: boolean; pending?: () => boolean } = {}): Clipboard {
  const clipboard: Clipboard = {
    written: [],
    writeText: vi
      .fn<(text: string) => Promise<void>>()
      .mockImplementation(() =>
        writeTextFails ? Promise.reject(new Error('denied')) : Promise.resolve(),
      ),
    calledSynchronously: [],
  };
  class FakeClipboardItem {
    constructor(readonly items: Record<string, Promise<Blob>>) {}
  }
  vi.stubGlobal('ClipboardItem', FakeClipboardItem);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: clipboard.writeText,
      write: async (items: FakeClipboardItem[]) => {
        clipboard.calledSynchronously.push(pending?.() ?? true);
        const blob = items[0]?.items['text/plain'];
        if (blob === undefined) throw new Error('no text/plain');
        const text = blob.then((value) => value.text());
        clipboard.written.push(text);
        await text;
        if (fails) throw new DOMException('not allowed', 'NotAllowedError');
      },
    },
  });
  return clipboard;
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
  server.use(membersHandler([anna, boris]));
  server.use(childFieldsHandler([]), childrenHandler([]));
});
afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.unstubAllGlobals();
});

describe('Inviting a new Member', () => {
  beforeEach(() => {
    server.use(invitesHandler([older]));
  });

  it('creates the Invite and copies its link with one tap', async () => {
    let answered = false;
    const calls = createAnswers(() => {
      answered = true;
      return HttpResponse.json({ ...created, url: URL }, { status: 201 });
    });
    const user = userEvent.setup();
    const clipboard = browserClipboard({ pending: () => !answered });

    renderApp('/settings');
    const membersSection = await membersRegion();
    await user.click(await within(membersSection).findByRole('button', { name: INVITE }));

    expect(await within(membersSection).findByRole('status')).toHaveTextContent(
      'Ссылка скопирована',
    );
    expect(clipboard.calledSynchronously).toEqual([true]);
    expect(await Promise.all(clipboard.written)).toEqual([URL]);
    expect(calls).toEqual(['token-from-server']);
    const invites = await invitesRegion();
    expect(within(invites).getAllByRole('listitem')[0]).toHaveTextContent('Ссылка · до 14 ноября');
  });

  it('stops saying the link was copied after a few seconds', async () => {
    createdWithUrl();
    const user = userEvent.setup();
    browserClipboard();

    renderApp('/settings');
    const membersSection = await membersRegion();
    await user.click(await within(membersSection).findByRole('button', { name: INVITE }));
    expect(await within(membersSection).findByRole('status')).toHaveTextContent(
      'Ссылка скопирована',
    );

    await waitFor(
      () => {
        expect(within(membersSection).queryByText('Ссылка скопирована')).not.toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  }, 10_000);

  it('shows the new link with «Скопировать» when copying fails', async () => {
    createdWithUrl();
    const user = userEvent.setup();
    const clipboard = browserClipboard({ fails: true });

    renderApp('/settings');
    const membersSection = await membersRegion();
    await user.click(await within(membersSection).findByRole('button', { name: INVITE }));
    expect(await within(membersSection).findByText(URL)).toBeInTheDocument();
    expect(within(membersSection).queryByRole('status')).not.toBeInTheDocument();
    await user.click(within(membersSection).getByRole('button', { name: 'Скопировать' }));

    expect(clipboard.writeText).toHaveBeenCalledWith(URL);
    expect(await within(membersSection).findByRole('status')).toHaveTextContent(
      'Ссылка скопирована',
    );
  });

  it('shows the new link with «Скопировать» when the browser has no ClipboardItem', async () => {
    createdWithUrl();
    const user = userEvent.setup();
    const clipboard = browserClipboard();
    vi.stubGlobal('ClipboardItem', undefined);

    renderApp('/settings');
    const membersSection = await membersRegion();
    await user.click(await within(membersSection).findByRole('button', { name: INVITE }));

    expect(await within(membersSection).findByText(URL)).toBeInTheDocument();
    expect(clipboard.written).toEqual([]);
    expect(within(await invitesRegion()).getAllByRole('listitem')).toHaveLength(2);
  });

  it('asks to copy by hand when «Скопировать» fails too', async () => {
    createdWithUrl();
    const user = userEvent.setup();
    browserClipboard({ fails: true, writeTextFails: true });

    renderApp('/settings');
    const membersSection = await membersRegion();
    await user.click(await within(membersSection).findByRole('button', { name: INVITE }));
    await user.click(await within(membersSection).findByRole('button', { name: 'Скопировать' }));

    expect(await within(membersSection).findByRole('alert')).toHaveTextContent(
      'Не удалось скопировать. Выделите ссылку и скопируйте её вручную.',
    );
  });

  it('says so when the Invite cannot be created, and copies nothing', async () => {
    createAnswers(() => HttpResponse.error());
    const user = userEvent.setup();
    const clipboard = browserClipboard();

    renderApp('/settings');
    const membersSection = await membersRegion();
    await user.click(await within(membersSection).findByRole('button', { name: INVITE }));

    expect(await within(membersSection).findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    expect(
      within(membersSection).queryByRole('button', { name: 'Скопировать' }),
    ).not.toBeInTheDocument();
    expect(within(membersSection).queryByRole('status')).not.toBeInTheDocument();
    await expect(Promise.all(clipboard.written)).rejects.toThrow();
  });
});

describe('Active Invites', () => {
  it('lists the active Invites with when each stops working', async () => {
    server.use(invitesHandler([newer, older]));

    renderApp('/settings');

    const items = within(await invitesRegion()).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Ссылка · до 13 ноября',
      'Ссылка · до 12 ноября',
    ]);
  });

  it('says there are no active Invites when there are none', async () => {
    server.use(invitesHandler([]));

    renderApp('/settings');

    const region = await invitesRegion();
    expect(await within(region).findByText('Активных приглашений нет')).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument();
  });

  it('says so when the Invites cannot be loaded, and loads them on retry', async () => {
    let calls = 0;
    server.use(
      http.get('/api/invites', () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : HttpResponse.json([older]);
      }),
    );
    const user = userEvent.setup();

    renderApp('/settings');
    const region = await invitesRegion();
    expect(await within(region).findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    await user.click(within(region).getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByText('Ссылка · до 12 ноября')).toBeInTheDocument();
  });
});

describe('Revoking an Invite', () => {
  function revokeAnswers(response: () => Response) {
    const calls: { id: unknown; csrf: string | null }[] = [];
    server.use(
      http.delete('/api/invites/:id', ({ params, request }) => {
        calls.push({ id: params.id, csrf: request.headers.get('X-XSRF-TOKEN') });
        return response();
      }),
    );
    return calls;
  }

  const revoked = () => new HttpResponse(null, { status: 204 });

  beforeEach(() => {
    server.use(invitesHandler([newer, older]));
  });

  it('revokes from edit mode after the action sheet, and removes the row', async () => {
    const calls = revokeAnswers(revoked);
    const user = userEvent.setup();

    renderApp('/settings');
    const region = await invitesRegion();
    await user.click(within(region).getByRole('button', { name: 'Изменить' }));
    expect(within(region).getByRole('button', { name: 'Готово' })).toBeInTheDocument();
    await user.click(
      within(region).getByRole('button', { name: 'Удалить «Ссылка · до 13 ноября»' }),
    );
    const sheet = screen.getByRole('dialog', { name: 'Удалить приглашение?' });
    expect(sheet).toHaveTextContent('Ссылка перестанет работать.');
    expect(calls).toEqual([]);
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(within(region).getAllByRole('listitem')).toHaveLength(1);
    });
    expect(within(region).queryByText('Ссылка · до 13 ноября')).not.toBeInTheDocument();
    expect(calls).toEqual([{ id: newer.id, csrf: 'token-from-server' }]);
  });

  it('keeps the Invite when the action sheet is cancelled', async () => {
    const calls = revokeAnswers(revoked);
    const user = userEvent.setup();

    renderApp('/settings');
    const region = await invitesRegion();
    await user.click(within(region).getByRole('button', { name: 'Изменить' }));
    await user.click(
      within(region).getByRole('button', { name: 'Удалить «Ссылка · до 13 ноября»' }),
    );
    await user.click(screen.getByRole('button', { name: 'Отменить' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(region).getAllByRole('listitem')).toHaveLength(2);
    expect(calls).toEqual([]);
  });

  it('turns edit mode off with «Готово»', async () => {
    const user = userEvent.setup();

    renderApp('/settings');
    const region = await invitesRegion();
    await user.click(within(region).getByRole('button', { name: 'Изменить' }));
    await user.click(within(region).getByRole('button', { name: 'Готово' }));

    expect(within(region).queryByRole('button', { name: /^Удалить «/ })).not.toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Изменить' })).toBeInTheDocument();
  });

  it('revokes with right-click → «Удалить», after the action sheet', async () => {
    const calls = revokeAnswers(revoked);
    const user = userEvent.setup();

    renderApp('/settings');
    const region = await invitesRegion();
    await user.pointer({
      keys: '[MouseRight]',
      target: within(region).getByText('Ссылка · до 12 ноября'),
    });
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    const sheet = await screen.findByRole('dialog', { name: 'Удалить приглашение?' });
    await user.click(within(sheet).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(within(region).getAllByRole('listitem')).toHaveLength(1);
    });
    expect(calls).toEqual([{ id: older.id, csrf: 'token-from-server' }]);
  });

  it('says so when revoking fails, and keeps the Invite', async () => {
    revokeAnswers(() => HttpResponse.error());
    const user = userEvent.setup();

    renderApp('/settings');
    const region = await invitesRegion();
    await user.click(within(region).getByRole('button', { name: 'Изменить' }));
    await user.click(
      within(region).getByRole('button', { name: 'Удалить «Ссылка · до 13 ноября»' }),
    );
    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(await within(region).findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    expect(within(region).getAllByRole('listitem')).toHaveLength(2);
  });

  it('says there are none after the last Invite, leaving edit mode', async () => {
    server.use(invitesHandler([older]));
    revokeAnswers(revoked);
    const user = userEvent.setup();

    renderApp('/settings');
    const region = await invitesRegion();
    await user.click(within(region).getByRole('button', { name: 'Изменить' }));
    await user.click(
      within(region).getByRole('button', { name: 'Удалить «Ссылка · до 12 ноября»' }),
    );
    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(await within(region).findByText('Активных приглашений нет')).toBeInTheDocument();
    expect(within(region).queryByRole('list')).not.toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: 'Готово' })).not.toBeInTheDocument();
  });

  it('forgets the uncopied link when its Invite is revoked', async () => {
    createdWithUrl();
    revokeAnswers(revoked);
    const user = userEvent.setup();
    browserClipboard({ fails: true });

    renderApp('/settings');
    const membersSection = await membersRegion();
    await user.click(await within(membersSection).findByRole('button', { name: INVITE }));
    expect(await within(membersSection).findByText(URL)).toBeInTheDocument();
    const region = await invitesRegion();
    await user.click(within(region).getByRole('button', { name: 'Изменить' }));
    await user.click(
      within(region).getByRole('button', { name: 'Удалить «Ссылка · до 14 ноября»' }),
    );
    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => {
      expect(within(membersSection).queryByText(URL)).not.toBeInTheDocument();
    });
  });
});

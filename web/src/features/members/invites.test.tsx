import { screen, within } from '@testing-library/react';
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

async function invitesRegion() {
  return screen.findByRole('region', { name: 'Приглашения' });
}

async function invitesList() {
  return within(await invitesRegion()).findByRole('list', { name: 'Активные приглашения' });
}

async function firstInvite() {
  const [first] = within(await invitesList()).getAllByRole('listitem');
  if (first === undefined) throw new Error('No Invite is listed');
  return first;
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

/**
 * Gives the browser a share sheet and/or clipboard for one test. Call it after `userEvent.setup()`,
 * which installs its own clipboard.
 */
function browserSupports({
  share,
  writeText,
}: {
  share?: (data: ShareData) => Promise<void>;
  writeText: (text: string) => Promise<void>;
}) {
  if (share !== undefined) {
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  }
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
  server.use(membersHandler([anna, boris]));
  server.use(childFieldsHandler([]), childrenHandler([]));
});
afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('Active Invites', () => {
  it('lists the active Invites with when each stops working', async () => {
    server.use(invitesHandler([newer, older]));

    renderApp('/settings');

    const items = within(await invitesList()).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Действует до 13 ноября');
    expect(items[1]).toHaveTextContent('Действует до 12 ноября');
  });

  it('says when there are none', async () => {
    server.use(invitesHandler([]));

    renderApp('/settings');

    expect(
      await within(await invitesRegion()).findByText('Активных приглашений нет'),
    ).toBeInTheDocument();
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

    expect(await within(region).findByText('Действует до 12 ноября')).toBeInTheDocument();
  });
});

describe('Creating an Invite', () => {
  beforeEach(() => {
    server.use(invitesHandler([older]));
  });

  it('shows the new link and adds the Invite to the list', async () => {
    const calls = createdWithUrl();
    const user = userEvent.setup();

    renderApp('/settings');
    const region = await invitesRegion();
    await user.click(within(region).getByRole('button', { name: 'Создать приглашение' }));

    expect(await within(region).findByLabelText('Ссылка-приглашение')).toHaveValue(URL);
    const items = within(await invitesList()).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Действует до 14 ноября');
    expect(calls).toEqual(['token-from-server']);
  });

  it('shares the link through the share sheet when the browser has one', async () => {
    createdWithUrl();
    const share = vi.fn<(data: ShareData) => Promise<void>>().mockResolvedValue(undefined);
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const user = userEvent.setup();
    browserSupports({ share, writeText });

    renderApp('/settings');
    const region = await invitesRegion();
    await user.click(within(region).getByRole('button', { name: 'Создать приглашение' }));
    await user.click(await within(region).findByRole('button', { name: 'Отправить ссылку' }));

    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: URL }));
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the link when the browser cannot share', async () => {
    createdWithUrl();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const user = userEvent.setup();
    browserSupports({ writeText });

    renderApp('/settings');
    const region = await invitesRegion();
    await user.click(within(region).getByRole('button', { name: 'Создать приглашение' }));
    expect(
      within(region).queryByRole('button', { name: 'Отправить ссылку' }),
    ).not.toBeInTheDocument();
    await user.click(await within(region).findByRole('button', { name: 'Скопировать ссылку' }));

    expect(writeText).toHaveBeenCalledWith(URL);
    expect(await within(region).findByRole('status')).toHaveTextContent('Ссылка скопирована');
  });

  it('copies the link when sharing fails', async () => {
    createdWithUrl();
    const share = vi
      .fn<(data: ShareData) => Promise<void>>()
      .mockRejectedValue(new DOMException('not allowed', 'NotAllowedError'));
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const user = userEvent.setup();
    browserSupports({ share, writeText });

    renderApp('/settings');
    const region = await invitesRegion();
    await user.click(within(region).getByRole('button', { name: 'Создать приглашение' }));
    await user.click(await within(region).findByRole('button', { name: 'Отправить ссылку' }));

    expect(writeText).toHaveBeenCalledWith(URL);
    expect(await within(region).findByRole('status')).toHaveTextContent('Ссылка скопирована');
  });

  it('does nothing more when the share sheet is closed', async () => {
    createdWithUrl();
    const share = vi
      .fn<(data: ShareData) => Promise<void>>()
      .mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const user = userEvent.setup();
    browserSupports({ share, writeText });

    renderApp('/settings');
    const region = await invitesRegion();
    await user.click(within(region).getByRole('button', { name: 'Создать приглашение' }));
    await user.click(await within(region).findByRole('button', { name: 'Отправить ссылку' }));

    expect(share).toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    expect(within(region).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('asks to copy by hand when copying fails', async () => {
    createdWithUrl();
    const user = userEvent.setup();
    browserSupports({ writeText: () => Promise.reject(new Error('denied')) });

    renderApp('/settings');
    const region = await invitesRegion();
    await user.click(within(region).getByRole('button', { name: 'Создать приглашение' }));
    await user.click(await within(region).findByRole('button', { name: 'Скопировать ссылку' }));

    expect(await within(region).findByRole('alert')).toHaveTextContent(
      'Не удалось скопировать. Выделите ссылку и скопируйте её вручную.',
    );
  });

  it('says so when the Invite cannot be created', async () => {
    createAnswers(() => HttpResponse.error());
    const user = userEvent.setup();

    renderApp('/settings');
    const region = await invitesRegion();
    await user.click(within(region).getByRole('button', { name: 'Создать приглашение' }));

    expect(await within(region).findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    expect(within(region).queryByLabelText('Ссылка-приглашение')).not.toBeInTheDocument();
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

  beforeEach(() => {
    server.use(invitesHandler([newer, older]));
  });

  it('revokes after confirmation and removes it from the list', async () => {
    const calls = revokeAnswers(() => new HttpResponse(null, { status: 204 }));
    const user = userEvent.setup();

    renderApp('/settings');
    const first = await firstInvite();
    await user.click(within(first).getByRole('button', { name: 'Отозвать' }));
    expect(
      within(first).getByText('Отозвать приглашение? Ссылка перестанет работать.'),
    ).toBeInTheDocument();
    expect(calls).toEqual([]);
    await user.click(within(first).getByRole('button', { name: 'Да, отозвать' }));

    expect(await within(await invitesList()).findAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByText('Действует до 13 ноября')).not.toBeInTheDocument();
    expect(calls).toEqual([{ id: newer.id, csrf: 'token-from-server' }]);
  });

  it('keeps the Invite when the confirmation is cancelled', async () => {
    const calls = revokeAnswers(() => new HttpResponse(null, { status: 204 }));
    const user = userEvent.setup();

    renderApp('/settings');
    const first = await firstInvite();
    await user.click(within(first).getByRole('button', { name: 'Отозвать' }));
    await user.click(within(first).getByRole('button', { name: 'Отмена' }));

    expect(within(await invitesList()).getAllByRole('listitem')).toHaveLength(2);
    expect(within(first).getByRole('button', { name: 'Отозвать' })).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('hides the new link when that Invite is revoked', async () => {
    createdWithUrl();
    revokeAnswers(() => new HttpResponse(null, { status: 204 }));
    const user = userEvent.setup();

    renderApp('/settings');
    const region = await invitesRegion();
    await user.click(within(region).getByRole('button', { name: 'Создать приглашение' }));
    expect(await within(region).findByLabelText('Ссылка-приглашение')).toBeInTheDocument();
    const first = await firstInvite();
    await user.click(within(first).getByRole('button', { name: 'Отозвать' }));
    await user.click(within(first).getByRole('button', { name: 'Да, отозвать' }));

    expect(await within(await invitesList()).findAllByRole('listitem')).toHaveLength(2);
    expect(within(region).queryByLabelText('Ссылка-приглашение')).not.toBeInTheDocument();
  });

  it('says so when revoking fails, and keeps the Invite', async () => {
    revokeAnswers(() => HttpResponse.error());
    const user = userEvent.setup();

    renderApp('/settings');
    const first = await firstInvite();
    await user.click(within(first).getByRole('button', { name: 'Отозвать' }));
    await user.click(within(first).getByRole('button', { name: 'Да, отозвать' }));

    expect(await within(first).findByRole('alert')).toHaveTextContent(NO_CONNECTION);
    expect(within(await invitesList()).getAllByRole('listitem')).toHaveLength(2);
  });
});

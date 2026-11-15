import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anna, boris, invitesHandler, membersHandler, sessionHandler } from '@/test/fixtures';
import { network } from '@/test/network';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';

// Settings «Уведомления»: the Notifications switch and this device (spec #104, ticket #108).

const ABOUT = 'Списки, которые меняет другой взрослый, и напоминания о сроках задач.';

/** Анна, with her Notifications switch as given. */
function annaWith(notificationsEnabled: boolean) {
  return { ...anna, notificationsEnabled };
}

function loggedInAs(member: typeof anna) {
  server.use(sessionHandler({ bootstrapRequired: false, member }).handler);
  server.use(membersHandler([member, boris]), invitesHandler([]));
}

const UNAVAILABLE =
  'Чтобы получать уведомления на iPhone, добавьте приложение на экран «Домой»: «Поделиться» → «На экран „Домой“».';

/** `PATCH /api/members/me` answering like the server; `received` lists the bodies. */
function profileSaves() {
  const received: unknown[] = [];
  server.use(
    http.patch('/api/members/me', async ({ request }) => {
      const body = (await request.json()) as object;
      received.push(body);
      return HttpResponse.json({ ...anna, ...body });
    }),
  );
  return received;
}

async function section() {
  return screen.findByRole('region', { name: 'Уведомления' });
}

async function notificationsSwitch() {
  return within(await section()).getByRole('switch', { name: 'Уведомления' });
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-from-server';
});
afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('The «Уведомления» section', () => {
  it('shows the switch as the session has it, with what it covers', async () => {
    loggedInAs(annaWith(true));

    renderApp('/settings');

    const toggle = await notificationsSwitch();
    expect(toggle).toBeChecked();
    expect(toggle).toHaveAccessibleDescription(expect.stringContaining(ABOUT));
  });

  it('is off until the Member turns it on', async () => {
    loggedInAs(anna);

    renderApp('/settings');

    expect(await notificationsSwitch()).not.toBeChecked();
  });
});

describe('The switch', () => {
  it('saves at once when turned on, and says how to get push on a device that can’t', async () => {
    loggedInAs(anna);
    const received = profileSaves();
    const user = userEvent.setup();

    renderApp('/settings');
    await user.click(await notificationsSwitch());

    await waitFor(() => {
      expect(received).toEqual([{ notificationsEnabled: true }]);
    });
    expect(await notificationsSwitch()).toBeChecked();
    expect(within(await section()).getByText(UNAVAILABLE)).toBeInTheDocument();
  });

  it('saves at once when turned off', async () => {
    loggedInAs(annaWith(true));
    const received = profileSaves();
    const user = userEvent.setup();

    renderApp('/settings');
    await user.click(await notificationsSwitch());

    await waitFor(() => {
      expect(received).toEqual([{ notificationsEnabled: false }]);
    });
    expect(await notificationsSwitch()).not.toBeChecked();
  });

  it('goes back when the save fails, and says so under it with «Повторить»', async () => {
    loggedInAs(anna);
    const user = userEvent.setup();

    renderApp('/settings');
    const toggle = await notificationsSwitch();
    network.goOffline();
    await user.click(toggle);

    const alert = await within(await section()).findByRole('alert');
    expect(alert).toHaveTextContent('Не удалось сохранить. Проверьте соединение.');
    expect(toggle).not.toBeChecked();

    network.goOnline();
    const received = profileSaves();
    await user.click(within(await section()).getByRole('button', { name: 'Повторить' }));
    await waitFor(() => {
      expect(toggle).toBeChecked();
    });
    expect(received).toEqual([{ notificationsEnabled: true }]);
  });
});

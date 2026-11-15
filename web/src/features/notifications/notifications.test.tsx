import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anna, boris, invitesHandler, membersHandler, sessionHandler } from '@/test/fixtures';
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

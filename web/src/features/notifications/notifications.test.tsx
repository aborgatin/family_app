import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anna, boris, invitesHandler, membersHandler, sessionHandler } from '@/test/fixtures';
import { network } from '@/test/network';
import { fakePushDevice, pushServer, subscriptionJson, VAPID_PUBLIC_KEY } from '@/test/pushDevice';
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

const DENIED = 'Уведомления запрещены. Разрешите их в Настройках iOS → Уведомления → Семья.';
const ENABLE_HERE = 'Включить на этом устройстве';

/** The VAPID key `pushServer()` gives, as the bytes the browser subscribes with. */
const VAPID_KEY_BYTES = new Uint8Array([4, 1, 2]);

/** `PATCH /api/members/me` that answers only when `release()` is called. */
function heldProfileSave() {
  let release: (() => void) | undefined;
  server.use(
    http.patch('/api/members/me', async ({ request }) => {
      const body = (await request.json()) as object;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return HttpResponse.json({ ...anna, ...body });
    }),
  );
  return {
    release: () => {
      release?.();
    },
  };
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

describe('Turning it on, on a device that can receive push', () => {
  it('asks for permission in the same tap, then subscribes with the server’s key and sends it', async () => {
    loggedInAs(anna);
    const device = fakePushDevice({ permission: 'default', answer: 'granted' });
    const push = pushServer();
    const save = heldProfileSave();
    const user = userEvent.setup();

    renderApp('/settings');
    await user.click(await notificationsSwitch());

    // Asked while the switch is still saving: iOS asks only during the tap itself.
    expect(device.requests).toBe(1);
    save.release();

    await waitFor(() => {
      expect(push.posted).toEqual([subscriptionJson('https://push.example/1')]);
    });
    expect(device.subscribes).toEqual([
      { userVisibleOnly: true, applicationServerKey: VAPID_KEY_BYTES },
    ]);
    const notifications = await section();
    expect(within(notifications).getByRole('switch', { name: 'Уведомления' })).toBeChecked();
    expect(
      within(notifications).queryByRole('button', { name: ENABLE_HERE }),
    ).not.toBeInTheDocument();
    expect(within(notifications).queryByText(DENIED)).not.toBeInTheDocument();
  });

  it('keeps the switch on when permission is refused, and says how to allow it', async () => {
    loggedInAs(anna);
    fakePushDevice({ permission: 'default', answer: 'denied' });
    const push = pushServer();
    const received = profileSaves();
    const user = userEvent.setup();

    renderApp('/settings');
    await user.click(await notificationsSwitch());

    expect(await within(await section()).findByText(DENIED)).toBeInTheDocument();
    expect(await notificationsSwitch()).toBeChecked();
    expect(received).toEqual([{ notificationsEnabled: true }]);
    expect(push.posted).toEqual([]);
    expect(screen.queryByRole('button', { name: ENABLE_HERE })).not.toBeInTheDocument();
  });

  it('says so when the server can’t be told, and offers this device again', async () => {
    loggedInAs(anna);
    const device = fakePushDevice({ permission: 'default', answer: 'granted' });
    const push = pushServer();
    push.failPosts();
    profileSaves();
    const user = userEvent.setup();

    renderApp('/settings');
    await user.click(await notificationsSwitch());

    const notifications = await section();
    expect(await within(notifications).findByRole('alert')).toHaveTextContent(
      'Что-то пошло не так. Попробуйте ещё раз.',
    );
    push.failing = false;
    await user.click(within(notifications).getByRole('button', { name: ENABLE_HERE }));

    await waitFor(() => {
      expect(push.posted).toEqual([device.subscription()]);
    });
    expect(within(notifications).queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('A device that can’t receive push yet', () => {
  it('says how to allow push when permission was refused, whether the switch is on or off', async () => {
    loggedInAs(anna);
    fakePushDevice({ permission: 'denied' });

    renderApp('/settings');

    expect(await within(await section()).findByText(DENIED)).toBeInTheDocument();
    expect(screen.queryByText(UNAVAILABLE)).not.toBeInTheDocument();
  });

  it('offers «Включить на этом устройстве» when the switch is on and permission wasn’t asked here', async () => {
    loggedInAs(annaWith(true));
    const device = fakePushDevice({ permission: 'default', answer: 'granted' });
    const push = pushServer();
    const user = userEvent.setup();

    renderApp('/settings');
    const notifications = await section();
    await user.click(await within(notifications).findByRole('button', { name: ENABLE_HERE }));

    expect(device.requests).toBe(1);
    await waitFor(() => {
      expect(push.posted).toEqual([subscriptionJson('https://push.example/1')]);
    });
    expect(
      within(notifications).queryByRole('button', { name: ENABLE_HERE }),
    ).not.toBeInTheDocument();
  });

  it('doesn’t offer this device while the switch is off', async () => {
    loggedInAs(anna);
    fakePushDevice({ permission: 'default' });

    renderApp('/settings');
    await section();

    expect(screen.queryByRole('button', { name: ENABLE_HERE })).not.toBeInTheDocument();
    expect(screen.queryByText(UNAVAILABLE)).not.toBeInTheDocument();
  });
});

describe('Turning it off', () => {
  it('keeps this device’s subscription', async () => {
    loggedInAs(annaWith(true));
    const device = fakePushDevice({
      permission: 'granted',
      subscribedAt: 'https://push.example/a',
    });
    const push = pushServer();
    const received = profileSaves();
    const user = userEvent.setup();

    renderApp('/settings');
    await user.click(await notificationsSwitch());

    await waitFor(() => {
      expect(received).toEqual([{ notificationsEnabled: false }]);
    });
    expect(push.deleted).toEqual([]);
    expect(device.unsubscribes).toBe(0);
    expect(device.subscription()).toEqual(subscriptionJson('https://push.example/a'));
  });
});

/** Lets requests started by the last render finish (a launch that should send nothing). */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

describe('At launch', () => {
  it('sends the subscription this device holds, while permission is granted and the switch is on', async () => {
    loggedInAs(annaWith(true));
    const device = fakePushDevice({
      permission: 'granted',
      subscribedAt: 'https://push.example/a',
    });
    const push = pushServer();

    renderApp('/');

    await waitFor(() => {
      expect(push.posted).toEqual([subscriptionJson('https://push.example/a')]);
    });
    expect(device.requests).toBe(0);
    expect(device.subscribes).toEqual([]);
  });

  it('subscribes again when iOS dropped the subscription, and sends the new one', async () => {
    loggedInAs(annaWith(true));
    const device = fakePushDevice({ permission: 'granted' });
    const push = pushServer();

    renderApp('/');

    await waitFor(() => {
      expect(push.posted).toEqual([subscriptionJson('https://push.example/1')]);
    });
    expect(device.subscribes).toEqual([
      { userVisibleOnly: true, applicationServerKey: VAPID_KEY_BYTES },
    ]);
  });

  it('sends nothing while the switch is off', async () => {
    loggedInAs(anna);
    fakePushDevice({ permission: 'granted', subscribedAt: 'https://push.example/a' });
    const push = pushServer();

    renderApp('/');
    await screen.findByRole('heading', { name: 'Семья', level: 1 });
    await settle();

    expect(push.posted).toEqual([]);
  });

  it('neither asks nor sends while permission wasn’t given here', async () => {
    loggedInAs(annaWith(true));
    const device = fakePushDevice({ permission: 'default' });
    const push = pushServer();

    renderApp('/');
    await screen.findByRole('heading', { name: 'Семья', level: 1 });
    await settle();

    expect(device.requests).toBe(0);
    expect(push.posted).toEqual([]);
  });

  it('fails silently and tries again at the next launch', async () => {
    loggedInAs(annaWith(true));
    fakePushDevice({ permission: 'granted', subscribedAt: 'https://push.example/a' });
    const push = pushServer();
    push.failPosts();

    const first = renderApp('/');
    await screen.findByRole('heading', { name: 'Семья', level: 1 });
    await settle();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    first.unmount();

    push.failing = false;
    renderApp('/');

    await waitFor(() => {
      expect(push.posted).toEqual([subscriptionJson('https://push.example/a')]);
    });
  });

  it('opens Settings with this device subscribed, not offering it again', async () => {
    loggedInAs(annaWith(true));
    fakePushDevice({ permission: 'granted' });
    const push = pushServer();
    // The key comes only once Settings is open, so it opens while the device subscribes.
    let giveKey: (() => void) | undefined;
    server.use(
      http.get('/api/push/vapid-public-key', async () => {
        await new Promise<void>((resolve) => {
          giveKey = resolve;
        });
        return HttpResponse.json({ publicKey: VAPID_PUBLIC_KEY });
      }),
    );

    renderApp('/settings');
    await section();
    giveKey?.();
    await waitFor(() => {
      expect(push.posted).toHaveLength(1);
    });
    await settle();

    expect(screen.queryByRole('button', { name: ENABLE_HERE })).not.toBeInTheDocument();
  });
});

describe('Logging out', () => {
  /** `POST /api/auth/logout` answering 204; `requests` gets `logout` in order with the push ones. */
  function logoutAnswers(requests: string[]) {
    server.use(
      http.post('/api/auth/logout', () => {
        requests.push('logout');
        return new HttpResponse(null, { status: 204 });
      }),
    );
  }

  async function logOut(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Выйти' }));
    const sheet = await screen.findByRole('dialog', {
      name: 'Выйти из аккаунта на этом устройстве?',
    });
    await user.click(within(sheet).getByRole('button', { name: 'Выйти' }));
  }

  it('tells the server to forget this device’s subscription first', async () => {
    loggedInAs(anna);
    fakePushDevice({ permission: 'granted', subscribedAt: 'https://push.example/a' });
    const push = pushServer();
    const requests: string[] = [];
    server.use(
      http.delete('/api/push/subscriptions', async ({ request }) => {
        requests.push('forget');
        push.deleted.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    logoutAnswers(requests);
    const user = userEvent.setup();

    renderApp('/settings');
    await logOut(user);

    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    expect(push.deleted).toEqual([{ endpoint: 'https://push.example/a' }]);
    expect(requests).toEqual(['forget', 'logout']);
  });

  it('still logs out when the server can’t be told', async () => {
    loggedInAs(anna);
    fakePushDevice({ permission: 'granted', subscribedAt: 'https://push.example/a' });
    server.use(
      http.delete('/api/push/subscriptions', () =>
        HttpResponse.json({ code: 'unknown' }, { status: 500 }),
      ),
    );
    const requests: string[] = [];
    logoutAnswers(requests);
    const user = userEvent.setup();

    renderApp('/settings');
    await logOut(user);

    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument();
    expect(requests).toEqual(['logout']);
  });
});

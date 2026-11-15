import { describe, expect, it } from 'vitest';
import {
  notificationClickTarget,
  openScreen,
  type AppClients,
  type AppWindow,
  type AppWindowClient,
} from './notificationClick';

// What a tap on a push does: focus an open app window and take it to the payload's screen, or open
// a new window there (spec #104 "Service worker").

const ORIGIN = 'https://family.example';

function appWindow(path: string, focused = false): AppWindow {
  return { url: `${ORIGIN}${path}`, focused };
}

describe('a tap on a push', () => {
  it('opens a new window at the payload’s screen when the app isn’t open', () => {
    expect(notificationClickTarget({ url: '/lists/l1' }, [], ORIGIN)).toEqual({
      open: `${ORIGIN}/lists/l1`,
    });
  });

  it('focuses the open app window and takes it to the screen', () => {
    const windows = [appWindow('/settings')];

    expect(notificationClickTarget({ url: '/lists/l1/items/i9' }, windows, ORIGIN)).toEqual({
      focus: windows[0],
      navigateTo: `${ORIGIN}/lists/l1/items/i9`,
    });
  });

  it('prefers the focused window among several', () => {
    const windows = [appWindow('/'), appWindow('/settings', true)];

    expect(notificationClickTarget({ url: '/lists/l1' }, windows, ORIGIN)).toEqual({
      focus: windows[1],
      navigateTo: `${ORIGIN}/lists/l1`,
    });
  });

  it('only focuses a window already on the screen', () => {
    const windows = [appWindow('/lists/l1')];

    expect(notificationClickTarget({ url: '/lists/l1' }, windows, ORIGIN)).toEqual({
      focus: windows[0],
    });
  });

  it.each([
    ['no data', undefined],
    ['no url', {}],
    ['a url that isn’t a string', { url: 42 }],
    ['another site', { url: 'https://elsewhere.example/lists/l1' }],
    ['a protocol-relative url', { url: '//elsewhere.example/lists/l1' }],
  ])('goes to / with %s', (_, data) => {
    expect(notificationClickTarget(data, [], ORIGIN)).toEqual({ open: `${ORIGIN}/` });
  });
});

// The worker's side of a tap, against fake windows: where the Member ends up.
describe('opening the screen of a tapped push', () => {
  interface FakeWindow extends AppWindowClient {
    events: string[];
  }

  function fakeWindow(path: string, canNavigate = true): FakeWindow {
    const window: FakeWindow = {
      url: `${ORIGIN}${path}`,
      focused: false,
      events: [],
      focus: () => {
        window.events.push('focus');
        return Promise.resolve(window);
      },
      navigate: (url: string) => {
        // A window the worker doesn't control yet can't be navigated.
        if (!canNavigate) return Promise.reject(new TypeError('not controlled'));
        window.events.push(`navigate ${url}`);
        window.url = url;
        return Promise.resolve(window);
      },
    };
    return window;
  }

  function fakeClients(windows: FakeWindow[]) {
    const opened: string[] = [];
    const clients: AppClients = {
      matchAll: () => Promise.resolve(windows),
      openWindow: (url: string) => {
        opened.push(url);
        return Promise.resolve(null);
      },
    };
    return { clients, opened };
  }

  it('opens a new window there when the app isn’t open', async () => {
    const { clients, opened } = fakeClients([]);

    await openScreen(clients, { url: '/lists/l1' }, ORIGIN);

    expect(opened).toEqual([`${ORIGIN}/lists/l1`]);
  });

  it('takes the open window to the screen, then focuses it', async () => {
    const window = fakeWindow('/settings');
    const { clients, opened } = fakeClients([window]);

    await openScreen(clients, { url: '/lists/l1' }, ORIGIN);

    expect(window.events).toEqual([`navigate ${ORIGIN}/lists/l1`, 'focus']);
    expect(opened).toEqual([]);
  });

  it('only focuses a window already on the screen', async () => {
    const window = fakeWindow('/lists/l1');
    const { clients, opened } = fakeClients([window]);

    await openScreen(clients, { url: '/lists/l1' }, ORIGIN);

    expect(window.events).toEqual(['focus']);
    expect(opened).toEqual([]);
  });

  it('opens a new window there when the open one can’t be navigated', async () => {
    const window = fakeWindow('/settings', false);
    const { clients, opened } = fakeClients([window]);

    await openScreen(clients, { url: '/lists/l1' }, ORIGIN);

    expect(window.events).toEqual([]);
    expect(opened).toEqual([`${ORIGIN}/lists/l1`]);
  });
});

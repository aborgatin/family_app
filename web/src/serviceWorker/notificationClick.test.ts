import { describe, expect, it } from 'vitest';
import { notificationClickTarget, type AppWindow } from './notificationClick';

// What a tap on a push does: focus an open app window and take it to the payload's screen, or open
// a new window there (spec #104 "Service worker").

const ORIGIN = 'https://family.example';

function appWindow(id: string, path: string, focused = false): AppWindow {
  return { id, url: `${ORIGIN}${path}`, focused };
}

describe('a tap on a push', () => {
  it('opens a new window at the payload’s screen when the app isn’t open', () => {
    expect(notificationClickTarget({ url: '/lists/l1' }, [], ORIGIN)).toEqual({
      open: `${ORIGIN}/lists/l1`,
    });
  });

  it('focuses the open app window and takes it to the screen', () => {
    const windows = [appWindow('w1', '/settings')];

    expect(notificationClickTarget({ url: '/lists/l1/items/i9' }, windows, ORIGIN)).toEqual({
      focus: 'w1',
      navigateTo: `${ORIGIN}/lists/l1/items/i9`,
    });
  });

  it('prefers the focused window among several', () => {
    const windows = [appWindow('w1', '/'), appWindow('w2', '/settings', true)];

    expect(notificationClickTarget({ url: '/lists/l1' }, windows, ORIGIN)).toEqual({
      focus: 'w2',
      navigateTo: `${ORIGIN}/lists/l1`,
    });
  });

  it('only focuses a window already on the screen', () => {
    const windows = [appWindow('w1', '/lists/l1')];

    expect(notificationClickTarget({ url: '/lists/l1' }, windows, ORIGIN)).toEqual({ focus: 'w1' });
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

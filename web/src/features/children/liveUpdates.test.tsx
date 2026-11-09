import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  anna,
  boris,
  invitesHandler,
  masha,
  membersHandler,
  petya,
  sessionHandler,
} from '@/test/fixtures';
import { FakeEventSource } from '@/test/eventSource';
import { renderApp } from '@/test/renderApp';
import { server } from '@/test/server';
import { syncServer } from '@/test/syncServer';

// Live updates (spec #3 "Live updates: SSE", ticket #54): with Settings open, a Child the other
// Member adds shows up without touching anything, because the server's `changed` event makes the
// app pull.

beforeEach(() => {
  server.use(sessionHandler({ bootstrapRequired: false, member: anna }).handler);
  server.use(membersHandler([anna, boris]), invitesHandler([]));
});

async function childrenList() {
  const section = await screen.findByRole('region', { name: 'Дети' });
  return within(section).findByRole('list', { name: 'Дети' });
}

let app: ReturnType<typeof renderApp> | undefined;

/** Settings is open and showing Маша, after the first sync; returns the live-update connection. */
async function settingsOpenWithMasha() {
  syncServer.seed('child', [masha]);
  app = renderApp('/settings');
  expect(await within(await childrenList()).findByText('Маша')).toBeInTheDocument();
  await waitFor(() => {
    expect(FakeEventSource.instances).not.toHaveLength(0);
  });
  const sse = FakeEventSource.latest();
  sse.open();
  return sse;
}

/** The server announces its latest Version, as after a commit by the other Member. */
function announce(sse: FakeEventSource, version = syncServer.latestVersion) {
  sse.emit('changed', JSON.stringify({ version }));
}

describe('Live updates', () => {
  it('opens one connection to the server’s live-update stream', async () => {
    await settingsOpenWithMasha();

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.latest().url).toBe('/api/sync/events');
  });

  it('shows a Child the other Member added, after the server says something changed', async () => {
    const sse = await settingsOpenWithMasha();

    syncServer.seed('child', [petya]);
    announce(sse);

    expect(await within(await childrenList()).findByText('Петя')).toBeInTheDocument();
  });

  it('does not pull for an event whose Version is not above the stored one', async () => {
    const sse = await settingsOpenWithMasha();
    await waitFor(() => {
      expect(syncServer.pulls).toHaveLength(1);
    });

    announce(sse); // the Version the app already has, as on connect
    announce(sse, syncServer.latestVersion - 1);
    // A later event that does pull shows the earlier ones were handled (in order) without one.
    syncServer.seed('child', [petya]);
    announce(sse);

    expect(await within(await childrenList()).findByText('Петя')).toBeInTheDocument();
    expect(syncServer.pulls).toHaveLength(2);
  });

  it('reconnects after the connection drops, and catches up', async () => {
    const dropped = await settingsOpenWithMasha();

    // The browser gave up on this connection (e.g. the server was down): it won't retry itself.
    dropped.readyState = FakeEventSource.CLOSED;
    dropped.fail();
    syncServer.seed('child', [petya]);

    await waitFor(
      () => {
        expect(FakeEventSource.instances).toHaveLength(2);
      },
      { timeout: 3000 },
    );
    const again = FakeEventSource.latest();
    expect(again.closed).toBe(false);
    again.open();
    announce(again);
    expect(await within(await childrenList()).findByText('Петя')).toBeInTheDocument();
  });

  it('reconnects at once when the network comes back', async () => {
    const dropped = await settingsOpenWithMasha();
    dropped.readyState = FakeEventSource.CLOSED;
    dropped.fail();

    window.dispatchEvent(new Event('online'));

    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('closes the connection when the app stops syncing', async () => {
    const sse = await settingsOpenWithMasha();

    app?.unmount();

    expect(sse.closed).toBe(true);
  });
});

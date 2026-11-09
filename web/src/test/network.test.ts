import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { network } from './network';
import { server } from './server';
import { syncServer } from './syncServer';

// "Offline" in a test means the whole network is gone, as on a phone with no signal: every
// request fails, not only the sync API (the M2 retro, #65).

describe('network', () => {
  it('fails every request while offline, whatever handler would answer it', async () => {
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })));
    network.goOffline();

    await expect(
      fetch(new URL('/api/auth/logout', window.location.origin), { method: 'POST' }),
    ).rejects.toThrow(TypeError);
    await expect(fetch(new URL('/api/sync/pull?since=0', window.location.origin))).rejects.toThrow(
      TypeError,
    );
  });

  it('answers again once back online', async () => {
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })));
    network.goOffline();
    network.goOnline();

    const response = await fetch(new URL('/api/auth/logout', window.location.origin), {
      method: 'POST',
    });
    expect(response.status).toBe(204);
  });

  it('syncServer.goOffline() takes the whole network down', async () => {
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })));
    syncServer.goOffline();

    await expect(
      fetch(new URL('/api/auth/logout', window.location.origin), { method: 'POST' }),
    ).rejects.toThrow(TypeError);
  });

  it('syncServer.failSyncOnly() fails the sync API and nothing else', async () => {
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })));
    syncServer.failSyncOnly();

    await expect(fetch(new URL('/api/sync/pull?since=0', window.location.origin))).rejects.toThrow(
      TypeError,
    );
    const response = await fetch(new URL('/api/auth/logout', window.location.origin), {
      method: 'POST',
    });
    expect(response.status).toBe(204);
  });

  it('starts every test online', async () => {
    const response = await fetch(new URL('/api/sync/pull?since=0', window.location.origin));
    expect(response.ok).toBe(true);
  });
});

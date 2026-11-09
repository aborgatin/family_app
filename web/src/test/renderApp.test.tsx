import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { network } from './network';
import { renderApp } from './renderApp';
import { server } from './server';

// Opening the app with no signal is its own case (spec #3 story 25 needed it and no test had it;
// the M2 retro, #65): `renderApp(path, { offline: true })` starts the app with the network down.

describe('renderApp', () => {
  it('opens the app with no signal when asked', async () => {
    renderApp('/', { offline: true });

    expect(network.offline).toBe(true);
    await expect(fetch(new URL('/api/auth/session', window.location.origin))).rejects.toThrow(
      TypeError,
    );
  });

  it('opens the app online by default', () => {
    server.use(
      http.get('/api/auth/session', () =>
        HttpResponse.json({ bootstrapRequired: true, member: null }),
      ),
    );
    renderApp('/');

    expect(network.offline).toBe(false);
  });
});

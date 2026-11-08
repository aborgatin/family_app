import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { reportServerReachable } from '@/shared/api/serverReachable';
import { server } from './server';

// Any request without a handler fails the test, so no test silently hits the network.
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
  // Reachability is module state: a test that ended offline must not leave the next one offline.
  reportServerReachable(true);
});
afterAll(() => {
  server.close();
});

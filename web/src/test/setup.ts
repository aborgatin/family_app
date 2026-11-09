import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { reportServerReachable } from '@/shared/api/serverReachable';
import { stopSync } from '@/shared/sync/engine';
import { localStore } from '@/shared/sync/localStore';
import { FakeEventSource } from './eventSource';
import { server } from './server';
import { syncServer } from './syncServer';

// fake-indexeddb gives jsdom an IndexedDB, so the real Dexie local store runs in tests.

// Any request without a handler fails the test, so no test silently hits the network.
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
beforeEach(() => {
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
});
afterEach(async () => {
  cleanup();
  // Unmounting stops the engine; make sure, then empty the local store for the next test.
  stopSync();
  await localStore.transaction('rw', localStore.tables, () =>
    Promise.all(localStore.tables.map((table) => table.clear())),
  );
  server.resetHandlers();
  syncServer.reset();
  FakeEventSource.reset();
  // Reachability is module state: a test that ended offline must not leave the next one offline.
  reportServerReachable(true);
});
afterAll(() => {
  server.close();
});

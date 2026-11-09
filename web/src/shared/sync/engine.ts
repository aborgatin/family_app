import { api, asApiError, subscribeServerReachable } from '@/shared/api';
import {
  applyLocally,
  isSyncedTable,
  localStore,
  storedVersion,
  storeVersion,
  type Operation,
  type SyncedTable,
  wipeLocalStore,
} from './localStore';

/*
 * The sync engine (ADR-0003, spec #3 "Client"): the one place that talks to the sync API. It
 * pushes the Outbox in order and then pulls, again and again while there is something to do:
 *
 * - at start, when the app comes back to the foreground, when the server becomes reachable again
 *   (any API answer, or the browser's `online` event), and after every local change;
 * - after a failure it retries with backoff (1 s doubling to 30 s); a `401` stops it until the next
 *   trigger, keeping the store and the Outbox.
 *
 * Its requests go through `api`, so they feed `serverReachable`, which stays the only sign of
 * unsent changes (the offline indicator).
 */

const PUSH_BATCH = 100;
const FIRST_RETRY_MS = 1000;
const LAST_RETRY_MS = 30_000;

interface PushResult {
  status: 'applied' | 'ignored' | 'rejected';
  code?: string;
  params?: Record<string, unknown>;
}

interface PushResponse {
  results: PushResult[];
  version: number;
}

interface Change {
  table: string;
  id: string;
  version: number;
  deleted: boolean;
  fields?: Record<string, unknown>;
}

interface PullResponse {
  changes: Change[];
  version: number;
}

/** An Outbox operation the server refused (`rejected`), with its `{code, params}`. */
export interface Rejection {
  table: SyncedTable;
  id: string;
  code: string;
  params: Record<string, unknown>;
}

let started = false;
/** Bumped by start and stop: a run from an older generation stops writing. */
let generation = 0;
let running = false;
let again = false;
/** After a rejection, the next pull fetches everything to restore the server's copy. */
let fullPullNeeded = false;
let retryDelay = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let unsubscribe: (() => void) | undefined;
const rejectionListeners = new Set<(rejection: Rejection) => void>();

/** Starts syncing for the logged-in Member; returns `stopSync`. Idempotent. */
export function startSync(): () => void {
  if (!started) {
    started = true;
    generation += 1;
    running = false;
    retryDelay = 0;
    requestPersistentStorage();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', requestSync);
    const stopReachable = subscribeServerReachable((reachable) => {
      if (reachable) requestSync();
    });
    unsubscribe = () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', requestSync);
      stopReachable();
    };
    requestSync();
  }
  return stopSync;
}

/** Stops syncing (logout, unmount). The store and the Outbox stay. */
export function stopSync(): void {
  if (!started) return;
  started = false;
  generation += 1;
  running = false;
  again = false;
  clearTimeout(retryTimer);
  unsubscribe?.();
  unsubscribe = undefined;
}

/** Pushes and pulls as soon as possible (now, or right after the run in progress). */
export function requestSync(): void {
  if (!started) return;
  if (running) {
    again = true;
    return;
  }
  clearTimeout(retryTimer);
  void run(generation);
}

/**
 * Sends the whole Outbox now (logout sends unsent changes first). Resolves once it is empty;
 * rejects with the `ApiError` when it can't be sent (server unreachable, `401`, …).
 */
export async function flushOutbox(): Promise<void> {
  // The engine pauses meanwhile, so it doesn't send the same operations alongside.
  const wasStarted = started;
  stopSync();
  try {
    await pushOutbox(() => true);
  } finally {
    if (wasStarted) startSync();
  }
}

/**
 * Logout: stops syncing and wipes the local store, Outbox included, so the next person on the
 * device sees none of this Member's data.
 */
export async function stopSyncAndWipe(): Promise<void> {
  stopSync();
  await wipeLocalStore();
}

/** Calls `listener` for every operation the server rejects; returns the unsubscribe. */
export function onRejection(listener: (rejection: Rejection) => void): () => void {
  rejectionListeners.add(listener);
  return () => {
    rejectionListeners.delete(listener);
  };
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') requestSync();
}

function requestPersistentStorage() {
  // Without persistence the browser may evict the store, and with it unsent changes.
  if ('storage' in navigator && typeof navigator.storage.persist === 'function') {
    navigator.storage.persist().catch(() => undefined);
  }
}

async function run(runGeneration: number) {
  running = true;
  const current = () => runGeneration === generation;
  try {
    do {
      again = false;
      await pushOutbox(current);
      if (!current()) return;
      await pull(current);
    } while (requestedMeanwhile() && current());
    retryDelay = 0;
  } catch (failure: unknown) {
    if (!current()) return;
    if (asApiError(failure).status !== 401) scheduleRetry();
  } finally {
    if (current()) running = false;
  }
}

/** Whether `requestSync` was called while this run was busy (set from outside the loop). */
function requestedMeanwhile() {
  return again;
}

function scheduleRetry() {
  retryDelay = retryDelay === 0 ? FIRST_RETRY_MS : Math.min(retryDelay * 2, LAST_RETRY_MS);
  clearTimeout(retryTimer);
  retryTimer = setTimeout(requestSync, retryDelay);
}

/** Sends the Outbox in order, a batch at a time, and drops what the server answered. */
async function pushOutbox(current: () => boolean) {
  for (;;) {
    const operations = await localStore.outbox.orderBy('seq').limit(PUSH_BATCH).toArray();
    if (operations.length === 0 || !current()) return;
    const response = await api.post<PushResponse>('/api/sync/push', {
      operations: operations.map(({ table, id, op, fields }) => ({ table, id, op, fields })),
    });
    if (!current()) return;
    await localStore.outbox.bulkDelete(
      operations.flatMap(({ seq }) => (seq === undefined ? [] : [seq])),
    );
    response.results.forEach((result, index) => {
      const operation = operations[index];
      if (result.status !== 'rejected' || operation === undefined) return;
      fullPullNeeded = true;
      const rejection = {
        table: operation.table,
        id: operation.id,
        code: result.code ?? 'unknown',
        params: result.params ?? {},
      };
      rejectionListeners.forEach((listener) => {
        listener(rejection);
      });
    });
  }
}

/**
 * Pulls the changes since the stored Version and applies them: pulled rows replace local ones,
 * then the Outbox operations still pending for those ids are applied again on top, so a pull never
 * reverts an unsent local edit. A full pull (first sync, or after a rejection) replaces every row.
 * A deleted row stays deleted: pending upserts for it are not applied again (delete wins).
 */
async function pull(current: () => boolean) {
  const full = fullPullNeeded || (await storedVersion()) === 0;
  const since = full ? 0 : await storedVersion();
  const response = await api.get<PullResponse>(`/api/sync/pull?since=${String(since)}`);
  if (!current()) return;
  await localStore.transaction(
    'rw',
    [...localStore.syncedTables(), localStore.outbox, localStore.meta],
    async () => {
      if (full) {
        await Promise.all(localStore.syncedTables().map((rows) => rows.clear()));
      }
      const touched = new Set<string>();
      const deleted = new Set<string>();
      for (const change of response.changes) {
        if (!isSyncedTable(change.table)) continue;
        const key = rowKey(change.table, change.id);
        touched.add(key);
        if (change.deleted) {
          deleted.add(key);
          await localStore.rows(change.table).delete(change.id);
        } else {
          await localStore.rows(change.table).put({ ...change.fields, id: change.id });
        }
      }
      const pending: Operation[] = await localStore.outbox.orderBy('seq').toArray();
      for (const operation of pending) {
        const key = rowKey(operation.table, operation.id);
        if ((full || touched.has(key)) && !deleted.has(key)) {
          await applyLocally(operation);
        }
      }
      await storeVersion(response.version);
    },
  );
  if (full) fullPullNeeded = false;
}

function rowKey(table: string, id: string) {
  return `${table}/${id}`;
}

import { http, HttpResponse } from 'msw';

/*
 * A fake of the server's sync API (`POST /api/sync/push`, `GET /api/sync/pull`) for MSW, installed
 * for every test by `server.ts` and emptied after each. It behaves like the real one where the
 * client can tell: a global Version, per-field Last write wins by arrival, delete wins, tombstones
 * after a first sync. Tests seed rows, read what was pushed, and switch it offline or make it
 * reject operations.
 *
 *   syncServer.seed('child', [masha, petya]);   // rows the next pull returns
 *   syncServer.goOffline();                      // push and pull fail like a lost network
 *   syncServer.rejectWhen((op) => op.id === masha.id);
 *   syncServer.operations('child')               // every operation pushed, in order
 *   syncServer.row('child', masha.id)            // the server's copy now
 *   const release = syncServer.holdPulls();      // pulls wait until release()
 */

export interface PushedOperation {
  table: string;
  id: string;
  op: 'upsert' | 'delete';
  fields?: Record<string, unknown>;
}

export interface Push {
  operations: PushedOperation[];
  /** The `X-XSRF-TOKEN` header the push carried. */
  csrf: string | null;
}

interface StoredRow {
  table: string;
  id: string;
  version: number;
  deleted: boolean;
  fields: Record<string, unknown>;
}

type Rejecter = (
  operation: PushedOperation,
) => { code: string; params?: Record<string, unknown> } | boolean;

/** The rejection used when `rejectWhen`'s predicate just answers `true`. */
const VALIDATION_FAILED = { code: 'validation.failed', params: { errors: [] } };

class FakeSyncServer {
  private version = 0;
  private stored = new Map<string, StoredRow>();
  private offline = false;
  private rejecter: Rejecter | undefined;
  private heldPull: Promise<void> | undefined;
  /** Every push received, in order (failed ones while offline are not received). */
  readonly pushes: Push[] = [];
  /** The `since` of every pull received. */
  readonly pulls: number[] = [];

  readonly handlers = [
    http.post('/api/sync/push', async ({ request }) => {
      if (this.offline) return HttpResponse.error();
      const body = (await request.json()) as { operations: PushedOperation[] };
      this.pushes.push({
        operations: body.operations,
        csrf: request.headers.get('X-XSRF-TOKEN'),
      });
      const results = body.operations.map((operation) => this.apply(operation));
      return HttpResponse.json({ results, version: this.version });
    }),
    http.get('/api/sync/pull', async ({ request }) => {
      if (this.offline) return HttpResponse.error();
      const since = Number(new URL(request.url).searchParams.get('since'));
      this.pulls.push(since);
      // A held pull answers with the server's state at release time.
      await this.heldPull;
      const changes = [...this.stored.values()]
        .filter((row) => row.version > since && (since > 0 || !row.deleted))
        .sort((a, b) => a.version - b.version)
        .map(({ table, id, version, deleted, fields }) =>
          deleted ? { table, id, version, deleted } : { table, id, version, deleted, fields },
        );
      return HttpResponse.json({ changes, version: this.version });
    }),
  ];

  /** Back to an empty server, online, rejecting nothing. */
  reset() {
    this.version = 0;
    this.stored.clear();
    this.offline = false;
    this.rejecter = undefined;
    this.heldPull = undefined;
    this.pushes.length = 0;
    this.pulls.length = 0;
  }

  /** Stores rows (`{id, ...fields}`) as if another device had written them, each a new Version. */
  seed(table: string, rows: readonly ({ id: string } & Record<string, unknown>)[]) {
    for (const { id, ...fields } of rows) {
      this.write(table, id, fields, false);
    }
  }

  /** Changes or deletes a row as if the other Member had done it (the next pull returns it). */
  change(table: string, id: string, fields: Record<string, unknown> | 'deleted') {
    const current = this.stored.get(key(table, id));
    if (fields === 'deleted') {
      this.write(table, id, current?.fields ?? {}, true);
    } else {
      this.write(table, id, { ...current?.fields, ...fields }, false);
    }
  }

  /** The last Version handed out: what a live-update `changed` event carries. */
  get latestVersion(): number {
    return this.version;
  }

  /** The server's copy of a row (`{id, ...fields}`), or `undefined` if absent or deleted. */
  row(table: string, id: string): Record<string, unknown> | undefined {
    const row = this.stored.get(key(table, id));
    return row === undefined || row.deleted ? undefined : { id, ...row.fields };
  }

  /** Every operation pushed for `table`, in arrival order. */
  operations(table: string): PushedOperation[] {
    return this.pushes.flatMap((push) => push.operations.filter((op) => op.table === table));
  }

  /** Push and pull fail as if the network were gone (MSW network error). */
  goOffline() {
    this.offline = true;
  }

  goOnline() {
    this.offline = false;
  }

  /**
   * Makes pulls wait until `release()` (then they answer with the server's state at that time), to
   * change things while a pull is in flight.
   */
  holdPulls(): () => void {
    let release = () => {
      // Replaced below, once the promise exists.
    };
    this.heldPull = new Promise((resolve) => {
      release = () => {
        this.heldPull = undefined;
        resolve();
      };
    });
    return release;
  }

  /**
   * Rejects the operations `rejecter` picks: `true` rejects as `validation.failed`, an object
   * gives the `{code, params}`.
   */
  rejectWhen(rejecter: Rejecter) {
    this.rejecter = rejecter;
  }

  private apply(operation: PushedOperation) {
    const rejection = this.rejecter?.(operation);
    if (rejection !== undefined && rejection !== false) {
      const { code, params = {} } = rejection === true ? VALIDATION_FAILED : rejection;
      return { status: 'rejected', code, params };
    }
    const current = this.stored.get(key(operation.table, operation.id));
    if (current?.deleted === true || (operation.op === 'delete' && current === undefined)) {
      return { status: 'ignored' };
    }
    if (operation.op === 'delete') {
      this.write(operation.table, operation.id, current?.fields ?? {}, true);
    } else {
      this.write(operation.table, operation.id, { ...current?.fields, ...operation.fields }, false);
    }
    return { status: 'applied' };
  }

  private write(table: string, id: string, fields: Record<string, unknown>, deleted: boolean) {
    this.version += 1;
    this.stored.set(key(table, id), { table, id, version: this.version, deleted, fields });
  }
}

function key(table: string, id: string) {
  return `${table}/${id}`;
}

export const syncServer = new FakeSyncServer();

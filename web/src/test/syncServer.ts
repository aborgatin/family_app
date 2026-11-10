import { http, HttpResponse } from 'msw';
import { dayParts } from '@/shared/dates';
import { network } from './network';

/*
 * A fake of the server's sync API (`POST /api/sync/push`, `GET /api/sync/pull`) for MSW, installed
 * for every test by `server.ts` and emptied after each. It behaves like the real one where the
 * client can tell: a global Version, per-field Last write wins by arrival, delete wins, tombstones
 * after a first sync, and the table rules a screen relies on: a deleted row takes the rows that
 * belong to it (`CASCADES`: a Child its Child lists and Child field values, a List its Items,
 * Categories and Item history), and a Child field value is a timeline entry (stamped with `recordedAt`, never
 * changed, ignored for a deleted Child or Child field), a List made Private loses the Assignee
 * of every one of its Items, and a repeating Item turned Done (pushed, or by `change`) hands its
 * Repeat on to its next occurrence, a new open Item (ADR-0009); a seeded row is stored as it is. Tests seed rows, read what was pushed, and switch it offline or make it
 * reject operations.
 *
 *   syncServer.seed('child', [masha, petya]);   // rows the next pull returns
 *   syncServer.goOffline();                      // the network is gone (`network.goOffline()`)
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

/**
 * What the server soft-deletes together with a row, in the same operation: the rows of `table`
 * whose `key` field holds the deleted `parent` row's id, and so on down. A deleted Child takes its
 * Child lists, whoever owns them, and its Child field values; a deleted Child field takes its
 * Child field values (spec #81); a deleted List takes its Items, Categories and Item history
 * (`ListService.deleteWithContent`).
 */
const CASCADES: readonly { parent: string; table: string; key: string }[] = [
  { parent: 'child', table: 'list', key: 'childId' },
  { parent: 'child', table: 'child_field_value', key: 'childId' },
  { parent: 'child_field', table: 'child_field_value', key: 'childFieldId' },
  { parent: 'list', table: 'item', key: 'listId' },
  { parent: 'list', table: 'category', key: 'listId' },
  { parent: 'list', table: 'item_history', key: 'listId' },
];

/** The rejection used when `rejectWhen`'s predicate just answers `true`. */
const VALIDATION_FAILED = { code: 'validation.failed', params: { errors: [] } };

class FakeSyncServer {
  private version = 0;
  private stored = new Map<string, StoredRow>();
  /** Only push and pull fail (`failSyncOnly()`); a lost network is `network.goOffline()`. */
  private syncFailing = false;
  private rejecter: Rejecter | undefined;
  private heldPull: Promise<void> | undefined;
  /** Every push received, in order (failed ones while offline are not received). */
  readonly pushes: Push[] = [];
  /** The `since` of every pull received. */
  readonly pulls: number[] = [];

  readonly handlers = [
    http.post('/api/sync/push', async ({ request }) => {
      if (this.syncFailing) return HttpResponse.error();
      const body = (await request.json()) as { operations: PushedOperation[] };
      this.pushes.push({
        operations: body.operations,
        csrf: request.headers.get('X-XSRF-TOKEN'),
      });
      const results = body.operations.map((operation) => this.apply(operation));
      return HttpResponse.json({ results, version: this.version });
    }),
    http.get('/api/sync/pull', async ({ request }) => {
      if (this.syncFailing) return HttpResponse.error();
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
    this.syncFailing = false;
    this.rejecter = undefined;
    this.heldPull = undefined;
    this.pushes.length = 0;
    this.pulls.length = 0;
  }

  /** Stores rows (`{id, ...fields}`) as if another device had written them, each a new Version. */
  seed(table: string, rows: readonly ({ id: string } & Record<string, unknown>)[]) {
    if (rows.length === 0) {
      throw new Error(
        `syncServer.seed('${table}', []) changes nothing; to remove a row use change(table, id, 'deleted')`,
      );
    }
    for (const { id, ...fields } of rows) {
      this.put(table, id, fields, false);
    }
  }

  /** Changes or deletes a row as if the other Member had done it (the next pull returns it). */
  change(table: string, id: string, fields: Record<string, unknown> | 'deleted') {
    const current = this.stored.get(key(table, id));
    if (current === undefined) {
      throw new Error(`syncServer.change: no ${table} ${id} on the server; seed it first`);
    }
    if (fields === 'deleted') {
      this.delete(table, id);
    } else {
      this.write(table, id, { ...current.fields, ...fields }, false);
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

  /** The whole network goes (`network.goOffline()`): every request fails, the sync API with it. */
  goOffline() {
    network.goOffline();
  }

  /** The network is back and the sync API answers again. */
  goOnline() {
    network.goOnline();
    this.syncFailing = false;
  }

  /**
   * Only push and pull fail (MSW network error) while every other request still answers. Use it
   * only when a test is about that split; a lost connection is `goOffline()`.
   */
  failSyncOnly() {
    this.syncFailing = true;
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
      this.delete(operation.table, operation.id);
    } else if (operation.table === 'child_field_value') {
      // A timeline entry (ADR-0007): never changed once recorded, stamped by the server, and not
      // recorded for a deleted Child or Child field.
      if (current !== undefined) return { status: 'applied' };
      const { childId, childFieldId } = operation.fields ?? {};
      if (this.gone('child', childId) || this.gone('child_field', childFieldId)) {
        return { status: 'ignored' };
      }
      this.write(
        operation.table,
        operation.id,
        { ...operation.fields, recordedAt: new Date().toISOString() },
        false,
      );
    } else {
      this.write(operation.table, operation.id, { ...current?.fields, ...operation.fields }, false);
    }
    return { status: 'applied' };
  }

  /** Whether the row is deleted, or was never there. */
  private gone(table: string, id: unknown): boolean {
    return typeof id !== 'string' || this.stored.get(key(table, id))?.deleted !== false;
  }

  /**
   * Soft-deletes the row and, as the server does in the same operation, the rows that go with it
   * (`CASCADES`), each with a new Version.
   */
  private delete(table: string, id: string) {
    this.write(table, id, this.stored.get(key(table, id))?.fields ?? {}, true);
    for (const cascade of CASCADES.filter(({ parent }) => parent === table)) {
      for (const row of [...this.stored.values()]) {
        if (row.table === cascade.table && !row.deleted && row.fields[cascade.key] === id) {
          this.delete(row.table, row.id);
        }
      }
    }
  }

  /** Stores the row with a new Version, as it is: no table rule runs (a seeded row). */
  private put(table: string, id: string, fields: Record<string, unknown>, deleted: boolean) {
    this.version += 1;
    this.stored.set(key(table, id), { table, id, version: this.version, deleted, fields });
  }

  /** Stores the row as a write by a Member does, with the table rules the server applies. */
  private write(table: string, id: string, fields: Record<string, unknown>, deleted: boolean) {
    const before = this.stored.get(key(table, id));
    // Turned Done: created Done, or changed from open (ADR-0009).
    const repeating =
      table === 'item' &&
      !deleted &&
      before?.fields.done !== true &&
      fields.done === true &&
      typeof fields.repeat === 'string' &&
      typeof fields.dueDate === 'string';
    this.put(table, id, repeating ? { ...fields, repeat: null } : fields, deleted);
    if (repeating) this.addNextOccurrence(fields);
    if (
      table === 'list' &&
      before !== undefined &&
      before.fields.visibility !== 'PRIVATE' &&
      fields.visibility === 'PRIVATE'
    ) {
      this.clearAssignees(id);
    }
  }

  /**
   * A repeating Item turned Done hands its Repeat on to a new open Item with a server-made id, in
   * the same operation (ADR-0009), as the real server does: same List, text, Description,
   * Assignee, Repeat, time of day and Creator, created now, due on the old Due date advanced by
   * the Repeat until it is after today (the device's date stands in for the server's).
   */
  private addNextOccurrence(done: Record<string, unknown>) {
    const now = new Date();
    this.write(
      'item',
      crypto.randomUUID(),
      {
        listId: done.listId,
        text: done.text,
        categoryId: null,
        description: done.description ?? null,
        dueDate: nextDueDate(done.dueDate as string, done.repeat as string, now),
        dueTime: done.dueTime ?? null,
        repeat: done.repeat,
        assigneeId: done.assigneeId ?? null,
        done: false,
        doneById: null,
        doneAt: null,
        creatorId: done.creatorId,
        createdAt: now.toISOString(),
      },
      false,
    );
  }

  /**
   * Making a List Private removes the Assignee from every one of its Items in the same operation,
   * each with a new Version (spec #81), as the real server does; making it Shared again restores
   * nothing.
   */
  private clearAssignees(listId: string) {
    for (const item of [...this.stored.values()]) {
      if (item.table === 'item' && !item.deleted && item.fields.listId === listId) {
        this.write('item', item.id, { ...item.fields, assigneeId: null }, false);
      }
    }
  }
}

/**
 * The Due date (`YYYY-MM-DD`) of the next occurrence after one due on `dueDate`: advanced by the
 * Repeat, at least once, until it is after `now`'s day. A month or year step to a day the month
 * doesn't have lands on its last day, and the next step goes on from there.
 */
function nextDueDate(dueDate: string, repeat: string, now: Date): string {
  let next = dayParts(dueDate);
  const today = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  const order = (d: typeof next) => d.year * 10_000 + d.month * 100 + d.day;
  do {
    next = step(next, repeat);
  } while (order(next) <= order(today));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(next.year)}-${pad(next.month)}-${pad(next.day)}`;
}

/** One Repeat period on from a day. */
function step(
  { year, month, day }: { year: number; month: number; day: number },
  repeat: string,
): { year: number; month: number; day: number } {
  if (repeat === 'DAILY' || repeat === 'WEEKLY') {
    const date = new Date(Date.UTC(year, month - 1, day + (repeat === 'DAILY' ? 1 : 7)));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  }
  const months = (month - 1 + (repeat === 'MONTHLY' ? 1 : 12)) % 12;
  const nextYear = year + Math.floor((month - 1 + (repeat === 'MONTHLY' ? 1 : 12)) / 12);
  const lastDay = new Date(Date.UTC(nextYear, months + 1, 0)).getUTCDate();
  return { year: nextYear, month: months + 1, day: Math.min(day, lastDay) };
}

function key(table: string, id: string) {
  return `${table}/${id}`;
}

export const syncServer = new FakeSyncServer();

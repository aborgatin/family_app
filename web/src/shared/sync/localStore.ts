import Dexie, { type Table } from 'dexie';

/*
 * The local store (ADR-0003, spec #3 "Client"): an IndexedDB database (Dexie) with one table per
 * syncable server table, the Outbox and the stored Version. Only the sync engine and the hooks in
 * this folder touch it; features go through `@/shared/sync`.
 *
 * Adding a syncable table: add its name to `SYNCED_TABLES` and a new `this.version(n).stores()`
 * below that declares it (keep every older version as it is). Dexie upgrades keep every table not
 * declared `null`, so the Outbox and unsent changes survive the upgrade.
 */

/** The syncable tables the client keeps, named as the server's sync API names them. */
export const SYNCED_TABLES = ['member', 'child', 'list'] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export function isSyncedTable(name: string): name is SyncedTable {
  return (SYNCED_TABLES as readonly string[]).includes(name);
}

/** A row of a syncable table: its id and the fields the server sends for it. */
export interface Row {
  id: string;
  [field: string]: unknown;
}

/** One Outbox operation, as the push sends it. `seq` orders the Outbox. */
export interface Operation {
  seq?: number;
  table: SyncedTable;
  id: string;
  op: 'upsert' | 'delete';
  /** An upsert carries only the fields that changed (all of them when it creates the row). */
  fields?: Record<string, unknown>;
}

interface Meta {
  key: string;
  value: unknown;
}

class LocalStore extends Dexie {
  declare outbox: Table<Operation, number>;
  declare meta: Table<Meta, string>;

  constructor() {
    super('family-app');
    this.version(1).stores({ member: 'id', child: 'id', outbox: '++seq', meta: 'key' });
    this.version(2).stores({ list: 'id' });
  }

  rows(table: SyncedTable): Table<Row, string> {
    return this.table(table);
  }

  syncedTables(): Table<Row, string>[] {
    return SYNCED_TABLES.map((table) => this.rows(table));
  }
}

export const localStore = new LocalStore();

const VERSION_KEY = 'version';

/** The high-water Version of the last pull; 0 before the first. */
export async function storedVersion(): Promise<number> {
  const meta = await localStore.meta.get(VERSION_KEY);
  return typeof meta?.value === 'number' ? meta.value : 0;
}

export async function storeVersion(version: number): Promise<void> {
  await localStore.meta.put({ key: VERSION_KEY, value: version });
}

/** The Member whose data the store holds (set when they log in on this device). */
const OWNER_KEY = 'owner';

/**
 * Empties every table of the store, whatever tables it has: rows, the Outbox and the meta (stored
 * Version, owner). Logging out leaves nothing of the Member's data on the device.
 */
export async function wipeLocalStore(): Promise<void> {
  await localStore.transaction('rw', localStore.tables, () =>
    Promise.all(localStore.tables.map((table) => table.clear())),
  );
}

/**
 * Makes the store `memberId`'s before sync starts: kept when it already is theirs (a session that
 * ended keeps unsent changes for the same Member) or nobody's yet, wiped first when it holds
 * another Member's data, so their Outbox is never sent under this session.
 */
export async function claimLocalStore(memberId: string): Promise<void> {
  await localStore.transaction('rw', localStore.tables, async () => {
    const owner = (await localStore.meta.get(OWNER_KEY))?.value;
    if (owner === memberId) return;
    if (owner !== undefined) {
      await Promise.all(localStore.tables.map((table) => table.clear()));
    }
    await localStore.meta.put({ key: OWNER_KEY, value: memberId });
  });
}

/** Applies an operation to the local rows (not the Outbox): what the server will do with it. */
export async function applyLocally(operation: Operation): Promise<void> {
  const rows = localStore.rows(operation.table);
  if (operation.op === 'delete') {
    await rows.delete(operation.id);
    return;
  }
  const existing = await rows.get(operation.id);
  await rows.put({ ...existing, ...operation.fields, id: operation.id });
}

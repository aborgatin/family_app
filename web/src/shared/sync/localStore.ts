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
export const SYNCED_TABLES = [
  'member',
  'child',
  'child_field',
  'list',
  'item',
  'category',
  'item_history',
] as const;
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
  /**
   * Fields written to the local row with the upsert but never sent: what the device knows only
   * until the server's copy arrives (e.g. when an Item was ticked off here). Kept with the
   * operation, so a pull while it is pending applies them again.
   */
  local?: Record<string, unknown>;
  /**
   * Set on an upsert written when the device had no row with this id: it creates the row. A full
   * pull, which leaves deleted rows out, re-applies pending upserts of a row it didn't send only
   * when one of them creates it (an unsent new row), never onto a row the server deleted or hid.
   */
  creates?: true;
}

/**
 * Rows of one table that belong to a row of another (`key` holds the parent's id): when the
 * parent goes (a tombstone, or the server ignoring a change to it because it is deleted), its
 * local rows go with it. Declared with the tables, so the engine needs no table's name.
 */
export const DEPENDENT_TABLES: readonly { parent: SyncedTable; table: SyncedTable; key: string }[] =
  [
    { parent: 'child', table: 'list', key: 'childId' },
    { parent: 'list', table: 'item', key: 'listId' },
    { parent: 'list', table: 'category', key: 'listId' },
    { parent: 'list', table: 'item_history', key: 'listId' },
  ];

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
    this.version(2).stores({ child_field: 'id', list: 'id' });
    // Items are indexed by their List: a tombstoned List takes its local Items with it.
    this.version(3).stores({ item: 'id, listId' });
    // Categories of a Shopping list, indexed by their List like Items (a dependent table).
    this.version(4).stores({ category: 'id, listId' });
    // A Shopping list's Item history (names for autocomplete), a dependent table of the List too.
    this.version(5).stores({ item_history: 'id, listId' });
    // Child lists: a List may belong to a Child, so Lists are indexed by it (a dependent table).
    this.version(6).stores({ list: 'id, childId' });
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

/** A copy of the owner as the app last knew them online (the session's Member). */
const OWNER_COPY_KEY = 'ownerCopy';

/**
 * Keeps a copy of the store's owner on the device, so the app can start as them with no
 * connection (`ownerCopy`). Ignored unless `owner` is the store's owner; wiped with the store.
 */
export async function saveOwnerCopy(owner: { id: string }): Promise<void> {
  await localStore.transaction('rw', localStore.meta, async () => {
    if ((await localStore.meta.get(OWNER_KEY))?.value !== owner.id) return;
    await localStore.meta.put({ key: OWNER_COPY_KEY, value: owner });
  });
}

/** The copy `saveOwnerCopy` kept of the store's owner; `undefined` when the store has none. */
export async function ownerCopy(): Promise<unknown> {
  return localStore.transaction('r', localStore.meta, async () => {
    const owner = (await localStore.meta.get(OWNER_KEY))?.value;
    const copy = (await localStore.meta.get(OWNER_COPY_KEY))?.value;
    return owner !== undefined && (copy as { id?: unknown } | undefined)?.id === owner
      ? copy
      : undefined;
  });
}

/**
 * Removes local rows of `table` that are gone on the server, and the rows that depend on them
 * (`DEPENDENT_TABLES`). Needs a surrounding transaction over the synced tables.
 */
export async function removeLocally(table: SyncedTable, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await localStore.rows(table).bulkDelete([...ids]);
  for (const dependent of DEPENDENT_TABLES.filter(({ parent }) => parent === table)) {
    const rows = await localStore.rows(dependent.table).where(dependent.key).anyOf(ids).toArray();
    await removeLocally(
      dependent.table,
      rows.map(({ id }) => id),
    );
  }
}

/** Applies an operation to the local rows (not the Outbox): what the server will do with it. */
export async function applyLocally(operation: Operation): Promise<void> {
  const rows = localStore.rows(operation.table);
  if (operation.op === 'delete') {
    await rows.delete(operation.id);
    return;
  }
  const existing = await rows.get(operation.id);
  await rows.put({ ...existing, ...operation.fields, ...operation.local, id: operation.id });
}

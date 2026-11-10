import Dexie from 'dexie';
import { localStore, STORE_SCHEMA } from '@/shared/sync/localStore';

/**
 * Replaces the local store with the one an older app created at schema `version` (the first
 * `version` entries of `STORE_SCHEMA`), lets `seed` put rows and Outbox operations in it, then
 * opens the current store over it, as the updated app does: Dexie upgrades it on open.
 *
 *   await upgradeStoreFrom(5, async (older) => {
 *     await older.table('list').put(chores);
 *   });
 */
export async function upgradeStoreFrom(
  version: number,
  seed: (older: Dexie) => Promise<unknown>,
): Promise<void> {
  localStore.close();
  await Dexie.delete(localStore.name);
  const older = new Dexie(localStore.name);
  STORE_SCHEMA.slice(0, version).forEach((stores, index) =>
    older.version(index + 1).stores(stores),
  );
  await seed(older);
  older.close();
  await localStore.open();
}

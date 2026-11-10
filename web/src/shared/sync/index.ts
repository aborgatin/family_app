// Offline-first sync (ADR-0003, spec #3; docs/architecture/frontend.md "Local store and sync").
// Features read and write synced data only through these; never Dexie or the sync API directly.
export { startSync, stopSync, requestSync, onSessionEnded } from './engine';
export { flushOutbox, stopSyncAndWipe } from './engine';
export { claimLocalStore, ownerCopy, saveOwnerCopy } from './localStore';
export {
  useRows,
  useSyncedRows,
  upsertRow,
  requestUpsert,
  deleteRow,
  type LocalLoad,
} from './rows';
export { useSaveRejection } from './saveRejection';
export type { Row, SyncedTable } from './localStore';

// Offline-first sync (ADR-0003, spec #3; docs/architecture/frontend.md "Local store and sync").
// Features read and write synced data only through these; never Dexie or the sync API directly.
export { startSync, stopSync, requestSync, type Rejection } from './engine';
export { useRows, upsertRow, deleteRow, useSaveRejected } from './rows';
export type { Row, SyncedTable } from './localStore';

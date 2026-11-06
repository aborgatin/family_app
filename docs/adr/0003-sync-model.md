# 0003 — Offline-first sync: outbox + versions, last-write-wins

- **Status:** Accepted
- **Date:** 2026-11-06

## Context
The app must work without signal (e.g. in a supermarket) and changes by one adult should
appear on the other's device within seconds. Only two users edit data.

## Decision
- Client keeps a local copy (IndexedDB via Dexie) and an **outbox** of operations
  (create item, toggle done, edit field, delete).
- On connectivity the client sends the outbox; the server applies operations idempotently
  (client-generated UUIDs) and assigns a monotonically increasing **version** to every changed row.
- Clients pull "all changes since version N". Deletes are soft (`deleted=true`) so they sync.
- Conflicts: **last write wins per field**. Adding and checking items never conflict.
- Live updates: **Server-Sent Events** notify open clients to pull; **Web Push** when the app is closed.

## Consequences
- Simple to implement and debug; no CRDT library.
- Rare simultaneous edits of the same field lose one edit — acceptable for two users.
- Every syncable table needs `id (UUID)`, `version`, `updated_at`, `deleted`.

# 0010 — Files in object storage, encrypted by the server, not backed up

- **Status:** Accepted
- **Date:** 2026-11-16

## Context
Medical cards (M5.5) bring the first uploaded files (Documents: PDFs and photos). Videos (R2) will
follow. Everything else the app stores is in PostgreSQL and backed up nightly as an encrypted dump to
Backblaze B2 and Cloudflare R2 ([ADR-0002](0002-postgresql.md)).

## Decision
- File contents live in a managed object-storage bucket (Cloudflare R2), separate from the backup
  buckets. PostgreSQL keeps only each file's metadata and its object key.
- The server encrypts every file before uploading it, with a key from `.env`. The key is kept in the
  password manager next to `BACKUP_PASSPHRASE`; without it the files cannot be read.
- Files are **not** backed up for now. We rely on the provider's durability.
- Deleting a Document deletes its object.

## Considered options
- **Files in PostgreSQL:** the existing backups would cover them with no new code, but the dumps would
  grow with every scan, and videos (R2) would need object storage anyway.
- **Self-hosted MinIO on the VPS:** with no backup, one lost disk would lose every file while the
  database, restored from backup, still pointed at them.

## Consequences
- A restore brings back the database; files come back only because they were never on the VPS.
- Losing the encryption key loses every file, so the key is part of the operator's handover.
- Rows whose object is missing (failed upload, provider loss) must be shown as unavailable, not crash.
- Backing up the bucket later (e.g. rclone copy to B2) is an addition, not a redesign.

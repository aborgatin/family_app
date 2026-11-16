-- Announcements («Что нового», spec #120, ticket #121): a row per catalog entry the scheduler step
-- has handled, by the entry's id. Handled means sent, or recorded unsent on a fresh database's first
-- step. A row is never deleted, so an entry is sent at most once per installation; a new id is a
-- new Announcement. Server-only: no sync columns.
CREATE TABLE announcement_sent (
  id      TEXT PRIMARY KEY,
  sent_at TIMESTAMPTZ NOT NULL
);

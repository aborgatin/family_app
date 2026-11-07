-- Password resets (spec #5, Password reset; ticket #21). Not syncable (S1): a server-only auth
-- artifact, never stored on the client, so it has no sync columns and its rows may be hard-deleted.
-- Only the SHA-256 hash of the token is stored; the raw token exists only in the printed link.
CREATE TABLE password_reset (
  id         UUID PRIMARY KEY,
  member_id  UUID NOT NULL REFERENCES member (id),
  token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ
);

CREATE INDEX password_reset_member_ix ON password_reset (member_id);

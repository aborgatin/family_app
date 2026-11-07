-- Invites (spec #5, Invites; ticket #24). Not syncable (S1): a server-only auth artifact, never
-- stored on the client, so it has no sync columns and its rows may be hard-deleted. Only the
-- SHA-256 hash of the token is stored; the raw token exists only in the link returned on creation.
-- Numbered V2_1 because V2 is password_reset and V3/V4 are reserved for #25/#26.
CREATE TABLE invite (
  id          UUID PRIMARY KEY,
  token_hash  BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  created_by  UUID NOT NULL REFERENCES member (id),
  created_at  TIMESTAMPTZ NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES member (id),
  revoked_at  TIMESTAMPTZ,
  CHECK ((accepted_at IS NULL) = (accepted_by IS NULL))
);

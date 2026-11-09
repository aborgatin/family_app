-- Lists (spec #3, Schema; ticket #55): the shared core only. M3 adds Categories, M4 the link to a
-- Child, each in its own migration. Syncable (S1): id, version, updated_at, deleted, with the
-- shared Version trigger from V1. The client generates the id (S3); deletes are soft (S2).
CREATE TABLE list (
  id         UUID PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  -- Kinds and Visibility values are code (S7), checked in Java: SHOPPING / TODO / WISH and
  -- PRIVATE / SHARED.
  kind       VARCHAR(16) NOT NULL,
  visibility VARCHAR(16) NOT NULL,
  -- The Owner: the Member who pushed the create. Set by the server, never by an operation.
  owner_id   UUID NOT NULL REFERENCES member (id),
  created_at TIMESTAMPTZ NOT NULL,
  version    BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TRIGGER list_bump_version
  BEFORE INSERT OR UPDATE ON list
  FOR EACH ROW EXECUTE FUNCTION bump_version();

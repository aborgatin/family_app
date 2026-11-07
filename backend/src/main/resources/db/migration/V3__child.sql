-- Children (spec #5, Schema; ticket #25). Syncable (S1): id, version, updated_at, deleted, with the
-- shared Version trigger from V1. The client generates the id (S3); deletes are soft (S2).
CREATE TABLE child (
  id         UUID PRIMARY KEY,
  family_id  UUID NOT NULL REFERENCES family (id),
  name       VARCHAR(100) NOT NULL,
  -- A code from the Child color palette (web/src/shared/palette/childColors.json), checked in Java
  -- so that the palette can change without a migration.
  color      VARCHAR(32) NOT NULL,
  birthday   DATE,
  version    BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TRIGGER child_bump_version
  BEFORE INSERT OR UPDATE ON child
  FOR EACH ROW EXECUTE FUNCTION bump_version();

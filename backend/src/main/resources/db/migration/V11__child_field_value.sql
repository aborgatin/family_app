-- Child field values (spec #81, ticket #91; ADR-0007): a timeline. Saving a Child's value for a
-- Child field appends an entry; the Child profile shows the latest one, which is the entry with
-- the highest Version (server arrival), not a client time.

-- Syncable (S1): id (client-generated, S3), version, updated_at, deleted.
-- value is text in the canonical format of the field's Value type (a date as YYYY-MM-DD), checked
-- in Java; empty means the value was cleared. recorded_at is set by the server.
CREATE TABLE child_field_value (
  id             UUID PRIMARY KEY,
  child_id       UUID NOT NULL REFERENCES child (id),
  child_field_id UUID NOT NULL REFERENCES child_field (id),
  value          TEXT NOT NULL,
  recorded_at    TIMESTAMPTZ NOT NULL,
  version        BIGINT NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL,
  deleted        BOOLEAN NOT NULL DEFAULT FALSE
);

-- Deleting a Child or a Child field soft-deletes its entries.
CREATE INDEX child_field_value_child_id_idx ON child_field_value (child_id);
CREATE INDEX child_field_value_child_field_id_idx ON child_field_value (child_field_id);

CREATE TRIGGER child_field_value_bump_version
  BEFORE INSERT OR UPDATE ON child_field_value
  FOR EACH ROW EXECUTE FUNCTION bump_version();

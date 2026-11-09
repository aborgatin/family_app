-- Items (spec #3, Schema; ticket #57): the shared core only. M3 adds quantity and Category, M4 Due
-- date, Repeat and Assignee, each in its own migration. Syncable (S1): id, version, updated_at,
-- deleted, with the shared Version trigger from V1. The client generates the id (S3); deletes are
-- soft (S2). Deleting a List soft-deletes its Items in the same transaction (`ListService`).
CREATE TABLE item (
  id         UUID PRIMARY KEY,
  list_id    UUID NOT NULL REFERENCES list (id),
  text       VARCHAR(1000) NOT NULL,
  -- No UI yet (spec #3, Out of Scope); written and pulled like the text.
  note       TEXT,
  -- Done, the Member who marked it Done and when: set by the server when Done changes (ticket #58).
  done       BOOLEAN NOT NULL DEFAULT FALSE,
  done_by_id UUID REFERENCES member (id),
  done_at    TIMESTAMPTZ,
  -- The Creator: the Member who pushed the create. Set by the server, never by an operation.
  creator_id UUID NOT NULL REFERENCES member (id),
  created_at TIMESTAMPTZ NOT NULL,
  version    BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted    BOOLEAN NOT NULL DEFAULT FALSE
);

-- A List's Items: its delete and its Visibility change write all of them.
CREATE INDEX item_list_id ON item (list_id);

CREATE TRIGGER item_bump_version
  BEFORE INSERT OR UPDATE ON item
  FOR EACH ROW EXECUTE FUNCTION bump_version();

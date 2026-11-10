-- Item history of a Shopping list (spec #4, Schema; ticket #74): the names ever added to it, for
-- autocomplete. Names only (no Category, no Description). Syncable for the pull (S1): id, version,
-- updated_at, deleted, with the shared Version trigger from V1; read-only for the push
-- (sync.read_only). The server writes it, in the Item operation's transaction, and makes the ids.
CREATE TABLE item_history (
  id              UUID PRIMARY KEY,
  list_id         UUID NOT NULL REFERENCES list (id),
  -- The name trimmed and lower-cased: one row per List and normalised name.
  normalized_name VARCHAR(1000) NOT NULL,
  -- The latest spelling, shown as the suggestion.
  name            VARCHAR(1000) NOT NULL,
  last_used_at    TIMESTAMPTZ NOT NULL,
  version         BIGINT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL,
  deleted         BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (list_id, normalized_name)
);

CREATE TRIGGER item_history_bump_version
  BEFORE INSERT OR UPDATE ON item_history
  FOR EACH ROW EXECUTE FUNCTION bump_version();

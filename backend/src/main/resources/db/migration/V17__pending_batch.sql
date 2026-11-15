-- Notifications (spec #104, ticket #109). Server-only tables: no sync columns, hard-deleted.

-- A pending Batch: one Member's changes to one List not yet sent as a Notification. It is sent
-- once its last change is 2 minutes old, or its first one 10 minutes old.
CREATE TABLE pending_batch (
  actor_id        UUID NOT NULL REFERENCES member (id),
  list_id         UUID NOT NULL REFERENCES list (id),
  first_change_at TIMESTAMPTZ NOT NULL,
  last_change_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (actor_id, list_id)
);

-- The Items of a pending Batch, in the order first recorded: added, and/or assigned to
-- assignee_id (the latest Assignee the actor gave it; never the actor).
CREATE TABLE pending_batch_item (
  actor_id    UUID NOT NULL,
  list_id     UUID NOT NULL,
  item_id     UUID NOT NULL REFERENCES item (id),
  position    BIGINT GENERATED ALWAYS AS IDENTITY,
  added       BOOLEAN NOT NULL,
  assignee_id UUID REFERENCES member (id),
  PRIMARY KEY (actor_id, list_id, item_id),
  FOREIGN KEY (actor_id, list_id) REFERENCES pending_batch (actor_id, list_id) ON DELETE CASCADE
);

-- The scheduler step's single row: when it last ran (NULL until its first run). Reminders start
-- their window there.
CREATE TABLE scheduler_step (
  id          BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  last_run_at TIMESTAMPTZ
);
INSERT INTO scheduler_step DEFAULT VALUES;

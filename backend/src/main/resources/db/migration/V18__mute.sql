-- Mute (spec #104, ticket #111): a Member's «Без уведомлений» on one Shared list. While a live
-- row exists for the List and Member, Batches leave the List's additions out of that Member's
-- Notifications. Pulled only by its own Member.

-- Syncable (S1): id (client-generated, S3), version, updated_at, deleted. member_id is set by the
-- server from the pushing Member. Two devices Muting offline may both create a row for the same
-- List: either one Mutes, and unmuting deletes every one of them.
CREATE TABLE mute (
  id         UUID PRIMARY KEY,
  list_id    UUID NOT NULL REFERENCES list (id),
  member_id  UUID NOT NULL REFERENCES member (id),
  version    BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted    BOOLEAN NOT NULL DEFAULT FALSE
);

-- Sending a Batch reads a List's Mutes; deleting a List or making it Private deletes them.
CREATE INDEX mute_list_id_idx ON mute (list_id);

CREATE TRIGGER mute_bump_version
  BEFORE INSERT OR UPDATE ON mute
  FOR EACH ROW EXECUTE FUNCTION bump_version();

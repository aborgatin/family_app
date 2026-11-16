-- Documents on Medical cards (spec #128, ticket #133): one file (a PDF or a photo) with its title,
-- the date it is from and a description. The row is created by POST /api/documents once the file is
-- stored; it is then edited and deleted through sync. The file itself is never in the database: it
-- is an object in the file store under a key made from the id, encrypted by the server (ADR-0010).
-- Seen by whoever sees the card (medical.Person), like the illness rows.

-- Syncable (S1): id (client-generated, S3), version, updated_at, deleted. illness_event_id: the
-- Illness event it was added to (ticket #134), at most one Document per event. content_type: what
-- the server found the file to be (application/pdf, image/jpeg, image/png, image/heic,
-- image/heif); size: the file's length in bytes, as uploaded.
CREATE TABLE document (
  id               UUID PRIMARY KEY,
  member_id        UUID REFERENCES member (id),
  child_id         UUID REFERENCES child (id),
  illness_event_id UUID REFERENCES illness_event (id),
  title            TEXT NOT NULL,
  date             DATE NOT NULL,
  description      TEXT,
  content_type     TEXT NOT NULL,
  size             BIGINT NOT NULL,
  version          BIGINT NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL,
  deleted          BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT document_one_person CHECK ((member_id IS NULL) <> (child_id IS NULL))
);

-- One Document per Illness event: a deleted one no longer counts.
CREATE UNIQUE INDEX document_illness_event_id_idx ON document (illness_event_id) WHERE NOT deleted;

-- Deleting a Child deletes their Documents.
CREATE INDEX document_child_id_idx ON document (child_id);

CREATE TRIGGER document_bump_version
  BEFORE INSERT OR UPDATE ON document
  FOR EACH ROW EXECUTE FUNCTION bump_version();

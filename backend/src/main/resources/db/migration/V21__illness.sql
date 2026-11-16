-- Medical cards (spec #128, ticket #129): Illnesses and Conditions (illness) and their Illness
-- events (illness_event). A Medical card is not a row: every Member and Child has one, and a card's
-- rows name their person, exactly one of a Member and a Child. A Member's card rows are pulled
-- only by that Member; a Child's by every Member (module medical, MedicalCards).

-- Syncable (S1): id (client-generated, S3), version, updated_at, deleted.
-- kind ILLNESS | CONDITION (switchable); ended: «Завершить»; position orders Conditions;
-- created_at, set by the server, orders the Illnesses without events.
CREATE TABLE illness (
  id          UUID PRIMARY KEY,
  member_id   UUID REFERENCES member (id),
  child_id    UUID REFERENCES child (id),
  kind        TEXT NOT NULL CHECK (kind IN ('ILLNESS', 'CONDITION')),
  name        TEXT NOT NULL,
  description TEXT,
  ended       BOOLEAN NOT NULL DEFAULT FALSE,
  position    DOUBLE PRECISION,
  created_at  TIMESTAMPTZ NOT NULL,
  version     BIGINT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL,
  deleted     BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT illness_one_person CHECK ((member_id IS NULL) <> (child_id IS NULL))
);

-- Deleting a Child deletes their Illnesses.
CREATE INDEX illness_child_id_idx ON illness (child_id);

CREATE TRIGGER illness_bump_version
  BEFORE INSERT OR UPDATE ON illness
  FOR EACH ROW EXECUTE FUNCTION bump_version();

-- kind MEDICINE_DOSE | TEMPERATURE | NOTE, fixed when created. date and time are wall-clock
-- values as written, like a Due date (time optional). temperature: one decimal, 34.0–43.0
-- (TEMPERATURE: required; a dose: optional). medicine_id and amount: a dose (the medicine table
-- comes with its own ticket). title: a Note event.
CREATE TABLE illness_event (
  id          UUID PRIMARY KEY,
  illness_id  UUID NOT NULL REFERENCES illness (id),
  kind        TEXT NOT NULL CHECK (kind IN ('MEDICINE_DOSE', 'TEMPERATURE', 'NOTE')),
  date        DATE NOT NULL,
  time        TIME,
  medicine_id UUID,
  amount      TEXT,
  temperature NUMERIC(3, 1),
  title       TEXT,
  description TEXT,
  version     BIGINT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL,
  deleted     BOOLEAN NOT NULL DEFAULT FALSE
);

-- Deleting an Illness deletes its events.
CREATE INDEX illness_event_illness_id_idx ON illness_event (illness_id);

CREATE TRIGGER illness_event_bump_version
  BEFORE INSERT OR UPDATE ON illness_event
  FOR EACH ROW EXECUTE FUNCTION bump_version();

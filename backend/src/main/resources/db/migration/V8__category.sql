-- Categories of a Shopping list (spec #4, Schema; ticket #70; ADR-0006). Syncable (S1): id,
-- version, updated_at, deleted, with the shared Version trigger from V1. The client generates the
-- id (S3); deletes are soft (S2). Only Lists of kind SHOPPING have Categories (checked in Java).
CREATE TABLE category (
  id         UUID PRIMARY KEY,
  list_id    UUID NOT NULL REFERENCES list (id),
  -- 1–100 code points after trim; two Categories may have the same name.
  name       VARCHAR(100) NOT NULL,
  -- An ordering key like child_field.position: a move writes only the moved Category, with the
  -- midpoint between its new neighbours; ties are broken by id.
  position   DOUBLE PRECISION NOT NULL,
  version    BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted    BOOLEAN NOT NULL DEFAULT FALSE
);

-- A List's Categories: its delete and its Visibility change write all of them.
CREATE INDEX category_list_id ON category (list_id);

CREATE TRIGGER category_bump_version
  BEFORE INSERT OR UPDATE ON category
  FOR EACH ROW EXECUTE FUNCTION bump_version();

-- The Unnamed category is not a row: it is an Item with no Category. Its place among the List's
-- Categories is a field of the List, written like its name (Last write wins per field).
ALTER TABLE list ADD COLUMN unnamed_category_position DOUBLE PRECISION NOT NULL DEFAULT 0;

-- An Item's Category; none is the Unnamed category.
ALTER TABLE item ADD COLUMN category_id UUID REFERENCES category (id);

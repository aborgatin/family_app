-- The Family's Medicines (spec #128, ticket #130): one-line names («Ибупрофен 20 мг/мл») that
-- Medicine doses name. Syncable (S1), seen by every Member. A deleted Medicine stays (soft delete,
-- S2) and is still pulled with its name, so past doses keep showing it.

CREATE TABLE medicine (
  id         UUID PRIMARY KEY,
  name       TEXT NOT NULL,
  version    BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted    BOOLEAN NOT NULL DEFAULT FALSE,
  -- Set on a new Medicine kept deleted because another one already had its name (both added
  -- offline): the one that survived, which the doses naming this one name instead.
  merged_into UUID REFERENCES medicine (id)
);

-- The name is unique ignoring case among Medicines that aren't deleted (medicine.duplicate).
CREATE UNIQUE INDEX medicine_name_idx ON medicine (lower(name)) WHERE NOT deleted;

CREATE TRIGGER medicine_bump_version
  BEFORE INSERT OR UPDATE ON medicine
  FOR EACH ROW EXECUTE FUNCTION bump_version();

-- The foreign key V21 left for this table: a dose names a Medicine (a deleted one too).
ALTER TABLE illness_event
  ADD CONSTRAINT illness_event_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES medicine (id);

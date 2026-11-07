-- Child fields («Поля профиля», spec #5, ADR-0007) and their Defaults.

-- Syncable (S1): id (client-generated, S3), version, updated_at, deleted.
-- value_type is fixed at creation (ADR-0007). Its allowed values are checked in Java (enum
-- ValueType), not by a CHECK here, so that a new Value type is a code change only (ADR-0007).
-- position is a numeric ordering key: a reorder writes only the moved field, giving it a position
-- between its new neighbours; ties are broken by id.
CREATE TABLE child_field (
  id         UUID PRIMARY KEY,
  family_id  UUID NOT NULL REFERENCES family (id),
  name       VARCHAR(100) NOT NULL,
  value_type VARCHAR(16) NOT NULL,
  position   DOUBLE PRECISION NOT NULL,
  version    BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TRIGGER child_field_bump_version
  BEFORE INSERT OR UPDATE ON child_field
  FOR EACH ROW EXECUTE FUNCTION bump_version();

-- Defaults: written once per installation, here, so they never come back after a Member edits or
-- removes them.
INSERT INTO child_field (id, family_id, name, value_type, position)
SELECT gen_random_uuid(), family.id, defaults.name, 'TEXT', defaults.position
FROM family, (VALUES ('Вес', 1.0), ('Рост', 2.0)) AS defaults (name, position);

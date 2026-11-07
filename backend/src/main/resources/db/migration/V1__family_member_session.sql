-- Foundation (spec #5 Schema, ADR-0003): the global Version sequence and the shared trigger that
-- every syncable table uses, the Family with its Default row, Members, and Spring Session tables.

-- One global, monotonic Version for every syncable row (ADR-0003, CODING_STANDARDS S2).
CREATE SEQUENCE version_seq;

-- Attached to every syncable table for INSERT and UPDATE, so no code path can forget to bump the
-- Version. A soft delete (deleted = true) is an UPDATE and bumps it too.
CREATE FUNCTION bump_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := nextval('version_seq');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Not syncable: exactly one row (ADR-0004), not exposed through the API.
CREATE TABLE family (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL
);

-- Defaults: the single Family.
INSERT INTO family (name) VALUES ('Семья');

-- Syncable (S1): id, version, updated_at, deleted.
CREATE TABLE member (
  id                    UUID PRIMARY KEY,
  family_id             UUID NOT NULL REFERENCES family (id),
  email                 VARCHAR(254) NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash         VARCHAR(255) NOT NULL,
  display_name          VARCHAR(100) NOT NULL,
  grammatical_gender    VARCHAR(16) NOT NULL CHECK (grammatical_gender IN ('MASCULINE', 'FEMININE')),
  notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  version               BIGINT NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL,
  deleted               BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TRIGGER member_bump_version
  BEFORE INSERT OR UPDATE ON member
  FOR EACH ROW EXECUTE FUNCTION bump_version();

-- Spring Session JDBC (spring-session-jdbc schema-postgresql.sql). Not syncable: server-only.
CREATE TABLE spring_session (
  primary_id            CHAR(36) NOT NULL,
  session_id            CHAR(36) NOT NULL,
  creation_time         BIGINT NOT NULL,
  last_access_time      BIGINT NOT NULL,
  max_inactive_interval INT NOT NULL,
  expiry_time           BIGINT NOT NULL,
  principal_name        VARCHAR(100),
  CONSTRAINT spring_session_pk PRIMARY KEY (primary_id)
);

CREATE UNIQUE INDEX spring_session_ix1 ON spring_session (session_id);
CREATE INDEX spring_session_ix2 ON spring_session (expiry_time);
CREATE INDEX spring_session_ix3 ON spring_session (principal_name);

CREATE TABLE spring_session_attributes (
  session_primary_id CHAR(36) NOT NULL,
  attribute_name     VARCHAR(200) NOT NULL,
  attribute_bytes    BYTEA NOT NULL,
  CONSTRAINT spring_session_attributes_pk PRIMARY KEY (session_primary_id, attribute_name),
  CONSTRAINT spring_session_attributes_fk FOREIGN KEY (session_primary_id)
    REFERENCES spring_session (primary_id) ON DELETE CASCADE
);

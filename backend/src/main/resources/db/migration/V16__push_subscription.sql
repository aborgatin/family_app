-- Notifications (spec #104; ticket #107).

-- The Notifications switch: off until the Member turns it on, for existing Members too (V1 created
-- the column with default TRUE, unused until now).
ALTER TABLE member ALTER COLUMN notifications_enabled SET DEFAULT FALSE;
UPDATE member SET notifications_enabled = FALSE WHERE notifications_enabled;

-- Not syncable: server-only. One row per browser push subscription (its endpoint), for the Member
-- logged in on that device, tied to the session that registered it: when that session ends
-- (logout, expiry cleanup, a password reset ending every session) the row goes with it.
CREATE TABLE push_subscription (
  endpoint           TEXT PRIMARY KEY CHECK (length(endpoint) <= 2048),
  p256dh             VARCHAR(100) NOT NULL,
  auth               VARCHAR(50) NOT NULL,
  member_id          UUID NOT NULL REFERENCES member (id) ON DELETE CASCADE,
  session_primary_id CHAR(36) NOT NULL REFERENCES spring_session (primary_id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL
);

CREATE INDEX push_subscription_member_ix ON push_subscription (member_id);
CREATE INDEX push_subscription_session_ix ON push_subscription (session_primary_id);

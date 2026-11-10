-- A todo item's Assignee (spec #81, Schema; ticket #85): the Member responsible for it. Nullable,
-- no backfill; only Items of a Shared Todo list have one (checked in Java), and making the List
-- Private clears it on all its Items (`ListService`).
ALTER TABLE item ADD COLUMN assignee_id UUID REFERENCES member (id);

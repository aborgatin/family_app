-- A todo item's Due date (spec #81, Schema; ticket #84): a calendar day, optionally with a time of
-- day. Both are wall-clock values, not an instant: «15 ноября, 15:00» is the same on every device,
-- whatever its time zone. Nullable, no backfill; only Items of a Todo list have them, and a time
-- only with a date (both checked in Java).
ALTER TABLE item ADD COLUMN due_date DATE;
ALTER TABLE item ADD COLUMN due_time TIME;

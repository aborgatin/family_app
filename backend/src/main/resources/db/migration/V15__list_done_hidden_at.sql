-- Hide done on a Todo list (spec #81; ticket #93): the moment up to which the List's Done items
-- are hidden from «Выполнено», for both Members. Set only by the server, with its own clock, when
-- a List upsert carries `hideDone: true` (`ListService`); only a Todo list has one (checked in
-- Java). Nullable, no backfill: no List has been hidden yet.
ALTER TABLE list ADD COLUMN done_hidden_at TIMESTAMPTZ;

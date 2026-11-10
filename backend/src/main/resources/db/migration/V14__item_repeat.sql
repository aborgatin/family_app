-- A todo item's Repeat (spec #81, Schema; ticket #86): DAILY, WEEKLY, MONTHLY or YEARLY, checked in
-- Java like List kinds. Nullable, no backfill; only Items of a Todo list with a Due date have one
-- (checked in Java), and removing the Due date removes it (`ItemService`).
ALTER TABLE item ADD COLUMN repeat VARCHAR(16);

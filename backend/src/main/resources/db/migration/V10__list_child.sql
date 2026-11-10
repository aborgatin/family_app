-- Child lists (spec #81, Schema; ticket #90): a List may be about a Child, for good. Nullable, no
-- backfill: every existing List stays an ordinary one. The rules (TODO or WISH only, always
-- Shared, set on create only) are checked in Java, like kinds and Visibility.
ALTER TABLE list ADD COLUMN child_id UUID REFERENCES child (id);

-- Deleting a Child soft-deletes its Child lists.
CREATE INDEX list_child_id_idx ON list (child_id) WHERE child_id IS NOT NULL;

-- Child avatar (ticket #124): the figure a Child is shown with, a code from the Avatar set
-- (web/src/shared/palette/childAvatars.json), checked in Java so that the set can grow without a
-- migration. Optional: NULL shows the Child's initial.
ALTER TABLE child ADD COLUMN avatar VARCHAR(32);

-- An Item's Description (spec #4, ticket #69): `note` becomes `description`, the glossary's word.
-- Nothing is in production, so there is no compatibility shim. Up to 10000 code points; NULL = none.
ALTER TABLE item RENAME COLUMN note TO description;

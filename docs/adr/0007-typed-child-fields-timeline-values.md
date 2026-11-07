# 0007 — Typed Child fields; values stored as a timeline

- **Status:** Accepted
- **Date:** 2026-11-07

## Context
Child fields are defined by the Family in Settings (ADR-0005). Some hold free text («Размер обуви»),
some hold dates, and some change over time where the past is worth keeping («Вес», «Рост»). We want
the first iteration simple, but adding more value types or a history view later should not need a
data migration or lose data recorded before the feature existed.

## Decision
- Every Child field has a **value type**. For now: `TEXT` and `DATE`. The set of value types is code
  (like List kinds), not Family data.
- The value type is chosen when the Child field is created and **never changes**. To change it, delete
  the field and create a new one.
- Values are always stored as text in a canonical format per type (dates as `YYYY-MM-DD`). A new value
  type is a code change: type value, client input, server validation. No schema change.
- A Child's birthday is **not** a Child field. It is a column on Child, because the app itself relies
  on it (ordering, age, possible birthday Reminders) and it must not be renamed or deleted in Settings.
- Child field values (M4) are stored as a **timeline**: saving a value appends a new entry (Child, Child
  field, value, recorded at). The Child profile shows the latest entry. Entries are ordinary syncable
  rows with client-generated ids.

## Consequences
- M4 editing looks like plain overwrite to the Member, but every past value is kept from day one.
- Appending never conflicts in sync (ADR-0003), unlike overwriting one shared value from two devices.
- A later per-field «Хранить историю» switch can show history (e.g. a growth chart) using entries
  already recorded. Fields without the switch simply never show past entries.
- A typo fix adds an entry rather than replacing one; the history view will need a way to delete a
  wrong entry.
- Storage grows with every save. This is negligible for one Family.

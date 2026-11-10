import { useCallback, useMemo } from 'react';
import { ApiError } from '@/shared/api';
import { upsertRow, useRows } from '@/shared/sync';
import type { ChildField, ChildFieldValue } from './childFieldTypes';

/** The longest value of a `TEXT` Child field, in code points (the server's limit). */
const MAX_TEXT_LENGTH = 1000;

/**
 * A Child's value for every Child field, and the way to save one: the only data access of the
 * Child profile's values. It reads the local store and writes through the Outbox (S4), so it works
 * the same offline.
 *
 * Values are a timeline (ADR-0007): `save` appends an entry, and `values` holds, per Child field
 * id, the value of the **latest** entry (no entry: absent). The latest is the entry the server
 * received last, so the one with the highest Version; an entry saved here and not pulled back yet
 * has no Version and is later than every pulled one, the last saved first among them (their
 * device-only `savedHereAt`, written with `upsertRow`'s `local` and never sent; device and server
 * order are never compared). `values` is `undefined` until the first local read.
 */
export function useChildFieldValues(childId: string) {
  const rows = useRows('child_field_value') as unknown as ChildFieldValue[] | undefined;

  const values = useMemo(() => {
    if (rows === undefined) return undefined;
    const latest = new Map<string, ChildFieldValue>();
    for (const entry of rows) {
      if (entry.childId !== childId) continue;
      const current = latest.get(entry.childFieldId);
      if (current === undefined || isLater(entry, current)) latest.set(entry.childFieldId, entry);
    }
    return new Map([...latest].map(([childFieldId, entry]) => [childFieldId, entry.value]));
  }, [rows, childId]);

  /**
   * Saves the Child's value for `field` (trimmed; `''` clears it) as a new entry, and resolves
   * with the value as saved, at once, offline too. A value equal to the latest one records
   * nothing. A text over 1000 characters is refused here as the server would (`too_long`).
   */
  const save = useCallback(
    async (field: ChildField, value: string): Promise<string> => {
      const saved = value.trim();
      if (saved === (values?.get(field.id) ?? '')) return saved;
      if (field.valueType === 'TEXT' && [...saved].length > MAX_TEXT_LENGTH) {
        throw new ApiError(400, 'validation.failed', {
          errors: [{ field: 'value', code: 'too_long' }],
        });
      }
      await upsertRow(
        'child_field_value',
        crypto.randomUUID(),
        { childId, childFieldId: field.id, value: saved },
        { savedHereAt: saveTime() },
      );
      return saved;
    },
    [childId, values],
  );

  return { values, save };
}

/** Whether entry `a` is later in the timeline than `b` (see `useChildFieldValues`). */
function isLater(a: ChildFieldValue, b: ChildFieldValue): boolean {
  if (a.version !== undefined && b.version !== undefined) return a.version > b.version;
  // Not pulled back yet: saved here after every entry the device has pulled.
  if (a.version !== undefined) return false;
  if (b.version !== undefined) return true;
  return (a.savedHereAt ?? 0) > (b.savedHereAt ?? 0);
}

let lastSaveTime = 0;

/** Now in ms, at least a millisecond after the last save, so two quick saves keep their order. */
function saveTime(): number {
  lastSaveTime = Math.max(Date.now(), lastSaveTime + 1);
  return lastSaveTime;
}

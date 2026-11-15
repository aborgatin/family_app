import { useCallback, useMemo } from 'react';
import { deleteRow, upsertRow, useRows } from '@/shared/sync';

/** A Mute row on the local store: the pull brings only the Member's own. */
interface Mute {
  id: string;
  listId: string;
}

/**
 * The Member's Mute of the List («Без уведомлений», spec #104): the only data access for it. It
 * reads the local store and writes through the Outbox (S4), so it works the same offline.
 * `undefined` until the first local read (so nothing can be set before the Mutes are known);
 * then `setMuted(true)` creates a Mute under a new id unless the List has one, and
 * `setMuted(false)` deletes every Mute of the List (two devices Muting offline make two).
 */
export function useMute(
  listId: string,
): { muted: boolean; setMuted: (value: boolean) => Promise<void> } | undefined {
  const rows = useRows('mute') as Mute[] | undefined;
  const mutes = useMemo(() => rows?.filter((row) => row.listId === listId), [rows, listId]);
  const setMuted = useCallback(
    async (value: boolean) => {
      if (mutes === undefined) return;
      if (value) {
        if (mutes.length === 0) await upsertRow('mute', crypto.randomUUID(), { listId });
        return;
      }
      for (const mute of mutes) await deleteRow('mute', mute.id);
    },
    [listId, mutes],
  );
  return mutes === undefined ? undefined : { muted: mutes.length > 0, setMuted };
}

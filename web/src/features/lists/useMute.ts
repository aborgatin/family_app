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
 * `muted` is `undefined` until the first local read. `setMuted(true)` creates a Mute under a new
 * id; `setMuted(false)` deletes every Mute of the List (two devices Muting offline make two).
 */
export function useMute(listId: string) {
  const rows = useRows('mute') as Mute[] | undefined;
  const mutes = useMemo(() => rows?.filter((row) => row.listId === listId), [rows, listId]);
  const setMuted = useCallback(
    async (value: boolean) => {
      if (value) {
        if (mutes?.length === 0) await upsertRow('mute', crypto.randomUUID(), { listId });
        return;
      }
      for (const mute of mutes ?? []) await deleteRow('mute', mute.id);
    },
    [listId, mutes],
  );
  return { muted: mutes === undefined ? undefined : mutes.length > 0, setMuted };
}

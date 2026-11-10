import { useCallback, useMemo } from 'react';
import { deleteRow, useRows } from '@/shared/sync';
import { compare, normalizedName, sortableTime } from './itemKeys';
import type { ItemHistoryName, List } from './listTypes';

/** How many names autocomplete shows at most. */
const MAX_NAMES = 5;

/**
 * Autocomplete from a Shopping list's Item history: the only data access for it. It reads the
 * local store (the server writes the names; the device pulls them and may only remove one), so it
 * works offline. Only a Shopping list's screen uses it (Todo and Wish lists keep no history).
 */
export function useItemHistory(list: List) {
  const rows = useRows('item_history') as ItemHistoryName[] | undefined;
  const listId = list.id;

  // Newest use first, ties by name.
  const names = useMemo(
    () =>
      (rows ?? [])
        .filter((row) => row.listId === listId)
        .sort(
          (a, b) =>
            compare(sortableTime(b.lastUsedAt), sortableTime(a.lastUsedAt)) ||
            a.name.localeCompare(b.name),
        ),
    [rows, listId],
  );

  /**
   * Up to 5 names of the history with a word that starts with the typed text, both trimmed and
   * lower-cased, the most recently used first.
   */
  const namesStarting = useCallback(
    (typed: string): readonly string[] => {
      const prefix = normalizedName(typed);
      if (prefix === '') return [];
      return names
        .filter(({ name }) => startsAWord(normalizedName(name), prefix))
        .slice(0, MAX_NAMES)
        .map(({ name }) => name);
    },
    [names],
  );

  /**
   * Removes a name (a typo) from the history at once, through the Outbox, offline too; no
   * confirmation, since the server remembers it again the next time an Item gets that name.
   */
  const remove = useCallback(
    async (name: string): Promise<void> => {
      const row = names.find((candidate) => candidate.name === name);
      if (row !== undefined) await deleteRow('item_history', row.id);
    },
    [names],
  );

  return { namesStarting, remove };
}

/** Whether `prefix` starts at the beginning of `name` or after a space in it. */
function startsAWord(name: string, prefix: string): boolean {
  for (let at = name.indexOf(prefix); at !== -1; at = name.indexOf(prefix, at + 1)) {
    if (at === 0 || /\s/.test(name.charAt(at - 1))) return true;
  }
  return false;
}

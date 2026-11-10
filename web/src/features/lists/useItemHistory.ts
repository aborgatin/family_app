import { useCallback, useMemo } from 'react';
import { useRows } from '@/shared/sync';
import type { ItemHistoryEntry, List } from './listTypes';
import { sortableTime } from './useItems';

/** How many names autocomplete shows at most. */
const SUGGESTIONS = 5;

/**
 * Autocomplete from a Shopping list's Item history: the only data access for it. It reads the
 * local store (the server writes the history; the device only pulls it), so it works offline.
 * Only a Shopping list's screen uses it (Todo and Wish lists keep no history).
 */
export function useItemHistory(list: List) {
  const rows = useRows('item_history') as ItemHistoryEntry[] | undefined;
  const listId = list.id;

  // Newest use first, ties by name.
  const entries = useMemo(
    () =>
      (rows ?? [])
        .filter((row) => row.listId === listId)
        .sort(
          (a, b) =>
            compareDesc(sortableTime(a.lastUsedAt), sortableTime(b.lastUsedAt)) ||
            a.name.localeCompare(b.name),
        ),
    [rows, listId],
  );

  /**
   * Up to 5 names of the history with a word that starts with the typed text, both trimmed and
   * lower-cased, the most recently used first.
   */
  const suggest = useCallback(
    (typed: string): readonly string[] => {
      const prefix = normalize(typed);
      if (prefix === '') return [];
      return entries
        .filter(({ name }) => startsAWord(normalize(name), prefix))
        .slice(0, SUGGESTIONS)
        .map(({ name }) => name);
    },
    [entries],
  );

  return { suggest };
}

/** A name as the history keys it: trimmed and lower-cased. */
function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/** Whether `prefix` starts at the beginning of `name` or after a space in it. */
function startsAWord(name: string, prefix: string): boolean {
  for (let at = name.indexOf(prefix); at !== -1; at = name.indexOf(prefix, at + 1)) {
    if (at === 0 || /\s/.test(name.charAt(at - 1))) return true;
  }
  return false;
}

/** Descending. */
function compareDesc(a: string, b: string): number {
  return a === b ? 0 : a < b ? 1 : -1;
}

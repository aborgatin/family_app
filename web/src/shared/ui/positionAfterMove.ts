/**
 * The position of the entry at `from` moved to index `to` (counted after the move), given every
 * entry's position in order: the midpoint between its new neighbours, or one past the end
 * neighbour at the top or bottom. Only the moved entry's position changes, so a reorder in a
 * `SortableList` is a single-record write (Last write wins). `undefined` when it doesn't move.
 */
export function positionAfterMove(
  positions: readonly number[],
  from: number,
  to: number,
): number | undefined {
  if (from === -1 || to === from || to < 0 || to >= positions.length) return undefined;
  const others = positions.filter((_, index) => index !== from);
  const before = others[to - 1];
  const after = others[to];
  if (before === undefined) return (after as number) - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

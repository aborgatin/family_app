// How Items and Item history names are compared and sorted; shared by `useItems()` and
// `useItemHistory()`.

/** A name as the Item history keys it, and as adding compares Items: trimmed and lower-cased. */
export function normalizedName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * An ISO-8601 UTC time that sorts as text: the server prints 0, 3, 6 or 9 fraction digits
 * (`…:00Z`, `…:00.123Z`, `…:00.123456Z`), so the fraction is padded to 9.
 */
export function sortableTime(time: string): string;
export function sortableTime(time: string | undefined): string | undefined;
export function sortableTime(time: string | undefined): string | undefined {
  if (time === undefined) return undefined;
  const [, seconds = time, fraction = ''] = /^(.*?)(?:\.(\d+))?Z$/.exec(time) ?? [];
  return `${seconds}.${fraction.padEnd(9, '0')}Z`;
}

/** Ascending; a missing value after every present one. Swap the arguments for descending. */
export function compare(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a < b ? -1 : 1;
}

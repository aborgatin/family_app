import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// The project's own lint rules, run through the ESLint API on small snippets. Type-checked linting
// needs a file the TypeScript project knows, so each snippet is linted as the text of an existing
// file of the kind under test.
const eslint = new ESLint({ cwd: resolve(import.meta.dirname, '../..') });

const FEATURE_FILE = 'src/features/lists/dueDates.ts';
const DATES_MODULE = 'src/shared/dates/index.ts';
const TEST_FILE = 'src/features/lists/items.test.tsx';
const OLDER_STORE = 'src/test/olderStore.ts';

async function messages(code: string, filePath: string, ruleId: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === ruleId).map((m) => m.message);
}

describe('reuse/dates-from-shared-dates', () => {
  const RULE = 'reuse/dates-from-shared-dates';
  const handParsed = `export const parts = (day: string) => day.split('-').map(Number);\n`;

  it('rejects a date string split by hand, naming @/shared/dates', async () => {
    const found = await messages(handParsed, FEATURE_FILE, RULE);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('@/shared/dates');
  });

  it('rejects a hand-written date pattern', async () => {
    const found = await messages(
      `export const isDay = (s: string) => /^\\d{4}-\\d{2}-\\d{2}$/.test(s);\n`,
      FEATURE_FILE,
      RULE,
    );
    expect(found).toHaveLength(1);
  });

  it('allows it inside @/shared/dates', async () => {
    expect(await messages(handParsed, DATES_MODULE, RULE)).toEqual([]);
  });

  it('leaves other splits alone', async () => {
    const other = `export const words = (s: string) => s.split(' ');\n`;
    expect(await messages(other, FEATURE_FILE, RULE)).toEqual([]);
  });
});

describe('reuse/store-versions-in-older-store', () => {
  const RULE = 'reuse/store-versions-in-older-store';
  const declared = `import Dexie from 'dexie';
const older = new Dexie('family');
older.version(1).stores({ list: 'id' });
`;

  it('rejects a test declaring the store versions, naming @/test/olderStore', async () => {
    const found = await messages(declared, TEST_FILE, RULE);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('@/test/olderStore');
  });

  it('allows it in @/test/olderStore', async () => {
    expect(await messages(declared, OLDER_STORE, RULE)).toEqual([]);
  });
});

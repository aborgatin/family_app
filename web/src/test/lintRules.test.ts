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

  it('rejects a date pattern built with new RegExp', async () => {
    const found = await messages(
      `export const isDay = (s: string) => new RegExp('^\\\\d{4}-\\\\d{2}').test(s);\n`,
      FEATURE_FILE,
      RULE,
    );
    expect(found).toHaveLength(1);
  });

  it('leaves splits that are not dates alone', async () => {
    const other = `export const words = (s: string) => s.split(' ');
export const prefix = (id: string) => id.split('-')[0];\n`;
    expect(await messages(other, FEATURE_FILE, RULE)).toEqual([]);
  });
});

describe('testing-library async rules', () => {
  const lint = async (body: string) => {
    const code = `import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
it('x', async () => {
${body}
});
`;
    const [result] = await eslint.lintText(code, { filePath: TEST_FILE });
    return (result?.messages ?? [])
      .map((m) => m.ruleId)
      .filter((rule) => rule?.startsWith('testing-library/'));
  };

  it('rejects an un-awaited waitFor', async () => {
    expect(await lint(`  void waitFor(() => { expect(1).toBe(1); });`)).toContain(
      'testing-library/await-async-utils',
    );
  });

  it('rejects waiting for a getBy query instead of findBy', async () => {
    expect(await lint(`  await waitFor(() => screen.getByText('Молоко'));`)).toContain(
      'testing-library/prefer-find-by',
    );
  });

  it('rejects a side effect inside waitFor', async () => {
    expect(
      await lint(`  await waitFor(() => {
    fireEvent.click(screen.getByRole('button'));
  });`),
    ).toContain('testing-library/no-wait-for-side-effects');
  });

  it('allows awaiting a findBy query', async () => {
    expect(await lint(`  expect(await screen.findByText('Молоко')).toBeVisible();`)).toEqual([]);
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

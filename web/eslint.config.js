import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import i18next from 'eslint-plugin-i18next';
import reactHooks from 'eslint-plugin-react-hooks';
import testingLibrary from 'eslint-plugin-testing-library';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const TEST_FILES = ['src/**/*.test.{ts,tsx}', 'src/test/**'];

// ---------------------------------------------------------------------------
// M3 — feature folders and layer direction (CODING_STANDARDS M3)
//
// Layers: src/shared → src/features/<feature> → src/app.
// - Leaving your own folder (a layer, or one feature's folder) is done only through the
//   `@/` alias, never through a relative `../` that climbs out of it.
// - Another feature is imported only through its index.ts: `@/features/<name>`, never
//   `@/features/<name>/<file>`.
// - shared imports neither features nor app; a feature never imports app.
//
// no-restricted-imports matches the import string, so "climbs out of the folder" is expressed
// per file depth: a file N folders below its root may use at most N `../`. Config objects for the
// same rule replace each other, so each depth gets its own disjoint block.
// ---------------------------------------------------------------------------

const MAX_DEPTH = 8;

const DEEP_FEATURE_IMPORT = {
  group: ['@/features/*/**'],
  message: 'Import another feature only through its index.ts: `@/features/<name>` (M3).',
};
const FEATURES_FROM_SHARED = {
  group: ['@/features', '@/features/**'],
  message: 'shared must not import features: shared → features → app (M3).',
};
const UI_LIBRARIES = {
  group: ['@dnd-kit/*', 'lucide-react', '@radix-ui/*'],
  message: 'Only shared/ui uses the UI libraries; build screens from `@/shared/ui` (ADR-0008).',
};
const APP_FROM_BELOW = {
  group: ['@/app', '@/app/**'],
  message: 'Only app imports app: shared → features → app (M3).',
};

// ---------------------------------------------------------------------------
// N1 — names use GLOSSARY.md terms. The words below are from glossary _Avoid_ lines and have no
// other meaning in this code; a name with one of them as a camelCase / snake_case word (`user`,
// `UserRow`, `INVITATION_URL`, plural too) is an error. Avoid-words that are also ordinary UI or
// sync words (section, mode, entry, store, reset, history…) stay a review rule (CODING_STANDARDS
// N1), as does using a canonical term for the wrong thing.
// ---------------------------------------------------------------------------

const GLOSSARY_AVOID = [
  // Tests keep Testing Library's `userEvent` / `const user = userEvent.setup()`: the person at the
  // keyboard, not a Member.
  { word: 'user', use: 'Member', inTests: false },
  { word: 'adult', use: 'Member' },
  { word: 'tenant', use: 'Family' },
  { word: 'household', use: 'Family' },
  // `grammaticalGender` is the canonical term itself.
  { word: 'gender', use: 'GrammaticalGender', unlessAfter: 'rammatical' },
  { word: 'sex', use: 'GrammaticalGender' },
  { word: 'kid', use: 'Child' },
  { word: 'invitation', use: 'Invite' },
  { word: 'referral', use: 'Invite' },
  { word: 'forgot', use: 'PasswordReset' },
  { word: 'recovery', use: 'PasswordReset' },
  { word: 'task', use: 'Item (or TodoList)' },
  { word: 'checklist', use: 'TodoList' },
  { word: 'wishlist', use: 'WishList' },
  { word: 'recurrence', use: 'Repeat' },
  { word: 'completed', use: 'Done' },
  { word: 'author', use: 'Creator (or Owner)' },
  { word: 'note', use: 'Description' },
];

/** A regex matching `word` as one word of an identifier: camelCase, PascalCase or SNAKE_CASE. */
function identifierWord({ word, unlessAfter }) {
  const lower = unlessAfter ? `(?<!${unlessAfter})` : '';
  const upper = unlessAfter ? `(?<!${unlessAfter.toUpperCase()}_)` : '';
  const cap = word[0].toUpperCase() + word.slice(1);
  const end = '(?:e?s)?(?=[A-Z0-9_]|$)';
  return [
    `(?:^|_)${word}${end}`,
    `(?:^|(?<=[a-z0-9_]))${lower}${cap}${end}`,
    `(?:^|_)${upper}${word.toUpperCase()}(?:E?S)?(?=_|$)`,
  ].join('|');
}

const glossaryNames = (entries) =>
  entries.map((entry) => ({
    selector: `Identifier[name=/${identifierWord(entry)}/]`,
    message: `Name it with the glossary term ${entry.use}, not "${entry.word}" (GLOSSARY.md, N1).`,
  }));
const GLOSSARY_NAMES = glossaryNames(GLOSSARY_AVOID);
const GLOSSARY_NAMES_IN_TESTS = glossaryNames(GLOSSARY_AVOID.filter((e) => e.inTests !== false));

// Design tokens — every colour is a token in shared/ui/theme.css (docs/design.md "Tokens"). A
// colour written into code (a Tailwind arbitrary value like `shadow-[0_0_1px_rgb(0_0_0/0.5)]`, a
// style object) has no dark-theme value. Tests are exempt.
// The function names may follow `_` (Tailwind's space) or `[`, so no `\b` before them.
const RAW_COLOUR = String.raw`#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z])|(?<![a-zA-Z-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\(`;
const RAW_COLOURS = [
  {
    selector: `Literal[value=/${RAW_COLOUR}/], TemplateElement[value.raw=/${RAW_COLOUR}/]`,
    message:
      'Use a colour token from shared/ui/theme.css (with its dark value), not a colour written in code (docs/design.md).',
  },
];

// ---------------------------------------------------------------------------
// Reuse — code one shared module owns is not written again elsewhere (the M4 retro, #94). Each
// rule is its own rule name, so it doesn't replace (or get replaced by) the no-restricted-syntax
// blocks below. Tested in src/test/lintRules.test.ts.
// ---------------------------------------------------------------------------

/** A rule reporting every node matching `selector` (an esquery selector) with `message`. */
function syntaxRule(selector, message) {
  return {
    meta: { type: 'problem', schema: [] },
    create: (context) => ({ [selector]: (node) => context.report({ node, message }) }),
  };
}

const reuse = {
  rules: {
    'dates-from-shared-dates': syntaxRule(
      [
        // `day.split('-').map(Number)`: a day taken apart by hand.
        "CallExpression[callee.property.name='map'][arguments.0.name='Number'] > MemberExpression.callee > CallExpression.object[callee.property.name='split'][arguments.0.value='-']",
        // A `\d{4}-` pattern, as a regex literal or a string given to RegExp.
        'Literal[regex.pattern=/\\\\d\\{4\\}-/]',
        ':matches(NewExpression, CallExpression)[callee.name="RegExp"] > Literal.arguments[value=/\\\\d\\{4\\}-/]',
      ].join(', '),
      'Parse and format `YYYY-MM-DD` days with `@/shared/dates` (dayParts, localDay…); add what is missing there.',
    ),
    'store-versions-in-older-store': syntaxRule(
      "CallExpression[callee.property.name='stores'][callee.object.callee.property.name='version']",
      'Build an older local store with `upgradeStoreFrom(version, seed)` from `@/test/olderStore`, not by declaring its versions in the test.',
    ),
  },
};

/**
 * Builds one config block per file depth under `root`, each banning relative imports that would
 * climb out of `root`, plus the layer's own `groups`.
 */
function layerBlocks(root, name, groups) {
  return Array.from({ length: MAX_DEPTH }, (_, depth) => ({
    name: `m3/${name}/depth-${String(depth)}`,
    files: [`${root}/${'*/'.repeat(depth)}*.{ts,tsx}`],
    ignores: TEST_FILES,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `^(\\.\\./){${String(depth + 1)},}`,
              message: `Do not climb out of ${name} with a relative import; use the @/ alias (M3).`,
            },
            ...groups,
          ],
        },
      ],
    },
  }));
}

export default defineConfig([
  globalIgnores(['dist', 'coverage']),

  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.strictTypeChecked],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
  },

  // I2 — every user-visible string comes from the i18n files: JSX text and user-visible
  // attributes. Tests are excluded: they assert on the Russian text the user sees.
  {
    files: ['src/**/*.tsx'],
    ignores: TEST_FILES,
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-only',
          'jsx-attributes': {
            include: [
              '^aria-label$',
              '^aria-description$',
              '^aria-placeholder$',
              '^aria-roledescription$',
              '^aria-valuetext$',
              '^title$',
              '^alt$',
              '^placeholder$',
              '^label$',
            ],
          },
          message: 'User-visible text must come from the ru i18n file (I2)',
        },
      ],
    },
  },

  // Testing Library's async rules: an un-awaited async query or util, waitFor around a getBy (use
  // findBy), side effects or several assertions inside waitFor. These make a test pass or fail by
  // timing (the M4 retro, #94). Tested in src/test/lintRules.test.ts.
  {
    name: 'testing-library/async',
    files: TEST_FILES,
    plugins: { 'testing-library': testingLibrary },
    rules: {
      'testing-library/await-async-events': 'error',
      'testing-library/await-async-queries': 'error',
      'testing-library/await-async-utils': 'error',
      'testing-library/no-await-sync-events': 'error',
      'testing-library/no-await-sync-queries': 'error',
      'testing-library/no-promise-in-fire-event': 'error',
      'testing-library/no-wait-for-multiple-assertions': 'error',
      'testing-library/no-wait-for-side-effects': 'error',
      'testing-library/no-wait-for-snapshot': 'error',
      'testing-library/prefer-find-by': 'error',
    },
  },

  {
    name: 'reuse/dates-from-shared-dates',
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/shared/dates/**'],
    plugins: { reuse },
    rules: { 'reuse/dates-from-shared-dates': 'error' },
  },
  {
    name: 'reuse/store-versions-in-older-store',
    files: TEST_FILES,
    ignores: ['src/test/olderStore.ts'],
    plugins: { reuse },
    rules: { 'reuse/store-versions-in-older-store': 'error' },
  },

  // no-restricted-syntax blocks replace each other per file, like no-restricted-imports, so each
  // later block repeats the selectors of the earlier ones that also cover its files.
  {
    name: 'n1/glossary-names-in-tests',
    files: TEST_FILES,
    rules: { 'no-restricted-syntax': ['error', ...GLOSSARY_NAMES_IN_TESTS] },
  },
  {
    name: 'design/colour-tokens-only',
    files: ['src/**/*.{ts,tsx}'],
    ignores: TEST_FILES,
    rules: { 'no-restricted-syntax': ['error', ...GLOSSARY_NAMES, ...RAW_COLOURS] },
  },

  // U1 — screens are built only from shared/ui (ADR-0008, docs/design.md): no raw form elements or
  // links, no className / style in features, in JSX or through createElement / cloneElement (the
  // only way a .ts file can draw). A separate rule from the M3 blocks below, since
  // no-restricted-imports blocks replace each other per file. Tests are exempt.
  {
    name: 'u1/features-only-shared-ui',
    files: ['src/features/**/*.{ts,tsx}'],
    ignores: TEST_FILES,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...GLOSSARY_NAMES,
        ...RAW_COLOURS,
        {
          selector: 'JSXOpeningElement[name.name=/^(button|input|select|textarea|form|a)$/]',
          message:
            'Build screens only from `@/shared/ui` (Button, Link, InputRow, Form, …); add a new look there first (U1).',
        },
        {
          selector: 'JSXAttribute[name.name=/^(className|style)$/]',
          message:
            'No className or style in features: styling lives in `@/shared/ui` components and their props (U1).',
        },
        {
          selector:
            'CallExpression[callee.name=/^(createElement|cloneElement)$/], CallExpression[callee.property.name=/^(createElement|cloneElement)$/]',
          message:
            'No createElement / cloneElement in features: render `@/shared/ui` components in JSX (U1).',
        },
      ],
    },
  },

  // Data access (docs/architecture/frontend.md "Data access"): a component reads and writes synced
  // data only through its feature's hook, never through `@/shared/sync`'s writers, its internals or
  // Dexie. The typescript-eslint copy of no-restricted-imports, so it doesn't replace the M3 blocks
  // above for the same files. Hooks (.ts) and tests are exempt.
  {
    name: 'data-access/components-use-hooks',
    files: ['src/features/**/*.tsx', 'src/app/**/*.tsx'],
    ignores: TEST_FILES,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/shared/sync',
              importNames: ['upsertRow', 'deleteRow', 'flushOutbox', 'stopSyncAndWipe'],
              allowTypeImports: true,
              message:
                'Components write synced data through their feature hook (useChildren, useItems, useLogout…), not the sync writers (frontend.md "Data access").',
            },
            {
              name: 'dexie',
              message: 'Only @/shared/sync touches Dexie (frontend.md "Data access").',
            },
          ],
          patterns: [
            {
              group: ['@/shared/sync/*'],
              allowTypeImports: true,
              message:
                'Import @/shared/sync through its index, and only its hooks from a component (frontend.md "Data access").',
            },
          ],
        },
      ],
    },
  },

  ...layerBlocks('src/shared', 'shared', [
    FEATURES_FROM_SHARED,
    APP_FROM_BELOW,
    DEEP_FEATURE_IMPORT,
  ]),
  ...layerBlocks('src/features/*', 'a feature folder', [
    APP_FROM_BELOW,
    DEEP_FEATURE_IMPORT,
    UI_LIBRARIES,
  ]),
  ...layerBlocks('src/app', 'app', [DEEP_FEATURE_IMPORT]),

  {
    files: ['*.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
]);

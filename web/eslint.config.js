import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import i18next from 'eslint-plugin-i18next';
import reactHooks from 'eslint-plugin-react-hooks';
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

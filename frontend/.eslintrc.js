// NOTE: We intentionally do NOT extend next/core-web-vitals here.
// In this npm-workspaces monorepo, eslint-config-next is hoisted to the root
// but 'next' lives in frontend/node_modules, which breaks the config's
// parser.js at root resolution time. Next.js linting rules are applied when
// running `next lint` (which handles its own ESLint config internally);
// this file adds project-level filename enforcement on top.

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  // Only lint the directories where we enforce naming conventions.
  // Files outside these directories (app/, pages/, lib/, public/, etc.) are
  // ignored so the default Espree parser never tries to parse TSX/TS.
  ignorePatterns: [
    'src/app/**',
    'src/__tests__/**',
    'src/mock/**',
    'src/types/**',
    'pages/**',
    'lib/**',
    'src/*',
    '!src/components/',
    '!src/hooks/',
    '!src/lib/',
    '!src/store/',
    '!src/services/',
    '!src/features/',
  ],
  overrides: [
    {
      files: [
        'src/components/**/*.{ts,tsx}',
        'src/hooks/**/*.{ts,tsx}',
        'src/lib/**/*.{ts,tsx}',
        'src/store/**/*.{ts,tsx}',
        'src/services/**/*.{ts,tsx}',
        'src/features/**/*.{ts,tsx}',
      ],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      plugins: ['check-file'],
      rules: {
        // Enforce kebab-case file names.
        // Catches misspellings like create-challange.tsx or newbadgemodal.tsx
        // before they reach a PR.
        'check-file/filename-naming-convention': [
          'error',
          {
            'src/components/**/*.{ts,tsx}': 'KEBAB_CASE',
            'src/hooks/**/*.{ts,tsx}': 'KEBAB_CASE',
            'src/lib/**/*.{ts,tsx}': 'KEBAB_CASE',
            'src/store/**/*.{ts,tsx}': 'KEBAB_CASE',
            'src/services/**/*.{ts,tsx}': 'KEBAB_CASE',
            'src/features/**/*.{ts,tsx}': 'KEBAB_CASE',
          },
          {
            // Allow foo.test.tsx, foo.stories.tsx, etc.
            ignoreMiddleExtensions: true,
          },
        ],
      },
    },
  ],
};

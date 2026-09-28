import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

// Flat ESLint config — replaces the CRA-era `eslintConfig` package.json
// field, which only worked under react-scripts.
export default [
  {
    ignores: ['build/', 'coverage/', 'node_modules/', 'scripts/'],
  },
  js.configs.recommended,
  // Build/tooling config files are CommonJS — give them Node globals.
  {
    files: ['*.config.cjs', 'postcss.config.cjs', 'tailwind.config.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
  {
    files: ['e2e/**/*.{js,mjs}', 'playwright.config.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.vitest,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.{js,jsx,mjs}', 'vite.config.mjs', 'eslint.config.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.vitest,
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // only-export-components is a Fast-Refresh DX hint, not a correctness
      // rule; it fires false positives on data/hook modules (themes.js).
      // Deliberately off: this one has no correctness value here.
      'react-refresh/only-export-components': 'off',
    },
  },

    // M5: TypeScript source (incremental `.js -> .tsx` migration). Same shared
    // baseline as the JSX tree, but parsed by the TypeScript-aware parser and
    // held to M5's stated bar — `strict: true` means no `any` and no dead code,
    // so enforce those explicitly. The full `@typescript-eslint/recommended` set
    // is intentionally NOT enabled yet: it would surface a large volume of
    // stylistic rules on the still-`.js` tree and is a separate M5.x lint task.
    {
     files: ['src/**/*.{ts,tsx}'],
     languageOptions: {
       ecmaVersion: 'latest',
       sourceType: 'module',
       parser: tsParser,
       parserOptions: {
         ecmaFeatures: { jsx: true },
       },
       globals: {
        ...globals.browser,
         ...globals.node,
          ...globals.vitest,
        },
      },
     settings: {
       react: { version: 'detect' },
      },
     plugins: {
       react,
        'react-hooks': reactHooks,
        'react-refresh': reactRefresh,
        '@typescript-eslint': tsPlugin,
      },
     rules: {
        // `no-undef` + bare `no-unused-vars` are redundant under the TS
         // parser / `strict` — let the `@typescript-eslint` variants own them.
         'no-undef': 'off',
          'no-unused-vars': 'off',
          'no-useless-escape': 'off',
            'react/jsx-uses-vars': 'error',
         'react-hooks/rules-of-hooks': 'error',
         'react-hooks/exhaustive-deps': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
         '@typescript-eslint/no-unused-vars': [
            'error',
   { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
  ],
  },
 },
];

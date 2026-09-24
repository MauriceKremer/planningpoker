import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

// Flat ESLint config (M1) — replaces the CRA-era `eslintConfig` package.json
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
      // Deliberately off — see migration_plan.md rule: no rules silenced to
      // hide real problems; this one has no correctness value here.
      'react-refresh/only-export-components': 'off',
    },
  },
];
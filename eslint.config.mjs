import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

const baseRules = {
  ...tseslint.configs.recommended.rules,
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  '@typescript-eslint/consistent-type-imports': 'error',
  'no-console': 'warn',
};

export default [
  {
    ignores: ['dist/', 'proto/', 'coverage/', 'docs/', 'examples/'],
  },
  // Type-aware pass for production code. Rules here need full tsconfig info.
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...baseRules,
      // Forbid dropping promises on the floor — silent async failures are the
      // single most common bug in the SDK's event loops (watchers, streams,
      // Participant.run). Warn-level first pass; tighten to 'error' once the
      // initial wave of fixes has landed.
      '@typescript-eslint/no-floating-promises': 'warn',
    },
  },
  // Tests run without the type-aware project. Vitest patterns like
  // `await expect(...)` occasionally trip the async rule on test scaffolding,
  // and tests aren't part of `tsconfig.json`'s compile graph.
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: baseRules,
  },
];

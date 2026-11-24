// Lint rules. Formatting is Prettier's job (.prettierrc.json); these rules
// are about mistakes, not layout.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'release/', 'node_modules/', 'test/fixtures/', 'site/'] },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    rules: {
      // Control characters are named in patterns on purpose: to strip them from names and addresses.
      'no-control-regex': 'off',
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      // A name starting with "_" says "left out on purpose", as in `const { answers: _gone, ...rest }`.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Tests build stand-ins for async interfaces, borrow methods and poke at untyped values.
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-implied-eval': 'off',
    },
  },
);

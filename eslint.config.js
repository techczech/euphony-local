// eslint.config.js
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { configs } from 'eslint-plugin-lit';
// import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default [
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  ...tseslint.configs.strict,
  ...tseslint.configs.strictTypeChecked,
  configs['flat/recommended'],
  {
    files: ['**/*.ts', '**/*.js', '**/*.cjs'],
    ignores: ['node_modules'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json'],
        extraFileExtensions: ['.cjs']
      },
      globals: {
        ...globals.browser
      }
    },
    rules: {
      indent: 'off',
      'linebreak-style': ['error', 'unix'],
      quotes: ['error', 'single', { avoidEscape: true }],
      'prefer-const': ['error'],
      semi: ['error', 'always'],
      'max-len': [
        'warn',
        {
          code: 120
        }
      ],
      'no-constant-condition': ['error', { checkLoops: false }],
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-useless-constructor': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      'no-self-assign': 'off',
      'no-var': 'error'
    }
  }
];

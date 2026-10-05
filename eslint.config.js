// Static checks for complexity and repeated code; formatting is Prettier's, types are tsc's
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'demo/dist/', 'coverage/', 'node_modules/', '.stryker-tmp/', 'reports/'] },
  {
    files: ['src/**/*.ts', 'demo/src/**/*.ts', 'scripts/**/*.mjs'],
    languageOptions: { parser: tseslint.parser },
    plugins: { sonarjs },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'sonarjs/cognitive-complexity': ['error', 15],
      complexity: ['error', 20],
      'max-depth': ['error', 4],
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-duplicated-branches': 'error',
      'sonarjs/no-all-duplicated-branches': 'error',
      'sonarjs/no-identical-conditions': 'error',
      'sonarjs/no-identical-expressions': 'error',
      'sonarjs/no-collapsible-if': 'error'
    }
  },
  {
    // Bugs the types reveal: promises nobody handles, switches that miss a case, values that read badly in text
    files: ['src/**/*.ts', 'demo/src/**/*.ts'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/restrict-template-expressions': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/prefer-promise-reject-errors': 'error'
    }
  }
);

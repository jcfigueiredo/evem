// Static checks for complexity and repeated code; formatting is Prettier's, types are tsc's
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'demo/dist/', 'coverage/', 'node_modules/'] },
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
  }
);

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**'],
  },
  {
    languageOptions: {
      globals: {
        crypto: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        Response: 'readonly',
        window: 'readonly',
      },
    },
  },
);

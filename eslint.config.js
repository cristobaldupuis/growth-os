import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // An unused binding prefixed with _ is an intentional placeholder — the
      // usual case here is destructuring a prop to document that it exists while
      // deliberately not consuming it.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    // The serverless function and the build scripts run under Node, not in the
    // browser. Without this, every `process.env` read is reported as no-undef —
    // five errors that were pure noise and trained the eye to ignore the output.
    files: ['api/**/*.js', 'scripts/**/*.mjs', 'src/**/*.test.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])

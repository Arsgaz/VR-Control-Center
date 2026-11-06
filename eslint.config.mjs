import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['out', 'dist', 'node_modules']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  prettier,
  {
    languageOptions: {
      globals: {
        console: 'readonly'
      }
    }
  },
  {
    files: ['scripts/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly'
      }
    }
  },
  {
    files: ['src/renderer/**/*.{ts,vue}', 'tests/renderer/**/*.ts'],
    languageOptions: {
      globals: {
        Event: 'readonly',
        document: 'readonly',
        HTMLElement: 'readonly',
        Node: 'readonly',
        PointerEvent: 'readonly',
        HTMLDialogElement: 'readonly',
        HTMLDetailsElement: 'readonly',
        HTMLInputElement: 'readonly',
        window: 'readonly'
      }
    }
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser
      }
    }
  }
)

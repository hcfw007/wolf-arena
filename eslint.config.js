import config from '@ddyscn/lint-config'

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'logs/**'],
  },
  ...config,
  {
    rules: {
      'no-console': 'off',
    },
  },
]

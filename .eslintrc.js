/* eslint-env node */

require('@uniswap/eslint-config/load')

module.exports = {
  extends: '@uniswap/eslint-config/react',
  ignorePatterns: ['*.js'],
  overrides: [
    {
      files: ['src/index.ts'],
      rules: {
        'import/no-unused-modules': 'off',
      }
    }
  ]
}

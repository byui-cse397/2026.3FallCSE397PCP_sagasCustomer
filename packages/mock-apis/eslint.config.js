import baseConfig from '@sagas/eslint-config/base';

export default [
  ...baseConfig,
  {
    // `!` is normal in tests, where you've already asserted the thing exists.
    files: ['src/**/*.test.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
];

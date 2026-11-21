import baseConfig from '@sagas/eslint-config/base';

export default [{ ignores: ['dist/**', '.wrangler/**'] }, ...baseConfig];

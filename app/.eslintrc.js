const path = require('path');

/**
 * Import boundaries.
 *
 * These encode the invariants REFACTORING_PLAN.md Phases 1-3 established, so that
 * they cannot quietly regress. Each group names the finding it protects.
 */

/** F16 / plan 5.1: nothing climbs two directories — use the '@/' alias. */
const NO_DEEP_RELATIVE = {
  group: ['../../*', '../../../*', '../../../../*'],
  message:
    "Use the '@/' alias instead of climbing directories (REFACTORING_PLAN F16). " +
    "'../sibling' is fine; '../../' is not.",
};

/** F10: endpoint strings and response shapes live in services/api/* only. */
const NO_API_CLIENT = {
  group: ['@/api/client', '**/api/client'],
  message:
    'Import a typed domain module from services/api/* instead. Only services/api/* ' +
    'and the AuthContext 401 wiring may touch the axios instance (REFACTORING_PLAN F10).',
};

/** F11: AsyncStorage keys and JSON shape-checking live in services/storage/* only. */
const NO_ASYNC_STORAGE = {
  group: ['@react-native-async-storage/async-storage'],
  message:
    'Go through services/storage (createJsonArrayStore / createJsonValueStore / ' +
    'tokenStorage) so every key is registered and every read is shape-checked ' +
    '(REFACTORING_PLAN F11).',
};

const restrict = (...groups) => ['error', { patterns: groups }];

module.exports = {
  root: true,
  extends: '@react-native',
  parserOptions: {
    requireConfigFile: false,
    babelOptions: {
      configFile: path.resolve(__dirname, 'babel.config.js'),
    },
  },
  rules: {
    'no-restricted-imports': restrict(NO_DEEP_RELATIVE, NO_ASYNC_STORAGE),
  },
  overrides: [
    {
      // Presentation and orchestration layers: no direct HTTP, no direct storage.
      files: [
        'src/screens/**',
        'src/components/**',
        'src/hooks/**',
        'src/navigation/**',
        'src/services/notifications/**',
      ],
      rules: {
        'no-restricted-imports': restrict(
          NO_DEEP_RELATIVE,
          NO_API_CLIENT,
          NO_ASYNC_STORAGE,
        ),
      },
    },
    {
      // The two modules that are *allowed* to own the primitives, plus the tests
      // that mock them. services/api/* wraps the axios instance; services/storage/*
      // wraps AsyncStorage.
      files: ['src/services/api/**', 'src/services/storage/**', '**/__tests__/**'],
      rules: {
        'no-restricted-imports': restrict(NO_DEEP_RELATIVE),
      },
    },
  ],
};

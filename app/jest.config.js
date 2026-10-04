module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // Mirrors the '@/*' -> 'src/*' alias in tsconfig.json and babel.config.js.
  // babel-plugin-module-resolver already rewrites these at transform time; this is
  // here so a '@/...' path still resolves if the transform ever stops running.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Coverage is measured over hand-written source only. Without this the 8,748 lines
  // of generated gluestack scaffold under src/components/ui (REFACTORING_PLAN.md §8,
  // "regenerate, never hand-edit") dominate every number the report produces.
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/components/ui/**',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
};

const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(@stellar|@creit\\.tech)/)'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/__tests__/fixtures/'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json'
    }]
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/**/generated/**',
    '!src/**/bindings/**',
  ],
  coverageThreshold: {
    global: {
      lines: 60,
      statements: 60,
      functions: 60,
      branches: 50,
    },
    // LF-322: the Stellar layer must stay above 80% lines and branches.
    // A bug there corrupts gameplay silently, so coverage is enforced here.
    './src/lib/stellar/**': {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 80,
    },
  },
}

module.exports = createJestConfig(customJestConfig)
/**
 * Jest Configuration
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/integration/**/*.test.js'
  ],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/enrichment-test.js',
    '/tests/post-cleaning-test.js',
    '/tests/selenium-infinite-scroll.test.js',
    '/tests/run-navigation-tests.js'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/tools/assets/**',  // Exclude browser-side scripts
    '!**/node_modules/**'
  ],

  // Coverage thresholds (can be adjusted as more tests are added)
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 30,
      lines: 30,
      statements: 30
    }
  },

  // Coverage reporters
  coverageReporters: ['text', 'text-summary', 'html'],

  // Coverage output directory
  coverageDirectory: 'coverage',

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Timeout for tests (30 seconds for integration tests)
  testTimeout: 30000,

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Detect open handles (useful for async issues)
  detectOpenHandles: true,

  // Force exit after tests complete
  forceExit: true
};

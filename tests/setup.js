/**
 * Jest Test Setup
 *
 * This file runs before each test suite.
 */

// Extend Jest expect with custom matchers if needed
// expect.extend({ ... });

// Global test utilities
global.testUtils = {
  /**
   * Create a mock logger
   */
  createMockLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }),

  /**
   * Wait for a condition to be true
   * @param {Function} condition - Function that returns boolean
   * @param {number} timeout - Max wait time in ms
   * @param {number} interval - Check interval in ms
   */
  waitFor: async (condition, timeout = 5000, interval = 100) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) return true;
      await new Promise(r => setTimeout(r, interval));
    }
    throw new Error('waitFor timeout');
  },

  /**
   * Create sample extraction result
   */
  createExtractionResult: (overrides = {}) => ({
    method: 'coordinate-text',
    value: 'Test Value',
    confidence: 85,
    metadata: {},
    ...overrides
  }),

  /**
   * Create sample config
   */
  createSampleConfig: (overrides = {}) => ({
    version: '2.3',
    domain: 'example.com',
    cardPattern: {
      primarySelector: '.card',
      sampleDimensions: { width: 300, height: 200 }
    },
    fields: {
      name: { userValidatedMethod: 'coordinate-text', coordinates: { x: 10, y: 10, width: 100, height: 20 } },
      email: { userValidatedMethod: 'mailto-link', coordinates: { x: 10, y: 40, width: 150, height: 20 } },
      phone: { skipped: true },
      profileUrl: { userValidatedMethod: 'href-link', coordinates: { x: 10, y: 70, width: 80, height: 20 } },
      title: { skipped: true },
      location: { skipped: true }
    },
    ...overrides
  })
};

// Suppress console output during tests (can be disabled for debugging)
if (process.env.JEST_SILENT !== 'false') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    // Keep warn and error visible for debugging
    // warn: jest.fn(),
    // error: jest.fn(),
  };
}

// Clean up after all tests
afterAll(async () => {
  // Close any open handles, connections, etc.
});

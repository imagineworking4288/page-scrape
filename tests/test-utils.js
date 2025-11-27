/**
 * Test Utilities
 *
 * Shared utilities for unit and integration testing.
 * Provides mock objects and test setup helpers.
 */

const BrowserManager = require('../src/utils/browser-manager');
const RateLimiter = require('../src/utils/rate-limiter');
const logger = require('../src/utils/logger');

/**
 * Mock logger that captures messages without output
 */
class MockLogger {
  constructor() {
    this.logs = [];
    this.warnings = [];
    this.errors = [];
    this.debug_logs = [];
  }

  info(msg, ...args) {
    this.logs.push({ msg, args });
  }

  warn(msg, ...args) {
    this.warnings.push({ msg, args });
  }

  error(msg, ...args) {
    this.errors.push({ msg, args });
  }

  debug(msg, ...args) {
    this.debug_logs.push({ msg, args });
  }

  logStats(stats) {
    this.logs.push({ msg: 'stats', stats });
  }

  clear() {
    this.logs = [];
    this.warnings = [];
    this.errors = [];
    this.debug_logs = [];
  }
}

/**
 * Mock browser manager for unit tests
 */
class MockBrowserManager {
  constructor() {
    this.page = null;
    this.launched = false;
  }

  async launch(headless = true) {
    this.launched = true;
    return this;
  }

  async getPage() {
    return this.page;
  }

  setMockPage(page) {
    this.page = page;
  }

  async close() {
    this.launched = false;
  }

  isLaunched() {
    return this.launched;
  }
}

/**
 * Mock rate limiter that doesn't delay
 */
class MockRateLimiter {
  async delay() {}
  async waitBeforeRequest() {}
  async wait(ms) {}
}

/**
 * Mock Puppeteer page for testing
 */
class MockPage {
  constructor(options = {}) {
    this.url = options.url || 'https://example.com';
    this.content = options.content || '<html><body>Test</body></html>';
    this.evaluateResult = options.evaluateResult || {};
  }

  async goto(url, options) {
    this.url = url;
    return { ok: () => true };
  }

  url() {
    return this.url;
  }

  async content() {
    return this.content;
  }

  async evaluate(fn, ...args) {
    if (typeof this.evaluateResult === 'function') {
      return this.evaluateResult(fn, ...args);
    }
    return this.evaluateResult;
  }

  async $(selector) {
    return null;
  }

  async $$(selector) {
    return [];
  }

  async waitForSelector(selector, options) {
    return null;
  }

  async waitForTimeout(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.min(ms, 10)));
  }

  async pdf(options) {
    return Buffer.from('%PDF-1.4 mock pdf content');
  }

  async screenshot(options) {
    return Buffer.from('mock screenshot');
  }
}

/**
 * Test setup utilities
 */
class TestSetup {
  /**
   * Create a mock logger instance
   */
  static createMockLogger() {
    return new MockLogger();
  }

  /**
   * Create a mock browser manager
   */
  static createMockBrowser() {
    return new MockBrowserManager();
  }

  /**
   * Create a mock rate limiter
   */
  static createMockRateLimiter() {
    return new MockRateLimiter();
  }

  /**
   * Create a mock page
   */
  static createMockPage(options = {}) {
    return new MockPage(options);
  }

  /**
   * Set up a real browser for integration testing
   * @param {boolean} headless - Run headless
   * @returns {Object} - { browserManager, rateLimiter, logger, cleanup }
   */
  static async setupIntegrationTest(headless = true) {
    const browserManager = new BrowserManager(logger);
    const rateLimiter = new RateLimiter(logger);

    await browserManager.launch(headless);

    return {
      browserManager,
      rateLimiter,
      logger,
      cleanup: async () => {
        try {
          await browserManager.close();
        } catch (error) {
          console.error('Cleanup error:', error.message);
        }
      }
    };
  }

  /**
   * Set up a scraper for integration testing
   * @param {Function} ScraperClass - Scraper class constructor
   * @param {boolean} headless - Run headless
   * @returns {Object} - { scraper, browserManager, cleanup }
   */
  static async setupScraperTest(ScraperClass, headless = true) {
    const { browserManager, rateLimiter, logger, cleanup } = await this.setupIntegrationTest(headless);
    const scraper = new ScraperClass(browserManager, rateLimiter, logger);

    return { scraper, browserManager, rateLimiter, logger, cleanup };
  }

  /**
   * Assert helper for tests without external dependencies
   */
  static assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  /**
   * Assert equality
   */
  static assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected} but got ${actual}`);
    }
  }

  /**
   * Assert array length
   */
  static assertLength(arr, length, message) {
    if (!Array.isArray(arr)) {
      throw new Error(message || `Expected array but got ${typeof arr}`);
    }
    if (arr.length !== length) {
      throw new Error(message || `Expected array of length ${length} but got ${arr.length}`);
    }
  }

  /**
   * Assert truthy
   */
  static assertTruthy(value, message) {
    if (!value) {
      throw new Error(message || `Expected truthy value but got ${value}`);
    }
  }

  /**
   * Assert falsy
   */
  static assertFalsy(value, message) {
    if (value) {
      throw new Error(message || `Expected falsy value but got ${value}`);
    }
  }
}

module.exports = {
  TestSetup,
  MockLogger,
  MockBrowserManager,
  MockRateLimiter,
  MockPage
};

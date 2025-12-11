/**
 * Navigation Test Utilities
 *
 * Shared utilities for testing navigation functionality (infinite scroll, pagination)
 * independently of data extraction quality. Focuses on verifying that navigation
 * mechanics work correctly.
 *
 * Usage:
 *   const { NavTestRunner, TestReporter, loadTestUrls } = require('./navigation-test-utils');
 *   const runner = new NavTestRunner({ headless: true });
 *   const results = await runner.runScrollTest(url, options);
 */

const fs = require('fs');
const path = require('path');

/**
 * Load test URLs from the test-urls.json database
 * @param {string} category - Category to load: 'infiniteScroll', 'pagination', 'all'
 * @param {Object} options - Filter options
 * @param {boolean} options.includeSkipped - Include URLs marked as skip (default: false)
 * @param {string} options.subcategory - Subcategory within main category
 * @returns {Array} - Array of test URL objects
 */
function loadTestUrls(category = 'all', options = {}) {
  const { includeSkipped = false, subcategory = null } = options;

  const testUrlsPath = path.join(__dirname, '..', 'test-urls.json');
  if (!fs.existsSync(testUrlsPath)) {
    throw new Error(`Test URLs file not found: ${testUrlsPath}`);
  }

  const testData = JSON.parse(fs.readFileSync(testUrlsPath, 'utf8'));
  const urls = [];

  // Helper to filter and collect URLs
  const collectUrls = (items, categoryName) => {
    if (!Array.isArray(items)) return;
    items.forEach(item => {
      if (!includeSkipped && item.skip) return;
      urls.push({
        ...item,
        category: categoryName
      });
    });
  };

  if (category === 'all' || category === 'infiniteScroll') {
    const infScroll = testData.infiniteScroll || {};
    if (subcategory) {
      collectUrls(infScroll[subcategory], `infiniteScroll.${subcategory}`);
    } else {
      Object.keys(infScroll).forEach(sub => {
        collectUrls(infScroll[sub], `infiniteScroll.${sub}`);
      });
    }
  }

  if (category === 'all' || category === 'pagination') {
    const pagination = testData.pagination || {};
    if (subcategory) {
      collectUrls(pagination[subcategory], `pagination.${subcategory}`);
    } else {
      Object.keys(pagination).forEach(sub => {
        collectUrls(pagination[sub], `pagination.${sub}`);
      });
    }
  }

  if (category === 'all' || category === 'mixed') {
    collectUrls(testData.mixed, 'mixed');
  }

  return urls;
}

/**
 * Navigation Test Runner
 * Executes navigation tests and collects results
 */
class NavTestRunner {
  constructor(options = {}) {
    this.options = {
      headless: options.headless !== false,
      verbose: options.verbose || false,
      timeout: options.timeout || 30000,
      ...options
    };

    this.results = [];
    this.startTime = null;
  }

  /**
   * Create a test logger that captures logs for reporting
   * @param {boolean} verbose - Output to console as well
   * @returns {Object} - Logger-compatible object
   */
  createTestLogger(verbose = false) {
    const logs = [];

    const log = (level, msg) => {
      logs.push({ level, msg, timestamp: Date.now() });
      if (verbose) {
        console.log(`[${level.toUpperCase()}] ${msg}`);
      }
    };

    return {
      info: (msg) => log('info', msg),
      warn: (msg) => log('warn', msg),
      error: (msg) => log('error', msg),
      debug: (msg) => log('debug', msg),
      getLogs: () => logs,
      clear: () => { logs.length = 0; }
    };
  }

  /**
   * Validate scroll test results against expected behavior
   * @param {Object} results - Scroll results from SeleniumManager
   * @param {Object} expected - Expected behavior from test URL config
   * @returns {Object} - { passed, assertions, failures }
   */
  validateScrollResults(results, expected = {}) {
    const assertions = [];
    const failures = [];

    // Check minimum height changes
    if (expected.minHeightChanges !== undefined) {
      const passed = results.heightChanges >= expected.minHeightChanges;
      assertions.push({
        name: 'minHeightChanges',
        expected: `>= ${expected.minHeightChanges}`,
        actual: results.heightChanges,
        passed
      });
      if (!passed) failures.push(`Height changes ${results.heightChanges} < expected ${expected.minHeightChanges}`);
    }

    // Check if Load More button was expected and clicked
    if (expected.hasLoadMoreButton === true) {
      const passed = results.buttonClicks > 0;
      assertions.push({
        name: 'loadMoreButtonClicked',
        expected: '> 0 clicks',
        actual: results.buttonClicks,
        passed
      });
      if (!passed) failures.push('Expected Load More button clicks but got 0');
    }

    // Check if Load More button was NOT expected
    if (expected.hasLoadMoreButton === false && results.buttonClicks > 0) {
      // This is informational, not a failure
      assertions.push({
        name: 'unexpectedLoadMoreButton',
        expected: '0 clicks',
        actual: results.buttonClicks,
        passed: true,
        note: 'Found unexpected Load More button - may indicate site change'
      });
    }

    // Check expected button clicks
    if (expected.expectedButtonClicks !== undefined) {
      const passed = results.buttonClicks >= expected.expectedButtonClicks;
      assertions.push({
        name: 'expectedButtonClicks',
        expected: `>= ${expected.expectedButtonClicks}`,
        actual: results.buttonClicks,
        passed
      });
      if (!passed) failures.push(`Button clicks ${results.buttonClicks} < expected ${expected.expectedButtonClicks}`);
    }

    // Check scroll completed without max scrolls limit
    if (results.stopReason && !results.stopReason.includes('max scrolls')) {
      assertions.push({
        name: 'completedNormally',
        expected: 'Normal completion',
        actual: results.stopReason,
        passed: true
      });
    } else if (results.scrollCount >= 1000) {
      assertions.push({
        name: 'hitMaxScrolls',
        expected: 'Normal completion',
        actual: 'Hit max scrolls limit',
        passed: false
      });
      failures.push('Hit max scrolls limit - possible infinite loop');
    }

    // Check final height is reasonable
    if (results.finalHeight > 0) {
      assertions.push({
        name: 'hasContent',
        expected: '> 0',
        actual: results.finalHeight,
        passed: true
      });
    }

    // Timeline validation
    if (results.timeline && results.timeline.length > 0) {
      assertions.push({
        name: 'timelineCapture',
        expected: 'Has timeline events',
        actual: `${results.timeline.length} events`,
        passed: true
      });
    }

    return {
      passed: failures.length === 0,
      assertions,
      failures,
      summary: `${assertions.filter(a => a.passed).length}/${assertions.length} assertions passed`
    };
  }

  /**
   * Validate pagination test results
   * @param {Object} results - Pagination results
   * @param {Object} expected - Expected behavior
   * @returns {Object} - { passed, assertions, failures }
   */
  validatePaginationResults(results, expected = {}) {
    const assertions = [];
    const failures = [];

    // Check pattern detected
    if (results.pattern) {
      assertions.push({
        name: 'patternDetected',
        expected: 'Pattern found',
        actual: results.pattern.type,
        passed: true
      });
    } else {
      assertions.push({
        name: 'patternDetected',
        expected: 'Pattern found',
        actual: 'None',
        passed: false
      });
      failures.push('No pagination pattern detected');
    }

    // Check expected parameter name
    if (expected.parameterName && results.pattern?.paramName) {
      const passed = results.pattern.paramName === expected.parameterName;
      assertions.push({
        name: 'parameterName',
        expected: expected.parameterName,
        actual: results.pattern.paramName,
        passed
      });
      if (!passed) failures.push(`Parameter name mismatch: expected ${expected.parameterName}, got ${results.pattern.paramName}`);
    }

    // Check expected pages
    if (expected.expectedPages && results.totalPages) {
      const passed = results.totalPages >= expected.expectedPages;
      assertions.push({
        name: 'expectedPages',
        expected: `>= ${expected.expectedPages}`,
        actual: results.totalPages,
        passed
      });
      if (!passed) failures.push(`Pages ${results.totalPages} < expected ${expected.expectedPages}`);
    }

    // Check contacts per page (if available)
    if (expected.contactsPerPage && results.averageContactsPerPage) {
      const tolerance = expected.contactsPerPage * 0.5; // 50% tolerance
      const passed = Math.abs(results.averageContactsPerPage - expected.contactsPerPage) <= tolerance;
      assertions.push({
        name: 'contactsPerPage',
        expected: `~${expected.contactsPerPage}`,
        actual: results.averageContactsPerPage,
        passed
      });
      if (!passed) failures.push(`Contacts per page ${results.averageContactsPerPage} differs from expected ${expected.contactsPerPage}`);
    }

    return {
      passed: failures.length === 0,
      assertions,
      failures,
      summary: `${assertions.filter(a => a.passed).length}/${assertions.length} assertions passed`
    };
  }

  /**
   * Record a test result
   * @param {Object} result - Test result object
   */
  recordResult(result) {
    this.results.push({
      ...result,
      recordedAt: Date.now()
    });
  }

  /**
   * Get all recorded results
   * @returns {Array} - All test results
   */
  getResults() {
    return this.results;
  }

  /**
   * Clear recorded results
   */
  clearResults() {
    this.results = [];
  }
}

/**
 * Test Reporter
 * Formats and outputs test results
 */
class TestReporter {
  constructor(options = {}) {
    this.options = {
      showTimeline: options.showTimeline || false,
      showAssertions: options.showAssertions !== false,
      colors: options.colors !== false,
      ...options
    };
  }

  /**
   * Format a single test result for console output
   * @param {Object} result - Test result object
   * @returns {string} - Formatted output
   */
  formatResult(result) {
    const lines = [];
    const status = result.passed ? '✓ PASS' : '✗ FAIL';

    lines.push(`${status}: ${result.name || 'Unnamed Test'}`);
    lines.push(`  URL: ${result.url}`);
    lines.push(`  Duration: ${result.duration || 0}ms`);

    if (result.scrollStats) {
      lines.push(`  Scroll Stats:`);
      lines.push(`    - Scrolls: ${result.scrollStats.scrollCount}`);
      lines.push(`    - Height changes: ${result.scrollStats.heightChanges}`);
      lines.push(`    - Button clicks: ${result.scrollStats.buttonClicks}`);
      lines.push(`    - Final height: ${result.scrollStats.finalHeight}px`);
      lines.push(`    - Stop reason: ${result.scrollStats.stopReason}`);
    }

    if (this.options.showAssertions && result.validation) {
      lines.push(`  Assertions: ${result.validation.summary}`);
      if (result.validation.failures.length > 0) {
        lines.push(`  Failures:`);
        result.validation.failures.forEach(f => {
          lines.push(`    - ${f}`);
        });
      }
    }

    if (this.options.showTimeline && result.timeline && result.timeline.length > 0) {
      lines.push(`  Timeline Events (${result.timeline.length}):`);
      result.timeline.slice(0, 10).forEach(event => {
        lines.push(`    [${event.timestamp}ms] ${event.type}: ${JSON.stringify(event).substring(0, 80)}...`);
      });
      if (result.timeline.length > 10) {
        lines.push(`    ... and ${result.timeline.length - 10} more events`);
      }
    }

    if (result.error) {
      lines.push(`  Error: ${result.error}`);
    }

    return lines.join('\n');
  }

  /**
   * Generate a summary report for all results
   * @param {Array} results - Array of test results
   * @returns {string} - Summary output
   */
  generateSummary(results) {
    const lines = [];
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const total = results.length;

    lines.push('');
    lines.push('═'.repeat(70));
    lines.push('  TEST SUMMARY');
    lines.push('═'.repeat(70));
    lines.push('');
    lines.push(`  Total:  ${total}`);
    lines.push(`  Passed: ${passed}`);
    lines.push(`  Failed: ${failed}`);
    lines.push(`  Rate:   ${total > 0 ? ((passed / total) * 100).toFixed(1) : 0}%`);
    lines.push('');

    if (failed > 0) {
      lines.push('  Failed Tests:');
      results.filter(r => !r.passed).forEach(r => {
        lines.push(`    - ${r.name}: ${r.validation?.failures?.[0] || r.error || 'Unknown failure'}`);
      });
      lines.push('');
    }

    lines.push('═'.repeat(70));

    return lines.join('\n');
  }

  /**
   * Print results to console
   * @param {Array} results - Array of test results
   */
  printResults(results) {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║              NAVIGATION TEST RESULTS                               ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝');
    console.log('');

    results.forEach((result, index) => {
      console.log(`[${index + 1}/${results.length}] ${this.formatResult(result)}`);
      console.log('');
    });

    console.log(this.generateSummary(results));
  }

  /**
   * Save results to JSON file
   * @param {Array} results - Array of test results
   * @param {string} outputPath - File path for output
   */
  saveResults(results, outputPath) {
    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length
      },
      results: results.map(r => ({
        ...r,
        // Truncate timeline for file output
        timeline: r.timeline ? r.timeline.slice(0, 50) : []
      }))
    };

    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`Results saved to: ${outputPath}`);
  }
}

/**
 * Helper to wait for a condition with timeout
 * @param {Function} condition - Async function returning boolean
 * @param {number} timeout - Timeout in ms
 * @param {number} interval - Check interval in ms
 * @returns {Promise<boolean>} - Whether condition was met
 */
async function waitForCondition(condition, timeout = 10000, interval = 100) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  return false;
}

/**
 * Simple assertion helper
 */
const assert = {
  ok: (value, message) => {
    if (!value) throw new Error(message || 'Assertion failed: expected truthy value');
  },
  equal: (actual, expected, message) => {
    if (actual !== expected) {
      throw new Error(message || `Assertion failed: ${actual} !== ${expected}`);
    }
  },
  greaterThan: (actual, expected, message) => {
    if (!(actual > expected)) {
      throw new Error(message || `Assertion failed: ${actual} not > ${expected}`);
    }
  },
  greaterOrEqual: (actual, expected, message) => {
    if (!(actual >= expected)) {
      throw new Error(message || `Assertion failed: ${actual} not >= ${expected}`);
    }
  }
};

module.exports = {
  loadTestUrls,
  NavTestRunner,
  TestReporter,
  waitForCondition,
  assert
};

/**
 * Tests for ScrollEngine
 */

const assert = require('assert');

// Test helpers
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    testsFailed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    testsFailed++;
  }
}

// Mock adapter for testing
class MockAdapter {
  constructor() {
    this.itemCount = 10;
    this.scrollHeight = 1000;
    this.scrollPosition = 0;
    this.scrollCalls = [];
    this.clickCalls = [];
  }

  async init() {}
  async navigateTo() {}
  async scrollBy(amount) {
    this.scrollCalls.push(amount);
    this.scrollPosition += amount;
    // Simulate content loading
    if (this.scrollCalls.length <= 5) {
      this.itemCount += 5;
      this.scrollHeight += 500;
    }
  }
  async scrollToTop() { this.scrollPosition = 0; }
  async scrollToBottom() { this.scrollPosition = this.scrollHeight; }
  async evaluateScript() { return true; }
  async click(selector) {
    this.clickCalls.push(selector);
    return true;
  }
  async waitFor() {}
  async waitForElement() { return true; }
  async getScrollHeight() { return this.scrollHeight; }
  async getScrollPosition() { return this.scrollPosition; }
  async getItemCount() { return this.itemCount; }
  async elementExists() { return false; }
  async isElementVisible() { return false; }
  async scrollIntoView() {}
  async getPageContent() { return '<html><body>Mock content</body></html>'; }
  async getCurrentUrl() { return 'http://test.com'; }
  async screenshot() {}
  async close() {}
}

// Mock logger
const mockLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {}
};

// Run tests
console.log('\n=== ScrollEngine Tests ===\n');

// Test human behavior module
console.log('Human Behavior Module:');
const humanBehavior = require('../src/engine/human-behavior');

test('randomInRange returns value in range', () => {
  for (let i = 0; i < 100; i++) {
    const value = humanBehavior.randomInRange(10, 20);
    assert(value >= 10 && value <= 20, `Value ${value} not in range 10-20`);
  }
});

test('getScrollAmount uses config values', () => {
  const config = { scrollAmount: { min: 100, max: 200 } };
  for (let i = 0; i < 50; i++) {
    const amount = humanBehavior.getScrollAmount(config);
    assert(amount >= 100 && amount <= 200, `Amount ${amount} not in range`);
  }
});

test('addJitter modifies value within percentage', () => {
  const base = 1000;
  for (let i = 0; i < 50; i++) {
    const jittered = humanBehavior.addJitter(base, 10);
    const diff = Math.abs(jittered - base);
    assert(diff <= 100, `Jitter ${diff} exceeds 10%`);
  }
});

test('exponentialBackoff increases with attempts', () => {
  const delay1 = humanBehavior.exponentialBackoff(0, 1000, 30000);
  const delay2 = humanBehavior.exponentialBackoff(2, 1000, 30000);
  const delay3 = humanBehavior.exponentialBackoff(5, 1000, 30000);

  assert(delay2 > delay1, 'Delay should increase with attempts');
  assert(delay3 <= 30000, 'Delay should not exceed max');
});

// Test config loader
console.log('\nConfig Loader:');
const { loadConfig, validateConfig, mergeWithDefaults, defaultConfig } = require('../src/config/config-loader');

test('defaultConfig has required fields', () => {
  assert(defaultConfig.maxScrollAttempts > 0, 'maxScrollAttempts should be positive');
  assert(defaultConfig.scrollAmount.min > 0, 'scrollAmount.min should be positive');
  assert(defaultConfig.waitAfterScroll.min > 0, 'waitAfterScroll.min should be positive');
});

test('mergeWithDefaults preserves user values', () => {
  const userConfig = {
    itemSelector: '.test-item',
    maxScrollAttempts: 50
  };
  const merged = mergeWithDefaults(userConfig);

  assert.strictEqual(merged.itemSelector, '.test-item');
  assert.strictEqual(merged.maxScrollAttempts, 50);
  assert.strictEqual(merged.maxDurationSeconds, defaultConfig.maxDurationSeconds);
});

test('validateConfig throws on missing itemSelector', () => {
  let threw = false;
  try {
    validateConfig({ ...defaultConfig, itemSelector: null });
  } catch (e) {
    threw = true;
    assert(e.message.includes('itemSelector'), 'Error should mention itemSelector');
  }
  assert(threw, 'Should throw validation error');
});

test('validateConfig throws on invalid detection method', () => {
  let threw = false;
  try {
    validateConfig({ ...defaultConfig, itemSelector: '.item', detectionMethod: 'invalid' });
  } catch (e) {
    threw = true;
  }
  assert(threw, 'Should throw for invalid detection method');
});

// Test Progress Detector
console.log('\nProgress Detector:');
const ProgressDetector = require('../src/engine/progress-detector');

asyncTest('ProgressDetector detects item count increase', async () => {
  const adapter = new MockAdapter();
  const config = {
    itemSelector: '.item',
    scrollContainer: 'window',
    detectionMethod: 'itemCount',
    progressTimeout: 3,
    maxDurationSeconds: 300
  };

  const detector = new ProgressDetector(adapter, config, mockLogger);
  await detector.initialize();

  // Simulate item count increase
  adapter.itemCount = 15;
  const result = await detector.checkProgress();

  assert(result.hasProgress === true, 'Should detect progress');
  assert(result.shouldStop === false, 'Should not stop');
}).then(() => {
  // Test no progress detection
  return asyncTest('ProgressDetector stops after timeout', async () => {
    const adapter = new MockAdapter();
    const config = {
      itemSelector: '.item',
      scrollContainer: 'window',
      detectionMethod: 'itemCount',
      progressTimeout: 2,
      maxDurationSeconds: 300
    };

    const detector = new ProgressDetector(adapter, config, mockLogger);
    await detector.initialize();

    // Check multiple times with no progress
    await detector.checkProgress();
    await detector.checkProgress();
    const result = await detector.checkProgress();

    assert(result.shouldStop === true, 'Should stop after timeout');
  });
}).then(() => {
  // Test Load More Handler
  console.log('\nLoad More Handler:');
  const LoadMoreHandler = require('../src/engine/load-more-handler');

  return asyncTest('LoadMoreHandler tracks click count', async () => {
    const adapter = new MockAdapter();
    adapter.elementExists = async () => true;
    adapter.isElementVisible = async () => true;
    adapter.evaluateScript = async () => false; // Not disabled

    const config = {
      loadMoreSelectors: ['.load-more'],
      maxLoadMoreClicks: 5,
      loadMoreClickDelay: { min: 10, max: 20 },
      waitForContent: 10
    };

    const handler = new LoadMoreHandler(adapter, config, mockLogger);

    // Click once
    const result1 = await handler.checkAndClick();
    assert(result1.clicked === true, 'First click should succeed');

    const stats = handler.getStats();
    assert(stats.clickCount === 1, 'Click count should be 1');
  });
}).then(() => {
  const LoadMoreHandler = require('../src/engine/load-more-handler');

  return asyncTest('LoadMoreHandler returns no button when none exist', async () => {
    const adapter = new MockAdapter();
    adapter.elementExists = async () => false;
    adapter.isElementVisible = async () => false;

    const config = {
      loadMoreSelectors: ['.btn-1', '.btn-2'],
      maxLoadMoreClicks: 10,
      loadMoreClickDelay: { min: 10, max: 20 },
      waitForContent: 10
    };

    const handler = new LoadMoreHandler(adapter, config, mockLogger);
    const result = await handler.checkAndClick();

    assert(result.clicked === false, 'Should not click');
    assert(result.selector === null, 'Selector should be null');
  });
}).then(() => {
  // Print results
  console.log('\n=== Test Results ===');
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);

  process.exit(testsFailed > 0 ? 1 : 0);
});

#!/usr/bin/env node

/**
 * Infinite Scroll Navigation Tests
 *
 * Tests the navigation mechanics of infinite scroll pages without focusing
 * on data extraction quality. Verifies:
 * - Scrolling triggers height changes
 * - Load More button detection and clicking
 * - Timeline callbacks fire correctly
 * - Scroll completes without hitting safety limits
 *
 * Usage:
 *   node tests/navigation/infinite-scroll-navigation.test.js [options]
 *
 * Options:
 *   --url <url>           Test a specific URL (overrides test-urls.json)
 *   --headless <bool>     Run in headless mode (default: true)
 *   --verbose             Show detailed output
 *   --show-timeline       Display timeline events
 *   --quick               Quick test (reduced scroll limits)
 *   --save <file>         Save results to JSON file
 */

const path = require('path');
const { Command } = require('commander');

// Set working directory to project root
process.chdir(path.join(__dirname, '..', '..'));

const SeleniumManager = require('../../src/core/selenium-manager');
const logger = require('../../src/core/logger');
const { loadTestUrls, NavTestRunner, TestReporter, assert } = require('./navigation-test-utils');

// CLI Setup
const program = new Command();
program
  .name('infinite-scroll-navigation-test')
  .description('Test infinite scroll navigation mechanics')
  .version('1.0.0')
  .option('--url <url>', 'Test a specific URL')
  .option('--headless [value]', 'Run in headless mode', 'true')
  .option('--verbose', 'Show detailed output', false)
  .option('--show-timeline', 'Display timeline events', false)
  .option('--quick', 'Quick test with reduced limits', false)
  .option('--save <file>', 'Save results to JSON file')
  .parse(process.argv);

const options = program.opts();
const headless = options.headless !== 'false' && options.headless !== false;

/**
 * Test: Basic Scroll Navigation
 * Verifies that scrolling triggers page height changes
 */
async function testBasicScrollNavigation(url, testConfig = {}) {
  const testName = testConfig.name || 'Basic Scroll Navigation';
  const startTime = Date.now();
  const testLogger = options.verbose ? logger : {
    info: () => {},
    warn: () => {},
    error: (msg) => console.error(msg),
    debug: () => {}
  };

  console.log(`\n[Test] ${testName}`);
  console.log(`URL: ${url}`);

  const seleniumManager = new SeleniumManager(testLogger);
  let result = {
    name: testName,
    url,
    passed: false,
    scrollStats: null,
    timeline: [],
    validation: null,
    duration: 0,
    error: null
  };

  // Timeline collection via callbacks
  const timelineEvents = [];
  const heightChanges = [];
  const buttonClicks = [];

  try {
    // Launch browser
    await seleniumManager.launch(headless);

    // Navigate to URL
    await seleniumManager.navigate(url);

    // Configure scroll options
    const scrollOptions = {
      scrollDelay: options.quick ? 200 : 400,
      maxRetries: options.quick ? 10 : 25,
      maxScrolls: options.quick ? 100 : 1000,
      initialWait: options.quick ? 2000 : 5000,
      verbose: options.verbose,
      enableLoadMoreButton: true,
      maxButtonClicks: options.quick ? 5 : 50,
      cardSelector: testConfig.cardSelector || null,

      // Timeline callbacks
      onHeightChange: (data) => {
        heightChanges.push(data);
        timelineEvents.push(data);
        if (options.verbose) {
          console.log(`  [Height Change] ${data.previousHeight} -> ${data.newHeight} (+${data.delta}px) at scroll ${data.scrollCount}`);
        }
      },
      onButtonClick: (data) => {
        buttonClicks.push(data);
        timelineEvents.push(data);
        console.log(`  [Button Click] "${data.buttonText}" (${data.strategy}) - Click #${data.buttonClicks}`);
      },
      onScrollBatch: (data) => {
        timelineEvents.push(data);
        if (options.verbose) {
          console.log(`  [Batch ${data.scrollCount}] Height changes: ${data.heightChanges}, Retries: ${data.retriesAtBatch}`);
        }
      }
    };

    // Execute scroll
    console.log('Starting scroll...');
    const scrollStats = await seleniumManager.scrollToFullyLoad(scrollOptions);

    result.scrollStats = scrollStats;
    result.timeline = timelineEvents;
    result.duration = Date.now() - startTime;

    // Validate results
    const runner = new NavTestRunner();
    result.validation = runner.validateScrollResults(scrollStats, testConfig.expectedBehavior || {});
    result.passed = result.validation.passed;

    // Additional assertions
    try {
      assert.greaterThan(scrollStats.scrollCount, 0, 'Should have scrolled at least once');
      assert.greaterThan(scrollStats.finalHeight, 0, 'Should have non-zero final height');

      if (testConfig.expectedBehavior?.minHeightChanges) {
        assert.greaterOrEqual(
          scrollStats.heightChanges,
          testConfig.expectedBehavior.minHeightChanges,
          `Should have at least ${testConfig.expectedBehavior.minHeightChanges} height changes`
        );
      }
    } catch (assertError) {
      result.passed = false;
      result.validation.failures.push(assertError.message);
    }

    console.log(`Result: ${result.passed ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`  Scrolls: ${scrollStats.scrollCount}, Height changes: ${scrollStats.heightChanges}`);
    console.log(`  Button clicks: ${scrollStats.buttonClicks}, Final height: ${scrollStats.finalHeight}px`);
    console.log(`  Duration: ${result.duration}ms`);

  } catch (error) {
    result.error = error.message;
    result.passed = false;
    console.error(`Error: ${error.message}`);
  } finally {
    await seleniumManager.close();
  }

  return result;
}

/**
 * Test: Timeline Callbacks
 * Verifies that timeline callbacks fire correctly during scroll
 */
async function testTimelineCallbacks(url, testConfig = {}) {
  const testName = 'Timeline Callbacks Test';
  const startTime = Date.now();
  const testLogger = options.verbose ? logger : {
    info: () => {},
    warn: () => {},
    error: (msg) => console.error(msg),
    debug: () => {}
  };

  console.log(`\n[Test] ${testName}`);
  console.log(`URL: ${url}`);

  const seleniumManager = new SeleniumManager(testLogger);
  let result = {
    name: testName,
    url,
    passed: false,
    callbackStats: {},
    duration: 0,
    error: null
  };

  let heightChangeCallbacks = 0;
  let scrollBatchCallbacks = 0;
  let buttonClickCallbacks = 0;

  try {
    await seleniumManager.launch(headless);
    await seleniumManager.navigate(url);

    const scrollStats = await seleniumManager.scrollToFullyLoad({
      scrollDelay: 200,
      maxRetries: 10,
      maxScrolls: 50,  // Limited for quick callback test
      initialWait: 2000,
      verbose: false,
      enableLoadMoreButton: true,
      maxButtonClicks: 5,

      onHeightChange: () => { heightChangeCallbacks++; },
      onButtonClick: () => { buttonClickCallbacks++; },
      onScrollBatch: () => { scrollBatchCallbacks++; }
    });

    result.callbackStats = {
      heightChangeCallbacks,
      scrollBatchCallbacks,
      buttonClickCallbacks,
      expectedBatches: Math.floor(scrollStats.scrollCount / 10)
    };

    result.duration = Date.now() - startTime;

    // Verify callbacks fired
    const assertions = [];
    const failures = [];

    // Height change callbacks should match stats
    if (heightChangeCallbacks === scrollStats.heightChanges) {
      assertions.push({ name: 'heightChangeCallbacks', passed: true });
    } else {
      assertions.push({ name: 'heightChangeCallbacks', passed: false });
      failures.push(`Height callbacks (${heightChangeCallbacks}) != height changes (${scrollStats.heightChanges})`);
    }

    // Scroll batch callbacks should fire every 10 scrolls
    const expectedBatches = Math.floor(scrollStats.scrollCount / 10);
    if (scrollBatchCallbacks === expectedBatches) {
      assertions.push({ name: 'scrollBatchCallbacks', passed: true });
    } else {
      assertions.push({ name: 'scrollBatchCallbacks', passed: false });
      failures.push(`Batch callbacks (${scrollBatchCallbacks}) != expected (${expectedBatches})`);
    }

    // Button click callbacks should match stats
    if (buttonClickCallbacks === scrollStats.buttonClicks) {
      assertions.push({ name: 'buttonClickCallbacks', passed: true });
    } else {
      assertions.push({ name: 'buttonClickCallbacks', passed: false });
      failures.push(`Button callbacks (${buttonClickCallbacks}) != button clicks (${scrollStats.buttonClicks})`);
    }

    // Timeline array should be populated
    if (scrollStats.timeline && scrollStats.timeline.length > 0) {
      assertions.push({ name: 'timelineArray', passed: true });
    } else {
      assertions.push({ name: 'timelineArray', passed: false });
      failures.push('Timeline array is empty');
    }

    result.validation = {
      passed: failures.length === 0,
      assertions,
      failures,
      summary: `${assertions.filter(a => a.passed).length}/${assertions.length} assertions passed`
    };
    result.passed = result.validation.passed;

    console.log(`Result: ${result.passed ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`  Height callbacks: ${heightChangeCallbacks}/${scrollStats.heightChanges}`);
    console.log(`  Batch callbacks: ${scrollBatchCallbacks}/${expectedBatches}`);
    console.log(`  Button callbacks: ${buttonClickCallbacks}/${scrollStats.buttonClicks}`);
    console.log(`  Timeline events: ${scrollStats.timeline?.length || 0}`);

  } catch (error) {
    result.error = error.message;
    result.passed = false;
    console.error(`Error: ${error.message}`);
  } finally {
    await seleniumManager.close();
  }

  return result;
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║      INFINITE SCROLL NAVIGATION TESTS                              ║');
  console.log('║      Testing scroll mechanics and timeline callbacks               ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Headless mode: ${headless}`);
  console.log(`Quick mode: ${options.quick}`);
  console.log(`Verbose: ${options.verbose}`);
  console.log('');

  const results = [];

  // Get test URLs
  let testUrls;
  if (options.url) {
    // Single URL from command line
    testUrls = [{
      name: 'CLI Specified URL',
      url: options.url,
      description: 'URL provided via --url flag',
      expectedBehavior: {
        minHeightChanges: 1
      }
    }];
  } else {
    // Load from test-urls.json
    try {
      testUrls = loadTestUrls('infiniteScroll');
      if (testUrls.length === 0) {
        console.log('No test URLs found in test-urls.json (all may be marked skip: true)');
        console.log('Use --url <url> to test a specific URL');
        process.exit(0);
      }
    } catch (err) {
      console.error('Failed to load test URLs:', err.message);
      console.log('Using default Sullivan & Cromwell URL');
      testUrls = [{
        name: 'Sullivan & Cromwell Lawyers (Default)',
        url: 'https://www.sullcrom.com/LawyerListing?custom_is_office=27567',
        expectedBehavior: {
          minHeightChanges: 5,
          hasLoadMoreButton: false
        },
        cardSelector: 'div.BioListingCard_card__Mkk7U.row.border-bottom.py-4'
      }];
    }
  }

  console.log(`Running ${testUrls.length} test(s)...`);
  console.log('─'.repeat(70));

  // Run basic scroll test for each URL
  for (const testUrl of testUrls) {
    const result = await testBasicScrollNavigation(testUrl.url, testUrl);
    results.push(result);
  }

  // Run timeline callback test on first URL
  if (testUrls.length > 0) {
    console.log('─'.repeat(70));
    console.log('Running timeline callback verification...');
    const callbackResult = await testTimelineCallbacks(testUrls[0].url, testUrls[0]);
    results.push(callbackResult);
  }

  // Report results
  const reporter = new TestReporter({
    showTimeline: options.showTimeline,
    showAssertions: true
  });

  console.log(reporter.generateSummary(results));

  // Save results if requested
  if (options.save) {
    reporter.saveResults(results, options.save);
  }

  // Exit with appropriate code
  const allPassed = results.every(r => r.passed);
  process.exit(allPassed ? 0 : 1);
}

// Run tests
runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Pagination Navigation Tests
 *
 * Tests the navigation mechanics of paginated pages without focusing
 * on data extraction quality. Verifies:
 * - Pagination pattern detection (URL parameter, path, offset)
 * - Visual pagination control detection
 * - Next/Previous button functionality
 * - Page URL generation accuracy
 *
 * Usage:
 *   node tests/navigation/pagination-navigation.test.js [options]
 *
 * Options:
 *   --url <url>           Test a specific URL (overrides test-urls.json)
 *   --headless <bool>     Run in headless mode (default: true)
 *   --verbose             Show detailed output
 *   --quick               Quick test (validate fewer pages)
 *   --save <file>         Save results to JSON file
 */

const path = require('path');
const { Command } = require('commander');

// Set working directory to project root
process.chdir(path.join(__dirname, '..', '..'));

const BrowserManager = require('../../src/core/browser-manager');
const PatternDetector = require('../../src/features/pagination/pattern-detector');
const logger = require('../../src/core/logger');
const { loadTestUrls, NavTestRunner, TestReporter, assert } = require('./navigation-test-utils');

// CLI Setup
const program = new Command();
program
  .name('pagination-navigation-test')
  .description('Test pagination navigation mechanics')
  .version('1.0.0')
  .option('--url <url>', 'Test a specific URL')
  .option('--headless [value]', 'Run in headless mode', 'true')
  .option('--verbose', 'Show detailed output', false)
  .option('--quick', 'Quick test (validate fewer pages)', false)
  .option('--save <file>', 'Save results to JSON file')
  .parse(process.argv);

const options = program.opts();
const headless = options.headless !== 'false' && options.headless !== false;

/**
 * Test: Pattern Detection
 * Verifies that pagination patterns are correctly detected
 */
async function testPatternDetection(url, testConfig = {}) {
  const testName = testConfig.name || 'Pattern Detection Test';
  const startTime = Date.now();
  const testLogger = options.verbose ? logger : {
    info: () => {},
    warn: () => {},
    error: (msg) => console.error(msg),
    debug: () => {}
  };

  console.log(`\n[Test] ${testName}`);
  console.log(`URL: ${url}`);

  const browserManager = new BrowserManager(testLogger);
  const patternDetector = new PatternDetector(testLogger);

  let result = {
    name: testName,
    url,
    passed: false,
    pattern: null,
    controls: null,
    validation: null,
    duration: 0,
    error: null
  };

  try {
    await browserManager.launch(headless);
    const page = browserManager.getPage();
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    // Detect visual pagination controls
    console.log('  Detecting visual controls...');
    const controls = await patternDetector.detectPaginationControls(page);
    result.controls = controls;

    if (options.verbose) {
      console.log(`    Has pagination: ${controls.hasPagination}`);
      console.log(`    Controls type: ${controls.controlsType}`);
      console.log(`    Max page: ${controls.maxPage || 'Unknown'}`);
      console.log(`    Next button: ${controls.nextButton ? 'Yes' : 'No'}`);
      console.log(`    Page numbers: ${controls.pageNumbers.join(', ') || 'None'}`);
    }

    // Discover full pattern
    console.log('  Discovering pattern...');
    const pattern = await patternDetector.discoverPattern(page, url);
    result.pattern = pattern;

    if (pattern) {
      console.log(`  Pattern detected: ${pattern.type}`);
      if (pattern.paramName) console.log(`    Parameter: ${pattern.paramName}`);
      if (pattern.urlPattern) console.log(`    URL pattern: ${pattern.urlPattern}`);
      console.log(`    Detection method: ${pattern.detectionMethod}`);
      console.log(`    Confidence: ${pattern.confidence || 'N/A'}`);
    } else {
      console.log('  No pagination pattern detected');
    }

    result.duration = Date.now() - startTime;

    // Validate results
    const assertions = [];
    const failures = [];

    // Check if pattern was expected and found
    const expectedBehavior = testConfig.expectedBehavior || {};

    if (expectedBehavior.parameterName) {
      if (pattern && pattern.paramName === expectedBehavior.parameterName) {
        assertions.push({ name: 'parameterName', passed: true });
      } else {
        assertions.push({ name: 'parameterName', passed: false });
        failures.push(`Expected parameter "${expectedBehavior.parameterName}", got "${pattern?.paramName || 'none'}"`);
      }
    }

    if (expectedBehavior.pathPattern) {
      if (pattern && pattern.urlPattern === expectedBehavior.pathPattern) {
        assertions.push({ name: 'pathPattern', passed: true });
      } else {
        assertions.push({ name: 'pathPattern', passed: false });
        failures.push(`Expected path "${expectedBehavior.pathPattern}", got "${pattern?.urlPattern || 'none'}"`);
      }
    }

    // Check visual controls if expected
    if (expectedBehavior.hasVisualControls === true) {
      if (controls.hasPagination) {
        assertions.push({ name: 'hasVisualControls', passed: true });
      } else {
        assertions.push({ name: 'hasVisualControls', passed: false });
        failures.push('Expected visual pagination controls but none found');
      }
    }

    // If no specific expectations, just check that something was detected
    if (!expectedBehavior.parameterName && !expectedBehavior.pathPattern) {
      if (pattern || controls.hasPagination) {
        assertions.push({ name: 'anyPaginationDetected', passed: true });
      } else {
        assertions.push({ name: 'anyPaginationDetected', passed: false });
        failures.push('No pagination detected (pattern or visual controls)');
      }
    }

    result.validation = {
      passed: failures.length === 0,
      assertions,
      failures,
      summary: `${assertions.filter(a => a.passed).length}/${assertions.length} assertions passed`
    };
    result.passed = result.validation.passed;

    console.log(`Result: ${result.passed ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`  Duration: ${result.duration}ms`);

  } catch (error) {
    result.error = error.message;
    result.passed = false;
    console.error(`Error: ${error.message}`);
  } finally {
    await browserManager.close();
  }

  return result;
}

/**
 * Test: Page URL Generation
 * Verifies that page URLs are correctly generated from detected patterns
 */
async function testPageUrlGeneration(url, testConfig = {}) {
  const testName = 'Page URL Generation Test';
  const startTime = Date.now();
  const testLogger = options.verbose ? logger : {
    info: () => {},
    warn: () => {},
    error: (msg) => console.error(msg),
    debug: () => {}
  };

  console.log(`\n[Test] ${testName}`);
  console.log(`URL: ${url}`);

  const browserManager = new BrowserManager(testLogger);
  const patternDetector = new PatternDetector(testLogger);

  let result = {
    name: testName,
    url,
    passed: false,
    generatedUrls: [],
    validation: null,
    duration: 0,
    error: null
  };

  try {
    await browserManager.launch(headless);
    const page = browserManager.getPage();
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    // Discover pattern
    const pattern = await patternDetector.discoverPattern(page, url);

    if (!pattern) {
      result.error = 'No pattern detected for URL generation test';
      result.passed = false;
      console.log('  Skipped: No pattern detected');
      await browserManager.close();
      return result;
    }

    // Generate page URLs
    const pageCount = options.quick ? 3 : 5;
    const urls = [];

    for (let i = 1; i <= pageCount; i++) {
      let pageUrl;
      const urlObj = new URL(pattern.baseUrl || url);

      switch (pattern.type) {
        case 'parameter':
          urlObj.searchParams.set(pattern.paramName, i.toString());
          pageUrl = urlObj.toString();
          break;
        case 'path':
          pageUrl = `${pattern.baseUrl || urlObj.origin}${pattern.urlPattern.replace('{page}', i.toString())}`;
          break;
        case 'offset':
          const offset = (i - 1) * (pattern.itemsPerPage || 10);
          urlObj.searchParams.set(pattern.paramName, offset.toString());
          pageUrl = urlObj.toString();
          break;
        default:
          pageUrl = null;
      }

      if (pageUrl) {
        urls.push({ page: i, url: pageUrl });
      }
    }

    result.generatedUrls = urls;
    console.log(`  Generated ${urls.length} page URLs:`);
    urls.forEach(u => console.log(`    Page ${u.page}: ${u.url}`));

    // Validate first few URLs actually load
    const validationResults = [];
    const pagesToTest = options.quick ? 2 : 3;

    console.log(`  Validating ${pagesToTest} page URLs...`);

    for (let i = 0; i < Math.min(pagesToTest, urls.length); i++) {
      const testUrl = urls[i];
      try {
        await page.goto(testUrl.url, { waitUntil: 'networkidle0', timeout: 15000 });

        // Check page has content
        const hasContent = await page.evaluate(() => {
          const bodyText = document.body.innerText || '';
          return bodyText.length > 100;
        });

        validationResults.push({
          page: testUrl.page,
          url: testUrl.url,
          loaded: true,
          hasContent
        });

        if (options.verbose) {
          console.log(`    Page ${testUrl.page}: ${hasContent ? '✓ Has content' : '⚠ Empty'}`);
        }
      } catch (err) {
        validationResults.push({
          page: testUrl.page,
          url: testUrl.url,
          loaded: false,
          error: err.message
        });
        if (options.verbose) {
          console.log(`    Page ${testUrl.page}: ✗ Failed - ${err.message}`);
        }
      }
    }

    result.duration = Date.now() - startTime;

    // Validate results
    const assertions = [];
    const failures = [];

    const loadedPages = validationResults.filter(r => r.loaded).length;
    const contentPages = validationResults.filter(r => r.loaded && r.hasContent).length;

    if (loadedPages === validationResults.length) {
      assertions.push({ name: 'allPagesLoad', passed: true });
    } else {
      assertions.push({ name: 'allPagesLoad', passed: false });
      failures.push(`Only ${loadedPages}/${validationResults.length} pages loaded successfully`);
    }

    if (contentPages >= loadedPages * 0.5) {  // At least 50% should have content
      assertions.push({ name: 'pagesHaveContent', passed: true });
    } else {
      assertions.push({ name: 'pagesHaveContent', passed: false });
      failures.push(`Only ${contentPages}/${loadedPages} pages have content`);
    }

    // Check URLs are unique
    const uniqueUrls = new Set(urls.map(u => u.url));
    if (uniqueUrls.size === urls.length) {
      assertions.push({ name: 'uniqueUrls', passed: true });
    } else {
      assertions.push({ name: 'uniqueUrls', passed: false });
      failures.push('Generated duplicate URLs');
    }

    result.validation = {
      passed: failures.length === 0,
      assertions,
      failures,
      summary: `${assertions.filter(a => a.passed).length}/${assertions.length} assertions passed`
    };
    result.passed = result.validation.passed;

    console.log(`Result: ${result.passed ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`  Pages tested: ${validationResults.length}, Loaded: ${loadedPages}, With content: ${contentPages}`);
    console.log(`  Duration: ${result.duration}ms`);

  } catch (error) {
    result.error = error.message;
    result.passed = false;
    console.error(`Error: ${error.message}`);
  } finally {
    await browserManager.close();
  }

  return result;
}

/**
 * Test: Infinite Scroll Detection
 * Verifies that infinite scroll detection works correctly
 */
async function testInfiniteScrollDetection(url, testConfig = {}) {
  const testName = 'Infinite Scroll Detection Test';
  const startTime = Date.now();
  const testLogger = options.verbose ? logger : {
    info: () => {},
    warn: () => {},
    error: (msg) => console.error(msg),
    debug: () => {}
  };

  console.log(`\n[Test] ${testName}`);
  console.log(`URL: ${url}`);

  const browserManager = new BrowserManager(testLogger);
  const patternDetector = new PatternDetector(testLogger);

  let result = {
    name: testName,
    url,
    passed: false,
    infiniteScrollResult: null,
    validation: null,
    duration: 0,
    error: null
  };

  try {
    await browserManager.launch(headless);
    const page = browserManager.getPage();
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    // Detect infinite scroll
    console.log('  Detecting infinite scroll indicators...');
    const infScrollResult = await patternDetector.detectInfiniteScroll(page);
    result.infiniteScrollResult = infScrollResult;

    console.log(`  Detected: ${infScrollResult.detected}`);
    console.log(`  Score: ${infScrollResult.score}/10`);

    if (options.verbose && infScrollResult.indicators) {
      console.log('  Indicators:');
      Object.entries(infScrollResult.indicators).forEach(([key, value]) => {
        if (value) console.log(`    - ${key}: ${value}`);
      });
    }

    result.duration = Date.now() - startTime;

    // Validate results
    const assertions = [];
    const failures = [];

    const expectedInfiniteScroll = testConfig.expectedBehavior?.isInfiniteScroll;

    if (expectedInfiniteScroll === true) {
      if (infScrollResult.detected) {
        assertions.push({ name: 'infiniteScrollDetected', passed: true });
      } else {
        assertions.push({ name: 'infiniteScrollDetected', passed: false });
        failures.push('Expected infinite scroll but not detected');
      }
    } else if (expectedInfiniteScroll === false) {
      if (!infScrollResult.detected) {
        assertions.push({ name: 'noInfiniteScroll', passed: true });
      } else {
        assertions.push({ name: 'noInfiniteScroll', passed: false });
        failures.push('Unexpected infinite scroll detection');
      }
    } else {
      // No expectation - just record the result
      assertions.push({
        name: 'infiniteScrollCheck',
        passed: true,
        note: `Infinite scroll ${infScrollResult.detected ? 'detected' : 'not detected'} (score: ${infScrollResult.score})`
      });
    }

    result.validation = {
      passed: failures.length === 0,
      assertions,
      failures,
      summary: `${assertions.filter(a => a.passed).length}/${assertions.length} assertions passed`
    };
    result.passed = result.validation.passed;

    console.log(`Result: ${result.passed ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`  Duration: ${result.duration}ms`);

  } catch (error) {
    result.error = error.message;
    result.passed = false;
    console.error(`Error: ${error.message}`);
  } finally {
    await browserManager.close();
  }

  return result;
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║      PAGINATION NAVIGATION TESTS                                   ║');
  console.log('║      Testing pattern detection and URL generation                  ║');
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
    testUrls = [{
      name: 'CLI Specified URL',
      url: options.url,
      description: 'URL provided via --url flag',
      expectedBehavior: {}
    }];
  } else {
    try {
      testUrls = loadTestUrls('pagination');
      if (testUrls.length === 0) {
        console.log('No pagination test URLs found in test-urls.json');
        console.log('Using Sullivan & Cromwell as infinite scroll detection test');
        testUrls = [{
          name: 'Sullivan & Cromwell (Infinite Scroll Check)',
          url: 'https://www.sullcrom.com/LawyerListing?custom_is_office=27567',
          expectedBehavior: {
            isInfiniteScroll: true
          }
        }];
      }
    } catch (err) {
      console.error('Failed to load test URLs:', err.message);
      testUrls = [{
        name: 'Sullivan & Cromwell (Infinite Scroll Check)',
        url: 'https://www.sullcrom.com/LawyerListing?custom_is_office=27567',
        expectedBehavior: {
          isInfiniteScroll: true
        }
      }];
    }
  }

  console.log(`Running tests on ${testUrls.length} URL(s)...`);
  console.log('─'.repeat(70));

  // Run pattern detection for each URL
  for (const testUrl of testUrls) {
    const patternResult = await testPatternDetection(testUrl.url, testUrl);
    results.push(patternResult);

    // If pattern found, also test URL generation
    if (patternResult.pattern && patternResult.pattern.type !== 'infinite-scroll') {
      const urlGenResult = await testPageUrlGeneration(testUrl.url, testUrl);
      results.push(urlGenResult);
    }
  }

  // Run infinite scroll detection test on first URL
  if (testUrls.length > 0) {
    console.log('─'.repeat(70));
    console.log('Running infinite scroll detection test...');
    const infScrollResult = await testInfiniteScrollDetection(testUrls[0].url, testUrls[0]);
    results.push(infScrollResult);
  }

  // Report results
  const reporter = new TestReporter({
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

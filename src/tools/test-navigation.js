#!/usr/bin/env node

/**
 * Navigation Test Tool
 *
 * Quick ad-hoc navigation testing for infinite scroll and pagination.
 * Tests navigation mechanics without needing to add URLs to test-urls.json.
 *
 * Usage:
 *   node src/tools/test-navigation.js --url "URL" --type infinite-scroll
 *   node src/tools/test-navigation.js --url "URL" --type pagination --verbose
 *   node src/tools/test-navigation.js --url "URL" --type infinite-scroll --headless false
 */

require('dotenv').config();

const path = require('path');
const { Command } = require('commander');

// Set working directory to project root
process.chdir(path.join(__dirname, '..', '..'));

const logger = require('../core/logger');
const { SeleniumManager } = require('../core');
const BrowserManager = require('../core/browser-manager');
const PatternDetector = require('../features/pagination/pattern-detector');
const UrlGenerator = require('../features/pagination/url-generator');
const {
  displayStageHeader,
  displayStageSummary,
  displaySuccess,
  displayError,
  displayWarning,
  displayInfo
} = require('../utils/prompt-helper');

// CLI Setup
const program = new Command();
program
  .name('test-navigation')
  .description('Test navigation mechanics for infinite scroll or pagination')
  .version('1.0.0')
  .requiredOption('-u, --url <url>', 'URL to test (required)')
  .requiredOption('-t, --type <type>', 'Test type: infinite-scroll or pagination')
  .option('--headless <bool>', 'Browser visibility (default: true)', 'true')
  .option('--scroll-delay <ms>', 'Delay between scrolls in ms', parseInt, 400)
  .option('--max-retries <n>', 'Max no-change scroll attempts', parseInt, 25)
  .option('--max-scrolls <n>', 'Safety limit for scrolls', parseInt, 1000)
  .option('-v, --verbose', 'Detailed output', false)
  .parse(process.argv);

const options = program.opts();

// Parse headless option
function parseHeadless(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'false' || lower === '0' || lower === 'no') {
      return false;
    }
  }
  return true;
}

// Format duration
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

// Format number with commas
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Test infinite scroll navigation
 */
async function testInfiniteScroll(url, opts) {
  const startTime = Date.now();
  const headless = parseHeadless(opts.headless);

  displayStageHeader('INFINITE SCROLL NAVIGATION TEST');
  displayInfo(`URL: ${url}`);
  displayInfo(`Headless: ${headless}`);
  displayInfo(`Scroll delay: ${opts.scrollDelay}ms`);
  displayInfo(`Max retries: ${opts.maxRetries}`);
  displayInfo(`Max scrolls: ${opts.maxScrolls}`);
  console.log('');

  const seleniumManager = new SeleniumManager(opts.verbose ? logger : {
    info: () => {},
    warn: () => {},
    error: (msg) => console.error(msg),
    debug: () => {}
  });

  // Timeline collection
  const heightChanges = [];
  const buttonClicks = [];

  try {
    // Launch browser
    displayInfo('Launching browser...');
    await seleniumManager.launch(headless);

    // Navigate to URL
    displayInfo('Navigating to URL...');
    await seleniumManager.navigate(url);

    // Configure scroll options
    const scrollOptions = {
      scrollDelay: opts.scrollDelay,
      maxRetries: opts.maxRetries,
      maxScrolls: opts.maxScrolls,
      initialWait: 3000,
      verbose: opts.verbose,
      enableLoadMoreButton: true,
      maxButtonClicks: 50,

      // Timeline callbacks
      onHeightChange: (data) => {
        heightChanges.push(data);
        if (opts.verbose) {
          console.log(`  [Height Change] ${data.previousHeight} -> ${data.newHeight} (+${data.delta}px) at scroll ${data.scrollCount}`);
        }
      },
      onButtonClick: (data) => {
        buttonClicks.push(data);
        console.log(`  [Button Click] "${data.buttonText}" (${data.strategy}) - Click #${data.buttonClicks}`);
      },
      onScrollBatch: (data) => {
        if (opts.verbose) {
          console.log(`  [Batch ${data.scrollCount}] Height changes: ${data.heightChanges}, Retries: ${data.retriesAtBatch}`);
        }
      }
    };

    // Execute scroll
    console.log('');
    displayInfo('Starting scroll test...');
    console.log('');

    const scrollStats = await seleniumManager.scrollToFullyLoad(scrollOptions);
    const duration = Date.now() - startTime;

    // Display results
    console.log('');
    displayStageHeader('NAVIGATION TEST RESULTS');
    console.log(`URL: ${url}`);
    console.log(`Test Type: infinite-scroll`);
    console.log('');

    // Determine pass/fail
    const passed = scrollStats.heightChanges > 0 || scrollStats.buttonClicks > 0;

    if (passed) {
      displaySuccess('Navigation Test PASSED');
    } else {
      displayError('Navigation Test FAILED');
      displayWarning('No height changes or button clicks detected');
    }

    console.log('');
    console.log('Metrics:');
    const metrics = {
      'Scroll count': scrollStats.scrollCount,
      'Height changes': scrollStats.heightChanges,
      'Button clicks': scrollStats.buttonClicks,
      'Final height': `${formatNumber(scrollStats.finalHeight)}px`,
      'Duration': formatDuration(duration),
      'Stop reason': scrollStats.stopReason || 'Unknown'
    };
    displayStageSummary(metrics);

    // Show timeline highlights
    if (heightChanges.length > 0 || buttonClicks.length > 0) {
      console.log('');
      console.log('Timeline Highlights:');

      // Show first few height changes
      heightChanges.slice(0, 3).forEach((hc) => {
        console.log(`  - Height change at scroll ${hc.scrollCount} (+${formatNumber(hc.delta)}px)`);
      });
      if (heightChanges.length > 3) {
        console.log(`  - ... and ${heightChanges.length - 3} more height changes`);
      }

      // Show button clicks
      buttonClicks.forEach((bc) => {
        console.log(`  - Button clicked: "${bc.buttonText}" at scroll ${bc.scrollCount}`);
      });
    }

    // Next steps
    console.log('');
    displayStageHeader('NEXT STEPS');
    console.log('1. Generate config:');
    console.log(`   node src/tools/config-generator.js --url "${url}"`);
    console.log('');
    console.log('2. Validate config:');
    console.log(`   node src/tools/validate-config.js --url "${url}" --limit 5`);
    console.log('');
    console.log('3. Run full scrape:');
    console.log(`   node orchestrator.js --url "${url}" --method config --scroll`);
    console.log('');

    return passed;

  } catch (error) {
    console.log('');
    displayError(`Navigation test failed: ${error.message}`);
    if (opts.verbose) {
      console.log('');
      console.log('Stack trace:');
      console.log(error.stack);
    }
    return false;

  } finally {
    try {
      await seleniumManager.close();
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Test pagination navigation
 */
async function testPagination(url, opts) {
  const startTime = Date.now();
  const headless = parseHeadless(opts.headless);

  displayStageHeader('PAGINATION NAVIGATION TEST');
  displayInfo(`URL: ${url}`);
  displayInfo(`Headless: ${headless}`);
  console.log('');

  const browserManager = new BrowserManager(opts.verbose ? logger : {
    info: () => {},
    warn: () => {},
    error: (msg) => console.error(msg),
    debug: () => {}
  });

  try {
    // Launch browser
    displayInfo('Launching browser...');
    await browserManager.launch(headless);

    // Get page
    const page = await browserManager.getPage();

    // Navigate to URL
    displayInfo('Navigating to URL...');
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    // Create pattern detector
    const patternDetector = new PatternDetector(opts.verbose ? logger : {
      info: () => {},
      warn: () => {},
      error: (msg) => console.error(msg),
      debug: () => {}
    });

    // Detect pagination pattern
    displayInfo('Detecting pagination pattern...');
    console.log('');

    const pattern = await patternDetector.discoverPattern(page, url, null);
    const duration = Date.now() - startTime;

    // Display results
    console.log('');
    displayStageHeader('NAVIGATION TEST RESULTS');
    console.log(`URL: ${url}`);
    console.log(`Test Type: pagination`);
    console.log('');

    if (pattern) {
      displaySuccess('Pagination Pattern Detected');
      console.log('');

      // Pattern details
      const patternInfo = {
        'Pattern type': pattern.type || pattern.paginationType,
        'Detection method': pattern.detectionMethod || 'auto',
        'Confidence': pattern.confidence ? `${Math.round(pattern.confidence * 100)}%` : 'N/A'
      };

      if (pattern.paramName) {
        patternInfo['Parameter name'] = pattern.paramName;
      }
      if (pattern.currentPage !== undefined) {
        patternInfo['Current page'] = pattern.currentPage;
      }
      if (pattern.maxPage !== undefined) {
        patternInfo['Max page'] = pattern.maxPage;
      }
      if (pattern.baseUrl) {
        patternInfo['Base URL'] = pattern.baseUrl.length > 60
          ? pattern.baseUrl.substring(0, 57) + '...'
          : pattern.baseUrl;
      }

      patternInfo['Duration'] = formatDuration(duration);

      displayStageSummary(patternInfo, 'Pattern Details:');

      // Generate sample URLs
      if (pattern.type === 'parameter' || pattern.type === 'offset') {
        console.log('');
        console.log('Sample Page URLs:');

        const urlGenerator = new UrlGenerator();
        for (let i = 1; i <= 5; i++) {
          try {
            const pageUrl = urlGenerator.generatePageUrl(pattern, i);
            console.log(`  Page ${i}: ${pageUrl.length > 70 ? pageUrl.substring(0, 67) + '...' : pageUrl}`);
          } catch (e) {
            console.log(`  Page ${i}: (generation failed)`);
          }
        }
      }

      // URL parameter preservation check
      if (pattern.originalUrl || pattern.baseUrl) {
        const sourceUrl = new URL(pattern.originalUrl || pattern.baseUrl);
        const paramCount = Array.from(sourceUrl.searchParams.keys()).length;
        if (paramCount > 1) {
          console.log('');
          displaySuccess(`Filter parameters preserved: ${paramCount} params in URL`);
        }
      }

    } else {
      displayError('No Pagination Pattern Detected');
      console.log('');
      displayWarning('This may be a single-page site or use infinite scroll');
      console.log('');
      console.log('Recommendations:');
      console.log('  1. Try testing with --type infinite-scroll');
      console.log('  2. Check if the URL has pagination parameters (page=, offset=, etc.)');
      console.log('  3. Inspect the page for pagination controls');
    }

    // Next steps
    console.log('');
    displayStageHeader('NEXT STEPS');

    if (pattern) {
      console.log('1. Generate config:');
      console.log(`   node src/tools/config-generator.js --url "${url}"`);
      console.log('');
      console.log('2. Validate config:');
      console.log(`   node src/tools/validate-config.js --url "${url}" --limit 5`);
      console.log('');
      console.log('3. Run full scrape:');
      console.log(`   node orchestrator.js --url "${url}" --method config`);
    } else {
      console.log('1. Test infinite scroll instead:');
      console.log(`   node src/tools/test-navigation.js --url "${url}" --type infinite-scroll`);
      console.log('');
      console.log('2. Or generate config to auto-detect:');
      console.log(`   node src/tools/config-generator.js --url "${url}"`);
    }
    console.log('');

    return !!pattern;

  } catch (error) {
    console.log('');
    displayError(`Navigation test failed: ${error.message}`);
    if (opts.verbose) {
      console.log('');
      console.log('Stack trace:');
      console.log(error.stack);
    }
    return false;

  } finally {
    try {
      await browserManager.close();
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Main execution
 */
async function main() {
  // Validate test type
  const testType = options.type.toLowerCase();
  if (!['infinite-scroll', 'pagination', 'scroll', 'page'].includes(testType)) {
    displayError(`Invalid test type: ${options.type}`);
    console.log('Valid types: infinite-scroll, pagination');
    process.exit(1);
  }

  // Validate URL
  try {
    new URL(options.url);
  } catch (e) {
    displayError(`Invalid URL: ${options.url}`);
    process.exit(1);
  }

  // Run appropriate test
  let passed;
  if (testType === 'infinite-scroll' || testType === 'scroll') {
    passed = await testInfiniteScroll(options.url, options);
  } else {
    passed = await testPagination(options.url, options);
  }

  process.exit(passed ? 0 : 1);
}

// Handle signals
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT. Cleaning up...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM. Cleaning up...');
  process.exit(0);
});

// Run
main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

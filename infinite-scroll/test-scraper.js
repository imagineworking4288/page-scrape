/**
 * Test Runner for Infinite Scroll Scraper
 * Runs test cases and outputs JSON files for validation
 */

// CRITICAL: Add error handlers FIRST to catch any silent failures
process.on('uncaughtException', (error) => {
  console.error('\n' + '='.repeat(70));
  console.error('UNCAUGHT EXCEPTION IN TEST RUNNER');
  console.error('='.repeat(70));
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
  console.error('='.repeat(70));
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('\n' + '='.repeat(70));
  console.error('UNHANDLED PROMISE REJECTION IN TEST RUNNER');
  console.error('='.repeat(70));
  console.error('Error:', error && error.message ? error.message : error);
  console.error('Stack:', error && error.stack ? error.stack : 'No stack trace');
  console.error('='.repeat(70));
  process.exit(1);
});

// ===========================
// CLI ARGUMENT PARSING
// ===========================
const { Command } = require('commander');

const program = new Command();
program
  .name('infinite-scroll-test')
  .description('Test infinite scroll scraper - supports test suite mode and ad-hoc URL testing')
  .option('-u, --url <url>', 'Target URL to test (enables ad-hoc mode)')
  .option('--max-scroll <number>', 'Max scroll attempts', '50')
  .option('--scroll-delay <ms>', 'Delay between scrolls in ms', '1500')
  .option('--expected-min <number>', 'Minimum expected contacts', '1')
  .option('--expected-max <number>', 'Maximum expected contacts', '1000')
  .option('--min-names <number>', 'Minimum names required', '0')
  .option('--headless <value>', 'Run browser in headless mode (true/false)', 'false')
  .option('--timeout <ms>', 'Test timeout in milliseconds', '180000')
  .parse(process.argv);

const cliOptions = program.opts();

console.log('='.repeat(70));
console.log('INFINITE SCROLL TEST RUNNER - LOADING');
console.log('='.repeat(70));
console.log('');

// Load imports with logging
console.log('Loading modules...');

const path = require('path');
console.log('  ✓ path');

const fs = require('fs');
console.log('  ✓ fs');

let InfiniteScrollScraper;
try {
  InfiniteScrollScraper = require('./infinite-scroll-scraper');
  console.log('  ✓ InfiniteScrollScraper');
} catch (error) {
  console.error('  ✗ InfiniteScrollScraper FAILED:', error.message);
  process.exit(1);
}

let testConfig;
try {
  testConfig = require('./test-config');
  console.log('  ✓ testConfig');
} catch (error) {
  console.error('  ✗ testConfig FAILED:', error.message);
  process.exit(1);
}

let BrowserManager;
try {
  BrowserManager = require(path.join(__dirname, '..', 'src', 'utils', 'browser-manager'));
  console.log('  ✓ BrowserManager');
} catch (error) {
  console.error('  ✗ BrowserManager FAILED:', error.message);
  process.exit(1);
}

let RateLimiter;
try {
  RateLimiter = require(path.join(__dirname, '..', 'src', 'utils', 'rate-limiter'));
  console.log('  ✓ RateLimiter');
} catch (error) {
  console.error('  ✗ RateLimiter FAILED:', error.message);
  process.exit(1);
}

let Logger;
try {
  Logger = require(path.join(__dirname, '..', 'src', 'utils', 'logger'));
  console.log('  ✓ Logger');
} catch (error) {
  console.error('  ✗ Logger FAILED:', error.message);
  process.exit(1);
}

console.log('');
console.log('All modules loaded successfully!');
console.log('');

class TestRunner {
  constructor() {
    console.log('[TestRunner] Initializing...');

    this.outputDir = path.join(__dirname, 'output');
    this.ensureOutputDir();
    console.log(`[TestRunner] Output directory: ${this.outputDir}`);

    // Use logger directly (it's already a configured winston instance, not a class)
    this.logger = Logger;
    console.log('[TestRunner] ✓ Logger initialized');

    // Initialize browser manager (will be set in initBrowser)
    this.browserManager = null;

    // Initialize rate limiter - FIXED: pass logger as first argument
    try {
      this.rateLimiter = new RateLimiter(this.logger, {
        minDelay: 2000,
        maxDelay: 4000
      });
      console.log('[TestRunner] ✓ RateLimiter initialized');
    } catch (error) {
      console.error('[TestRunner] RateLimiter initialization failed:', error.message);
      throw error;
    }

    console.log('[TestRunner] Constructor complete');
  }

  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
      console.log(`[TestRunner] Created output directory: ${this.outputDir}`);
    }
  }

  /**
   * Initialize browser
   */
  async initBrowser() {
    console.log('[initBrowser] Starting browser launch...');

    try {
      // BrowserManager takes logger as constructor argument
      console.log('[initBrowser] Creating BrowserManager...');
      this.browserManager = new BrowserManager(this.logger);
      console.log('[initBrowser] ✓ BrowserManager created');

      // Use launch() method with headless parameter
      const headless = testConfig.settings.browserHeadless;
      console.log(`[initBrowser] Launching browser (headless: ${headless})...`);

      await this.browserManager.launch(headless);

      console.log('[initBrowser] ✓ Browser launched successfully');
      this.logger.info('Browser initialized');
    } catch (error) {
      console.error('[initBrowser] CRITICAL: Browser launch failed!');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      throw error;
    }
  }

  /**
   * Close browser
   */
  async closeBrowser() {
    console.log('[closeBrowser] Closing browser...');
    try {
      if (this.browserManager) {
        await this.browserManager.close();
        console.log('[closeBrowser] ✓ Browser closed');
        this.logger.info('Browser closed');
      } else {
        console.log('[closeBrowser] No browser to close');
      }
    } catch (error) {
      console.error('[closeBrowser] Error closing browser:', error.message);
    }
  }

  /**
   * Reset page state between tests
   * Clears cookies, local storage, and navigates to blank page
   */
  async resetPageState() {
    try {
      const page = this.browserManager.getPage();
      if (!page) {
        console.log('[resetPageState] No page to reset');
        return;
      }

      // Navigate to about:blank to clear the page
      console.log('[resetPageState] Navigating to about:blank...');
      await page.goto('about:blank', { waitUntil: 'load', timeout: 10000 });

      // Clear cookies
      console.log('[resetPageState] Clearing cookies...');
      const client = await page.target().createCDPSession();
      await client.send('Network.clearBrowserCookies');

      // Clear local storage and session storage
      console.log('[resetPageState] Clearing storage...');
      await page.evaluate(() => {
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch (e) {
          // May fail on about:blank, that's ok
        }
      });

      console.log('[resetPageState] ✓ Page state reset complete');
      this.logger.info('Page state reset between tests');

    } catch (error) {
      console.warn('[resetPageState] Error resetting page state:', error.message);
      // Non-fatal error, continue with tests
    }
  }

  /**
   * Run all tests from test-config.js
   */
  async runAllTests() {
    console.log('');
    console.log('='.repeat(70));
    console.log('  INFINITE SCROLL TEST RUNNER');
    console.log('='.repeat(70));
    console.log(`Total tests to run: ${testConfig.tests.length}`);
    console.log('');

    const results = [];

    try {
      console.log('[runAllTests] Initializing browser...');
      await this.initBrowser();
      console.log('[runAllTests] ✓ Browser ready');

      for (let i = 0; i < testConfig.tests.length; i++) {
        const test = testConfig.tests[i];
        console.log('');
        console.log(`${'='.repeat(70)}`);
        console.log(`TEST ${i + 1}/${testConfig.tests.length}: ${test.name}`);
        console.log(`URL: ${test.url}`);
        console.log(`Description: ${test.description}`);
        console.log(`Expected contacts: ${test.expectedMin}-${test.expectedMax}`);
        console.log('='.repeat(70));

        try {
          const result = await this.runSingleTest(test);
          results.push(result);

          this.saveTestOutput(test.name, result);
          this.logTestResult(test, result);
        } catch (testError) {
          console.error(`\n[runAllTests] TEST ERROR: ${test.name}`);
          console.error(`Error: ${testError.message}`);
          console.error(`Stack: ${testError.stack}`);

          results.push({
            testName: test.name,
            url: test.url,
            timestamp: new Date().toISOString(),
            success: false,
            passed: false,
            error: testError.message,
            stack: testError.stack
          });
        }

        // Reset page state and wait between tests
        if (i < testConfig.tests.length - 1) {
          console.log('\n[runAllTests] Resetting page state before next test...');
          await this.resetPageState();
          console.log('[runAllTests] Waiting 3s before next test...');
          await this.sleep(3000);
        }
      }

      this.saveTestSummary(results);

    } catch (error) {
      console.error('');
      console.error('[runAllTests] CRITICAL ERROR:');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      throw error;
    } finally {
      console.log('\n[runAllTests] Cleanup: closing browser...');
      await this.closeBrowser();
    }

    return results;
  }

  /**
   * Run a single test case
   */
  async runSingleTest(test) {
    console.log('');
    console.log(`[runSingleTest] Starting test: ${test.name}`);
    console.log('-'.repeat(50));

    const startTime = Date.now();

    try {
      // Create scraper
      console.log('[runSingleTest] Creating InfiniteScrollScraper instance...');
      const scraper = new InfiniteScrollScraper(
        this.browserManager,
        this.rateLimiter,
        this.logger
      );
      console.log('[runSingleTest] ✓ Scraper created');

      // Run scrape with timeout
      console.log(`[runSingleTest] Running scrape (timeout: ${testConfig.settings.timeout}ms)...`);
      const contacts = await this.scrapeWithTimeout(scraper, test);

      console.log('');
      console.log(`[runSingleTest] Scrape completed! Got ${contacts.length} contacts`);

      // Diagnostic check: if no contacts, log warning
      if (contacts.length === 0) {
        console.log('');
        console.log('[runSingleTest] WARNING: Zero contacts extracted!');
        console.log('Possible causes:');
        console.log('  1. Page did not load correctly');
        console.log('  2. Scroll did not load more content');
        console.log('  3. No business emails found on page');
        console.log('  4. Card selector did not match any elements');
      }

      // Calculate stats
      console.log('[runSingleTest] Calculating stats...');
      const stats = {
        totalContacts: contacts.length,
        withEmail: contacts.filter(c => c.email).length,
        withName: contacts.filter(c => c.name).length,
        withPhone: contacts.filter(c => c.phone).length,
        businessEmails: contacts.filter(c => c.domainType === 'business').length,
        completeness: this.calculateCompleteness(contacts),
        executionTime: Date.now() - startTime
      };

      console.log(`[runSingleTest] Stats: ${stats.totalContacts} total, ${stats.withEmail} with email, ${stats.withName} with name`);

      // Validate test
      const passed = this.validateTest(contacts, test, stats);
      console.log(`[runSingleTest] Test ${passed ? 'PASSED' : 'FAILED'}`);

      const result = {
        testName: test.name,
        url: test.url,
        timestamp: new Date().toISOString(),
        success: true,
        passed: passed,
        contacts: contacts,
        stats: stats,
        expectedMin: test.expectedMin,
        expectedMax: test.expectedMax,
        validationDetails: this.getValidationDetails(contacts, test, stats)
      };

      return result;

    } catch (error) {
      console.error('');
      console.error(`[runSingleTest] Test "${test.name}" FAILED with error:`);
      console.error(`Error: ${error.message}`);
      console.error(`Stack: ${error.stack}`);

      return {
        testName: test.name,
        url: test.url,
        timestamp: new Date().toISOString(),
        success: false,
        passed: false,
        error: error.message,
        stack: error.stack,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Scrape with timeout
   */
  async scrapeWithTimeout(scraper, test) {
    const timeout = testConfig.settings.timeout;
    console.log(`[scrapeWithTimeout] Starting scrape with ${timeout}ms timeout...`);

    return Promise.race([
      scraper.scrape(test.url, test.scrollOptions),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Test timeout after ${timeout}ms`)), timeout)
      )
    ]);
  }

  /**
   * Validate test results
   */
  validateTest(contacts, test, stats) {
    const checks = {
      withinRange: stats.totalContacts >= test.expectedMin &&
                   stats.totalContacts <= test.expectedMax,
      hasEmails: stats.withEmail > 0,
      hasNames: stats.withName >= test.minNamesRequired,
      highCompleteness: stats.completeness >= 60,
      noDuplicates: this.checkNoDuplicates(contacts)
    };

    // All checks must pass
    return Object.values(checks).every(check => check === true);
  }

  /**
   * Get detailed validation info
   */
  getValidationDetails(contacts, test, stats) {
    const totalContacts = stats.totalContacts || 1; // Avoid division by zero
    return {
      countCheck: {
        pass: stats.totalContacts >= test.expectedMin && stats.totalContacts <= test.expectedMax,
        expected: `${test.expectedMin}-${test.expectedMax}`,
        actual: stats.totalContacts
      },
      emailCheck: {
        pass: stats.withEmail > 0,
        percentage: ((stats.withEmail / totalContacts) * 100).toFixed(1)
      },
      nameCheck: {
        pass: stats.withName >= test.minNamesRequired,
        expected: test.minNamesRequired,
        actual: stats.withName
      },
      completenessCheck: {
        pass: stats.completeness >= 60,
        expected: '>=60%',
        actual: `${stats.completeness.toFixed(1)}%`
      },
      duplicateCheck: {
        pass: this.checkNoDuplicates(contacts)
      }
    };
  }

  /**
   * Check for duplicate contacts
   */
  checkNoDuplicates(contacts) {
    const emails = contacts.map(c => c.email).filter(e => e);
    const uniqueEmails = new Set(emails);
    return emails.length === uniqueEmails.size;
  }

  /**
   * Calculate completeness score (0-100)
   */
  calculateCompleteness(contacts) {
    if (contacts.length === 0) return 0;

    let score = 0;
    for (const contact of contacts) {
      if (contact.email) score += 0.5;
      if (contact.name) score += 0.3;
      if (contact.phone) score += 0.2;
    }

    return (score / contacts.length) * 100;
  }

  /**
   * Save test output to JSON file
   */
  saveTestOutput(testName, result) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `${testName}-${timestamp}.json`;
      const filepath = path.join(this.outputDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
      console.log(`\n✓ Saved test output: ${filename}`);
    } catch (error) {
      console.error(`Error saving test output: ${error.message}`);
    }
  }

  /**
   * Log test result to console
   */
  logTestResult(test, result) {
    console.log('\n' + '-'.repeat(70));
    console.log('TEST RESULT');
    console.log('-'.repeat(70));

    if (!result.success) {
      console.log(`❌ FAILED - Error: ${result.error}`);
      return;
    }

    console.log(`Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);

    if (result.stats && result.stats.totalContacts > 0) {
      const total = result.stats.totalContacts;
      console.log(`\nContacts: ${total} (expected: ${test.expectedMin}-${test.expectedMax})`);
      console.log(`  - With email: ${result.stats.withEmail} (${((result.stats.withEmail/total)*100).toFixed(1)}%)`);
      console.log(`  - With name: ${result.stats.withName} (${((result.stats.withName/total)*100).toFixed(1)}%)`);
      console.log(`  - With phone: ${result.stats.withPhone} (${((result.stats.withPhone/total)*100).toFixed(1)}%)`);
      console.log(`  - Business emails: ${result.stats.businessEmails}`);
      console.log(`\nCompleteness: ${result.stats.completeness.toFixed(1)}%`);
      console.log(`Execution time: ${(result.stats.executionTime / 1000).toFixed(1)}s`);
    } else {
      console.log('\nNo contacts extracted.');
      console.log(`Execution time: ${result.stats ? (result.stats.executionTime / 1000).toFixed(1) + 's' : 'N/A'}`);
    }

    // Show validation details
    if (result.validationDetails) {
      console.log('\nValidation Checks:');
      for (const [key, value] of Object.entries(result.validationDetails)) {
        const status = value.pass ? '✓' : '✗';
        console.log(`  ${status} ${key}: ${JSON.stringify(value)}`);
      }
    }
  }

  /**
   * Save test summary
   */
  saveTestSummary(results) {
    try {
      const summary = {
        timestamp: new Date().toISOString(),
        totalTests: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        results: results.map(r => ({
          testName: r.testName,
          passed: r.passed,
          contactCount: r.stats?.totalContacts || 0,
          completeness: r.stats?.completeness || 0,
          executionTime: r.stats?.executionTime || 0
        }))
      };

      const filepath = path.join(this.outputDir, 'test-summary.json');
      fs.writeFileSync(filepath, JSON.stringify(summary, null, 2));

      console.log('\n' + '='.repeat(70));
      console.log('TEST SUMMARY');
      console.log('='.repeat(70));
      console.log(`Total tests: ${summary.totalTests}`);
      console.log(`Passed: ${summary.passed} ✅`);
      console.log(`Failed: ${summary.failed} ❌`);
      console.log(`Success rate: ${((summary.passed / summary.totalTests) * 100).toFixed(1)}%`);
      console.log(`\nSummary saved to: test-summary.json`);
    } catch (error) {
      console.error(`Error saving test summary: ${error.message}`);
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TestRunner;

// Run tests if called directly
if (require.main === module) {
  console.log('');
  console.log('[Main] Test runner invoked directly');

  try {
    const runner = new TestRunner();
    console.log('[Main] ✓ TestRunner created');

    // Detect mode: Ad-hoc (--url provided) vs Test Suite (no --url)
    if (cliOptions.url) {
      console.log('');
      console.log('='.repeat(70));
      console.log('  AD-HOC TEST MODE');
      console.log('='.repeat(70));
      console.log(`[Main] Target URL: ${cliOptions.url}`);
      console.log(`[Main] Max scrolls: ${cliOptions.maxScroll}`);
      console.log(`[Main] Scroll delay: ${cliOptions.scrollDelay}ms`);
      console.log(`[Main] Expected contacts: ${cliOptions.expectedMin}-${cliOptions.expectedMax}`);
      console.log(`[Main] Min names required: ${cliOptions.minNames}`);
      console.log(`[Main] Headless: ${cliOptions.headless}`);
      console.log(`[Main] Timeout: ${cliOptions.timeout}ms`);
      console.log('');

      // Create ad-hoc test configuration
      const adHocTest = {
        name: 'ad-hoc-test',
        url: cliOptions.url,
        description: `Ad-hoc test for ${cliOptions.url}`,
        expectedMin: parseInt(cliOptions.expectedMin),
        expectedMax: parseInt(cliOptions.expectedMax),
        minNamesRequired: parseInt(cliOptions.minNames),
        scrollOptions: {
          maxScrolls: parseInt(cliOptions.maxScroll),
          scrollDelay: parseInt(cliOptions.scrollDelay),
          noChangeThreshold: 3,
          limit: null
        }
      };

      // Override testConfig.tests with single ad-hoc test
      testConfig.tests = [adHocTest];

      // Override settings
      testConfig.settings.browserHeadless = cliOptions.headless === 'true';
      testConfig.settings.timeout = parseInt(cliOptions.timeout);

      console.log('[Main] Starting ad-hoc test...');
    } else {
      console.log('[Main] Test suite mode - running all tests from config');
      console.log(`[Main] Tests to run: ${testConfig.tests.length}`);
    }

    console.log('');

    runner.runAllTests()
      .then(results => {
        const allPassed = results.every(r => r.passed);
        console.log(`\n${'='.repeat(70)}`);
        console.log(allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
        console.log('='.repeat(70));
        process.exit(allPassed ? 0 : 1);
      })
      .catch(error => {
        console.error('\n' + '='.repeat(70));
        console.error('❌ TEST RUNNER FAILED');
        console.error('='.repeat(70));
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('='.repeat(70));
        process.exit(1);
      });
  } catch (error) {
    console.error('\n' + '='.repeat(70));
    console.error('❌ FAILED TO CREATE TEST RUNNER');
    console.error('='.repeat(70));
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('='.repeat(70));
    process.exit(1);
  }
} else {
  console.log('[Main] Module loaded as dependency (not invoked directly)');
}

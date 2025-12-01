/**
 * Test Runner for Infinite Scroll Scraper
 * Runs test cases and outputs JSON files for validation
 */

const path = require('path');
const fs = require('fs');
const InfiniteScrollScraper = require('./infinite-scroll-scraper');
const testConfig = require('./test-config');

// Import project dependencies
const BrowserManager = require(path.join(__dirname, '..', 'src', 'utils', 'browser-manager'));
const RateLimiter = require(path.join(__dirname, '..', 'src', 'utils', 'rate-limiter'));
const Logger = require(path.join(__dirname, '..', 'src', 'utils', 'logger'));

class TestRunner {
  constructor() {
    this.outputDir = path.join(__dirname, 'output');
    this.ensureOutputDir();

    // Initialize logger
    this.logger = new Logger({ level: 'info' });

    // Initialize browser manager and rate limiter
    this.browserManager = null;
    this.rateLimiter = new RateLimiter({
      minDelay: 2000,
      maxDelay: 4000
    });
  }

  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
      console.log(`Created output directory: ${this.outputDir}`);
    }
  }

  /**
   * Initialize browser
   */
  async initBrowser() {
    this.browserManager = new BrowserManager({
      headless: testConfig.settings.browserHeadless,
      logger: this.logger
    });

    await this.browserManager.initialize();
    this.logger.info('Browser initialized');
  }

  /**
   * Close browser
   */
  async closeBrowser() {
    if (this.browserManager) {
      await this.browserManager.close();
      this.logger.info('Browser closed');
    }
  }

  /**
   * Run all tests from test-config.js
   */
  async runAllTests() {
    const results = [];

    try {
      await this.initBrowser();

      for (const test of testConfig.tests) {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`TEST: ${test.name}`);
        console.log(`URL: ${test.url}`);
        console.log(`Description: ${test.description}`);
        console.log('='.repeat(70));

        const result = await this.runSingleTest(test);
        results.push(result);

        this.saveTestOutput(test.name, result);
        this.logTestResult(test, result);

        // Wait between tests
        await this.sleep(3000);
      }

      this.saveTestSummary(results);

    } finally {
      await this.closeBrowser();
    }

    return results;
  }

  /**
   * Run a single test case
   */
  async runSingleTest(test) {
    const startTime = Date.now();

    try {
      // Create scraper
      const scraper = new InfiniteScrollScraper(
        this.browserManager,
        this.rateLimiter,
        this.logger
      );

      // Run scrape with timeout
      const contacts = await this.scrapeWithTimeout(scraper, test);

      // Calculate stats
      const stats = {
        totalContacts: contacts.length,
        withEmail: contacts.filter(c => c.email).length,
        withName: contacts.filter(c => c.name).length,
        withPhone: contacts.filter(c => c.phone).length,
        businessEmails: contacts.filter(c => c.domainType === 'business').length,
        completeness: this.calculateCompleteness(contacts),
        executionTime: Date.now() - startTime
      };

      // Validate test
      const passed = this.validateTest(contacts, test, stats);

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
    return {
      countCheck: {
        pass: stats.totalContacts >= test.expectedMin && stats.totalContacts <= test.expectedMax,
        expected: `${test.expectedMin}-${test.expectedMax}`,
        actual: stats.totalContacts
      },
      emailCheck: {
        pass: stats.withEmail > 0,
        percentage: ((stats.withEmail / stats.totalContacts) * 100).toFixed(1)
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
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `${testName}-${timestamp}.json`;
    const filepath = path.join(this.outputDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
    console.log(`\n✓ Saved test output: ${filename}`);
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
    console.log(`\nContacts: ${result.stats.totalContacts} (expected: ${test.expectedMin}-${test.expectedMax})`);
    console.log(`  - With email: ${result.stats.withEmail} (${((result.stats.withEmail/result.stats.totalContacts)*100).toFixed(1)}%)`);
    console.log(`  - With name: ${result.stats.withName} (${((result.stats.withName/result.stats.totalContacts)*100).toFixed(1)}%)`);
    console.log(`  - With phone: ${result.stats.withPhone} (${((result.stats.withPhone/result.stats.totalContacts)*100).toFixed(1)}%)`);
    console.log(`  - Business emails: ${result.stats.businessEmails}`);
    console.log(`\nCompleteness: ${result.stats.completeness.toFixed(1)}%`);
    console.log(`Execution time: ${(result.stats.executionTime / 1000).toFixed(1)}s`);

    // Show validation details
    console.log('\nValidation Checks:');
    for (const [key, value] of Object.entries(result.validationDetails)) {
      const status = value.pass ? '✓' : '✗';
      console.log(`  ${status} ${key}: ${JSON.stringify(value)}`);
    }
  }

  /**
   * Save test summary
   */
  saveTestSummary(results) {
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
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run tests if called directly
if (require.main === module) {
  const runner = new TestRunner();

  runner.runAllTests()
    .then(results => {
      const allPassed = results.every(r => r.passed);
      console.log(`\n${'='.repeat(70)}`);
      console.log(allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
      console.log('='.repeat(70));
      process.exit(allPassed ? 0 : 1);
    })
    .catch(error => {
      console.error('\n❌ Test runner failed:', error);
      process.exit(1);
    });
}

module.exports = TestRunner;

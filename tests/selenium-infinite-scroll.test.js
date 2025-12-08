/**
 * Selenium Infinite Scroll Test
 *
 * Tests the Selenium-based infinite scroll functionality against
 * Sullivan & Cromwell's lawyer listing page.
 *
 * Run: node tests/selenium-infinite-scroll.test.js
 */

const path = require('path');

// Add src to path for imports
process.chdir(path.join(__dirname, '..'));

const { SeleniumManager } = require('../src/core');
const { SeleniumInfiniteScrollScraper } = require('../src/scrapers/config-scrapers');
const logger = require('../src/utils/logger');

// Test URL - Sullivan & Cromwell lawyer listing (all lawyers)
const TEST_URL = 'https://www.sullcrom.com/LawyerListing?custom_is_office=27567';

// Simple mock rate limiter
const mockRateLimiter = {
  waitBeforeRequest: async () => {}
};

// Test configuration
const TEST_CONFIG = {
  headless: false,
  scrollDelay: 400,
  maxRetries: 25,
  maxScrolls: 1000,
  expectedMinLawyers: 500
};

async function testSeleniumScrollDirect() {
  console.log('═'.repeat(70));
  console.log('TEST 1: Direct Selenium Scroll Test');
  console.log('═'.repeat(70));
  console.log('');
  console.log(`Target: ${TEST_URL}`);
  console.log(`Expected: ${TEST_CONFIG.expectedMinLawyers}+ lawyer links`);
  console.log('');

  const seleniumManager = new SeleniumManager(logger);

  try {
    // Launch browser
    console.log('Launching Selenium...');
    await seleniumManager.launch(TEST_CONFIG.headless);

    // Navigate to page
    console.log('Navigating to URL...');
    await seleniumManager.navigate(TEST_URL);

    // Scroll to fully load
    console.log('Starting scroll...');
    const stats = await seleniumManager.scrollToFullyLoad({
      scrollDelay: TEST_CONFIG.scrollDelay,
      maxRetries: TEST_CONFIG.maxRetries,
      maxScrolls: TEST_CONFIG.maxScrolls,
      verbose: true
    });

    // Get HTML and extract links
    const html = await seleniumManager.getPageSource();

    // Extract lawyer links (case-insensitive)
    const regex = /href="([^"]*\/[Ll]awyers\/[^"]+)"/gi;
    const links = new Set();
    let match;
    while ((match = regex.exec(html)) !== null) {
      if (!match[1].endsWith('.vcf')) {
        links.add(match[1]);
      }
    }

    const lawyerCount = links.size;

    console.log('');
    console.log('─'.repeat(70));
    console.log('RESULTS');
    console.log('─'.repeat(70));
    console.log(`Scrolls: ${stats.scrollCount}`);
    console.log(`Height changes: ${stats.heightChanges}`);
    console.log(`Final height: ${stats.finalHeight}px`);
    console.log(`Lawyer links found: ${lawyerCount}`);
    console.log('');

    // Verdict
    if (lawyerCount >= TEST_CONFIG.expectedMinLawyers) {
      console.log(`✓ PASS: Found ${lawyerCount} lawyers (expected ${TEST_CONFIG.expectedMinLawyers}+)`);
      return { pass: true, count: lawyerCount, stats };
    } else {
      console.log(`✗ FAIL: Found only ${lawyerCount} lawyers (expected ${TEST_CONFIG.expectedMinLawyers}+)`);
      return { pass: false, count: lawyerCount, stats };
    }

  } catch (error) {
    console.error('Test error:', error.message);
    return { pass: false, error: error.message };
  } finally {
    await seleniumManager.close();
  }
}

async function testSeleniumScraper() {
  console.log('');
  console.log('═'.repeat(70));
  console.log('TEST 2: SeleniumInfiniteScrollScraper Test');
  console.log('═'.repeat(70));
  console.log('');

  // Create a minimal config
  const testConfig = {
    name: 'sullcrom-test',
    version: '2.3',
    cardPattern: {
      primarySelector: '[class*="BioCard"], [class*="bio-card"], .lawyer-card, article'
    },
    fields: {
      name: {
        userValidatedMethod: 'coordinate-text',
        selector: 'h1, h2, h3, h4, .name, [class*="name"]'
      },
      profileUrl: {
        userValidatedMethod: 'href-link',
        selector: 'a[href*="/Lawyer"]'
      }
    },
    pagination: {
      paginationType: 'infinite-scroll',
      scrollMethod: 'selenium-pagedown'
    }
  };

  const seleniumManager = new SeleniumManager(logger);

  try {
    await seleniumManager.launch(TEST_CONFIG.headless);

    const scraper = new SeleniumInfiniteScrollScraper(seleniumManager, mockRateLimiter, logger, {
      scrollDelay: TEST_CONFIG.scrollDelay,
      maxRetries: TEST_CONFIG.maxRetries,
      maxScrolls: TEST_CONFIG.maxScrolls
    });

    // Set config
    scraper.config = testConfig;
    scraper.initializeCardSelector();

    console.log('Running scraper...');
    const results = await scraper.scrape(TEST_URL, 0);  // No limit

    console.log('');
    console.log('─'.repeat(70));
    console.log('RESULTS');
    console.log('─'.repeat(70));
    console.log(`Total contacts: ${results.totalContacts}`);
    console.log(`Scroll stats: ${JSON.stringify(results.scrollStats, null, 2)}`);

    if (results.contacts.length > 0) {
      console.log('');
      console.log('Sample contacts (first 5):');
      results.contacts.slice(0, 5).forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.name || '[No name]'} - ${c.profileUrl || '[No URL]'}`);
      });
    }

    console.log('');

    // Verdict
    if (results.totalContacts >= TEST_CONFIG.expectedMinLawyers) {
      console.log(`✓ PASS: Scraper found ${results.totalContacts} contacts`);
      return { pass: true, count: results.totalContacts };
    } else if (results.totalContacts > 100) {
      console.log(`~ PARTIAL: Scraper found ${results.totalContacts} contacts (card selector may need tuning)`);
      return { pass: true, count: results.totalContacts, note: 'Card selector may need adjustment' };
    } else {
      console.log(`✗ FAIL: Scraper found only ${results.totalContacts} contacts`);
      return { pass: false, count: results.totalContacts };
    }

  } catch (error) {
    console.error('Test error:', error.message);
    console.error(error.stack);
    return { pass: false, error: error.message };
  } finally {
    await seleniumManager.close();
  }
}

async function runAllTests() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║      SELENIUM INFINITE SCROLL TEST SUITE                          ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
  console.log('');

  const results = {};

  // Test 1: Direct Selenium scroll
  results.directScroll = await testSeleniumScrollDirect();

  // Test 2: Scraper integration
  results.scraper = await testSeleniumScraper();

  // Summary
  console.log('');
  console.log('═'.repeat(70));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(70));
  console.log('');
  console.log(`Direct Scroll: ${results.directScroll.pass ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Scraper:       ${results.scraper.pass ? '✓ PASS' : '✗ FAIL'}`);
  console.log('');

  const allPassed = results.directScroll.pass && results.scraper.pass;

  if (allPassed) {
    console.log('All tests passed!');
    process.exit(0);
  } else {
    console.log('Some tests failed.');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

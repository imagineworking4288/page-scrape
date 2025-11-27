/**
 * Infinite Scroll Test Suite
 *
 * Tests the InfiniteScrollHandler and related components.
 * Target test site: Sullivan & Cromwell Lawyer Directory
 * https://www.sullcrom.com/LawyerListing?custom_is_office=27567
 */

const logger = require('../src/utils/logger');
const BrowserManager = require('../src/utils/browser-manager');
const RateLimiter = require('../src/utils/rate-limiter');
const { InfiniteScrollHandler } = require('../src/features/infinite-scroll');
const { ScrapingWorkflow } = require('../src/features/workflows');
const Paginator = require('../src/features/pagination/paginator');
const ConfigLoader = require('../src/utils/config-loader');
const DomainExtractor = require('../src/utils/domain-extractor');

// Test URL
const TEST_URL = 'https://www.sullcrom.com/LawyerListing?custom_is_office=27567';

async function testInfiniteScrollDetection() {
  console.log('\n=== Test 1: Infinite Scroll Detection ===\n');

  const browserManager = new BrowserManager(logger);
  const rateLimiter = new RateLimiter({ requestsPerMinute: 30 }, logger);
  const configLoader = new ConfigLoader(logger);
  const paginator = new Paginator(browserManager, rateLimiter, logger, configLoader);

  try {
    await browserManager.initialize();
    const page = await browserManager.getPage();

    // Navigate to test URL
    console.log(`Navigating to: ${TEST_URL}`);
    await page.goto(TEST_URL, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Create InfiniteScrollHandler
    const config = {
      cardSelector: '.attorney-card, [class*="attorney"], .lawyer-card',
      infiniteScroll: {
        maxScrollAttempts: 5,
        scrollDelay: 2000,
        noNewContentThreshold: 2
      }
    };
    const handler = new InfiniteScrollHandler(page, config, logger);

    // Test detection
    const hasInfiniteScroll = await handler.detectInfiniteScroll();
    console.log(`Infinite scroll detected: ${hasInfiniteScroll}`);

    console.log('\n✓ Test 1 completed\n');
    return { success: true, hasInfiniteScroll };

  } catch (error) {
    console.error(`Test 1 failed: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    await browserManager.close();
  }
}

async function testInfiniteScrollCollection() {
  console.log('\n=== Test 2: Infinite Scroll Collection ===\n');

  const browserManager = new BrowserManager(logger);
  const rateLimiter = new RateLimiter({ requestsPerMinute: 30 }, logger);

  try {
    await browserManager.initialize();
    const page = await browserManager.getPage();

    // Navigate to test URL
    console.log(`Navigating to: ${TEST_URL}`);
    await page.goto(TEST_URL, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Create InfiniteScrollHandler
    const config = {
      cardSelector: '.attorney-card, [class*="attorney"], .lawyer-card',
      infiniteScroll: {
        maxScrollAttempts: 10,
        scrollDelay: 2000,
        noNewContentThreshold: 3
      }
    };
    const handler = new InfiniteScrollHandler(page, config, logger);

    // Define simple extraction function
    const extractFn = async () => {
      const items = await page.evaluate(() => {
        const cards = document.querySelectorAll('.attorney-card, [class*="attorney"], .lawyer-card');
        return Array.from(cards).map(card => {
          const nameEl = card.querySelector('h3, h2, .name, [class*="name"]');
          const emailEl = card.querySelector('a[href^="mailto:"]');
          return {
            name: nameEl?.textContent?.trim() || null,
            email: emailEl?.href?.replace('mailto:', '')?.split('?')[0] || null
          };
        }).filter(item => item.name || item.email);
      });
      return items;
    };

    // Scroll and collect
    console.log('Starting scroll and collect...');
    const items = await handler.scrollAndCollect(extractFn, 50); // Limit to 50 for test

    console.log(`\nCollected ${items.length} items`);
    console.log('Stats:', handler.getStats());

    // Show sample items
    console.log('\nSample items:');
    items.slice(0, 5).forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.name || 'Unknown'} - ${item.email || 'No email'}`);
    });

    console.log('\n✓ Test 2 completed\n');
    return { success: true, itemCount: items.length, stats: handler.getStats() };

  } catch (error) {
    console.error(`Test 2 failed: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    await browserManager.close();
  }
}

async function testScrapingWorkflowWithInfiniteScroll() {
  console.log('\n=== Test 3: ScrapingWorkflow with Infinite Scroll ===\n');

  const browserManager = new BrowserManager(logger);
  const rateLimiter = new RateLimiter({ requestsPerMinute: 30 }, logger);
  const configLoader = new ConfigLoader(logger);
  const domainExtractor = new DomainExtractor(logger);
  const paginator = new Paginator(browserManager, rateLimiter, logger, configLoader);

  try {
    await browserManager.initialize();

    // Create workflow with infinite scroll enabled
    const workflow = new ScrapingWorkflow({
      logger,
      browserManager,
      rateLimiter,
      paginator,
      configLoader,
      domainExtractor,
      method: 'hybrid',
      limit: 30, // Limit for test
      keepPdfs: false,
      infiniteScrollEnabled: true,
      cardSelector: '.attorney-card, [class*="attorney"], .lawyer-card',
      maxScrollAttempts: 10,
      scrollDelay: 2000
    });

    // Run workflow
    console.log('Running workflow...');
    const result = await workflow.run(TEST_URL);

    console.log('\nWorkflow Results:');
    console.log(`  Pagination type: ${result.pagination?.paginationType}`);
    console.log(`  Contacts found: ${result.contacts?.length || 0}`);
    console.log(`  Stats:`, result.stats);

    // Show sample contacts
    if (result.contacts && result.contacts.length > 0) {
      console.log('\nSample contacts:');
      result.contacts.slice(0, 5).forEach((contact, i) => {
        console.log(`  ${i + 1}. ${contact.name || 'Unknown'} - ${contact.email || 'No email'}`);
      });
    }

    console.log('\n✓ Test 3 completed\n');
    return { success: true, result };

  } catch (error) {
    console.error(`Test 3 failed: ${error.message}`);
    console.error(error.stack);
    return { success: false, error: error.message };
  } finally {
    await browserManager.close();
  }
}

async function runAllTests() {
  console.log('========================================');
  console.log('  INFINITE SCROLL TEST SUITE');
  console.log('========================================');

  const results = {
    detection: null,
    collection: null,
    workflow: null
  };

  // Run tests
  results.detection = await testInfiniteScrollDetection();
  results.collection = await testInfiniteScrollCollection();
  results.workflow = await testScrapingWorkflowWithInfiniteScroll();

  // Summary
  console.log('\n========================================');
  console.log('  TEST SUMMARY');
  console.log('========================================\n');

  console.log(`Test 1 (Detection):  ${results.detection.success ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Test 2 (Collection): ${results.collection.success ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Test 3 (Workflow):   ${results.workflow.success ? '✓ PASS' : '✗ FAIL'}`);

  const allPassed = Object.values(results).every(r => r.success);
  console.log(`\nOverall: ${allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}`);

  return results;
}

// Run if called directly
if (require.main === module) {
  runAllTests()
    .then(results => {
      process.exit(Object.values(results).every(r => r.success) ? 0 : 1);
    })
    .catch(error => {
      console.error('Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = {
  testInfiniteScrollDetection,
  testInfiniteScrollCollection,
  testScrapingWorkflowWithInfiniteScroll,
  runAllTests
};

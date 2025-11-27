#!/usr/bin/env node

/**
 * Refactoring Tests
 *
 * Tests to validate all refactored modules work correctly:
 * - BaseScraper inheritance
 * - Pagination modules (PatternDetector, BinarySearcher, UrlGenerator)
 * - Workflow classes (ScrapingWorkflow, ExportWorkflow)
 * - Contact extractor delegation
 */

const { TestSetup, MockLogger, MockBrowserManager, MockRateLimiter, MockPage } = require('./test-utils');

// Test results tracking
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    failed++;
  }
}

// =============================================================================
// BaseScraper Tests
// =============================================================================

function testBaseScraper() {
  console.log('\n📦 BaseScraper Tests');
  console.log('─'.repeat(40));

  const BaseScraper = require('../scrapers/base-scraper');

  test('BaseScraper can be instantiated', () => {
    const logger = new MockLogger();
    const browserManager = new MockBrowserManager();
    const rateLimiter = new MockRateLimiter();
    const scraper = new BaseScraper(browserManager, rateLimiter, logger);
    TestSetup.assertTruthy(scraper, 'Scraper should be created');
  });

  test('BaseScraper has extractor methods', () => {
    const scraper = new BaseScraper(new MockBrowserManager(), new MockRateLimiter(), new MockLogger());
    TestSetup.assertTruthy(typeof scraper.extractEmails === 'function', 'Should have extractEmails');
    TestSetup.assertTruthy(typeof scraper.extractPhones === 'function', 'Should have extractPhones');
    TestSetup.assertTruthy(typeof scraper.validateAndCleanName === 'function', 'Should have validateAndCleanName');
  });

  test('BaseScraper has domain methods', () => {
    const scraper = new BaseScraper(new MockBrowserManager(), new MockRateLimiter(), new MockLogger());
    TestSetup.assertTruthy(typeof scraper.addDomainInfo === 'function', 'Should have addDomainInfo');
    TestSetup.assertTruthy(scraper.domainExtractor, 'Should have domainExtractor');
  });

  test('BaseScraper extractEmails works', () => {
    const scraper = new BaseScraper(new MockBrowserManager(), new MockRateLimiter(), new MockLogger());
    const emails = scraper.extractEmails('Contact us at test@example.com');
    TestSetup.assertTruthy(emails.includes('test@example.com'), 'Should extract email');
  });

  test('BaseScraper addDomainInfo works', () => {
    const scraper = new BaseScraper(new MockBrowserManager(), new MockRateLimiter(), new MockLogger());
    const contact = { email: 'test@business.com' };
    scraper.addDomainInfo(contact);
    TestSetup.assertEqual(contact.domain, 'business.com', 'Should set domain');
    TestSetup.assertEqual(contact.domainType, 'business', 'Should set domainType');
  });

  test('BaseScraper deduplication tracking works', () => {
    const scraper = new BaseScraper(new MockBrowserManager(), new MockRateLimiter(), new MockLogger());
    TestSetup.assertFalsy(scraper.isEmailProcessed('test@example.com'), 'Should not be processed initially');
    scraper.markEmailProcessed('test@example.com');
    TestSetup.assertTruthy(scraper.isEmailProcessed('test@example.com'), 'Should be marked as processed');
    scraper.clearProcessedEmails();
    TestSetup.assertFalsy(scraper.isEmailProcessed('test@example.com'), 'Should be cleared');
  });
}

// =============================================================================
// Scraper Inheritance Tests
// =============================================================================

function testScraperInheritance() {
  console.log('\n📦 Scraper Inheritance Tests');
  console.log('─'.repeat(40));

  const BaseScraper = require('../scrapers/base-scraper');
  const SimpleScraper = require('../scrapers/simple-scraper');
  const PdfScraper = require('../scrapers/pdf-scraper');
  const SelectScraper = require('../scrapers/select-scraper');

  test('SimpleScraper extends BaseScraper', () => {
    const scraper = new SimpleScraper(new MockBrowserManager(), new MockRateLimiter(), new MockLogger());
    TestSetup.assertTruthy(scraper instanceof BaseScraper, 'Should extend BaseScraper');
  });

  test('PdfScraper extends BaseScraper', () => {
    const scraper = new PdfScraper(new MockBrowserManager(), new MockRateLimiter(), new MockLogger());
    TestSetup.assertTruthy(scraper instanceof BaseScraper, 'Should extend BaseScraper');
  });

  test('SelectScraper extends BaseScraper', () => {
    const scraper = new SelectScraper(new MockBrowserManager(), new MockRateLimiter(), new MockLogger());
    TestSetup.assertTruthy(scraper instanceof BaseScraper, 'Should extend BaseScraper');
  });

  test('SimpleScraper inherits extractEmails', () => {
    const scraper = new SimpleScraper(new MockBrowserManager(), new MockRateLimiter(), new MockLogger());
    const emails = scraper.extractEmails('test@example.com');
    TestSetup.assertTruthy(emails.includes('test@example.com'), 'Should inherit extractEmails');
  });

  test('PdfScraper inherits addDomainInfo', () => {
    const scraper = new PdfScraper(new MockBrowserManager(), new MockRateLimiter(), new MockLogger());
    const contact = { email: 'pdf@company.org' };
    scraper.addDomainInfo(contact);
    TestSetup.assertEqual(contact.domain, 'company.org', 'Should inherit addDomainInfo');
  });
}

// =============================================================================
// Pagination Module Tests
// =============================================================================

function testPaginationModules() {
  console.log('\n📦 Pagination Module Tests');
  console.log('─'.repeat(40));

  const { PatternDetector, BinarySearcher, UrlGenerator } = require('../utils/pagination');

  test('PatternDetector can be instantiated', () => {
    const detector = new PatternDetector(new MockLogger());
    TestSetup.assertTruthy(detector, 'Should create PatternDetector');
  });

  test('BinarySearcher can be instantiated', () => {
    const searcher = new BinarySearcher(new MockLogger(), new MockRateLimiter());
    TestSetup.assertTruthy(searcher, 'Should create BinarySearcher');
  });

  test('UrlGenerator can be instantiated', () => {
    const generator = new UrlGenerator(new MockLogger());
    TestSetup.assertTruthy(generator, 'Should create UrlGenerator');
  });

  test('UrlGenerator generates parameter URLs', () => {
    const generator = new UrlGenerator(new MockLogger());
    const pattern = { type: 'parameter', baseUrl: 'https://example.com', paramName: 'page' };
    const url = generator.generatePageUrl(pattern, 5);
    TestSetup.assertEqual(url, 'https://example.com/?page=5', 'Should generate parameter URL');
  });

  test('UrlGenerator generates path URLs', () => {
    const generator = new UrlGenerator(new MockLogger());
    const pattern = { type: 'path', baseUrl: 'https://example.com', urlPattern: '/page/{page}' };
    const url = generator.generatePageUrl(pattern, 3);
    TestSetup.assertEqual(url, 'https://example.com/page/3', 'Should generate path URL');
  });

  test('UrlGenerator generates offset URLs', () => {
    const generator = new UrlGenerator(new MockLogger());
    const pattern = { type: 'offset', baseUrl: 'https://example.com', paramName: 'offset', itemsPerPage: 20 };
    const url = generator.generatePageUrl(pattern, 3);
    TestSetup.assertEqual(url, 'https://example.com/?offset=40', 'Should generate offset URL');
  });

  test('UrlGenerator generates page range', () => {
    const generator = new UrlGenerator(new MockLogger());
    const pattern = { type: 'parameter', baseUrl: 'https://example.com', paramName: 'p' };
    const urls = generator.generatePageRange(pattern, 1, 3);
    TestSetup.assertLength(urls, 3, 'Should generate 3 URLs');
    TestSetup.assertEqual(urls[0], 'https://example.com/?p=1', 'First URL should be page 1');
    TestSetup.assertEqual(urls[2], 'https://example.com/?p=3', 'Last URL should be page 3');
  });

  test('UrlGenerator createGenerator returns function', () => {
    const generator = new UrlGenerator(new MockLogger());
    const pattern = { type: 'parameter', baseUrl: 'https://example.com', paramName: 'page' };
    const fn = generator.createGenerator(pattern);
    TestSetup.assertTruthy(typeof fn === 'function', 'Should return function');
    TestSetup.assertEqual(fn(2), 'https://example.com/?page=2', 'Function should generate URLs');
  });
}

// =============================================================================
// Paginator Integration Tests
// =============================================================================

function testPaginatorIntegration() {
  console.log('\n📦 Paginator Integration Tests');
  console.log('─'.repeat(40));

  const Paginator = require('../utils/paginator');

  test('Paginator initializes sub-modules', () => {
    const paginator = new Paginator(
      new MockBrowserManager(),
      new MockRateLimiter(),
      new MockLogger(),
      null
    );
    TestSetup.assertTruthy(paginator.patternDetector, 'Should have patternDetector');
    TestSetup.assertTruthy(paginator.binarySearcher, 'Should have binarySearcher');
    TestSetup.assertTruthy(paginator.urlGenerator, 'Should have urlGenerator');
  });

  test('Paginator _generateSinglePageUrl uses UrlGenerator', () => {
    const paginator = new Paginator(
      new MockBrowserManager(),
      new MockRateLimiter(),
      new MockLogger(),
      null
    );
    const pattern = { type: 'parameter', baseUrl: 'https://test.com', paramName: 'page' };
    const url = paginator._generateSinglePageUrl(pattern, 7);
    TestSetup.assertEqual(url, 'https://test.com/?page=7', 'Should use UrlGenerator');
  });

  test('Paginator content hash tracking works', () => {
    const paginator = new Paginator(
      new MockBrowserManager(),
      new MockRateLimiter(),
      new MockLogger(),
      null
    );
    TestSetup.assertFalsy(paginator.isDuplicateContent('hash1'), 'Should not be duplicate initially');
    paginator.markContentAsSeen('hash1');
    TestSetup.assertTruthy(paginator.isDuplicateContent('hash1'), 'Should be marked as seen');
    paginator.resetSeenContent();
    TestSetup.assertFalsy(paginator.isDuplicateContent('hash1'), 'Should be cleared');
  });
}

// =============================================================================
// Workflow Tests
// =============================================================================

function testWorkflows() {
  console.log('\n📦 Workflow Tests');
  console.log('─'.repeat(40));

  const { ScrapingWorkflow, ExportWorkflow } = require('../utils/workflows');

  test('ScrapingWorkflow can be instantiated', () => {
    const workflow = new ScrapingWorkflow({ logger: new MockLogger() });
    TestSetup.assertTruthy(workflow, 'Should create ScrapingWorkflow');
  });

  test('ExportWorkflow can be instantiated', () => {
    const workflow = new ExportWorkflow({ logger: new MockLogger() });
    TestSetup.assertTruthy(workflow, 'Should create ExportWorkflow');
  });

  test('ScrapingWorkflow deduplicateContacts works', () => {
    const workflow = new ScrapingWorkflow({ logger: new MockLogger() });
    const contacts = [
      { email: 'test@example.com', name: 'John' },
      { email: 'test@example.com', name: 'John Doe', phone: '123' },
      { email: 'other@example.com', name: 'Jane' }
    ];
    const unique = workflow.deduplicateContacts(contacts);
    TestSetup.assertLength(unique, 2, 'Should deduplicate to 2 contacts');
    const testContact = unique.find(c => c.email === 'test@example.com');
    TestSetup.assertEqual(testContact.name, 'John Doe', 'Should keep more complete contact');
  });

  test('ScrapingWorkflow createScraper works for html method', () => {
    const workflow = new ScrapingWorkflow({
      logger: new MockLogger(),
      browserManager: new MockBrowserManager(),
      rateLimiter: new MockRateLimiter(),
      method: 'html'
    });
    const scraper = workflow.createScraper();
    TestSetup.assertTruthy(scraper, 'Should create scraper');
  });

  test('ExportWorkflow buildOutputData structures correctly', () => {
    const workflow = new ExportWorkflow({ logger: new MockLogger() });
    const result = {
      contacts: [{ email: 'test@example.com' }],
      stats: { pagesScraped: 5, duplicatesRemoved: 10 },
      domainStats: { uniqueDomains: 1 }
    };
    const output = workflow.buildOutputData(result, 'https://example.com');
    TestSetup.assertTruthy(output.metadata, 'Should have metadata');
    TestSetup.assertTruthy(output.contacts, 'Should have contacts');
    TestSetup.assertEqual(output.metadata.url, 'https://example.com', 'Should include URL');
  });
}

// =============================================================================
// Constants Tests
// =============================================================================

function testConstants() {
  console.log('\n📦 Constants Tests');
  console.log('─'.repeat(40));

  const constants = require('../utils/constants');

  test('Constants has timeout values', () => {
    TestSetup.assertTruthy(constants.DEFAULT_TIMEOUT, 'Should have DEFAULT_TIMEOUT');
    TestSetup.assertTruthy(constants.NAVIGATION_TIMEOUT, 'Should have NAVIGATION_TIMEOUT');
  });

  test('Constants has pagination values', () => {
    TestSetup.assertTruthy(constants.DEFAULT_MAX_PAGES, 'Should have DEFAULT_MAX_PAGES');
    TestSetup.assertTruthy(constants.DEFAULT_MIN_CONTACTS !== undefined, 'Should have DEFAULT_MIN_CONTACTS');
  });

  test('Constants has confidence levels', () => {
    TestSetup.assertEqual(constants.CONFIDENCE_HIGH, 'high', 'Should have CONFIDENCE_HIGH');
    TestSetup.assertEqual(constants.CONFIDENCE_MEDIUM, 'medium', 'Should have CONFIDENCE_MEDIUM');
    TestSetup.assertEqual(constants.CONFIDENCE_LOW, 'low', 'Should have CONFIDENCE_LOW');
  });
}

// =============================================================================
// Run All Tests
// =============================================================================

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           REFACTORING VALIDATION TESTS                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  testBaseScraper();
  testScraperInheritance();
  testPaginationModules();
  testPaginatorIntegration();
  testWorkflows();
  testConstants();

  console.log('\n═'.repeat(60));
  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log('  ⚠️  Some tests failed! Review the output above.\n');
    process.exit(1);
  } else {
    console.log('  ✅ All refactoring tests passed!\n');
    process.exit(0);
  }
}

runAllTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});

#!/usr/bin/env node

const PdfScraper = require('../src/scrapers/pdf-scraper');
const DomainExtractor = require('../src/utils/domain-extractor');
const { Command } = require('commander');

// Real imports for live testing
const logger = require('../src/utils/logger');
const BrowserManager = require('../src/utils/browser-manager');
const RateLimiter = require('../src/utils/rate-limiter');

// Mock classes for unit tests
class MockLogger {
  info() {}
  warn() {}
  error() {}
  debug() {}
}

class MockBrowserManager {
  constructor() {
    this.page = null;
  }
  getPage() {
    return this.page;
  }
}

class MockRateLimiter {
  async delay() {}
}

// Test runner
class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
  }

  async test(name, fn) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      this.passed++;
    } catch (error) {
      console.log(`✗ ${name}`);
      console.log(`  Error: ${error.message}`);
      this.failed++;
    }
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  }

  assertMatch(text, pattern, message) {
    if (!pattern.test(text)) {
      throw new Error(message || `Expected "${text}" to match pattern ${pattern}`);
    }
  }

  summary() {
    console.log('\n═══════════════════════════════════════');
    console.log('  UNIT TEST SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`Total Tests: ${this.passed + this.failed}`);
    console.log(`Passed: ${this.passed}`);
    console.log(`Failed: ${this.failed}`);
    console.log('');
    
    if (this.failed === 0) {
      console.log('✓ All unit tests passed!');
    } else {
      console.log(`✗ ${this.failed} unit test(s) failed`);
    }
  }
}

// Live URL testing
async function testLiveUrl(url, headless = true) {
  console.log('\n\n╔═══════════════════════════════════════╗');
  console.log('║   LIVE URL TEST - PDF SCRAPER          ║');
  console.log('╚═══════════════════════════════════════╝\n');
  console.log(`URL: ${url}\n`);

  let browserManager = null;

  try {
    // Initialize real components
    console.log('[1/5] Initializing browser...');
    browserManager = new BrowserManager(logger);
    const rateLimiter = new RateLimiter();
    await browserManager.launch(headless);
    console.log('✓ Browser launched\n');

    // Create PDF scraper and domain extractor
    const scraper = new PdfScraper(browserManager, rateLimiter, logger);
    const domainExtractor = new DomainExtractor(logger);

    // Navigate to URL
    console.log('[2/5] Navigating to URL...');
    await browserManager.navigate(url);
    console.log('✓ Page loaded\n');

    // Check if PDF
    console.log('[3/5] Checking page type...');
    const page = browserManager.getPage();
    const contentType = await page.evaluate(() => {
      return document.contentType || document.querySelector('embed')?.type || 'text/html';
    });
    console.log(`  Content type: ${contentType}`);
    
    const isPdf = contentType.includes('pdf');
    console.log(`  Is PDF: ${isPdf ? 'YES' : 'NO (will try PDF extraction anyway)'}\n`);

    // Extract contacts
    console.log('[4/5] Extracting contacts from PDF...');
    const contacts = await scraper.scrapePdf(url, null);
    console.log(`✓ Extracted ${contacts.length} contacts\n`);

    // Analyze domains
    console.log('[5/5] Analyzing domains...');
    const domainStats = domainExtractor.getDomainStats(contacts);
    console.log(`✓ Found ${domainStats.uniqueDomains} unique domains\n`);

    // Display results
    displayResults(contacts, domainStats);

    // Cleanup
    await browserManager.close();

    return { success: true, contacts, domainStats };

  } catch (error) {
    console.error(`\n✗ Live test failed: ${error.message}`);
    if (browserManager) {
      await browserManager.close();
    }
    return { success: false, error: error.message };
  }
}

function displayResults(contacts, domainStats) {
  console.log('═══════════════════════════════════════════════════');
  console.log('  DATA QUALITY METRICS');
  console.log('═══════════════════════════════════════════════════\n');

  const total = contacts.length;
  const withName = contacts.filter(c => c.name).length;
  const withEmail = contacts.filter(c => c.email).length;
  const withPhone = contacts.filter(c => c.phone).length;
  const complete = contacts.filter(c => c.name && c.email && c.phone).length;

  console.log(`Total Contacts:     ${total}`);
  console.log(`With Name:          ${withName} (${total > 0 ? ((withName/total)*100).toFixed(1) : 0}%)`);
  console.log(`With Email:         ${withEmail} (${total > 0 ? ((withEmail/total)*100).toFixed(1) : 0}%)`);
  console.log(`With Phone:         ${withPhone} (${total > 0 ? ((withPhone/total)*100).toFixed(1) : 0}%)`);
  console.log(`Complete (all 3):   ${complete} (${total > 0 ? ((complete/total)*100).toFixed(1) : 0}%)`);

  const highConf = contacts.filter(c => c.confidence === 'high').length;
  const medConf = contacts.filter(c => c.confidence === 'medium').length;
  const lowConf = contacts.filter(c => c.confidence === 'low').length;

  console.log(`\nConfidence Levels:`);
  console.log(`  High:   ${highConf}`);
  console.log(`  Medium: ${medConf}`);
  console.log(`  Low:    ${lowConf}`);

  // NEW: Display domain statistics
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  DOMAIN ANALYSIS');
  console.log('═══════════════════════════════════════════════════\n');

  console.log(`Unique Domains:     ${domainStats.uniqueDomains}`);
  console.log(`Business Domains:   ${domainStats.businessDomains}`);
  console.log(`Business Emails:    ${domainStats.businessEmailCount} (${withEmail > 0 ? ((domainStats.businessEmailCount / withEmail) * 100).toFixed(1) : '0.0'}%)`);
  console.log(`Personal Emails:    ${domainStats.personalEmailCount} (${withEmail > 0 ? ((domainStats.personalEmailCount / withEmail) * 100).toFixed(1) : '0.0'}%)`);

  if (domainStats.topDomains.length > 0) {
    console.log(`\nTop 5 Domains:`);
    domainStats.topDomains.slice(0, 5).forEach((item, index) => {
      const domainExtractor = new DomainExtractor();
      const type = domainExtractor.isBusinessDomain(item.domain) ? 'Business' : 'Personal';
      console.log(`  ${index + 1}. ${item.domain} - ${item.count} contacts (${item.percentage}%) [${type}]`);
    });
  }

  if (domainStats.topBusinessDomains.length > 0) {
    console.log(`\nTop 5 Business Domains:`);
    domainStats.topBusinessDomains.slice(0, 5).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.domain} - ${item.count} contacts (${item.percentage}% of business)`);
    });
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  RAW SCRAPED DATA');
  console.log('═══════════════════════════════════════════════════\n');

  if (contacts.length === 0) {
    console.log('(No contacts extracted)');
  } else {
    contacts.slice(0, 5).forEach((contact, index) => {
      console.log(`Contact #${index + 1}:`);
      console.log(`  Name:       ${contact.name || '(missing)'}`);
      console.log(`  Email:      ${contact.email || '(missing)'}`);
      console.log(`  Phone:      ${contact.phone || '(missing)'}`);
      console.log(`  Domain:     ${contact.domain || '(missing)'}`);
      console.log(`  Type:       ${contact.domainType || '(missing)'}`);
      console.log(`  Source:     ${contact.source || 'pdf'}`);
      console.log(`  Confidence: ${contact.confidence || 'unknown'}`);
      if (contact.rawText) {
        console.log(`  Raw Text:   ${contact.rawText.substring(0, 100)}...`);
      }
      console.log('');
    });
  }

  console.log('═══════════════════════════════════════════════════\n');
}

// Run unit tests
async function runUnitTests() {
  const runner = new TestRunner();
  const mockLogger = new MockLogger();
  const mockBrowserManager = new MockBrowserManager();
  const mockRateLimiter = new MockRateLimiter();

  console.log('═══════════════════════════════════════');
  console.log('  PDF SCRAPER UNIT TESTS');
  console.log('═══════════════════════════════════════');
  console.log('');

  await runner.test('Phone Pattern Extraction', () => {
    const scraper = new PdfScraper(mockBrowserManager, mockRateLimiter, mockLogger);
    
    const tests = [
      '(123) 456-7890',
      '123-456-7890',
      '1234567890',
      '+1 (123) 456-7890'
    ];
    
    for (const phone of tests) {
      const phones = scraper.extractPhones(phone);
      runner.assert(phones.length > 0, `Should extract phone from: ${phone}`);
    }
  });

  await runner.test('Email Pattern Extraction', () => {
    const scraper = new PdfScraper(mockBrowserManager, mockRateLimiter, mockLogger);
    
    const tests = [
      'test@example.com',
      'user.name@domain.co.uk',
      'email+tag@test.com'
    ];
    
    for (const email of tests) {
      const emails = scraper.extractEmails(email);
      runner.assert(emails.length > 0, `Should extract email from: ${email}`);
    }
  });

  await runner.test('Name Pattern Recognition', () => {
    const scraper = new PdfScraper(mockBrowserManager, mockRateLimiter, mockLogger);
    
    const validNames = [
      [{ text: 'John Doe', height: 20, x: 10, y: 10 }],
      [{ text: 'Mary Jane Smith', height: 20, x: 10, y: 10 }],
      [{ text: "O'Brien", height: 18, x: 10, y: 10 }]
    ];
    
    for (const nameArray of validNames) {
      const name = scraper.extractName(nameArray);
      runner.assert(name !== null, `Should recognize "${nameArray[0].text}" as a name`);
    }
  });

  await runner.test('Single-Word Name Acceptance', () => {
    const scraper = new PdfScraper(mockBrowserManager, mockRateLimiter, mockLogger);
    
    const singleWordNames = [
      [{ text: "O'Brien", height: 20, x: 10, y: 10 }],
      [{ text: "Smith", height: 20, x: 10, y: 10 }],
      [{ text: "McDonald", height: 20, x: 10, y: 10 }],
      [{ text: "Lee", height: 20, x: 10, y: 10 }]
    ];
    
    for (const nameArray of singleWordNames) {
      const name = scraper.extractName(nameArray);
      runner.assert(name !== null, `Should accept single-word name: "${nameArray[0].text}"`);
    }
  });

  await runner.test('Compound Name Support', () => {
    const scraper = new PdfScraper(mockBrowserManager, mockRateLimiter, mockLogger);
    
    const compoundNames = [
      [{ text: "von Trapp", height: 20, x: 10, y: 10 }],
      [{ text: "de la Cruz", height: 20, x: 10, y: 10 }],
      [{ text: "van der Berg", height: 20, x: 10, y: 10 }]
    ];
    
    for (const nameArray of compoundNames) {
      const name = scraper.extractName(nameArray);
      runner.assert(name !== null, `Should accept compound name: "${nameArray[0].text}"`);
    }
  });

  await runner.test('Y-Threshold Configuration', () => {
    const scraper = new PdfScraper(mockBrowserManager, mockRateLimiter, mockLogger);
    
    runner.assertEqual(scraper.Y_THRESHOLD, 40, 'Default Y_THRESHOLD should be 40');
    
    scraper.setYThreshold(30);
    runner.assertEqual(scraper.Y_THRESHOLD, 30, 'Y_THRESHOLD should be configurable');
  });

  await runner.test('Contact Object Structure', () => {
    const scraper = new PdfScraper(mockBrowserManager, mockRateLimiter, mockLogger);
    
    const textGroup = [
      { text: 'John Doe', x: 10, y: 10, height: 20 },
      { text: 'john@example.com', x: 10, y: 30, height: 14 },
      { text: '(123) 456-7890', x: 10, y: 50, height: 14 }
    ];
    
    const contact = scraper.extractContactFromGroup(textGroup);
    
    runner.assert(contact !== null, 'Should create contact');
    runner.assert('name' in contact, 'Should have name field');
    runner.assert('email' in contact, 'Should have email field');
    runner.assert('phone' in contact, 'Should have phone field');
    runner.assert('source' in contact, 'Should have source field');
    runner.assert('confidence' in contact, 'Should have confidence field');
    runner.assertEqual(contact.source, 'pdf', 'Source should be pdf');
  });

  await runner.test('Confidence Calculation', () => {
    const scraper = new PdfScraper(mockBrowserManager, mockRateLimiter, mockLogger);
    
    runner.assertEqual(scraper.calculateConfidence(true, true, true), 'high');
    runner.assertEqual(scraper.calculateConfidence(true, true, false), 'medium');
    runner.assertEqual(scraper.calculateConfidence(false, true, true), 'medium');
    runner.assertEqual(scraper.calculateConfidence(true, false, false), 'low');
    runner.assertEqual(scraper.calculateConfidence(false, true, false), 'low');
  });

  // NEW: Test 9: Domain Extractor Integration
  await runner.test('Domain Extractor Integration', () => {
    const scraper = new PdfScraper(mockBrowserManager, mockRateLimiter, mockLogger);
    
    runner.assert(scraper.domainExtractor, 'Should have domain extractor');
    runner.assert(typeof scraper.addDomainInfo === 'function', 'Should have addDomainInfo method');
  });

  // NEW: Test 10: Domain Info Added to Contacts
  await runner.test('Domain Info Added to Contacts', () => {
    const scraper = new PdfScraper(mockBrowserManager, mockRateLimiter, mockLogger);
    
    const contact = {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '1234567890'
    };
    
    scraper.addDomainInfo(contact);
    
    runner.assert(contact.domain !== undefined, 'Should have domain field');
    runner.assert(contact.domainType !== undefined, 'Should have domainType field');
    runner.assertEqual(contact.domain, 'example.com', 'Should extract correct domain');
  });

  // NEW: Test 11: Business vs Personal Domain Detection
  await runner.test('Business vs Personal Domain Detection', () => {
    const scraper = new PdfScraper(mockBrowserManager, mockRateLimiter, mockLogger);
    
    const businessContact = { email: 'john@acme.com' };
    const personalContact = { email: 'john@gmail.com' };
    
    scraper.addDomainInfo(businessContact);
    scraper.addDomainInfo(personalContact);
    
    runner.assertEqual(businessContact.domainType, 'business', 'Should detect business domain');
    runner.assertEqual(personalContact.domainType, 'personal', 'Should detect personal domain');
  });

  runner.summary();
  return runner.failed === 0;
}

// Main execution
async function main() {
  // Parse command line arguments
  const program = new Command();
  program
    .option('-u, --url <url>', 'URL to test with live PDF scraping')
    .option('--headless [value]', 'Run browser in headless mode (default: true)', 'true')
    .parse(process.argv);

  const options = program.opts();

  // Run unit tests first
  console.log('Starting PDF Scraper tests...\n');
  const unitTestsPassed = await runUnitTests();

  // If URL provided, run live test
  if (options.url) {
    const headless = options.headless === 'false' ? false : true;
    const liveResult = await testLiveUrl(options.url, headless);
    
    if (!liveResult.success) {
      console.log('\n✗ Live URL test failed');
      process.exit(1);
    }
  } else {
    console.log('\n\nℹ No URL provided. To test live PDF scraping, run:');
    console.log('  node tests/pdf-scraper-test.js --url "https://example.com/document.pdf"');
  }

  console.log('\n✓ Testing complete\n');
  process.exit(unitTestsPassed ? 0 : 1);
}

main().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
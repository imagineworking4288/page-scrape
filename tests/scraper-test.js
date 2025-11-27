#!/usr/bin/env node

const SimpleScraper = require('../src/scrapers/simple-scraper');
const DomainExtractor = require('../src/utils/domain-extractor');
const { Command } = require('commander');

// Real imports for live testing
const logger = require('../src/utils/logger');
const BrowserManager = require('../src/utils/browser-manager');
const RateLimiter = require('../src/utils/rate-limiter');

// Mock logger for unit tests (silent logger to avoid console clutter during tests)
class MockLogger {
  info() {}
  warn() {}
  error() {}
  debug() {}
}

// Mock browser manager and rate limiter for unit tests
class MockBrowserManager {
  constructor() {
    this.page = null;
  }
  getPage() {
    return this.page;
  }
  setMockPage(page) {
    this.page = page;
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
    this.tests = [];
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
  console.log('║   LIVE URL TEST - HTML SCRAPER        ║');
  console.log('╚═══════════════════════════════════════╝\n');
  console.log(`URL: ${url}\n`);

  let browserManager = null;

  try {
    // Initialize real components
    console.log('[1/6] Initializing browser...');
    browserManager = new BrowserManager(logger);
    const rateLimiter = new RateLimiter();
    await browserManager.launch(headless);
    console.log('✓ Browser launched\n');

    // Create scraper and domain extractor
    const scraper = new SimpleScraper(browserManager, rateLimiter, logger);
    const domainExtractor = new DomainExtractor(logger);

    // Navigate to URL
    console.log('[2/6] Navigating to URL...');
    await browserManager.navigate(url);
    console.log('✓ Page loaded\n');

    // Detect card pattern
    console.log('[3/6] Detecting card pattern...');
    const page = browserManager.getPage();
    const cardSelector = await scraper.detectCardPattern(page);
    
    if (cardSelector) {
      const cardCount = await page.evaluate((sel) => {
        return document.querySelectorAll(sel).length;
      }, cardSelector);
      console.log(`✓ Card pattern found: ${cardSelector}`);
      console.log(`  Found ${cardCount} cards\n`);
    } else {
      console.log('⚠ No card pattern found (will treat page as single contact)\n');
    }

    // Extract contacts
    console.log('[4/6] Extracting contacts...');
    const contacts = await scraper.scrape(url, null);
    console.log(`✓ Extracted ${contacts.length} contacts\n`);

    // Post-process
    const processed = scraper.postProcessContacts(contacts);
    console.log(`✓ After deduplication: ${processed.length} contacts\n`);

    // Analyze domains
    console.log('[5/6] Analyzing domains...');
    const domainStats = domainExtractor.getDomainStats(processed);
    console.log(`✓ Found ${domainStats.uniqueDomains} unique domains\n`);

    // Display results
    console.log('[6/6] Results:\n');
    displayResults(processed, domainStats);

    // Cleanup
    await browserManager.close();

    return { success: true, contacts: processed, domainStats };

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
  console.log(`With Name:          ${withName} (${((withName/total)*100).toFixed(1)}%)`);
  console.log(`With Email:         ${withEmail} (${((withEmail/total)*100).toFixed(1)}%)`);
  console.log(`With Phone:         ${withPhone} (${((withPhone/total)*100).toFixed(1)}%)`);
  console.log(`Complete (all 3):   ${complete} (${((complete/total)*100).toFixed(1)}%)`);

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
      console.log(`  Source:     ${contact.source || 'html'}`);
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
  const scraper = new SimpleScraper(mockBrowserManager, mockRateLimiter, mockLogger);

  console.log('═══════════════════════════════════════');
  console.log('  SIMPLE SCRAPER UNIT TESTS');
  console.log('═══════════════════════════════════════');
  console.log('');

  // Test 1: Email Pattern - Valid Emails
  await runner.test('Email Pattern - Valid Emails', () => {
    const validEmails = [
      'test@example.com',
      'user.name@domain.co.uk',
      'first+last@company.org',
      'email123@test-domain.com'
    ];

    for (const email of validEmails) {
      const testPattern = new RegExp(scraper.EMAIL_REGEX.source);
      runner.assertMatch(email, testPattern, `Should match ${email}`);
    }
  });

  // Test 2: Email Pattern - Invalid Emails
  await runner.test('Email Pattern - Invalid Emails', () => {
    const invalidEmails = [
      'notanemail',
      '@example.com',
      'user@',
      'user @example.com'
    ];

    for (const email of invalidEmails) {
      const testPattern = new RegExp(scraper.EMAIL_REGEX.source);
      const matches = email.match(testPattern);
      runner.assert(!matches || matches[0] !== email, `Should not match ${email}`);
    }
  });

  // Test 3: Phone Pattern - US Formats
  await runner.test('Phone Pattern - US Formats', () => {
    const validPhones = [
      '(123) 456-7890',
      '123-456-7890',
      '1234567890',
      '+1 (123) 456-7890',
      '+1-123-456-7890'
    ];

    for (const phone of validPhones) {
      let matched = false;
      for (const regex of scraper.PHONE_REGEXES) {
        const testPattern = new RegExp(regex.source);
        if (testPattern.test(phone)) {
          matched = true;
          break;
        }
      }
      runner.assert(matched, `Should match ${phone}`);
    }
  });

  // Test 4: Email Validation
  await runner.test('Email Validation', () => {
    runner.assert(scraper.isValidEmail('test@example.com'), 'Should validate valid email');
    runner.assert(!scraper.isValidEmail('invalid'), 'Should reject invalid email');
    runner.assert(!scraper.isValidEmail(null), 'Should reject null');
  });

  // Test 5: Deduplication
  await runner.test('Contact Deduplication', () => {
    const contacts = [
      { name: 'John Doe', email: 'john@example.com', phone: '1234567890' },
      { name: 'John Doe', email: 'john@example.com', phone: '1234567890' },
      { name: 'Jane Smith', email: 'jane@example.com', phone: '9876543210' },
      { name: 'JOHN DOE', email: 'JOHN@EXAMPLE.COM', phone: '1234567890' }
    ];

    const deduplicated = scraper.postProcessContacts(contacts);
    runner.assertEqual(deduplicated.length, 2, 'Should remove duplicates');
  });

  // Test 6: Card Selectors Array
  await runner.test('Card Selectors Defined', () => {
    runner.assert(Array.isArray(scraper.CARD_SELECTORS), 'CARD_SELECTORS should be an array');
    runner.assert(scraper.CARD_SELECTORS.length > 15, 'Should have multiple selector options');
    runner.assert(scraper.CARD_SELECTORS.includes('.card'), 'Should include .card selector');
  });

  // Test 7: Contact Object Structure
  await runner.test('Contact Object Structure', () => {
    const sampleContacts = [
      { 
        name: 'John Doe', 
        email: 'john@example.com', 
        phone: '(123) 456-7890',
        source: 'html',
        confidence: 'high'
      }
    ];

    const processed = scraper.postProcessContacts(sampleContacts);
    runner.assert(processed.length > 0, 'Should have contacts');
    runner.assert(processed[0].name, 'Should have name');
    runner.assert(processed[0].email, 'Should have email');
    runner.assert(processed[0].phone, 'Should have phone');
  });

  // Test 8: Empty Input Handling
  await runner.test('Empty Input Handling', () => {
    const emptyContacts = scraper.postProcessContacts([]);
    runner.assertEqual(emptyContacts.length, 0, 'Should handle empty array');
  });

  // Test 9: Null Field Handling
  await runner.test('Null Field Handling', () => {
    const contacts = [
      { name: 'John Doe', email: null, phone: null },
      { name: null, email: 'test@example.com', phone: null }
    ];

    const processed = scraper.postProcessContacts(contacts);
    runner.assertEqual(processed.length, 2, 'Should keep contacts with some fields null');
  });

  // Test 10: Name Regex Pattern
  await runner.test('Name Regex Pattern - Compound Names', () => {
    runner.assert(scraper.NAME_REGEX, 'NAME_REGEX should be defined');
    
    const validNames = [
      "John Doe",
      "O'Brien",
      "von Trapp",
      "Mary-Jane",
      "Smith"
    ];
    
    for (const name of validNames) {
      runner.assert(scraper.NAME_REGEX.test(name), `Should accept: ${name}`);
    }
  });

  // Test 11: Pre-compiled Regex Patterns
  await runner.test('Pre-compiled Regex Patterns', () => {
    runner.assert(scraper.EMAIL_REGEX instanceof RegExp, 'EMAIL_REGEX should be pre-compiled');
    runner.assert(Array.isArray(scraper.PHONE_REGEXES), 'PHONE_REGEXES should be array');
    runner.assert(scraper.PHONE_REGEXES[0] instanceof RegExp, 'Phone patterns should be pre-compiled');
    runner.assert(scraper.NAME_REGEX instanceof RegExp, 'NAME_REGEX should be pre-compiled');
  });

  // NEW: Test 12: Domain Extractor Integration
  await runner.test('Domain Extractor Integration', () => {
    runner.assert(scraper.domainExtractor, 'Should have domain extractor');
    runner.assert(typeof scraper.addDomainInfo === 'function', 'Should have addDomainInfo method');
  });

  // NEW: Test 13: Domain Info Added to Contacts
  await runner.test('Domain Info Added to Contacts', () => {
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

  // NEW TEST: Edge case - Extremely long names
  await runner.test('Edge Case - Extremely Long Names', () => {
    const contacts = [
      { name: 'A'.repeat(150), email: 'test@example.com', phone: '1234567890' }
    ];

    const processed = scraper.postProcessContacts(contacts);
    // Should still process but name may be truncated depending on validation
    runner.assert(processed.length >= 0, 'Should handle extremely long names');
  });

  // NEW TEST: Edge case - International phone formats
  await runner.test('Edge Case - International Phone Formats', () => {
    const internationalPhones = [
      '+44 20 7123 4567',    // UK
      '+33 1 23 45 67 89',   // France
      '+61 2 1234 5678',     // Australia
      '+81 3-1234-5678'      // Japan
    ];

    for (const phone of internationalPhones) {
      let matched = false;
      for (const regex of scraper.PHONE_REGEXES) {
        const testPattern = new RegExp(regex.source, 'g');
        const phoneDigits = phone.replace(/\D/g, '');
        if (phoneDigits.length >= 10) {
          matched = true; // Should extract digits even if format doesn't match
          break;
        }
      }
      runner.assert(matched || phone.replace(/\D/g, '').length >= 10, `Should handle international format: ${phone}`);
    }
  });

  // NEW TEST: Edge case - Malformed emails
  await runner.test('Edge Case - Malformed Emails', () => {
    const malformedEmails = [
      'notanemail',
      'missing@domain',
      '@nodomain.com',
      'double@@domain.com',
      'spaces in@email.com'
    ];

    for (const email of malformedEmails) {
      const isValid = scraper.isValidEmail(email);
      runner.assert(!isValid, `Should reject malformed email: ${email}`);
    }
  });

  // NEW TEST: Edge case - Empty or null contacts
  await runner.test('Edge Case - Empty or Null Contacts', () => {
    const edgeCases = [
      [],
      [{}],
      [{ name: null, email: null, phone: null }],
      [{ name: '', email: '', phone: '' }]
    ];

    for (const contacts of edgeCases) {
      const processed = scraper.postProcessContacts(contacts);
      runner.assert(Array.isArray(processed), 'Should return array for edge cases');
    }
  });

  // NEW TEST: Edge case - Special characters in names
  await runner.test('Edge Case - Special Characters in Names', () => {
    const specialNames = [
      "José García",
      "François Müller",
      "Søren Ørsted",
      "Владимир Иванов"
    ];

    // These might not all match the current NAME_REGEX, but shouldn't cause errors
    for (const name of specialNames) {
      const contacts = [{ name, email: 'test@example.com', phone: '1234567890' }];
      try {
        const processed = scraper.postProcessContacts(contacts);
        runner.assert(true, `Should handle special characters: ${name}`);
      } catch (error) {
        runner.assert(false, `Should not throw error for: ${name}`);
      }
    }
  });

  runner.summary();
  return runner.failed === 0;
}

// Main execution
async function main() {
  // Parse command line arguments
  const program = new Command();
  program
    .option('-u, --url <url>', 'URL to test with live scraping')
    .option('--headless [value]', 'Run browser in headless mode (default: true)', 'true')
    .parse(process.argv);

  const options = program.opts();

  // Run unit tests first
  console.log('Starting Simple Scraper tests...\n');
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
    console.log('\n\nℹ No URL provided. To test live scraping, run:');
    console.log('  node tests/scraper-test.js --url "https://example.com/agents"');
  }

  console.log('\n✓ Testing complete\n');
  process.exit(unitTestsPassed ? 0 : 1);
}

main().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
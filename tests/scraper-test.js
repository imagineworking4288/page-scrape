const SimpleScraper = require('../scrapers/simple-scraper');
const Logger = require('../utils/logger');

// Mock browser manager and rate limiter for testing
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
  async delay() {
    // No delay in tests
  }
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
    console.log('  TEST SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`Total Tests: ${this.passed + this.failed}`);
    console.log(`Passed: ${this.passed}`);
    console.log(`Failed: ${this.failed}`);
    console.log('');
    
    if (this.failed === 0) {
      console.log('✓ All tests passed!');
    } else {
      console.log(`✗ ${this.failed} test(s) failed`);
      process.exit(1);
    }
  }
}

// Run tests
async function runTests() {
  const runner = new TestRunner();
  const logger = new Logger();
  const browserManager = new MockBrowserManager();
  const rateLimiter = new MockRateLimiter();
  const scraper = new SimpleScraper(browserManager, rateLimiter, logger);

  console.log('═══════════════════════════════════════');
  console.log('  SIMPLE SCRAPER TESTS');
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
      runner.assertMatch(email, scraper.EMAIL_PATTERN, `Should match ${email}`);
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
      const matches = email.match(scraper.EMAIL_PATTERN);
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
      for (const pattern of scraper.PHONE_PATTERNS) {
        if (pattern.test(phone)) {
          matched = true;
          break;
        }
      }
      runner.assert(matched, `Should match ${phone}`);
    }
  });

  // Test 4: Phone Normalization
  await runner.test('Phone Normalization', () => {
    const tests = [
      { input: '1234567890', expected: '(123) 456-7890' },
      { input: '(123) 456-7890', expected: '(123) 456-7890' },
      { input: '123-456-7890', expected: '(123) 456-7890' },
      { input: '+1 (123) 456-7890', expected: '(123) 456-7890' }
    ];

    for (const test of tests) {
      const normalized = scraper.normalizePhone(test.input);
      runner.assertEqual(normalized, test.expected, 
        `Failed to normalize ${test.input}, got ${normalized}`);
    }
  });

  // Test 5: Email Validation
  await runner.test('Email Validation', () => {
    runner.assert(scraper.isValidEmail('test@example.com'), 'Should validate valid email');
    runner.assert(!scraper.isValidEmail('invalid'), 'Should reject invalid email');
    runner.assert(!scraper.isValidEmail(null), 'Should reject null');
  });

  // Test 6: Deduplication
  await runner.test('Contact Deduplication', () => {
    const contacts = [
      { name: 'John Doe', email: 'john@example.com', phone: '1234567890' },
      { name: 'John Doe', email: 'john@example.com', phone: '1234567890' }, // Duplicate
      { name: 'Jane Smith', email: 'jane@example.com', phone: '9876543210' },
      { name: 'JOHN DOE', email: 'JOHN@EXAMPLE.COM', phone: '1234567890' } // Case variation
    ];

    const deduplicated = scraper.postProcessContacts(contacts);
    runner.assertEqual(deduplicated.length, 2, 'Should remove duplicates');
  });

  // Test 7: Card Selectors Array
  await runner.test('Card Selectors Defined', () => {
    runner.assert(Array.isArray(scraper.CARD_SELECTORS), 'CARD_SELECTORS should be an array');
    runner.assert(scraper.CARD_SELECTORS.length > 15, 'Should have multiple selector options');
    runner.assert(scraper.CARD_SELECTORS.includes('.card'), 'Should include .card selector');
  });

  // Test 8: Contact Object Structure
  await runner.test('Contact Object Structure', () => {
    const sampleContacts = [
      { 
        name: 'John Doe', 
        email: 'john@example.com', 
        phone: '(123) 456-7890',
        source: 'visible_text',
        confidence: 'high'
      }
    ];

    const processed = scraper.postProcessContacts(sampleContacts);
    runner.assert(processed.length > 0, 'Should have contacts');
    runner.assert(processed[0].name, 'Should have name');
    runner.assert(processed[0].email, 'Should have email');
    runner.assert(processed[0].phone, 'Should have phone');
  });

  // Test 9: Empty Input Handling
  await runner.test('Empty Input Handling', () => {
    const emptyContacts = scraper.postProcessContacts([]);
    runner.assertEqual(emptyContacts.length, 0, 'Should handle empty array');
  });

  // Test 10: Null Field Handling
  await runner.test('Null Field Handling', () => {
    const contacts = [
      { name: 'John Doe', email: null, phone: null },
      { name: null, email: 'test@example.com', phone: null }
    ];

    const processed = scraper.postProcessContacts(contacts);
    runner.assertEqual(processed.length, 2, 'Should keep contacts with some fields null');
  });

  // Display summary
  runner.summary();
}

// Run all tests
console.log('Starting test suite...\n');
runTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});

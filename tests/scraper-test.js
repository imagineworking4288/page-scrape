const SimpleScraper = require('../scrapers/simple-scraper');

// Mock logger for testing (silent logger to avoid console clutter during tests)
class MockLogger {
  info() {}
  warn() {}
  error() {}
  debug() {}
}

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
  const logger = new MockLogger();
  const browserManager = new MockBrowserManager();
  const rateLimiter = new MockRateLimiter();
  const scraper = new SimpleScraper(browserManager, rateLimiter, logger);

  console.log('═══════════════════════════════════════');
  console.log('  SIMPLE SCRAPER TESTS');
  console.log('═══════════════════════════════════════');
  console.log('');

  // Test 1: Email Pattern - Valid Emails (FIXED)
  await runner.test('Email Pattern - Valid Emails', () => {
    const validEmails = [
      'test@example.com',
      'user.name@domain.co.uk',
      'first+last@company.org',
      'email123@test-domain.com'
    ];

    for (const email of validEmails) {
      // Use EMAIL_REGEX (not EMAIL_PATTERN)
      const testPattern = new RegExp(scraper.EMAIL_REGEX.source);
      runner.assertMatch(email, testPattern, `Should match ${email}`);
    }
  });

  // Test 2: Email Pattern - Invalid Emails (FIXED)
  await runner.test('Email Pattern - Invalid Emails', () => {
    const invalidEmails = [
      'notanemail',
      '@example.com',
      'user@',
      'user @example.com'
    ];

    for (const email of invalidEmails) {
      // Use EMAIL_REGEX (not EMAIL_PATTERN)
      const testPattern = new RegExp(scraper.EMAIL_REGEX.source);
      const matches = email.match(testPattern);
      runner.assert(!matches || matches[0] !== email, `Should not match ${email}`);
    }
  });

  // Test 3: Phone Pattern - US Formats (FIXED)
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
      // Use PHONE_REGEXES (not PHONE_PATTERNS)
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

  // Test 4: Phone Normalization - REMOVED (moved to data-merger)
  // This test is no longer applicable to simple-scraper

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

  // NEW Test 11: Name Regex Pattern
  await runner.test('Name Regex Pattern - Compound Names', () => {
    // Test that NAME_REGEX exists and accepts compound names
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

  // NEW Test 12: Pre-compiled Regex Performance
  await runner.test('Pre-compiled Regex Patterns', () => {
    runner.assert(scraper.EMAIL_REGEX instanceof RegExp, 'EMAIL_REGEX should be pre-compiled');
    runner.assert(Array.isArray(scraper.PHONE_REGEXES), 'PHONE_REGEXES should be array');
    runner.assert(scraper.PHONE_REGEXES[0] instanceof RegExp, 'Phone patterns should be pre-compiled');
    runner.assert(scraper.NAME_REGEX instanceof RegExp, 'NAME_REGEX should be pre-compiled');
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
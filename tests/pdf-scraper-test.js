const PdfScraper = require('../scrapers/pdf-scraper');
const DataMerger = require('../scrapers/data-merger');

// Mock classes
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

async function runTests() {
  const runner = new TestRunner();
  const logger = new MockLogger();
  const browserManager = new MockBrowserManager();
  const rateLimiter = new MockRateLimiter();

  console.log('═══════════════════════════════════════');
  console.log('  PDF SCRAPER & DATA MERGER TESTS');
  console.log('═══════════════════════════════════════');
  console.log('');

  // PDF Scraper Tests
  console.log('--- PDF Scraper Tests ---\n');

  await runner.test('Phone Pattern Extraction', () => {
    const scraper = new PdfScraper(browserManager, rateLimiter, logger);
    
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
    const scraper = new PdfScraper(browserManager, rateLimiter, logger);
    
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
    const scraper = new PdfScraper(browserManager, rateLimiter, logger);
    
    const validNames = [
      { text: 'John Doe', height: 20 },
      { text: 'Mary Jane Smith', height: 20 },
      { text: "O'Brien", height: 18 }
    ];
    
    for (const nameObj of validNames) {
      const name = scraper.extractName([nameObj]);
      runner.assert(name !== null, `Should recognize "${nameObj.text}" as a name`);
    }
  });

  await runner.test('Phone Normalization', () => {
    const scraper = new PdfScraper(browserManager, rateLimiter, logger);
    
    const tests = [
      { input: '(123) 456-7890', expected: '1234567890' },
      { input: '123-456-7890', expected: '1234567890' },
      { input: '+1 (123) 456-7890', expected: '1234567890' }
    ];
    
    for (const test of tests) {
      const result = scraper.normalizePhone(test.input);
      runner.assertEqual(result, test.expected, `Failed to normalize ${test.input}`);
    }
  });

  await runner.test('Email Normalization', () => {
    const scraper = new PdfScraper(browserManager, rateLimiter, logger);
    
    const tests = [
      { input: 'TEST@EXAMPLE.COM', expected: 'test@example.com' },
      { input: 'User@Domain.Com', expected: 'user@domain.com' },
      { input: '  email@test.com  ', expected: 'email@test.com' }
    ];
    
    for (const test of tests) {
      const result = scraper.normalizeEmail(test.input);
      runner.assertEqual(result, test.expected, `Failed to normalize ${test.input}`);
    }
  });

  await runner.test('Contact Object Structure', () => {
    const scraper = new PdfScraper(browserManager, rateLimiter, logger);
    
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
    const scraper = new PdfScraper(browserManager, rateLimiter, logger);
    
    runner.assertEqual(scraper.calculateConfidence(true, true, true), 'high');
    runner.assertEqual(scraper.calculateConfidence(true, true, false), 'medium');
    runner.assertEqual(scraper.calculateConfidence(false, true, true), 'medium');
    runner.assertEqual(scraper.calculateConfidence(true, false, false), 'low');
    runner.assertEqual(scraper.calculateConfidence(false, true, false), 'low');
  });

  // Data Merger Tests
  console.log('\n--- Data Merger Tests ---\n');

  await runner.test('Contact Key Creation', () => {
    const merger = new DataMerger(logger);
    
    const tests = [
      { contact: { email: 'john@x.com', phone: '(555) 123-4567' }, expected: 'john@x.com||5551234567' },
      { contact: { email: 'test@example.com', phone: null }, expected: 'test@example.com||' },
      { contact: { email: null, phone: '1234567890' }, expected: '||1234567890' },
      { contact: { email: null, phone: null, name: 'John Doe' }, expected: '||john doe' }
    ];
    
    for (const test of tests) {
      const key = merger.createContactKey(test.contact);
      runner.assertEqual(key, test.expected, `Key creation failed for ${JSON.stringify(test.contact)}`);
    }
  });

  await runner.test('Simple Merge (No Overlap)', () => {
    const merger = new DataMerger(logger);
    
    const htmlContacts = [
      { name: 'John Doe', email: 'john@x.com', phone: '5551234567' }
    ];
    
    const pdfContacts = [
      { name: 'Jane Smith', email: 'jane@x.com', phone: '5559876543' }
    ];
    
    const merged = merger.mergeContacts(htmlContacts, pdfContacts);
    
    runner.assertEqual(merged.length, 2, 'Should have 2 contacts (no overlap)');
    runner.assert(merged.some(c => c.name === 'John Doe'), 'Should have John Doe');
    runner.assert(merged.some(c => c.name === 'Jane Smith'), 'Should have Jane Smith');
  });

  await runner.test('Merge with Overlap (Fill Missing Fields)', () => {
    const merger = new DataMerger(logger);
    
    const htmlContacts = [
      { name: 'John Doe', email: 'john@x.com', phone: null }
    ];
    
    const pdfContacts = [
      { name: null, email: 'john@x.com', phone: '5551234567' }
    ];
    
    const merged = merger.mergeContacts(htmlContacts, pdfContacts);
    
    runner.assertEqual(merged.length, 1, 'Should merge into 1 contact');
    runner.assertEqual(merged[0].name, 'John Doe', 'Should keep HTML name');
    runner.assertEqual(merged[0].phone, '5551234567', 'Should add PDF phone');
    runner.assertEqual(merged[0].source, 'merged', 'Source should be merged');
  });

  await runner.test('Merge Priority (HTML > PDF)', () => {
    const merger = new DataMerger(logger);
    
    const htmlContacts = [
      { name: 'John Smith', email: 'john@x.com', phone: '5551234567' }
    ];
    
    const pdfContacts = [
      { name: 'JOHN SMITH', email: 'john@x.com', phone: '5551234567' }
    ];
    
    const merged = merger.mergeContacts(htmlContacts, pdfContacts);
    
    runner.assertEqual(merged.length, 1, 'Should merge into 1 contact');
    runner.assertEqual(merged[0].name, 'John Smith', 'Should keep HTML name (better formatting)');
    runner.assertEqual(merged[0].source, 'html', 'Source should remain html (no new data)');
  });

  await runner.test('Deduplication', () => {
    const merger = new DataMerger(logger);
    
    const htmlContacts = [
      { name: 'John Doe', email: 'john@example.com', phone: '5551234567' },
      { name: 'Jane Smith', email: 'jane@example.com', phone: '5559876543' }
    ];
    
    const pdfContacts = [
      { name: 'John Doe', email: 'john@example.com', phone: '5551234567' }, // Duplicate
      { name: 'Bob Johnson', email: 'bob@example.com', phone: '5551111111' }
    ];
    
    const merged = merger.mergeContacts(htmlContacts, pdfContacts);
    
    runner.assertEqual(merged.length, 3, 'Should have 3 unique contacts');
  });

  await runner.test('Confidence Recalculation After Merge', () => {
    const merger = new DataMerger(logger);
    
    const htmlContacts = [
      { name: 'John Doe', email: 'john@x.com', phone: null, confidence: 'medium' }
    ];
    
    const pdfContacts = [
      { name: null, email: 'john@x.com', phone: '5551234567', confidence: 'medium' }
    ];
    
    const merged = merger.mergeContacts(htmlContacts, pdfContacts);
    
    runner.assertEqual(merged[0].confidence, 'high', 'Confidence should be high after merge (all 3 fields)');
  });

  // Display summary
  runner.summary();
}

// Run tests
console.log('Starting PDF scraper and data merger test suite...\n');
runTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});

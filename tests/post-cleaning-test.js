#!/usr/bin/env node

/**
 * Post-Cleaning Module Tests
 *
 * Tests for the post-enrichment field cleaning system:
 * - LocationNormalizer
 * - MultiLocationHandler
 * - PhoneLocationCorrelator
 * - DomainClassifier
 * - ConfidenceScorer
 * - FieldCleaner (orchestrator)
 */

const {
  FieldCleaner,
  MultiLocationHandler,
  PhoneLocationCorrelator,
  LocationNormalizer,
  DomainClassifier,
  ConfidenceScorer
} = require('../src/features/enrichment/post-cleaners');

// Simple test logger
const testLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
};

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

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message} Expected: ${expected}, Got: ${actual}`);
  }
}

function assertTrue(value, message = '') {
  if (!value) {
    throw new Error(`${message} Expected truthy value, got: ${value}`);
  }
}

function assertFalse(value, message = '') {
  if (value) {
    throw new Error(`${message} Expected falsy value, got: ${value}`);
  }
}

// ============================================================================
// LocationNormalizer Tests
// ============================================================================
console.log('\nLocationNormalizer Tests');
console.log('─'.repeat(50));

test('normalizes basic location', () => {
  const normalizer = new LocationNormalizer(testLogger);
  const result = normalizer.normalize('  New York  ');
  assertEqual(result.normalized, 'New York');
});

test('preserves Washington, D.C. pattern', () => {
  const normalizer = new LocationNormalizer(testLogger);
  const result = normalizer.normalize('Washington, D.C.');
  assertEqual(result.normalized, 'Washington, D.C.');
  assertFalse(result.wasChanged);
});

test('preserves St. prefix cities', () => {
  const normalizer = new LocationNormalizer(testLogger);
  const result = normalizer.normalize('St. Louis');
  assertEqual(result.normalized, 'St. Louis');
});

test('preserves City, STATE format', () => {
  const normalizer = new LocationNormalizer(testLogger);
  const result = normalizer.normalize('Austin, TX');
  assertEqual(result.normalized, 'Austin, TX');
});

test('handles null/empty location', () => {
  const normalizer = new LocationNormalizer(testLogger);
  const result = normalizer.normalize(null);
  assertEqual(result.normalized, null);
  assertFalse(result.wasChanged);
});

test('removes embedded phone number from location', () => {
  const normalizer = new LocationNormalizer(testLogger);
  const result = normalizer.normalize('New York +1-212-558-1623');
  assertEqual(result.normalized, 'New York');
  assertTrue(result.wasChanged);
  assertTrue(result.phonesRemoved.length > 0);
});

test('removes phone with newline separator', () => {
  const normalizer = new LocationNormalizer(testLogger);
  const result = normalizer.normalize('New York\n            +1-212-558-3960');
  assertEqual(result.normalized, 'New York');
  assertTrue(result.wasChanged);
  assertTrue(result.phonesRemoved.length > 0);
});

test('removes multiple phone numbers', () => {
  const normalizer = new LocationNormalizer(testLogger);
  const result = normalizer.normalize('Frankfurt +49-69-4272-5200\nNew York +1-212-558-4000');
  assertFalse(result.normalized.includes('+'));
  assertEqual(result.phonesRemoved.length, 2);
});

test('returns empty phonesRemoved for clean location', () => {
  const normalizer = new LocationNormalizer(testLogger);
  const result = normalizer.normalize('New York');
  assertEqual(result.normalized, 'New York');
  assertFalse(result.wasChanged);
  assertEqual(result.phonesRemoved.length, 0);
});

// ============================================================================
// MultiLocationHandler Tests
// ============================================================================
console.log('\nMultiLocationHandler Tests');
console.log('─'.repeat(50));

test('detects single location', () => {
  const handler = new MultiLocationHandler(testLogger);
  const result = handler.parse('New York, NY', '+1 212 555 1234');
  assertFalse(result.isMultiLocation);
  assertEqual(result.primaryLocation, 'New York, NY');
});

test('detects multi-location with newlines', () => {
  const handler = new MultiLocationHandler(testLogger);
  const result = handler.parse('New York, NY\nFrankfurt', '+1 212 555 1234');
  assertTrue(result.isMultiLocation);
  assertEqual(result.allLocations.length, 2);
});

test('prioritizes US locations when enabled', () => {
  const handler = new MultiLocationHandler(testLogger);
  const result = handler.parse('Frankfurt\nNew York, NY', null, true);
  assertTrue(result.isMultiLocation);
  assertEqual(result.primaryLocation, 'New York, NY');
});

test('does not prioritize US when disabled', () => {
  const handler = new MultiLocationHandler(testLogger);
  const result = handler.parse('Frankfurt\nNew York, NY', null, false);
  assertTrue(result.isMultiLocation);
  assertEqual(result.primaryLocation, 'Frankfurt');
});

test('identifies US location by state abbreviation', () => {
  const handler = new MultiLocationHandler(testLogger);
  assertTrue(handler.isUSLocation('Austin, TX', null));
});

test('identifies US location by phone country code', () => {
  const handler = new MultiLocationHandler(testLogger);
  assertTrue(handler.isUSLocation('Unknown City', '+1 555 123 4567'));
});

test('identifies Washington, D.C. as US', () => {
  const handler = new MultiLocationHandler(testLogger);
  assertTrue(handler.isUSLocation('Washington, D.C.', null));
});

// ============================================================================
// PhoneLocationCorrelator Tests
// ============================================================================
console.log('\nPhoneLocationCorrelator Tests');
console.log('─'.repeat(50));

test('validates matching US phone and location', () => {
  const correlator = new PhoneLocationCorrelator(testLogger);
  const result = correlator.validate('+1 212 555 1234', 'New York, NY');
  assertTrue(result.valid);
  assertFalse(result.hasMismatch);
});

test('detects country mismatch', () => {
  const correlator = new PhoneLocationCorrelator(testLogger);
  const result = correlator.validate('+44 20 7946 0958', 'New York, NY');
  assertFalse(result.valid);
  assertTrue(result.hasMismatch);
  assertEqual(result.reason, 'country-mismatch');
});

test('detects US city mismatch', () => {
  const correlator = new PhoneLocationCorrelator(testLogger);
  const result = correlator.validate('+1 212 555 1234', 'Los Angeles, CA');
  // Note: city mismatch is valid but flagged
  assertTrue(result.valid);
  assertTrue(result.hasMismatch);
  assertEqual(result.reason, 'city-mismatch');
});

test('handles missing phone', () => {
  const correlator = new PhoneLocationCorrelator(testLogger);
  const result = correlator.validate(null, 'New York, NY');
  assertFalse(result.valid);
  assertEqual(result.reason, 'missing-data');
});

test('extracts US area code correctly', () => {
  const correlator = new PhoneLocationCorrelator(testLogger);
  assertEqual(correlator.extractUSAreaCode('+1 (212) 555-1234'), '212');
  assertEqual(correlator.extractUSAreaCode('+1-415-555-1234'), '415');
});

// ============================================================================
// DomainClassifier Tests
// ============================================================================
console.log('\nDomainClassifier Tests');
console.log('─'.repeat(50));

test('classifies business email domain', () => {
  const classifier = new DomainClassifier(testLogger);
  const result = classifier.classify('john@company.com');
  assertEqual(result.domain, 'company.com');
  assertEqual(result.domainType, 'business');
});

test('classifies personal email domain (gmail)', () => {
  const classifier = new DomainClassifier(testLogger);
  const result = classifier.classify('john@gmail.com');
  assertEqual(result.domain, 'gmail.com');
  assertEqual(result.domainType, 'personal');
});

test('classifies personal email domain (yahoo)', () => {
  const classifier = new DomainClassifier(testLogger);
  const result = classifier.classify('john@yahoo.com');
  assertEqual(result.domainType, 'personal');
});

test('handles invalid email', () => {
  const classifier = new DomainClassifier(testLogger);
  const result = classifier.classify('not-an-email');
  assertEqual(result.domain, null);
  assertEqual(result.domainType, 'unknown');
});

test('handles null email', () => {
  const classifier = new DomainClassifier(testLogger);
  const result = classifier.classify(null);
  assertEqual(result.domain, null);
});

// ============================================================================
// ConfidenceScorer Tests
// ============================================================================
console.log('\nConfidenceScorer Tests');
console.log('─'.repeat(50));

test('scores complete contact as high confidence', () => {
  const scorer = new ConfidenceScorer(testLogger);
  const contact = {
    name: 'John Smith',
    email: 'john@company.com',
    phone: '+1 212 555 1234',
    location: 'New York, NY'
  };
  const result = scorer.calculate(contact);
  assertEqual(result.overall, 'high');
  assertTrue(result.score >= 80);
});

test('scores incomplete contact as low confidence', () => {
  const scorer = new ConfidenceScorer(testLogger);
  const contact = {
    name: 'Unknown'
  };
  const result = scorer.calculate(contact);
  assertEqual(result.overall, 'low');
  assertTrue(result.score < 50);
});

test('includes breakdown in result', () => {
  const scorer = new ConfidenceScorer(testLogger);
  const contact = {
    name: 'John Smith',
    email: 'john@company.com'
  };
  const result = scorer.calculate(contact);
  assertTrue(result.breakdown !== undefined);
  // Breakdown uses keys like nameClean, emailPresent
  assertTrue(result.breakdown.nameClean !== undefined);
  assertTrue(result.breakdown.emailPresent !== undefined);
});

test('factors in validation data', () => {
  const scorer = new ConfidenceScorer(testLogger);
  const contact = {
    name: 'John Smith',
    email: 'john@company.com',
    phone: '+1 212 555 1234',
    location: 'New York, NY'
  };
  const validationData = {
    phoneLocationCorrelation: { valid: true, hasMismatch: false }
  };
  const result = scorer.calculate(contact, validationData);
  assertTrue(result.score > 0);
});

// ============================================================================
// FieldCleaner (Orchestrator) Tests
// ============================================================================
console.log('\nFieldCleaner (Orchestrator) Tests');
console.log('─'.repeat(50));

test('processes single contact', async () => {
  const cleaner = new FieldCleaner(testLogger);
  const contacts = [{
    name: 'John Smith',
    email: 'john@company.com',
    phone: '+1 212 555 1234',
    location: 'New York, NY'
  }];
  const result = await cleaner.cleanContacts(contacts);
  assertEqual(result.length, 1);
  assertTrue(result[0]._postCleaning !== undefined);
});

test('adds confidence scores', async () => {
  const cleaner = new FieldCleaner(testLogger);
  const contacts = [{
    name: 'John Smith',
    email: 'john@company.com'
  }];
  const result = await cleaner.cleanContacts(contacts);
  assertTrue(result[0]._postCleaning.confidence !== undefined);
  assertTrue(result[0]._postCleaning.confidence.overall !== undefined);
});

test('handles multi-location contacts', async () => {
  const cleaner = new FieldCleaner(testLogger);
  const contacts = [{
    name: 'John Smith',
    location: 'Frankfurt\nNew York, NY',
    phone: '+1 212 555 1234'
  }];
  const result = await cleaner.cleanContacts(contacts, { prioritizeUS: true });
  assertTrue(result[0]._postCleaning.locationData !== undefined);
  // With US prioritization, New York should be primary
  assertEqual(result[0].location, 'New York, NY');
});

test('respects prioritizeUS option', async () => {
  const cleaner = new FieldCleaner(testLogger);
  const contacts = [{
    name: 'John Smith',
    location: 'Frankfurt\nNew York, NY'
  }];
  const result = await cleaner.cleanContacts(contacts, { prioritizeUS: false });
  // Without US prioritization, Frankfurt should remain first
  assertEqual(result[0].location, 'Frankfurt');
});

test('classifies email domains', async () => {
  const cleaner = new FieldCleaner(testLogger);
  const contacts = [{
    name: 'John Smith',
    email: 'john@gmail.com'
  }];
  const result = await cleaner.cleanContacts(contacts);
  assertEqual(result[0]._postCleaning.domainType, 'personal');
});

test('generates statistics', async () => {
  const cleaner = new FieldCleaner(testLogger);
  const contacts = [
    { name: 'John', location: 'New York, NY\nFrankfurt' },
    { name: 'Jane', email: 'jane@company.com', phone: '+1 415 555 1234', location: 'San Francisco, CA' }
  ];
  const result = await cleaner.cleanContacts(contacts);
  const stats = cleaner.getStatistics(result);
  assertEqual(stats.totalProcessed, 2);
  assertTrue(stats.multiLocation >= 1);
});

test('handles empty contact array', async () => {
  const cleaner = new FieldCleaner(testLogger);
  const result = await cleaner.cleanContacts([]);
  assertEqual(result.length, 0);
});

test('handles null contacts', async () => {
  const cleaner = new FieldCleaner(testLogger);
  const result = await cleaner.cleanContacts(null);
  assertEqual(result.length, 0);
});

test('cleans contaminated location regardless of enrichment status', async () => {
  const cleaner = new FieldCleaner(testLogger);
  const contacts = [{
    name: 'John Smith',
    phone: '+1 212 555 1234',
    location: 'New York +1-212-558-1623',  // Contaminated
    email: 'john@example.com',
    enrichment: {
      actions: {
        location: 'UNCHANGED'  // This should NOT prevent cleaning
      }
    }
  }];
  const result = await cleaner.cleanContacts(contacts);
  assertEqual(result[0].location, 'New York');
  assertTrue(result[0]._postCleaning.operations.includes('location-normalized'));
  assertTrue(result[0]._postCleaning.operations.includes('location-phones-removed'));
});

test('tracks removed phones in post-cleaning metadata', async () => {
  const cleaner = new FieldCleaner(testLogger);
  const contacts = [{
    name: 'Jane Doe',
    location: 'Washington, D.C.\n+1-202-555-1234'
  }];
  const result = await cleaner.cleanContacts(contacts);
  assertTrue(result[0]._postCleaning.locationPhonesRemoved !== undefined);
  assertTrue(result[0]._postCleaning.locationPhonesRemoved.length > 0);
});

test('improves confidence score after phone removal', async () => {
  const cleaner = new FieldCleaner(testLogger);
  const contacts = [{
    name: 'Test Contact',
    email: 'test@company.com',
    phone: '+1-212-555-1234',
    location: 'New York +1-212-555-1234'  // Before: fails locationClean
  }];
  const result = await cleaner.cleanContacts(contacts);
  // After cleaning, location should be clean and score should include locationClean
  assertEqual(result[0].location, 'New York');
  assertTrue(result[0].confidenceBreakdown.locationClean === 20);
});

// ============================================================================
// Summary
// ============================================================================
console.log('\n' + '═'.repeat(50));
console.log(`Tests Complete: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(50));

process.exit(failed > 0 ? 1 : 0);

/**
 * v2.2 Manual Field Selection System - Integration Tests
 *
 * Tests the complete flow of the manual selection system:
 * - Field requirements constants
 * - Element capture
 * - Config building v2.2
 * - Multi-method extraction with userSelected/coordinates
 * - Profile enrichment
 */

const assert = require('assert');

// Module imports
const {
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS,
  FIELD_ORDER,
  FIELD_METADATA,
  VALIDATION_RULES,
  CONFIDENCE_SCORES,
  PROFILE_LINK_TYPES,
  NAME_MATCH_STRENGTH
} = require('../src/tools/lib/constants/field-requirements');

const ElementCapture = require('../src/tools/lib/element-capture');
const ConfigBuilder = require('../src/tools/lib/config-builder');
const MultiMethodExtractor = require('../src/tools/lib/multi-method-extractor');
const ProfileEnrichment = require('../src/tools/lib/profile-enrichment');

// Mock logger
const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
};

console.log('='.repeat(60));
console.log('v2.2 Manual Field Selection System - Integration Tests');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

// =========================
// Test: Field Requirements Constants
// =========================

console.log('\n--- Field Requirements Constants ---');

test('REQUIRED_FIELDS should include name, email, profileUrl', () => {
  assert(REQUIRED_FIELDS.includes('name'), 'Missing name');
  assert(REQUIRED_FIELDS.includes('email'), 'Missing email');
  assert(REQUIRED_FIELDS.includes('profileUrl'), 'Missing profileUrl');
});

test('OPTIONAL_FIELDS should include phone, title, location', () => {
  assert(OPTIONAL_FIELDS.includes('phone'), 'Missing phone');
  assert(OPTIONAL_FIELDS.includes('title'), 'Missing title');
  assert(OPTIONAL_FIELDS.includes('location'), 'Missing location');
});

test('FIELD_ORDER should have correct length', () => {
  assert.strictEqual(FIELD_ORDER.length, 6, 'Should have 6 fields');
});

test('FIELD_METADATA should have metadata for all fields', () => {
  FIELD_ORDER.forEach(field => {
    assert(FIELD_METADATA[field], `Missing metadata for ${field}`);
    assert(FIELD_METADATA[field].label, `Missing label for ${field}`);
    assert(FIELD_METADATA[field].prompt, `Missing prompt for ${field}`);
  });
});

test('VALIDATION_RULES should have patterns for key fields', () => {
  assert(VALIDATION_RULES.email.pattern, 'Missing email pattern');
  assert(VALIDATION_RULES.phone.pattern, 'Missing phone pattern');
});

test('CONFIDENCE_SCORES should have required scores', () => {
  assert.strictEqual(CONFIDENCE_SCORES.userSelected, 1.0, 'userSelected should be 1.0');
  assert.strictEqual(CONFIDENCE_SCORES.coordinateFallback, 0.85, 'coordinateFallback should be 0.85');
  assert(CONFIDENCE_SCORES.mailtoLink > 0.9, 'mailtoLink should be high');
});

test('PROFILE_LINK_TYPES should have required types', () => {
  assert(PROFILE_LINK_TYPES.PROFILE, 'Missing PROFILE type');
  assert(PROFILE_LINK_TYPES.LINKEDIN, 'Missing LINKEDIN type');
});

test('NAME_MATCH_STRENGTH should have required strengths', () => {
  assert(NAME_MATCH_STRENGTH.EXACT, 'Missing EXACT strength');
  assert(NAME_MATCH_STRENGTH.STRONG, 'Missing STRONG strength');
  assert(NAME_MATCH_STRENGTH.PARTIAL, 'Missing PARTIAL strength');
});

// =========================
// Test: ElementCapture Module
// =========================

console.log('\n--- ElementCapture Module ---');

test('ElementCapture should instantiate', () => {
  const ec = new ElementCapture(mockLogger);
  assert(ec, 'Should create instance');
});

test('ElementCapture.validateCapture should check required fields', () => {
  const ec = new ElementCapture(mockLogger);

  // Empty fields
  const emptyResult = ec.validateCapture({});
  assert(!emptyResult.valid, 'Should be invalid with empty fields');
  assert(emptyResult.missingRequired.length > 0, 'Should list missing fields');

  // With all required fields
  const validResult = ec.validateCapture({
    name: { value: 'John Smith' },
    email: { value: 'john@example.com' },
    profileUrl: { value: '/people/john-smith' }
  });
  assert(validResult.valid, 'Should be valid with all required fields');
});

test('ElementCapture.calculateRelationships should work', () => {
  const ec = new ElementCapture(mockLogger);

  const fields = {
    name: {
      element: { coordinates: { centerX: 100, centerY: 50 } }
    },
    email: {
      element: { coordinates: { centerX: 100, centerY: 100 } }
    }
  };

  const relationships = ec.calculateRelationships(fields);
  assert(relationships.nameAboveEmail === true, 'Name should be above email');
});

test('ElementCapture.extractUrlPattern should extract patterns', () => {
  const ec = new ElementCapture(mockLogger);

  const pattern1 = ec.extractUrlPattern('https://example.com/lawyers/john-smith');
  assert(pattern1 === '/lawyers/', 'Should extract /lawyers/ pattern');

  const pattern2 = ec.extractUrlPattern('https://example.com/people/jane-doe');
  assert(pattern2 === '/people/', 'Should extract /people/ pattern');
});

test('ElementCapture.buildExtractionRules should create v2.2 format', () => {
  const ec = new ElementCapture(mockLogger);

  const capturedData = {
    fields: {
      name: { value: 'John Smith', methods: [{ type: 'selector', priority: 1 }] },
      email: { value: 'john@example.com', methods: [{ type: 'mailto', priority: 1 }] }
    }
  };

  const rules = ec.buildExtractionRules(capturedData);
  assert.strictEqual(rules.version, '2.2', 'Should be v2.2');
  assert.strictEqual(rules.strategy, 'multi-method', 'Should use multi-method');
  assert(rules.fields.name.capturedValue === 'John Smith', 'Should have captured value');
});

// =========================
// Test: ConfigBuilder v2.2
// =========================

console.log('\n--- ConfigBuilder v2.2 ---');

test('ConfigBuilder should instantiate', () => {
  const cb = new ConfigBuilder(mockLogger);
  assert(cb, 'Should create instance');
});

test('ConfigBuilder.isV22Config should detect v2.2 configs', () => {
  const cb = new ConfigBuilder(mockLogger);

  assert(cb.isV22Config({ version: '2.2' }), 'Should detect by version');
  assert(cb.isV22Config({ selectionMethod: 'manual' }), 'Should detect by selectionMethod');
  assert(cb.isV22Config({ fieldExtraction: { version: '2.2' } }), 'Should detect by fieldExtraction version');
  assert(!cb.isV22Config({ version: '2.1' }), 'Should not match v2.1');
});

test('ConfigBuilder.buildConfigV22 should create valid config', () => {
  const cb = new ConfigBuilder(mockLogger);

  const capturedData = {
    fields: {
      name: { value: 'John', source: 'manual', selector: '.name' },
      email: { value: 'john@test.com', source: 'manual', selector: 'a.email' }
    },
    relationships: {},
    capturedElements: {}
  };

  const matchResult = {
    selector: '.card',
    totalFound: 10,
    matches: [{ confidence: 90 }]
  };

  const metadata = {
    url: 'https://example.com/people',
    domain: 'example.com',
    pagination: { type: 'none' }
  };

  const config = cb.buildConfigV22(capturedData, matchResult, metadata);

  assert.strictEqual(config.version, '2.2', 'Should be v2.2');
  assert.strictEqual(config.selectionMethod, 'manual', 'Should have manual selection');
  assert(config.fieldExtraction.fields.name, 'Should have name field');
  assert(config.fieldExtraction.fields.email, 'Should have email field');
});

test('ConfigBuilder.buildFieldMethodsV22 should prioritize userSelected', () => {
  const cb = new ConfigBuilder(mockLogger);

  const fieldData = {
    value: 'john@test.com',
    source: 'manual',
    selector: 'a.email',
    coordinates: { centerX: 100, centerY: 50 }
  };

  const result = cb.buildFieldMethodsV22(fieldData, 'email');

  assert(result.methods.length >= 2, 'Should have multiple methods');
  assert.strictEqual(result.methods[0].type, 'userSelected', 'First method should be userSelected');
  assert.strictEqual(result.methods[0].confidence, 1.0, 'userSelected should have 1.0 confidence');
  assert.strictEqual(result.methods[1].type, 'coordinates', 'Second method should be coordinates');
});

test('ConfigBuilder.getAttributeForField should return correct attributes', () => {
  const cb = new ConfigBuilder(mockLogger);

  assert.strictEqual(cb.getAttributeForField('email'), 'href', 'email should use href');
  assert.strictEqual(cb.getAttributeForField('phone'), 'href', 'phone should use href');
  assert.strictEqual(cb.getAttributeForField('profileUrl'), 'href', 'profileUrl should use href');
  assert.strictEqual(cb.getAttributeForField('name'), 'textContent', 'name should use textContent');
});

// =========================
// Test: MultiMethodExtractor v2.2
// =========================

console.log('\n--- MultiMethodExtractor v2.2 ---');

test('MultiMethodExtractor should instantiate', () => {
  const extractor = new MultiMethodExtractor(mockLogger);
  assert(extractor, 'Should create instance');
});

test('MultiMethodExtractor.getExtractorCode should include userSelected', () => {
  const extractor = new MultiMethodExtractor(mockLogger);
  const code = extractor.getExtractorCode();

  assert(code.includes('extractUserSelected'), 'Should have extractUserSelected function');
  assert(code.includes('extractCoordinates'), 'Should have extractCoordinates function');
  assert(code.includes("case 'userSelected':"), 'Should have userSelected case');
  assert(code.includes("case 'coordinates':"), 'Should have coordinates case');
});

test('MultiMethodExtractor.resetStats should work', () => {
  const extractor = new MultiMethodExtractor(mockLogger);
  extractor.extractionStats.fieldsExtracted = 100;
  extractor.resetStats();
  assert.strictEqual(extractor.extractionStats.fieldsExtracted, 0, 'Should reset stats');
});

// =========================
// Test: ProfileEnrichment Module
// =========================

console.log('\n--- ProfileEnrichment Module ---');

test('ProfileEnrichment should instantiate', () => {
  const pe = new ProfileEnrichment(mockLogger);
  assert(pe, 'Should create instance');
});

test('ProfileEnrichment.parseNameParts should parse names correctly', () => {
  const pe = new ProfileEnrichment(mockLogger);

  const simple = pe.parseNameParts('John Smith');
  assert.strictEqual(simple.firstName, 'john', 'Should get firstName');
  assert.strictEqual(simple.lastName, 'smith', 'Should get lastName');

  const complex = pe.parseNameParts('Dr. John A. Smith Jr.');
  assert.strictEqual(complex.firstName, 'dr', 'Should get first part');
  assert.strictEqual(complex.lastName, 'jr', 'Should get last part');
});

test('ProfileEnrichment.calculateNameMatchScore should score correctly', () => {
  const pe = new ProfileEnrichment(mockLogger);

  // Perfect match - name in URL
  const perfect = pe.calculateNameMatchScore(
    pe.parseNameParts('John Smith'),
    '/people/john-smith',
    'John Smith'
  );
  assert(perfect.total > 0.5, 'Perfect match should score high');

  // Partial match - last name only in URL
  const partial = pe.calculateNameMatchScore(
    pe.parseNameParts('John Smith'),
    '/people/smith-attorney',
    ''
  );
  assert(partial.urlScore > 0, 'Partial match should have some URL score');

  // No match
  const none = pe.calculateNameMatchScore(
    pe.parseNameParts('John Smith'),
    '/about',
    'Contact Us'
  );
  assert(none.urlScore === 0, 'No match should have zero URL score');
});

test('ProfileEnrichment.getProfilePatterns should return patterns', () => {
  const pe = new ProfileEnrichment(mockLogger);

  // Default patterns
  const defaultPatterns = pe.getProfilePatterns({});
  assert(defaultPatterns.length > 5, 'Should have default patterns');
  assert(defaultPatterns.includes('/people/'), 'Should include /people/');

  // From config
  const configPatterns = pe.getProfilePatterns({
    fieldExtraction: {
      fields: {
        profileUrl: {
          methods: [{ type: 'urlPattern', patterns: ['/custom/'] }]
        }
      }
    }
  });
  assert(configPatterns.includes('/custom/'), 'Should use config patterns');
});

test('ProfileEnrichment.classifyProfileLink should classify correctly', () => {
  const pe = new ProfileEnrichment(mockLogger);

  const profile = pe.classifyProfileLink('/people/john-smith', 'John Smith', 'John Smith');
  assert.strictEqual(profile.type, PROFILE_LINK_TYPES.PROFILE, 'Should classify as profile');
  assert(profile.isProfile, 'Should mark as profile');
  assert(profile.confidence > 0.5, 'Should have good confidence');

  const linkedin = pe.classifyProfileLink('https://linkedin.com/in/john', 'LinkedIn', 'John');
  assert.strictEqual(linkedin.type, PROFILE_LINK_TYPES.LINKEDIN, 'Should classify as LinkedIn');
});

// =========================
// Summary
// =========================

console.log('\n' + '='.repeat(60));
console.log(`Tests completed: ${passed + failed} total`);
console.log(`  ✓ Passed: ${passed}`);
console.log(`  ✗ Failed: ${failed}`);
console.log('='.repeat(60));

if (failed > 0) {
  process.exit(1);
}

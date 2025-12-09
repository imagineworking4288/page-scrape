#!/usr/bin/env node

/**
 * Enrichment System Test Suite
 *
 * Tests all components of the profile enrichment system:
 * - Name cleaner
 * - Location cleaner
 * - Title extractor
 * - Noise detector
 * - Field comparator
 * - Integration tests
 */

const {
  cleanName,
  cleanLocation,
  extractTitle,
  detectNoise,
  hasEmbeddedTitle,
  hasPhoneInLocation
} = require('../src/features/enrichment/cleaners');

const fieldComparator = require('../src/features/enrichment/field-comparator');

// Test results tracking
let passed = 0;
let failed = 0;

/**
 * Simple assertion helper
 */
function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
  }
}

/**
 * Deep equality check
 */
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

console.log('');
console.log('═══════════════════════════════════════');
console.log('  ENRICHMENT SYSTEM TEST SUITE');
console.log('═══════════════════════════════════════');
console.log('');

// ============================================================================
// NAME CLEANER TESTS
// ============================================================================
console.log('NAME CLEANER TESTS');
console.log('──────────────────────────────────────────');

// Test 1: Basic title removal
{
  const result = cleanName('Arthur S. AdlerPartner');
  assert(result.cleaned === 'Arthur S. Adler', 'Removes "Partner" suffix');
  assert(result.extractedTitle === 'Partner', 'Extracts title "Partner"');
  assert(result.wasContaminated === true, 'Marks as contaminated');
}

// Test 2: Title with space
{
  const result = cleanName('John Smith Senior Partner');
  assert(result.cleaned === 'John Smith', 'Removes "Senior Partner" suffix');
  assert(result.extractedTitle === 'Senior Partner', 'Extracts title "Senior Partner"');
}

// Test 3: Of Counsel title
{
  const result = cleanName('Jane DoeOf Counsel');
  assert(result.cleaned === 'Jane Doe', 'Removes "Of Counsel" suffix');
  assert(result.extractedTitle === 'Of Counsel', 'Extracts title "Of Counsel"');
}

// Test 4: Clean name (no contamination)
{
  const result = cleanName('Michael Johnson');
  assert(result.cleaned === 'Michael Johnson', 'Keeps clean name unchanged');
  assert(result.extractedTitle === null, 'No title extracted from clean name');
  assert(result.wasContaminated === false, 'Not marked as contaminated');
}

// Test 5: Profile title override
{
  const result = cleanName('Robert Brown', 'Managing Partner');
  assert(result.extractedTitle === 'Managing Partner', 'Uses profile title when provided');
}

// Test 6: Null input
{
  const result = cleanName(null);
  assert(result.cleaned === null, 'Handles null input');
}

// Test 7: Empty string
{
  const result = cleanName('');
  assert(result.cleaned === null, 'Handles empty string');
}

// Test 8: hasEmbeddedTitle helper
{
  assert(hasEmbeddedTitle('John SmithPartner') === true, 'Detects embedded title');
  assert(hasEmbeddedTitle('John Smith') === false, 'Clean name has no embedded title');
}

console.log('');

// ============================================================================
// LOCATION CLEANER TESTS
// ============================================================================
console.log('LOCATION CLEANER TESTS');
console.log('──────────────────────────────────────────');

// Test 1: Remove phone from location
{
  const result = cleanLocation('New York\n +1-212-558-3960', ['+1-212-558-3960']);
  assert(result.cleaned === 'New York', 'Removes phone from location');
  assert(result.removedNoise.length > 0, 'Records removed noise');
}

// Test 2: Multiple locations
{
  const result = cleanLocation('New York\nFrankfurt');
  assert(result.isMultiLocation === true, 'Detects multi-location');
  assert(result.locations.length === 2, 'Extracts both locations');
  assert(result.locations[0] === 'New York', 'First location correct');
  assert(result.locations[1] === 'Frankfurt', 'Second location correct');
}

// Test 3: Clean location
{
  const result = cleanLocation('Los Angeles');
  assert(result.cleaned === 'Los Angeles', 'Keeps clean location unchanged');
  assert(result.removedNoise.length === 0, 'No noise removed');
}

// Test 4: Location with address (keep)
{
  const result = cleanLocation('New York, 125 Broad Street');
  assert(result.cleaned === 'New York, 125 Broad Street', 'Keeps address details');
}

// Test 5: hasPhoneInLocation helper
{
  assert(hasPhoneInLocation('New York +1-212-555-1234') === true, 'Detects phone in location');
  assert(hasPhoneInLocation('New York') === false, 'Clean location has no phone');
}

// Test 6: Null input
{
  const result = cleanLocation(null);
  assert(result.cleaned === null, 'Handles null input');
}

console.log('');

// ============================================================================
// TITLE EXTRACTOR TESTS
// ============================================================================
console.log('TITLE EXTRACTOR TESTS');
console.log('──────────────────────────────────────────');

// Test 1: Extract from profile data
{
  const result = extractTitle('John Smith', { title: 'Partner' });
  assert(result.title === 'Partner', 'Extracts title from profile data');
  assert(result.source === 'profile-html', 'Identifies source as profile-html');
  assert(result.confidence === 'high', 'High confidence from profile');
}

// Test 2: Extract from structured data
{
  const result = extractTitle('John Smith', { structuredData: { jobTitle: 'Senior Associate' } });
  assert(result.title === 'Senior Associate', 'Extracts title from structured data');
  assert(result.source === 'profile-structured-data', 'Identifies source as structured data');
}

// Test 3: Extract from name field
{
  const result = extractTitle('John SmithPartner', {});
  assert(result.title === 'Partner', 'Extracts title from name field');
  assert(result.source === 'name-field', 'Identifies source as name field');
  assert(result.confidence === 'medium', 'Medium confidence from name');
}

// Test 4: No title found
{
  const result = extractTitle('John Smith', {});
  assert(result.title === null, 'Returns null when no title found');
}

console.log('');

// ============================================================================
// NOISE DETECTOR TESTS
// ============================================================================
console.log('NOISE DETECTOR TESTS');
console.log('──────────────────────────────────────────');

// Test 1: Detect label prefix
{
  const result = detectNoise('email', 'Email: john@example.com', {});
  assert(result.hasNoise === true, 'Detects label prefix');
  assert(result.cleanValue === 'john@example.com', 'Cleans label prefix');
}

// Test 2: Detect duplicate phone in location
{
  const result = detectNoise('location', 'New York +1-212-555-1234', { phone: '+1-212-555-1234' });
  assert(result.hasNoise === true, 'Detects duplicate phone in location');
}

// Test 3: Clean field
{
  const result = detectNoise('name', 'John Smith', { email: 'john@example.com' });
  assert(result.hasNoise === false, 'Clean field has no noise');
}

// Test 4: Detect UI element
{
  const result = detectNoise('name', 'View Profile John Smith', {});
  assert(result.hasNoise === true, 'Detects UI element');
}

console.log('');

// ============================================================================
// FIELD COMPARATOR TESTS
// ============================================================================
console.log('FIELD COMPARATOR TESTS');
console.log('──────────────────────────────────────────');

// Test 1: ENRICHED - Original missing, profile has data
{
  const result = fieldComparator.compareAndMerge(null, 'john@example.com', 'email', {});
  assert(result.action === 'ENRICHED', 'ENRICHED when original missing');
  assert(result.value === 'john@example.com', 'Uses profile value');
  assert(result.confidence === 'high', 'High confidence for enrichment');
}

// Test 2: VALIDATED - Exact match
{
  const result = fieldComparator.compareAndMerge('john@example.com', 'john@example.com', 'email', {});
  assert(result.action === 'VALIDATED', 'VALIDATED when exact match');
  assert(result.confidence === 'high', 'High confidence for validation');
}

// Test 3: CLEANED - Contaminated name
{
  const result = fieldComparator.compareAndMerge('John SmithPartner', 'John Smith', 'name', {});
  assert(result.action === 'CLEANED', 'CLEANED when contaminated');
  assert(result.value === 'John Smith', 'Uses clean value');
  assert(result.originalValue === 'John SmithPartner', 'Preserves original');
}

// Test 4: REPLACED - Mismatch
{
  const result = fieldComparator.compareAndMerge('wrong@example.com', 'correct@example.com', 'email', {});
  assert(result.action === 'REPLACED', 'REPLACED when mismatch');
  assert(result.value === 'correct@example.com', 'Profile wins');
  assert(result.needsReview === true, 'Flagged for review');
  assert(result.flag === 'email_mismatch', 'Has mismatch flag');
}

// Test 5: UNCHANGED - Original exists, profile missing
{
  const result = fieldComparator.compareAndMerge('john@example.com', null, 'email', {});
  assert(result.action === 'UNCHANGED', 'UNCHANGED when profile missing');
  assert(result.value === 'john@example.com', 'Keeps original');
}

// Test 6: Phone comparison (normalized)
{
  const result = fieldComparator.compareAndMerge('+1-212-555-1234', '(212) 555-1234', 'phone', {});
  assert(result.action === 'VALIDATED', 'VALIDATED for equivalent phone formats');
}

// Test 7: Email comparison (case insensitive)
{
  const result = fieldComparator.compareAndMerge('John@Example.com', 'john@example.com', 'email', {});
  assert(result.action === 'VALIDATED', 'VALIDATED for case-different emails');
}

console.log('');

// ============================================================================
// INTEGRATION TESTS
// ============================================================================
console.log('INTEGRATION TESTS');
console.log('──────────────────────────────────────────');

// Test 1: Compare all fields
{
  const originalContact = {
    name: 'Arthur S. AdlerPartner',
    email: null,
    phone: '+1-212-558-3960',
    location: 'New York\n +1-212-558-3960',
    title: null
  };

  const profileData = {
    name: 'Arthur S. Adler',
    email: 'aadler@sullcrom.com',
    phone: '+1-212-558-3960',
    location: 'New York',
    title: 'Partner'
  };

  const comparisons = fieldComparator.compareAllFields(originalContact, profileData);

  assert(comparisons.name.action === 'CLEANED', 'Name cleaned');
  assert(comparisons.email.action === 'ENRICHED', 'Email enriched');
  assert(comparisons.phone.action === 'VALIDATED', 'Phone validated');
  assert(comparisons.location.action === 'CLEANED', 'Location cleaned');
  assert(comparisons.title.action === 'ENRICHED', 'Title enriched');
}

// Test 2: Calculate overall confidence
{
  const comparisons = {
    name: { confidence: 'high' },
    email: { confidence: 'high' },
    phone: { confidence: 'medium' },
    location: { confidence: 'high' }
  };

  const overall = fieldComparator.calculateOverallConfidence(comparisons);
  assert(overall === 'high', 'Overall confidence calculated correctly');
}

// Test 3: Count actions
{
  const comparisons = {
    name: { action: 'CLEANED' },
    email: { action: 'ENRICHED' },
    phone: { action: 'VALIDATED' },
    location: { action: 'CLEANED' }
  };

  const counts = fieldComparator.countActions(comparisons);
  assert(counts.CLEANED === 2, 'Counts CLEANED actions');
  assert(counts.ENRICHED === 1, 'Counts ENRICHED actions');
  assert(counts.VALIDATED === 1, 'Counts VALIDATED actions');
}

// Test 4: Needs manual review
{
  const comparisonsWithReview = {
    email: { needsReview: true }
  };
  const comparisonsNoReview = {
    email: { needsReview: false }
  };

  assert(fieldComparator.needsManualReview(comparisonsWithReview) === true, 'Detects need for review');
  assert(fieldComparator.needsManualReview(comparisonsNoReview) === false, 'No review needed when not flagged');
}

console.log('');

// ============================================================================
// SUMMARY
// ============================================================================
console.log('═══════════════════════════════════════');
console.log('  TEST SUMMARY');
console.log('═══════════════════════════════════════');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${passed + failed}`);
console.log('═══════════════════════════════════════');

if (failed > 0) {
  console.log('');
  console.log('  Some tests FAILED!');
  process.exit(1);
} else {
  console.log('');
  console.log('  All tests PASSED!');
  process.exit(0);
}

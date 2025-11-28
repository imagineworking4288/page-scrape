/**
 * Infinite Scroll Basic Test Suite
 *
 * Unit tests for ContentTracker and ScrollDetector modules.
 */

const ContentTracker = require('../src/features/infinite-scroll/content-tracker');

console.log('========================================');
console.log('  INFINITE SCROLL BASIC TESTS');
console.log('========================================\n');

// Test ContentTracker
function testContentTracker() {
  console.log('=== Test 1: ContentTracker ===\n');
  let passed = 0;
  let failed = 0;

  const tracker = new ContentTracker();

  // Test 1.1: Hash generation for same email produces same hash
  const contact1 = { name: 'John Doe', email: 'john@example.com', phone: '555-1234' };
  const contact2 = { name: 'John Smith', email: 'john@example.com', phone: '555-9999' };
  const hash1 = tracker.generateHash(contact1);
  const hash2 = tracker.generateHash(contact2);

  if (hash1 === hash2) {
    console.log('  [PASS] Same email produces same hash');
    passed++;
  } else {
    console.log('  [FAIL] Same email should produce same hash');
    failed++;
  }

  // Test 1.2: Different emails produce different hashes
  const contact3 = { name: 'Jane Doe', email: 'jane@example.com', phone: '555-1234' };
  const hash3 = tracker.generateHash(contact3);

  if (hash1 !== hash3) {
    console.log('  [PASS] Different emails produce different hashes');
    passed++;
  } else {
    console.log('  [FAIL] Different emails should produce different hashes');
    failed++;
  }

  // Test 1.3: Deduplication works correctly
  tracker.clear();
  const isNew1 = tracker.checkAndMark(contact1);
  const isNew2 = tracker.checkAndMark(contact2); // Same email as contact1

  if (isNew1 === true && isNew2 === false) {
    console.log('  [PASS] Deduplication works correctly');
    passed++;
  } else {
    console.log(`  [FAIL] Deduplication failed: isNew1=${isNew1}, isNew2=${isNew2}`);
    failed++;
  }

  // Test 1.4: Unique count is correct
  tracker.clear();
  tracker.checkAndMark({ email: 'a@example.com' });
  tracker.checkAndMark({ email: 'b@example.com' });
  tracker.checkAndMark({ email: 'a@example.com' }); // Duplicate

  if (tracker.getUniqueCount() === 2) {
    console.log('  [PASS] Unique count is correct');
    passed++;
  } else {
    console.log(`  [FAIL] Expected 2 unique, got ${tracker.getUniqueCount()}`);
    failed++;
  }

  // Test 1.5: Duplicates skipped count is correct
  if (tracker.getDuplicatesSkipped() === 1) {
    console.log('  [PASS] Duplicates skipped count is correct');
    passed++;
  } else {
    console.log(`  [FAIL] Expected 1 duplicate, got ${tracker.getDuplicatesSkipped()}`);
    failed++;
  }

  // Test 1.6: Clear resets state
  tracker.clear();
  if (tracker.getUniqueCount() === 0 && tracker.getDuplicatesSkipped() === 0) {
    console.log('  [PASS] Clear resets state');
    passed++;
  } else {
    console.log('  [FAIL] Clear should reset state');
    failed++;
  }

  // Test 1.7: Fallback to name+phone when no email
  tracker.clear();
  const noEmail1 = { name: 'Bob Smith', phone: '555-1234' };
  const noEmail2 = { name: 'Bob Smith', phone: '555-1234' }; // Same name+phone
  const noEmail3 = { name: 'Bob Smith', phone: '555-5678' }; // Different phone

  tracker.checkAndMark(noEmail1);
  const noEmailDup = tracker.checkAndMark(noEmail2);
  const noEmailNew = tracker.checkAndMark(noEmail3);

  if (noEmailDup === false && noEmailNew === true) {
    console.log('  [PASS] Fallback to name+phone works correctly');
    passed++;
  } else {
    console.log(`  [FAIL] Name+phone fallback failed: noEmailDup=${noEmailDup}, noEmailNew=${noEmailNew}`);
    failed++;
  }

  // Test 1.8: Handle null/undefined gracefully
  tracker.clear();
  try {
    tracker.generateHash(null);
    tracker.generateHash(undefined);
    tracker.generateHash({});
    console.log('  [PASS] Handles null/undefined gracefully');
    passed++;
  } catch (err) {
    console.log(`  [FAIL] Should handle null/undefined: ${err.message}`);
    failed++;
  }

  // Test 1.9: Get contact key
  const key1 = tracker.getContactKey({ email: 'test@example.com' });
  const key2 = tracker.getContactKey({ name: 'John', phone: '555-1234' });
  const key3 = tracker.getContactKey({ name: 'John' });

  if (key1.startsWith('email:') && key2.startsWith('name-phone:') && key3.startsWith('name:')) {
    console.log('  [PASS] getContactKey returns correct format');
    passed++;
  } else {
    console.log(`  [FAIL] getContactKey format incorrect: ${key1}, ${key2}, ${key3}`);
    failed++;
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// Test module exports
function testModuleExports() {
  console.log('=== Test 2: Module Exports ===\n');
  let passed = 0;
  let failed = 0;

  try {
    const { InfiniteScrollHandler, ContentTracker, ScrollDetector } = require('../src/features/infinite-scroll');

    if (typeof InfiniteScrollHandler === 'function') {
      console.log('  [PASS] InfiniteScrollHandler exported correctly');
      passed++;
    } else {
      console.log('  [FAIL] InfiniteScrollHandler not exported as function');
      failed++;
    }

    if (typeof ContentTracker === 'function') {
      console.log('  [PASS] ContentTracker exported correctly');
      passed++;
    } else {
      console.log('  [FAIL] ContentTracker not exported as function');
      failed++;
    }

    if (typeof ScrollDetector === 'function') {
      console.log('  [PASS] ScrollDetector exported correctly');
      passed++;
    } else {
      console.log('  [FAIL] ScrollDetector not exported as function');
      failed++;
    }

  } catch (err) {
    console.log(`  [FAIL] Module import failed: ${err.message}`);
    failed += 3;
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// Test config loading
function testConfigLoading() {
  console.log('=== Test 3: Config Loading ===\n');
  let passed = 0;
  let failed = 0;

  try {
    const fs = require('fs');
    const path = require('path');

    // Test default config
    const defaultConfig = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'configs', '_default.json'), 'utf8')
    );

    if (defaultConfig.infiniteScroll) {
      console.log('  [PASS] Default config has infiniteScroll section');
      passed++;
    } else {
      console.log('  [FAIL] Default config missing infiniteScroll section');
      failed++;
    }

    if (defaultConfig.infiniteScroll.scrollDelay === 1500) {
      console.log('  [PASS] Default scrollDelay is 1500');
      passed++;
    } else {
      console.log(`  [FAIL] Default scrollDelay is ${defaultConfig.infiniteScroll.scrollDelay}`);
      failed++;
    }

    // Test Sullivan & Cromwell config
    const sullcromConfig = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'configs', 'sullcrom.com.json'), 'utf8')
    );

    if (sullcromConfig.infiniteScroll && sullcromConfig.infiniteScroll.enabled === true) {
      console.log('  [PASS] Sullivan & Cromwell config has infiniteScroll enabled');
      passed++;
    } else {
      console.log('  [FAIL] Sullivan & Cromwell config should have infiniteScroll enabled');
      failed++;
    }

    if (sullcromConfig.domain === 'sullcrom.com') {
      console.log('  [PASS] Sullivan & Cromwell config has correct domain');
      passed++;
    } else {
      console.log('  [FAIL] Sullivan & Cromwell config domain incorrect');
      failed++;
    }

  } catch (err) {
    console.log(`  [FAIL] Config loading failed: ${err.message}`);
    failed += 4;
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// Run all tests
function runAllTests() {
  const results = [];

  results.push(testContentTracker());
  results.push(testModuleExports());
  results.push(testConfigLoading());

  // Summary
  const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

  console.log('========================================');
  console.log('  TEST SUMMARY');
  console.log('========================================\n');
  console.log(`  Total: ${totalPassed} passed, ${totalFailed} failed`);
  console.log(`  ${totalFailed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  console.log('');

  process.exit(totalFailed === 0 ? 0 : 1);
}

// Run tests
runAllTests();

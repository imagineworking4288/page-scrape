/**
 * Integration tests for Infinite Scroll Loader
 * Tests against real websites
 */

const { InfiniteScrollOrchestrator } = require('../src/index');

// Test configuration
const TEST_TIMEOUT = 120000; // 2 minutes per test

async function runTests() {
  console.log('\n=== Infinite Scroll Loader Integration Tests ===\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Basic scrollHeight detection with a simple page
  console.log('Test 1: Basic scroll with scrollHeight detection');
  try {
    const orchestrator = new InfiniteScrollOrchestrator();
    const result = await orchestrator.loadWithOptions('https://example.com', {
      detectionMethod: 'scrollHeight',
      maxScrollAttempts: 5,
      maxDurationSeconds: 30,
      progressTimeout: 2,
      headless: true
    });

    if (result.success && result.html && result.html.length > 0) {
      console.log(`  ✓ Loaded page successfully`);
      console.log(`    - HTML size: ${result.html.length} bytes`);
      console.log(`    - Scroll attempts: ${result.stats.scrollAttempts}`);
      passed++;
    } else {
      throw new Error(result.errors.join(', ') || 'Unknown error');
    }
  } catch (error) {
    console.log(`  ✗ Failed: ${error.message}`);
    failed++;
  }

  // Test 2: Item count detection
  console.log('\nTest 2: Item count detection with selector');
  try {
    const orchestrator = new InfiniteScrollOrchestrator();
    const result = await orchestrator.loadWithOptions('https://httpbin.org/html', {
      itemSelector: 'p',
      detectionMethod: 'itemCount',
      maxScrollAttempts: 3,
      maxDurationSeconds: 30,
      progressTimeout: 2,
      headless: true
    });

    if (result.success) {
      console.log(`  ✓ Loaded with item count detection`);
      console.log(`    - Final item count: ${result.stats.finalItemCount}`);
      passed++;
    } else {
      throw new Error(result.errors.join(', ') || 'Unknown error');
    }
  } catch (error) {
    console.log(`  ✗ Failed: ${error.message}`);
    failed++;
  }

  // Test 3: Configuration validation
  console.log('\nTest 3: Configuration validation');
  try {
    const orchestrator = new InfiniteScrollOrchestrator();

    // This should fail validation because itemSelector is required
    const result = await orchestrator.loadPage('https://example.com', {
      itemSelector: null,  // Missing required field
      maxScrollAttempts: 5
    });

    if (!result.success && result.errors.some(e => e.includes('itemSelector'))) {
      console.log(`  ✓ Validation correctly caught missing itemSelector`);
      passed++;
    } else {
      throw new Error('Validation should have failed');
    }
  } catch (error) {
    // If it throws, that's also valid validation behavior
    if (error.message.includes('itemSelector')) {
      console.log(`  ✓ Validation correctly caught missing itemSelector`);
      passed++;
    } else {
      console.log(`  ✗ Unexpected error: ${error.message}`);
      failed++;
    }
  }

  // Test 4: Timeout handling
  console.log('\nTest 4: Timeout handling');
  try {
    const orchestrator = new InfiniteScrollOrchestrator();
    const startTime = Date.now();

    const result = await orchestrator.loadWithOptions('https://example.com', {
      itemSelector: '.nonexistent-item',
      detectionMethod: 'itemCount',
      maxScrollAttempts: 100,
      maxDurationSeconds: 10, // Short timeout
      progressTimeout: 2,
      headless: true
    });

    const duration = (Date.now() - startTime) / 1000;

    if (duration <= 30) { // Should complete within reasonable time
      console.log(`  ✓ Timeout handled correctly`);
      console.log(`    - Completed in ${duration.toFixed(1)}s`);
      passed++;
    } else {
      throw new Error(`Took too long: ${duration}s`);
    }
  } catch (error) {
    console.log(`  ✗ Failed: ${error.message}`);
    failed++;
  }

  // Test 5: Module API
  console.log('\nTest 5: Module API (loadInfiniteScroll convenience function)');
  try {
    const { loadInfiniteScroll } = require('../src/index');

    const result = await loadInfiniteScroll('https://example.com', {
      itemSelector: 'body',
      maxScrollAttempts: 2,
      maxDurationSeconds: 20,
      headless: true
    });

    if (result.html) {
      console.log(`  ✓ loadInfiniteScroll convenience function works`);
      passed++;
    } else {
      throw new Error('No HTML returned');
    }
  } catch (error) {
    console.log(`  ✗ Failed: ${error.message}`);
    failed++;
  }

  // Print summary
  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

// Run with timeout
const timeout = setTimeout(() => {
  console.error('Tests timed out after 5 minutes');
  process.exit(1);
}, 300000);

runTests().finally(() => clearTimeout(timeout));

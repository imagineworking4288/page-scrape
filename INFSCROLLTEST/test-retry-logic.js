/**
 * Test: Retry Logic with Sullivan & Cromwell
 *
 * This is the main test - scrapes Sullivan & Cromwell's lawyer listing
 * and validates that we can find 500+ lawyers using the PAGE_DOWN approach.
 */

const { scrapeWithScroll, extractLinks } = require('./selenium-scraper');

// Target URL - Sullivan & Cromwell lawyer listing (all lawyers)
const URL = 'https://www.sullcrom.com/LawyerListing?custom_is_office=27567';

async function test() {
  console.log('='.repeat(70));
  console.log('TEST: Selenium PAGE_DOWN Retry Logic');
  console.log('='.repeat(70));
  console.log('');
  console.log('Target: Sullivan & Cromwell lawyer listing');
  console.log('Expected: 500+ lawyer links');
  console.log('Method: PAGE_DOWN key simulation with counter reset on height change');
  console.log('');

  const startTime = Date.now();

  // Check for --interactive flag
  const interactive = process.argv.includes('--interactive') || process.argv.includes('-i');

  // Run scraper with retry logic
  const result = await scrapeWithScroll(URL, {
    headless: false,          // Watch the browser
    scrollDelay: 400,         // 400ms between PAGE_DOWN presses (allow AJAX time)
    maxRetries: 25,           // Stop after 25 consecutive no-height-change
    maxScrolls: 1000,         // Safety limit
    initialWait: 5000,        // Wait 5s for initial content to load
    outputFile: 'output-retry-logic.html',
    verbose: true,
    waitForConfirmation: interactive  // If --interactive, wait for user
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('');
  console.log('='.repeat(70));
  console.log('RESULTS');
  console.log('='.repeat(70));

  if (!result.success) {
    console.log('FAILED:', result.error);
    process.exit(1);
  }

  console.log('');
  console.log('Scroll Statistics:');
  console.log(JSON.stringify(result.stats, null, 2));
  console.log('');

  // Extract and count lawyer links
  const lawyerLinks = extractLinks(result.html, '/lawyers/');

  console.log('Link Analysis:');
  console.log(`  Unique lawyer links found: ${lawyerLinks.length}`);
  console.log(`  Time elapsed: ${elapsed}s`);
  console.log('');

  // Show sample links
  if (lawyerLinks.length > 0) {
    console.log('Sample links (first 5):');
    lawyerLinks.slice(0, 5).forEach(link => {
      console.log(`  - ${link}`);
    });
    console.log('');
  }

  // Success criteria
  console.log('='.repeat(70));
  console.log('VERDICT');
  console.log('='.repeat(70));

  if (lawyerLinks.length >= 500) {
    console.log(`PASS: Found ${lawyerLinks.length} lawyers (target: 500+)`);
    console.log('The PAGE_DOWN retry logic works correctly!');
  } else if (lawyerLinks.length >= 400) {
    console.log(`PARTIAL: Found ${lawyerLinks.length} lawyers (target: 500+)`);
    console.log('Close to target - may need parameter tuning');
  } else if (lawyerLinks.length >= 100) {
    console.log(`PROGRESS: Found ${lawyerLinks.length} lawyers (target: 500+)`);
    console.log('Significant improvement over baseline (44), but not at target');
  } else {
    console.log(`FAIL: Found only ${lawyerLinks.length} lawyers (target: 500+)`);
    console.log('The scraper is not loading enough content');
  }
}

// Run test
test().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

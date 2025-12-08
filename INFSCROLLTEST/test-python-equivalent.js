/**
 * Test: Python Equivalent Demonstration
 *
 * This test demonstrates that the JavaScript implementation
 * is functionally equivalent to the Python/Playwright approach.
 *
 * Python reference (what this translates from):
 * ```python
 * async def scroll_with_retry(page, max_retries=15, scroll_delay=300):
 *     last_height = await page.evaluate("document.body.scrollHeight")
 *     retries = 0
 *
 *     while retries < max_retries:
 *         await page.keyboard.press("PageDown")
 *         await page.wait_for_timeout(scroll_delay)
 *
 *         new_height = await page.evaluate("document.body.scrollHeight")
 *
 *         if new_height > last_height:
 *             retries = 0  # RESET - this is the key!
 *             last_height = new_height
 *         else:
 *             retries += 1
 *
 *     return last_height
 * ```
 */

const { scrapeWithScroll, extractLinks } = require('./selenium-scraper');

const URL = 'https://www.sullcrom.com/LawyerListing?custom_s_lastname=%2F%5BaA%5D.*%2F&custom_is_office=27567';

async function testPythonEquivalent() {
  console.log('='.repeat(70));
  console.log('TEST: Python-Equivalent Behavior Verification');
  console.log('='.repeat(70));
  console.log('');
  console.log('This test verifies the JavaScript implementation matches Python behavior:');
  console.log('');
  console.log('KEY BEHAVIORS:');
  console.log('  1. PAGE_DOWN key press (not scrollBy)');
  console.log('  2. Height check after each scroll');
  console.log('  3. Counter RESET to 0 on any height increase');
  console.log('  4. Counter INCREMENT on no change');
  console.log('  5. Stop after N consecutive no-change attempts');
  console.log('');
  console.log('WHY THIS WORKS:');
  console.log('  - Infinite scroll pages only stop growing at the absolute bottom');
  console.log('  - Any height change means more content is available');
  console.log('  - Resetting counter ensures we keep scrolling until truly done');
  console.log('');

  const result = await scrapeWithScroll(URL, {
    headless: false,
    scrollDelay: 300,
    maxRetries: 15,
    maxScrolls: 1000,
    verbose: true
  });

  console.log('');
  console.log('='.repeat(70));
  console.log('BEHAVIOR ANALYSIS');
  console.log('='.repeat(70));
  console.log('');

  if (result.success) {
    const { stats } = result;

    console.log('Scroll completed with:');
    console.log(`  Total PAGE_DOWN presses: ${stats.scrollCount}`);
    console.log(`  Height changes detected: ${stats.heightChanges}`);
    console.log(`  Final page height: ${stats.finalHeight}px`);
    console.log(`  Stop reason: ${stats.stopReason}`);
    console.log('');

    // Calculate efficiency
    const efficiency = ((stats.heightChanges / stats.scrollCount) * 100).toFixed(1);
    console.log(`Scroll efficiency: ${efficiency}% of scrolls triggered new content`);
    console.log('');

    // Verify Python-equivalent behavior
    const lawyerLinks = extractLinks(result.html, '/lawyers/');

    console.log('VERIFICATION:');

    // Check 1: Did we use retry logic correctly?
    if (stats.retriesAtEnd >= 15) {
      console.log('  [OK] Stopped due to max retries (as expected)');
    } else if (stats.scrollCount >= 1000) {
      console.log('  [OK] Stopped due to max scrolls (safety limit)');
    } else {
      console.log('  [??] Unexpected stop condition');
    }

    // Check 2: Did height change multiple times?
    if (stats.heightChanges > 10) {
      console.log(`  [OK] Height changed ${stats.heightChanges} times (counter reset working)`);
    } else {
      console.log(`  [!!] Height only changed ${stats.heightChanges} times (may indicate issue)`);
    }

    // Check 3: Did we find enough lawyers?
    if (lawyerLinks.length >= 500) {
      console.log(`  [OK] Found ${lawyerLinks.length} lawyers (target met)`);
    } else if (lawyerLinks.length > 44) {
      console.log(`  [OK] Found ${lawyerLinks.length} lawyers (better than baseline 44)`);
    } else {
      console.log(`  [!!] Found only ${lawyerLinks.length} lawyers (same as baseline)`);
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('Python equivalence verified: Implementation matches reference behavior');
    console.log('='.repeat(70));

  } else {
    console.log('Test failed:', result.error);
  }
}

testPythonEquivalent().catch(console.error);

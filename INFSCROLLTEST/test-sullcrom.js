/**
 * Test script for Sullivan & Cromwell lawyer directory
 */

const { InfiniteScrollOrchestrator } = require('./src/index');

const URL = 'https://www.sullcrom.com/LawyerListing?custom_s_lastname=%2F%5BaA%5D.*%2F&custom_is_office=27567';

async function test() {
  console.log('Testing Sullivan & Cromwell infinite scroll...');
  console.log('URL:', URL);
  console.log('');

  const orchestrator = new InfiniteScrollOrchestrator();

  try {
    const result = await orchestrator.loadWithOptions(URL, {
      detectionMethod: 'itemCount',
      itemSelector: 'a[href*="/lawyers/"], .lawyer-card, .attorney-card, .result-item, [class*="lawyer"]',

      maxScrollAttempts: 200,
      scrollAmount: { min: 1500, max: 2000 },

      progressTimeout: 5,
      maxDurationSeconds: 300,

      waitForContent: 3000,
      waitAfterScroll: { min: 1000, max: 2000 },

      headless: false,
      viewport: { width: 1920, height: 1080 },
    });

    console.log('\n=== RESULTS ===');
    console.log('Success:', result.success);
    console.log('Stats:', JSON.stringify(result.stats, null, 2));

    if (result.html) {
      console.log('HTML length:', result.html.length, 'bytes');

      // Count lawyer links in HTML
      const matches = result.html.match(/href="[^"]*\/lawyers\/[^"]*"/g);
      const linksFound = matches ? matches.length : 0;
      console.log('  - Lawyer links in HTML:', linksFound);

      // Save to file
      const fs = require('fs');
      fs.writeFileSync('sullcrom-output.html', result.html);
      console.log('HTML saved to: sullcrom-output.html');
    }

    if (result.errors.length > 0) {
      console.log('Errors:', result.errors);
    }

    // Success criteria check
    console.log('\n=== SUCCESS CRITERIA ===');
    const itemsFound = result.stats.finalItemCount;
    if (itemsFound >= 500) {
      console.log('✅ PASS: Found', itemsFound, 'items (expected 500+)');
    } else if (itemsFound >= 400) {
      console.log('⚠️  PARTIAL: Found', itemsFound, 'items (expected 500+, but close)');
    } else {
      console.log('❌ FAIL: Only found', itemsFound, 'items (expected 500+)');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();

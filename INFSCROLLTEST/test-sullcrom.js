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
      // Try common selectors for lawyer listings
      itemSelector: '.lawyer-result, .attorney-card, .result-item, .listing-item, [class*="lawyer"], [class*="attorney"]',
      detectionMethod: 'scrollHeight',
      maxScrollAttempts: 100,
      maxDurationSeconds: 180,
      progressTimeout: 10,        // Wait longer for content to load
      headless: false,            // Set to true for headless
      waitForContent: 4000,       // Wait 4 seconds for content after scroll
      waitAfterScroll: { min: 1000, max: 2000 },
      scrollAmount: { min: 600, max: 1000 }  // Larger scrolls
    });

    console.log('\n=== RESULTS ===');
    console.log('Success:', result.success);
    console.log('Stats:', JSON.stringify(result.stats, null, 2));

    if (result.html) {
      console.log('HTML length:', result.html.length, 'bytes');

      // Save to file
      const fs = require('fs');
      fs.writeFileSync('sullcrom-output.html', result.html);
      console.log('HTML saved to: sullcrom-output.html');
    }

    if (result.errors.length > 0) {
      console.log('Errors:', result.errors);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();

/**
 * Debug test script for Sullivan & Cromwell lawyer directory
 * Runs with verbose logging and stops after 20 scrolls for quick debugging
 */

const { InfiniteScrollOrchestrator } = require('./src/index');

const URL = 'https://www.sullcrom.com/LawyerListing?custom_s_lastname=%2F%5BaA%5D.*%2F&custom_is_office=27567';

async function debugTest() {
  console.log('=== SULLIVAN & CROMWELL DEBUG TEST ===');
  console.log('This will run with verbose logging and stop after 20 scrolls');
  console.log('Watch the browser to see scrolling behavior\n');
  console.log('URL:', URL);
  console.log('');

  const orchestrator = new InfiniteScrollOrchestrator();

  try {
    const result = await orchestrator.loadWithOptions(URL, {
      detectionMethod: 'itemCount',
      itemSelector: 'a[href*="/lawyers/"], .lawyer-card, .attorney-card',

      maxScrollAttempts: 20,
      scrollAmount: { min: 1500, max: 2000 },
      progressTimeout: 3,

      waitForContent: 3000,
      waitAfterScroll: { min: 1500, max: 2500 },

      headless: false,
      viewport: { width: 1920, height: 1080 },

      logLevel: 'debug'
    });

    console.log('\n=== DEBUG RESULTS ===');
    console.log('Scroll attempts:', result.stats.scrollAttempts);
    console.log('Items found:', result.stats.finalItemCount);
    console.log('Duration:', result.stats.durationSeconds, 'seconds');
    console.log('Stopped because:', result.stats.stoppedReason);

    console.log('\n=== ANALYSIS ===');
    if (result.stats.scrollAttempts >= 20) {
      console.log('✅ Reached max scroll attempts (as expected for debug test)');
    }
    if (result.stats.finalItemCount > 44) {
      console.log('✅ Found more items than before (', result.stats.finalItemCount, 'vs 44)');
    } else {
      console.log('⚠️  Still only finding', result.stats.finalItemCount, 'items - needs investigation');
    }

  } catch (error) {
    console.error('\n=== ERROR ===');
    console.error(error);
  }
}

debugTest().catch(console.error);

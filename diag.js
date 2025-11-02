#!/usr/bin/env node

console.log('🔍 Diagnostic Test Starting...\n');

// Test 1: Check if modules load
console.log('✓ Step 1: Testing module imports...');
try {
  const Logger = require('./utils/logger');
  console.log('  ✓ Logger imported');
  
  const BrowserManager = require('./utils/browser-manager');
  console.log('  ✓ BrowserManager imported');
  
  const RateLimiter = require('./utils/rate-limiter');
  console.log('  ✓ RateLimiter imported');
  
  const SimpleScraper = require('./scrapers/simple-scraper');
  console.log('  ✓ SimpleScraper imported');
  
  console.log('  ✅ All modules loaded successfully\n');
} catch (error) {
  console.error('  ❌ Module import failed:', error.message);
  process.exit(1);
}

// Test 2: Check if logger works
console.log('✓ Step 2: Testing logger...');
try {
  const logger = require('./utils/logger');
  logger.info('Logger test message');
  console.log('   Logger working\n');
} catch (error) {
  console.error('   Logger failed:', error.message);
  process.exit(1);
}

// Test 3: Initialize browser
console.log('✓ Step 3: Testing browser initialization...');
async function testBrowser() {
  try {
    const Logger = require('./utils/logger');
    const BrowserManager = require('./utils/browser-manager');
    
    const browserManager = new BrowserManager(Logger);
    console.log('  ✓ BrowserManager created');
    
    await browserManager.launch(true); // headless mode
    console.log('  ✓ Browser launched');
    
    await browserManager.close();
    console.log('  ✓ Browser closed');
    
    console.log('   Browser test successful\n');
    
    console.log('═══════════════════════════════════════');
    console.log(' All diagnostic tests passed!');
    console.log('═══════════════════════════════════════');
    console.log('\nYour scraper should be working. Try:');
    console.log('  node orchestrator.js --url "https://example.com"');
    
  } catch (error) {
    console.error('   Browser test failed:', error.message);
    console.error('\n Full error:');
    console.error(error);
    process.exit(1);
  }
}

testBrowser();
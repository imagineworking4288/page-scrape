console.log('=== IMPORT TEST ===');

try {
  console.log('1. Testing path...');
  const path = require('path');
  console.log('   ✓ path loaded');

  console.log('2. Testing fs...');
  const fs = require('fs');
  console.log('   ✓ fs loaded');

  console.log('3. Testing BrowserManager...');
  const BrowserManager = require(path.join(__dirname, '..', 'src', 'utils', 'browser-manager'));
  console.log('   ✓ BrowserManager loaded');

  console.log('4. Testing RateLimiter...');
  const RateLimiter = require(path.join(__dirname, '..', 'src', 'utils', 'rate-limiter'));
  console.log('   ✓ RateLimiter loaded');

  console.log('5. Testing Logger...');
  const Logger = require(path.join(__dirname, '..', 'src', 'utils', 'logger'));
  console.log('   ✓ Logger loaded');

  console.log('6. Testing ScrollController...');
  const ScrollController = require('./scroll-controller');
  console.log('   ✓ ScrollController loaded');

  console.log('7. Testing InfiniteScrollScraper...');
  const InfiniteScrollScraper = require('./infinite-scroll-scraper');
  console.log('   ✓ InfiniteScrollScraper loaded');

  console.log('8. Testing testConfig...');
  const testConfig = require('./test-config');
  console.log('   ✓ testConfig loaded');

  console.log('\n=== ALL IMPORTS SUCCESSFUL ===');
  console.log('\nChecking InfiniteScrollScraper methods...');
  const scraper = new InfiniteScrollScraper(null, null, console);
  console.log('- Has scrape:', typeof scraper.scrape);
  console.log('- Has extractFromLoadedPage:', typeof scraper.extractFromLoadedPage);
  
  if (typeof scraper.extractFromLoadedPage !== 'function') {
    console.error('\n✗ CRITICAL: extractFromLoadedPage is missing!');
  }

} catch (error) {
  console.error('\n✗ IMPORT FAILED:');
  console.error('Error:', error.message);
  console.error('\nFull stack:');
  console.error(error.stack);
  process.exit(1);
}
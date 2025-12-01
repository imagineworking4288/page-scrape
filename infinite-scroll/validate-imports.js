/**
 * Validation test for infinite-scroll imports
 * Ensures all utilities are properly imported from src/utils/
 */

const path = require('path');

console.log('Testing imports...');
console.log('');

try {
  // Test utility imports from src/utils/
  const BrowserManager = require(path.join(__dirname, '..', 'src', 'utils', 'browser-manager'));
  const RateLimiter = require(path.join(__dirname, '..', 'src', 'utils', 'rate-limiter'));
  const Logger = require(path.join(__dirname, '..', 'src', 'utils', 'logger'));

  console.log('✓ BrowserManager:', typeof BrowserManager);
  console.log('✓ RateLimiter:', typeof RateLimiter);
  console.log('✓ Logger:', typeof Logger);

  // Test scraper imports from src/scrapers/
  const SimpleScraper = require(path.join(__dirname, '..', 'src', 'scrapers', 'simple-scraper'));
  console.log('✓ SimpleScraper:', typeof SimpleScraper);

  // Test local infinite-scroll imports
  const ScrollController = require('./scroll-controller');
  const InfiniteScrollScraper = require('./infinite-scroll-scraper');
  const testConfig = require('./test-config');

  console.log('✓ ScrollController:', typeof ScrollController);
  console.log('✓ InfiniteScrollScraper:', typeof InfiniteScrollScraper);
  console.log('✓ testConfig:', typeof testConfig, '- tests:', testConfig.tests?.length || 0);

  console.log('');
  console.log('========================================');
  console.log('  ALL IMPORTS SUCCESSFUL');
  console.log('========================================');

  process.exit(0);
} catch (error) {
  console.error('');
  console.error('========================================');
  console.error('  IMPORT FAILED');
  console.error('========================================');
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

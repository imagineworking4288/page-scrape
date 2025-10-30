#!/usr/bin/env node

/**
 * Universal Professional Directory Scraper
 * Main CLI orchestrator for coordinating the scraping process
 * 
 * Usage:
 *   node orchestrator.js --url https://example.com/directory --limit 100
 *   node orchestrator.js -u https://example.com/directory -l 500
 */

const { Command } = require('commander');
const BrowserManager = require('./utils/browser-manager');
const RateLimiter = require('./utils/rate-limiter');
const logger = require('./utils/logger');
require('dotenv').config();

// Initialize CLI
const program = new Command();

program
  .name('universal-scraper')
  .description('Universal Professional Directory Scraper - Extract contact data from directory websites')
  .version('1.0.0')
  .requiredOption('-u, --url <url>', 'Target directory URL to scrape')
  .option('-l, --limit <number>', 'Maximum number of contacts to extract', '100')
  .option('-o, --output <format>', 'Output format (sqlite|csv|sheets|all)', 'all')
  .option('--headless <boolean>', 'Run browser in headless mode', 'true')
  .option('--delay <ms>', 'Delay between requests in milliseconds', '2000-5000')
  .parse(process.argv);

const options = program.opts();

/**
 * Main scraping orchestration function
 */
async function main() {
  const browserManager = new BrowserManager();
  const rateLimiter = new RateLimiter();
  
  try {
    // Display startup banner
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║  Universal Professional Directory Scraper     ║');
    console.log('║  Version 1.0.0 - Week 1 Foundation            ║');
    console.log('╚════════════════════════════════════════════════╝\n');
    
    logger.info('Starting Universal Directory Scraper...');
    logger.info(`Target URL: ${options.url}`);
    logger.info(`Contact limit: ${options.limit}`);
    logger.info(`Output format: ${options.output}`);
    
    // Validate URL
    if (!isValidUrl(options.url)) {
      throw new Error('Invalid URL provided. Please provide a valid HTTP/HTTPS URL.');
    }
    
    // Parse limit
    const limit = parseInt(options.limit);
    if (isNaN(limit) || limit <= 0) {
      throw new Error('Limit must be a positive number');
    }
    
    // Initialize browser
    logger.info('Initializing browser...');
    await browserManager.initialize();
    
    // Navigate to target URL
    logger.info('Navigating to target URL...');
    await rateLimiter.waitBeforeRequest();
    await browserManager.navigateSafely(options.url);
    
    logger.info('Page loaded successfully!');
    
    // Log memory usage
    logger.logMemory();
    
    // Week 1: Basic initialization only
    // Scraping logic will be added in Week 2
    logger.info('\n=== Week 1 Foundation Test ===');
    logger.info('✓ Browser initialized successfully');
    logger.info('✓ Navigation completed without errors');
    logger.info('✓ Rate limiting active');
    logger.info('✓ Memory management active');
    logger.info('✓ CAPTCHA detection active');
    logger.info('\nWeek 1 foundation is working correctly!');
    logger.info('Next: Week 2 will add Simple Scraper functionality\n');
    
    // Keep page open briefly to verify
    await rateLimiter.sleep(2000);
    
  } catch (error) {
    if (error.message === 'CAPTCHA_DETECTED') {
      logger.error('CAPTCHA detected! The target website is blocking automated access.');
      logger.error(`URL: ${error.url || options.url}`);
      logger.info('Please try a different website or use a CAPTCHA solving service.');
    } else {
      logger.error(`Scraping failed: ${error.message}`);
      if (error.stack) {
        logger.debug(error.stack);
      }
    }
    process.exit(1);
  } finally {
    // Cleanup
    logger.info('Closing browser...');
    await browserManager.close();
    logger.info('Scraper shutdown complete');
  }
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid
 */
function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

/**
 * Handle process signals for graceful shutdown
 */
process.on('SIGINT', () => {
  logger.info('Received SIGINT signal, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM signal, shutting down gracefully...');
  process.exit(0);
});

// Run the orchestrator
if (require.main === module) {
  main().catch(error => {
    logger.error(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { main };

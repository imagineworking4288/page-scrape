#!/usr/bin/env node

/**
 * Interactive Config Generator
 *
 * Visual tool to generate site-specific config files by clicking on elements
 * in a live browser window. Creates configs for the select-scraper method.
 *
 * Usage:
 *   node tools/config-generator.js --url "https://example.com/directory"
 *   node tools/config-generator.js --url "https://example.com" --no-test
 *   node tools/config-generator.js --url "https://example.com" --verbose
 */

require('dotenv').config();

const { Command } = require('commander');
const path = require('path');

// Import core utilities
const logger = require('../core/logger');
const BrowserManager = require('../core/browser-manager');
const RateLimiter = require('../core/rate-limiter');
const ConfigLoader = require('../config/config-loader');

// Import tool-specific modules
const InteractiveSession = require('./lib/interactive-session');

// CLI setup
const program = new Command();
program
  .name('config-generator')
  .description('Interactive tool to generate site-specific config files by visual element selection')
  .version('1.0.0')
  .requiredOption('-u, --url <url>', 'Target URL to configure')
  .option('-o, --output <dir>', 'Config output directory', 'configs')
  .option('-t, --timeout <ms>', 'Page load timeout in milliseconds', '30000')
  .option('--no-test', 'Skip testing config after generation')
  .option('--delay <ms>', 'Delay between requests (ms)', '2000-5000')
  .option('--verbose', 'Show detailed logs')
  .parse(process.argv);

const options = program.opts();

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid
 */
function validateUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  let browserManager = null;

  try {
    // Header
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║              INTERACTIVE CONFIG GENERATOR v1.0                 ║');
    console.log('║         Visual Tool for Site-Specific Config Creation          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');

    // Validate URL
    if (!validateUrl(options.url)) {
      logger.error(`Invalid URL: ${options.url}`);
      process.exit(1);
    }

    // Parse delay range
    const [minDelay, maxDelay] = options.delay.split('-').map(d => parseInt(d));

    // Show configuration
    logger.info(`Target URL: ${options.url}`);
    logger.info(`Output directory: ${options.output}`);
    logger.info(`Page timeout: ${options.timeout}ms`);
    logger.info(`Test after generation: ${options.test !== false ? 'yes' : 'no'}`);
    console.log('');

    // Initialize components
    logger.info('Initializing browser (visible mode)...');
    browserManager = new BrowserManager(logger);

    const rateLimiter = new RateLimiter(logger, {
      minDelay: minDelay || 2000,
      maxDelay: maxDelay || 5000
    });

    const configLoader = new ConfigLoader(logger);

    // Launch browser in NON-HEADLESS mode (user needs to see it)
    await browserManager.launch(false); // headless = false
    logger.info('Browser launched in visible mode');
    console.log('');

    // Create interactive session
    const session = new InteractiveSession(browserManager, rateLimiter, logger, configLoader, {
      outputDir: options.output,
      timeout: parseInt(options.timeout),
      testAfterGeneration: options.test !== false,
      verbose: options.verbose
    });

    // Register session for cleanup on shutdown
    InteractiveSession.setActiveSession(session);

    // Run interactive session
    logger.info('Starting interactive session...');
    logger.info('Follow the on-screen instructions in the browser window.');
    console.log('');
    console.log('═'.repeat(60));
    console.log('  INSTRUCTIONS:');
    console.log('  1. Wait for the page to load completely');
    console.log('  2. Click "I\'m Ready" in the control panel');
    console.log('  3. Click on a contact card to select the card pattern');
    console.log('  4. Click on name, email, and phone fields within a card');
    console.log('  5. Review and save your config');
    console.log('═'.repeat(60));
    console.log('');

    const result = await session.start(options.url);

    // Clear active session reference
    InteractiveSession.clearActiveSession();

    // Close browser
    await browserManager.close();

    if (result && result.success) {
      console.log('');
      logger.info('═══════════════════════════════════════════════════════════════');
      logger.info('  CONFIG GENERATION COMPLETE');
      logger.info('═══════════════════════════════════════════════════════════════');
      logger.info(`Config saved to: ${result.configPath}`);
      logger.info('');
      logger.info('To use this config:');
      logger.info(`  node orchestrator.js --url "${options.url}" --method select`);
      console.log('');
      process.exit(0);
    } else {
      logger.warn('Config generation was cancelled or failed');
      if (result?.error) {
        logger.error(`Error: ${result.error}`);
      }
      process.exit(1);
    }

  } catch (error) {
    logger.error('Fatal error:', error.message);
    if (options.verbose) {
      console.error(error.stack);
    }

    if (browserManager) {
      try {
        await browserManager.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('');
  logger.warn('Received SIGINT, shutting down...');
  logger.info('Config generation cancelled by user.');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.warn('Received SIGTERM, shutting down...');
  process.exit(0);
});

// Run
main();

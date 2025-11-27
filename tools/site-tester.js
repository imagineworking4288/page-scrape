#!/usr/bin/env node

/**
 * Site Tester - Diagnostic Tool
 *
 * Tests a URL to determine scraping feasibility:
 * - Identifies pagination patterns
 * - Tests all scraping methods (html, pdf, select)
 * - Compares results and recommends best approach
 * - Outputs terminal report + JSON file
 *
 * Usage:
 *   node tools/site-tester.js --url "https://example.com/directory"
 *   node tools/site-tester.js --url "https://example.com" --methods html,pdf
 *   node tools/site-tester.js --url "https://example.com" --skip pdf --no-pagination
 */

require('dotenv').config();

const { Command } = require('commander');
const path = require('path');

// Import utilities from parent directory
const logger = require('../utils/logger');
const BrowserManager = require('../utils/browser-manager');
const RateLimiter = require('../utils/rate-limiter');
const ConfigLoader = require('../utils/config-loader');

// Import tool-specific modules
const TestOrchestrator = require('./lib/test-orchestrator');
const TestReporter = require('./lib/test-reporter');

// CLI setup
const program = new Command();
program
  .name('site-tester')
  .description('Diagnostic tool to test scraping feasibility for a URL')
  .version('1.0.0')
  .requiredOption('-u, --url <url>', 'Target URL to test')
  .option('-m, --methods <methods>', 'Methods to test (comma-separated: html,pdf,select)', 'html,pdf,select')
  .option('-s, --skip <methods>', 'Methods to skip (comma-separated)')
  .option('-o, --output <path>', 'Output directory for JSON report', './output/diagnostics')
  .option('--headless [value]', 'Run browser in headless mode (true/false)', 'true')
  .option('--no-pagination', 'Skip pagination detection')
  .option('--delay <ms>', 'Delay between requests (ms)', '2000-5000')
  .option('--verbose', 'Show detailed output')
  .parse(process.argv);

const options = program.opts();

/**
 * Parse headless option
 */
function parseHeadless(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'false' || lower === '0' || lower === 'no') {
      return false;
    }
  }
  return true;
}

/**
 * Parse methods option
 */
function parseMethods(methodsStr, skipStr) {
  const allMethods = ['html', 'pdf', 'select'];
  let methods = methodsStr ? methodsStr.split(',').map(m => m.trim().toLowerCase()) : allMethods;

  // Filter out invalid methods
  methods = methods.filter(m => allMethods.includes(m));

  // Remove skipped methods
  if (skipStr) {
    const skip = skipStr.split(',').map(m => m.trim().toLowerCase());
    methods = methods.filter(m => !skip.includes(m));
  }

  return methods;
}

/**
 * Validate URL
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
    console.log('║                    SITE TESTER v1.0                            ║');
    console.log('║         Diagnostic Tool for Scraping Feasibility               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');

    // Validate URL
    if (!validateUrl(options.url)) {
      logger.error(`Invalid URL: ${options.url}`);
      process.exit(1);
    }

    // Parse options
    const headless = parseHeadless(options.headless);
    const methods = parseMethods(options.methods, options.skip);
    const testPagination = options.pagination !== false;

    // Parse delay range
    const [minDelay, maxDelay] = options.delay.split('-').map(d => parseInt(d));

    // Show configuration
    logger.info(`Target URL: ${options.url}`);
    logger.info(`Methods to test: ${methods.join(', ')}`);
    logger.info(`Test pagination: ${testPagination ? 'yes' : 'no'}`);
    logger.info(`Headless: ${headless}`);
    logger.info(`Output: ${options.output}`);
    console.log('');

    // Initialize components
    logger.info('Initializing components...');
    browserManager = new BrowserManager(logger);
    const rateLimiter = new RateLimiter(logger, {
      minDelay: minDelay || 2000,
      maxDelay: maxDelay || 5000
    });
    const configLoader = new ConfigLoader(logger);

    // Launch browser
    await browserManager.launch(headless);
    logger.info('Browser launched');
    console.log('');

    // Create orchestrator and run tests
    const orchestrator = new TestOrchestrator({
      browserManager,
      rateLimiter,
      logger,
      configLoader,
      verbose: options.verbose
    });

    // Run diagnostic test
    logger.info('Starting diagnostic tests...');
    console.log('');

    const results = await orchestrator.runTest(options.url, {
      methods,
      testPagination,
      headless
    });

    // Generate reports
    const reporter = new TestReporter({ logger });

    // Terminal output
    reporter.generateTerminalOutput(results);

    // JSON file output
    const jsonPath = reporter.generateJsonFile(results, options.output);
    console.log('');
    logger.info(`Full report saved to: ${jsonPath}`);

    // Close browser
    await browserManager.close();

    console.log('');
    logger.info('Site testing completed successfully');
    process.exit(0);

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
  logger.warn('Received SIGINT, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.warn('Received SIGTERM, shutting down...');
  process.exit(0);
});

// Run
main();

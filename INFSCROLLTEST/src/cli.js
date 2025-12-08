#!/usr/bin/env node

/**
 * CLI for Infinite Scroll Loader
 */

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const InfiniteScrollOrchestrator = require('./orchestrator/orchestrator');
const logger = require('./utils/logger');
const { formatDuration, formatBytes } = require('./utils/helpers');

const program = new Command();

program
  .name('infinite-scroll-loader')
  .description('Load infinite scroll websites to completion')
  .version('1.0.0')
  .argument('<url>', 'URL to load')
  .option('-c, --config <path>', 'Path to config file (YAML or JSON)')
  .option('-o, --output <path>', 'Save HTML to file')
  .option('-s, --selector <selector>', 'CSS selector for items to count')
  .option('--headless <boolean>', 'Run browser in headless mode', 'true')
  .option('--max-scrolls <number>', 'Maximum scroll attempts', '100')
  .option('--timeout <seconds>', 'Maximum duration in seconds', '300')
  .option('--progress-timeout <seconds>', 'Stop after N seconds without progress', '3')
  .option('--detection <method>', 'Detection method: itemCount, scrollHeight, sentinel', 'itemCount')
  .option('--load-more <selectors>', 'Comma-separated load more button selectors')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-q, --quiet', 'Suppress all output except errors')
  .action(async (url, options) => {
    try {
      // Set log level based on options
      if (options.quiet) {
        logger.setLevel('error');
      } else if (options.verbose) {
        logger.setLevel('debug');
      }

      logger.info('Infinite Scroll Loader starting...');
      logger.info(`URL: ${url}`);

      // Build config from CLI options
      const cliConfig = {};

      if (options.selector) {
        cliConfig.itemSelector = options.selector;
      }

      if (options.headless !== undefined) {
        cliConfig.headless = options.headless === 'true';
      }

      if (options.maxScrolls) {
        cliConfig.maxScrollAttempts = parseInt(options.maxScrolls, 10);
      }

      if (options.timeout) {
        cliConfig.maxDurationSeconds = parseInt(options.timeout, 10);
      }

      if (options.progressTimeout) {
        cliConfig.progressTimeout = parseInt(options.progressTimeout, 10);
      }

      if (options.detection) {
        cliConfig.detectionMethod = options.detection;
      }

      if (options.loadMore) {
        cliConfig.loadMoreSelectors = options.loadMore.split(',').map(s => s.trim());
      }

      // Create orchestrator and run
      const orchestrator = new InfiniteScrollOrchestrator();
      const startTime = Date.now();

      let result;
      if (options.config) {
        // Load from config file, merge with CLI options
        const { loadConfig, mergeWithDefaults } = require('./config/config-loader');
        const fileConfig = loadConfig(options.config);
        const mergedConfig = mergeWithDefaults({ ...fileConfig, ...cliConfig });
        result = await orchestrator.loadPage(url, mergedConfig);
      } else {
        // Use CLI options only (with defaults)
        result = await orchestrator.loadWithOptions(url, cliConfig);
      }

      const duration = Date.now() - startTime;

      // Output results
      if (result.success) {
        logger.info('');
        logger.info('=== SCROLL COMPLETED SUCCESSFULLY ===');
        logger.info(`Duration: ${formatDuration(duration)}`);
        logger.info(`Scroll attempts: ${result.stats.scrollAttempts}`);
        logger.info(`Final item count: ${result.stats.finalItemCount || 'N/A'}`);
        logger.info(`Load more clicks: ${result.stats.loadMoreClicks}`);

        if (result.html) {
          logger.info(`HTML size: ${formatBytes(result.html.length)}`);
        }

        // Save HTML to file if requested
        if (options.output && result.html) {
          const outputPath = path.resolve(options.output);
          fs.writeFileSync(outputPath, result.html, 'utf8');
          logger.info(`HTML saved to: ${outputPath}`);
        }

        process.exit(0);
      } else {
        logger.error('');
        logger.error('=== SCROLL FAILED ===');
        logger.error(`Errors: ${result.errors.join(', ')}`);

        if (result.stats) {
          logger.error(`Scroll attempts before failure: ${result.stats.scrollAttempts}`);
        }

        process.exit(1);
      }

    } catch (error) {
      logger.error(`Fatal error: ${error.message}`);
      if (options.verbose) {
        logger.error(error.stack);
      }
      process.exit(1);
    }
  });

// Parse arguments
program.parse();

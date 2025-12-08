/**
 * Infinite Scroll Loader
 * Main module exports
 */

const InfiniteScrollOrchestrator = require('./orchestrator/orchestrator');
const ScrollEngine = require('./engine/scroll-engine');
const ProgressDetector = require('./engine/progress-detector');
const LoadMoreHandler = require('./engine/load-more-handler');
const humanBehavior = require('./engine/human-behavior');

const BrowserAdapter = require('./adapters/browser-adapter');
const PuppeteerAdapter = require('./adapters/puppeteer-adapter');

const { loadConfig, validateConfig, mergeWithDefaults, defaultConfig } = require('./config/config-loader');
const logger = require('./utils/logger');
const helpers = require('./utils/helpers');

// Main export - simple API
module.exports = {
  // High-level API
  InfiniteScrollOrchestrator,

  // Engine components (for advanced usage)
  ScrollEngine,
  ProgressDetector,
  LoadMoreHandler,
  humanBehavior,

  // Browser adapters
  BrowserAdapter,
  PuppeteerAdapter,

  // Configuration
  loadConfig,
  validateConfig,
  mergeWithDefaults,
  defaultConfig,

  // Utilities
  logger,
  helpers,

  // Convenience function
  async loadInfiniteScroll(url, config = null) {
    const orchestrator = new InfiniteScrollOrchestrator();
    return orchestrator.loadPage(url, config);
  }
};

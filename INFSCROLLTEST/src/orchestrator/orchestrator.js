/**
 * Infinite Scroll Orchestrator
 * High-level API for loading infinite scroll pages
 */

const { loadConfig, validateConfig } = require('../config/config-loader');
const PuppeteerAdapter = require('../adapters/puppeteer-adapter');
const ScrollEngine = require('../engine/scroll-engine');
const logger = require('../utils/logger');

class InfiniteScrollOrchestrator {
  constructor() {
    this.adapter = null;
    this.engine = null;
    this.config = null;
  }

  /**
   * Load a page with infinite scroll handling
   * @param {string} url - URL to load
   * @param {string|object} configOrPath - Config file path or config object
   * @returns {object} { success: boolean, html: string, stats: object, errors: array }
   */
  async loadPage(url, configOrPath = null) {
    const errors = [];
    let html = null;
    let stats = {};

    try {
      // Load and validate configuration
      if (typeof configOrPath === 'string') {
        this.config = loadConfig(configOrPath);
      } else if (typeof configOrPath === 'object' && configOrPath !== null) {
        const { mergeWithDefaults } = require('../config/config-loader');
        this.config = mergeWithDefaults(configOrPath);
      } else {
        this.config = loadConfig(null);
      }

      validateConfig(this.config);
      logger.info(`Configuration loaded and validated`);

      // Create browser adapter
      this.adapter = new PuppeteerAdapter();
      await this.adapter.init(this.config);
      logger.info(`Browser initialized (headless: ${this.config.headless})`);

      // Navigate to URL
      logger.info(`Navigating to: ${url}`);
      await this.adapter.navigateTo(url);
      logger.info(`Page loaded successfully`);

      // Wait for initial content
      if (this.config.itemSelector) {
        const hasItems = await this.adapter.waitForElement(this.config.itemSelector, 10000);
        if (!hasItems) {
          logger.warn(`Item selector "${this.config.itemSelector}" not found after 10 seconds`);
        }
      }

      // Create and run scroll engine
      this.engine = new ScrollEngine(this.adapter, this.config, logger);
      const result = await this.engine.run();

      html = result.html;
      stats = result.stats;

      if (!result.success) {
        errors.push(result.error);
      }

      return {
        success: result.success && errors.length === 0,
        html,
        stats,
        errors
      };

    } catch (error) {
      logger.error(`Orchestrator error: ${error.message}`);
      errors.push(error.message);

      return {
        success: false,
        html,
        stats,
        errors
      };

    } finally {
      // Always close browser
      await this.close();
    }
  }

  /**
   * Load a page with custom scroll behavior
   * @param {string} url - URL to load
   * @param {object} options - Options for this specific load
   * @returns {object} Result object
   */
  async loadWithOptions(url, options = {}) {
    const config = {
      itemSelector: options.itemSelector || 'body *',
      scrollContainer: options.scrollContainer || 'window',
      maxScrollAttempts: options.maxScrollAttempts || 50,
      maxDurationSeconds: options.maxDurationSeconds || 120,
      progressTimeout: options.progressTimeout || 3,
      detectionMethod: options.detectionMethod || 'scrollHeight',
      headless: options.headless !== false,
      loadMoreSelectors: options.loadMoreSelectors || [],
      ...options
    };

    return this.loadPage(url, config);
  }

  /**
   * Close the browser and clean up
   */
  async close() {
    if (this.adapter) {
      try {
        await this.adapter.close();
        logger.debug('Browser closed');
      } catch (error) {
        logger.error(`Error closing browser: ${error.message}`);
      }
      this.adapter = null;
    }
    this.engine = null;
  }

  /**
   * Stop the current scroll operation
   */
  stop() {
    if (this.engine) {
      this.engine.stop();
    }
  }
}

module.exports = InfiniteScrollOrchestrator;

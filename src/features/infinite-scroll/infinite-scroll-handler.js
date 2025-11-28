/**
 * InfiniteScrollHandler
 *
 * Orchestrates the scroll loop, extraction, and deduplication for pages
 * that load additional content dynamically as the user scrolls.
 *
 * Uses ContentTracker for deduplication and ScrollDetector for robust
 * content load detection.
 */

const ContentTracker = require('./content-tracker');
const ScrollDetector = require('./scroll-detector');

class InfiniteScrollHandler {
  /**
   * Create an InfiniteScrollHandler
   * @param {Object} page - Puppeteer page object
   * @param {Object} config - Configuration object
   * @param {Object} logger - Logger instance
   */
  constructor(page, config, logger) {
    this.page = page;
    this.config = config;
    this.logger = logger;

    // Configuration with defaults
    const infiniteScrollConfig = config.infiniteScroll || {};
    this.maxScrollAttempts = infiniteScrollConfig.maxScrollAttempts || 50;
    this.scrollDelay = infiniteScrollConfig.scrollDelay || 1500;
    this.noNewContentThreshold = infiniteScrollConfig.noNewContentThreshold || 3;
    this.scrollStrategy = infiniteScrollConfig.scrollStrategy || 'viewport';
    this.scrollPixels = infiniteScrollConfig.scrollPixels || 800;
    this.networkIdleTimeout = infiniteScrollConfig.networkIdleTimeout || 5000;
    this.minCardIncrement = infiniteScrollConfig.minCardIncrement || 1;

    // Get card/container selector
    this.containerSelector = config.cardSelector ||
      config.selectors?.container ||
      null;

    // Initialize helper modules
    this.contentTracker = new ContentTracker();
    this.scrollDetector = new ScrollDetector(page, logger, {
      scrollDelay: this.scrollDelay,
      networkIdleTimeout: this.networkIdleTimeout
    });

    // Tracking state
    this.scrollAttempts = 0;
    this.startTime = null;
    this.stoppedReason = null;
  }

  /**
   * Detect if page uses infinite scroll
   * @returns {Promise<boolean>}
   */
  async detectInfiniteScroll() {
    try {
      const cardSelector = this.containerSelector;
      if (!cardSelector) return false;

      // Get initial card count
      const initialCount = await this.page.$$eval(cardSelector, cards => cards.length);

      // Scroll down
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      // Wait for potential new content
      await this.scrollDetector.waitForContentLoad();

      // Check if more cards loaded
      const newCount = await this.page.$$eval(cardSelector, cards => cards.length);

      // Scroll back to top
      await this.page.evaluate(() => {
        window.scrollTo(0, 0);
      });

      const hasInfiniteScroll = newCount > initialCount;
      this.logger.info(`Infinite scroll detection: ${hasInfiniteScroll ? 'YES' : 'NO'} (${initialCount} -> ${newCount} cards)`);

      return hasInfiniteScroll;
    } catch (error) {
      this.logger.warn(`Infinite scroll detection failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Scroll and collect all content
   * @param {Function} extractFn - Function to extract data from current view
   * @param {number} maxItems - Maximum items to collect
   * @returns {Promise<Object>} - Object with contacts array and stats
   */
  async scrollAndCollect(extractFn, maxItems = Infinity) {
    this.startTime = Date.now();
    this.scrollAttempts = 0;
    this.stoppedReason = null;
    this.contentTracker.clear();

    const allContacts = [];
    let noNewContentCount = 0;
    let previousHeight = 0;
    let previousCardCount = 0;

    this.logger.info('Starting infinite scroll collection...');

    // Get initial state
    previousHeight = await this.scrollDetector.getPageHeight();
    if (this.containerSelector) {
      previousCardCount = await this.page.$$eval(this.containerSelector, els => els.length)
        .catch(() => 0);
    }

    this.logger.info(`Initial state: ${previousCardCount} cards, height ${previousHeight}px`);

    while (!this.hasReachedEnd(allContacts.length, noNewContentCount, maxItems)) {
      // Extract current visible items
      const currentItems = await extractFn();
      let newItemsFound = 0;

      for (const item of currentItems) {
        // Check if this item is new using ContentTracker
        if (this.contentTracker.checkAndMark(item)) {
          allContacts.push(item);
          newItemsFound++;

          if (allContacts.length >= maxItems) {
            this.logger.info(`Reached max items limit (${maxItems})`);
            this.stoppedReason = 'maxItems';
            break;
          }
        }
      }

      // Log progress
      this.logger.debug?.(
        `Scroll ${this.scrollAttempts + 1}: Found ${newItemsFound} new items (total: ${allContacts.length})`
      );
      this.logger.info(
        `Scroll #${this.scrollAttempts + 1}: ${newItemsFound} new, ${allContacts.length} total`
      );

      // Check if we got new content
      if (newItemsFound === 0) {
        noNewContentCount++;

        if (noNewContentCount >= this.noNewContentThreshold) {
          this.logger.info(`No new content after ${this.noNewContentThreshold} scrolls, stopping`);
          this.stoppedReason = 'noNewContent';
          break;
        }
      } else {
        noNewContentCount = 0;
      }

      // Check for max items
      if (allContacts.length >= maxItems) {
        this.stoppedReason = 'maxItems';
        break;
      }

      // Perform scroll
      await this.performScroll();

      // Wait for content to load
      const loadResult = await this.scrollDetector.waitForContentLoad({
        previousHeight
      });

      // Get current state
      const currentHeight = await this.scrollDetector.getPageHeight();
      let currentCardCount = 0;
      if (this.containerSelector) {
        currentCardCount = await this.page.$$eval(this.containerSelector, els => els.length)
          .catch(() => 0);
      }

      // Check if page height and card count are unchanged
      if (currentHeight === previousHeight &&
          currentCardCount === previousCardCount &&
          noNewContentCount > 0) {
        this.logger.info('Page height and card count unchanged, likely reached end');
        this.stoppedReason = 'noChange';
        break;
      }

      previousHeight = currentHeight;
      previousCardCount = currentCardCount;
      this.scrollAttempts++;
    }

    // Scroll back to top for visual confirmation
    await this.page.evaluate(() => window.scrollTo(0, 0));
    await this.sleep(500);

    if (!this.stoppedReason && this.scrollAttempts >= this.maxScrollAttempts) {
      this.stoppedReason = 'maxScrolls';
    }

    const totalTime = Date.now() - this.startTime;
    const stats = this.getStats();

    this.logger.info(`Infinite scroll complete: ${allContacts.length} total items collected`);
    this.logger.info(`Stats: ${JSON.stringify(stats)}`);

    return {
      contacts: allContacts,
      stats: {
        ...stats,
        totalTimeElapsed: totalTime
      }
    };
  }

  /**
   * Perform a scroll action based on configured strategy
   * @returns {Promise<void>}
   */
  async performScroll() {
    switch (this.scrollStrategy) {
      case 'bottom':
        // Scroll to absolute bottom
        await this.page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        break;

      case 'fixed':
        // Scroll by fixed pixels
        await this.page.evaluate((pixels) => {
          window.scrollBy(0, pixels);
        }, this.scrollPixels);
        break;

      case 'viewport':
      default:
        // Scroll by viewport height (with 20% overlap)
        await this.page.evaluate(() => {
          window.scrollBy(0, window.innerHeight * 0.8);
        });
        break;
    }
  }

  /**
   * Check if we've reached the end condition
   * @param {number} itemCount - Current item count
   * @param {number} noNewContentCount - Consecutive scrolls without new content
   * @param {number} maxItems - Maximum items to collect
   * @returns {boolean} - True if should stop scrolling
   */
  hasReachedEnd(itemCount, noNewContentCount, maxItems) {
    // Check max scroll attempts
    if (this.scrollAttempts >= this.maxScrollAttempts) {
      this.stoppedReason = 'maxScrolls';
      return true;
    }

    // Check no new content threshold
    if (noNewContentCount >= this.noNewContentThreshold) {
      this.stoppedReason = 'noNewContent';
      return true;
    }

    // Check max items
    if (itemCount >= maxItems) {
      this.stoppedReason = 'maxItems';
      return true;
    }

    return false;
  }

  /**
   * Get unique key for an item to detect duplicates
   * @param {Object} item - Item to generate key for
   * @returns {string}
   * @deprecated Use ContentTracker.getContactKey instead
   */
  getItemKey(item) {
    return this.contentTracker.getContactKey(item);
  }

  /**
   * Wait for new content to load after scroll
   * @returns {Promise<void>}
   * @deprecated Use ScrollDetector.waitForContentLoad instead
   */
  async waitForNewContent() {
    await this.scrollDetector.waitForContentLoad();
  }

  /**
   * Reset state for new page
   */
  reset() {
    this.contentTracker.clear();
    this.scrollAttempts = 0;
    this.startTime = null;
    this.stoppedReason = null;
  }

  /**
   * Get statistics about the scroll session
   * @returns {Object}
   */
  getStats() {
    const trackerStats = this.contentTracker.getStats();

    return {
      scrollsPerformed: this.scrollAttempts,
      uniqueContactsFound: trackerStats.uniqueCount,
      duplicatesSkipped: trackerStats.duplicatesSkipped,
      maxScrollAttempts: this.maxScrollAttempts,
      stoppedReason: this.stoppedReason || 'unknown'
    };
  }

  /**
   * Update configuration dynamically
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    if (newConfig.scrollDelay !== undefined) {
      this.scrollDelay = newConfig.scrollDelay;
      this.scrollDetector.updateConfig({ scrollDelay: newConfig.scrollDelay });
    }
    if (newConfig.maxScrollAttempts !== undefined) {
      this.maxScrollAttempts = newConfig.maxScrollAttempts;
    }
    if (newConfig.noNewContentThreshold !== undefined) {
      this.noNewContentThreshold = newConfig.noNewContentThreshold;
    }
    if (newConfig.scrollStrategy !== undefined) {
      this.scrollStrategy = newConfig.scrollStrategy;
    }
    if (newConfig.scrollPixels !== undefined) {
      this.scrollPixels = newConfig.scrollPixels;
    }
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = InfiniteScrollHandler;

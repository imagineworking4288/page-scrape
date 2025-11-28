/**
 * ScrollDetector
 *
 * Detects when new content has finished loading after scroll.
 * Combines network idle detection with configurable delays
 * to prevent false positives from slow networks.
 */

class ScrollDetector {
  /**
   * Create a ScrollDetector
   * @param {Object} page - Puppeteer page object
   * @param {Object} logger - Logger instance
   * @param {Object} config - Configuration options
   * @param {number} config.scrollDelay - Minimum wait time after scroll (default 1500ms)
   * @param {number} config.networkIdleTimeout - Max time to wait for network idle (default 5000ms)
   */
  constructor(page, logger, config = {}) {
    this.page = page;
    this.logger = logger;

    // Configuration with defaults
    this.scrollDelay = config.scrollDelay || 1500;
    this.networkIdleTimeout = config.networkIdleTimeout || 5000;
  }

  /**
   * Wait for content to load after a scroll action
   * Combines network idle detection with minimum delay
   * @param {Object} options - Additional options
   * @param {number} options.previousHeight - Page height before scroll (for comparison)
   * @returns {Promise<Object>} - Load status object
   */
  async waitForContentLoad(options = {}) {
    const startTime = Date.now();
    let networkIdleReached = false;

    try {
      // Step 1: Try to wait for network idle with timeout
      await Promise.race([
        this.page.waitForNetworkIdle({ idleTime: 500, timeout: this.networkIdleTimeout })
          .then(() => { networkIdleReached = true; }),
        new Promise(resolve => setTimeout(resolve, this.networkIdleTimeout))
      ]);

      if (!networkIdleReached) {
        this.logger.debug?.('Network idle timeout reached, continuing anyway');
      }

    } catch (error) {
      // Network idle might not be available or might timeout - that's OK
      this.logger.debug?.(`Network idle wait failed: ${error.message}`);
    }

    // Step 2: Always add minimum configured delay to allow DOM updates
    const elapsedTime = Date.now() - startTime;
    const remainingDelay = Math.max(0, this.scrollDelay - elapsedTime);

    if (remainingDelay > 0) {
      await this.sleep(remainingDelay);
    }

    // Step 3: Check if page height changed (indicator of new content)
    let heightIncreased = false;
    if (options.previousHeight !== undefined) {
      const currentHeight = await this.getPageHeight();
      heightIncreased = currentHeight > options.previousHeight;
    }

    const totalTime = Date.now() - startTime;

    return {
      loadComplete: true,
      networkIdleReached,
      heightIncreased,
      timeElapsed: totalTime
    };
  }

  /**
   * Wait for a specific selector to appear or increase in count
   * @param {string} selector - CSS selector to watch
   * @param {number} previousCount - Previous count of elements
   * @param {number} timeout - Maximum wait time (default 5000ms)
   * @returns {Promise<Object>} - Result with new count and success status
   */
  async waitForElementCountIncrease(selector, previousCount, timeout = 5000) {
    const startTime = Date.now();

    try {
      await this.page.waitForFunction(
        (sel, prevCount) => {
          const elements = document.querySelectorAll(sel);
          return elements.length > prevCount;
        },
        { timeout },
        selector,
        previousCount
      );

      const newCount = await this.page.$$eval(selector, els => els.length);

      return {
        success: true,
        previousCount,
        newCount,
        countIncreased: newCount > previousCount,
        timeElapsed: Date.now() - startTime
      };

    } catch (error) {
      // Timeout is OK - might have reached the end
      const currentCount = await this.page.$$eval(selector, els => els.length).catch(() => previousCount);

      return {
        success: false,
        previousCount,
        newCount: currentCount,
        countIncreased: currentCount > previousCount,
        timeElapsed: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Get current page scroll height
   * @returns {Promise<number>} - Page scroll height in pixels
   */
  async getPageHeight() {
    return await this.page.evaluate(() => document.body.scrollHeight);
  }

  /**
   * Get current scroll position
   * @returns {Promise<number>} - Current scroll position in pixels
   */
  async getScrollPosition() {
    return await this.page.evaluate(() => window.scrollY || window.pageYOffset);
  }

  /**
   * Check if at bottom of page
   * @param {number} threshold - Pixels from bottom to consider "at bottom" (default 100)
   * @returns {Promise<boolean>} - True if at or near bottom
   */
  async isAtBottom(threshold = 100) {
    return await this.page.evaluate((t) => {
      const scrollTop = window.scrollY || window.pageYOffset;
      const scrollHeight = document.body.scrollHeight;
      const clientHeight = window.innerHeight;
      return scrollTop + clientHeight >= scrollHeight - t;
    }, threshold);
  }

  /**
   * Get viewport information
   * @returns {Promise<Object>} - Viewport dimensions and scroll info
   */
  async getViewportInfo() {
    return await this.page.evaluate(() => ({
      scrollTop: window.scrollY || window.pageYOffset,
      scrollHeight: document.body.scrollHeight,
      clientHeight: window.innerHeight,
      clientWidth: window.innerWidth
    }));
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update configuration
   * @param {Object} config - New configuration options
   */
  updateConfig(config) {
    if (config.scrollDelay !== undefined) {
      this.scrollDelay = config.scrollDelay;
    }
    if (config.networkIdleTimeout !== undefined) {
      this.networkIdleTimeout = config.networkIdleTimeout;
    }
  }
}

module.exports = ScrollDetector;

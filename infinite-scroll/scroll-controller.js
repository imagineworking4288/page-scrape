/**
 * ScrollController - Simple scroll-to-bottom handler
 *
 * Strategy: Keep scrolling until page stops growing
 * No extraction during scroll - just load content
 */

class ScrollController {
  constructor(page, logger, options = {}) {
    this.page = page;
    this.logger = logger;

    // Configuration
    this.maxScrolls = options.maxScrolls || 50;
    this.scrollDelay = options.scrollDelay || 1500;
    this.noChangeThreshold = options.noChangeThreshold || 3;
  }

  /**
   * Scroll to end of page
   * Stops when page height doesn't change for 3 consecutive scrolls
   * @returns {Object} - { scrollsPerformed, finalHeight }
   */
  async scrollToEnd() {
    console.log('ScrollController: Starting scroll to end...');
    this.logger.info('Starting scroll to end...');

    let scrollAttempts = 0;
    let noChangeCount = 0;
    let previousHeight = await this.getPageHeight();

    // If initial height is 0, page might not be ready - wait and retry
    if (previousHeight === 0) {
      this.logger.warn('Initial page height is 0, waiting for page to be ready...');
      await this.sleep(2000);
      previousHeight = await this.getPageHeight();

      if (previousHeight === 0) {
        this.logger.error('Page height still 0 after waiting, aborting scroll');
        return {
          scrollsPerformed: 0,
          finalHeight: 0,
          error: 'Page not ready'
        };
      }
    }

    console.log(`Initial page height: ${previousHeight}px`);
    this.logger.info(`Initial page height: ${previousHeight}px`);

    while (scrollAttempts < this.maxScrolls) {
      // Try clicking "Load More" button first
      const clickedLoadMore = await this.clickLoadMoreIfExists();
      if (clickedLoadMore) {
        this.logger.info(`Clicked "Load More" button (scroll ${scrollAttempts + 1})`);
      }

      // Scroll down one viewport
      await this.performScroll();
      await this.sleep(this.scrollDelay);

      // Check if page grew
      const currentHeight = await this.getPageHeight();

      this.logger.info(
        `Scroll ${scrollAttempts + 1}/${this.maxScrolls}: ` +
        `${previousHeight}px -> ${currentHeight}px ` +
        `(${currentHeight > previousHeight ? '+' : ''}${currentHeight - previousHeight}px)`
      );

      if (currentHeight === previousHeight) {
        noChangeCount++;
        this.logger.info(`No height change (${noChangeCount}/${this.noChangeThreshold})`);

        if (noChangeCount >= this.noChangeThreshold) {
          this.logger.info('Page stopped growing, scroll complete');
          break;
        }
      } else {
        noChangeCount = 0;
      }

      previousHeight = currentHeight;
      scrollAttempts++;
    }

    if (scrollAttempts >= this.maxScrolls) {
      console.log(`WARNING: Reached max scrolls (${this.maxScrolls})`);
      this.logger.warn(`Reached max scrolls (${this.maxScrolls})`);
    }

    console.log(`ScrollController complete: ${scrollAttempts} scrolls, final height: ${previousHeight}px`);

    return {
      scrollsPerformed: scrollAttempts,
      finalHeight: previousHeight
    };
  }

  /**
   * Get current page scroll height
   * Includes retry logic to handle "Requesting main frame too early!" errors
   */
  async getPageHeight() {
    const maxRetries = 3;
    const retryDelay = 500;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const height = await this.page.evaluate(() => document.body.scrollHeight);
        return height;
      } catch (error) {
        this.logger.warn(`getPageHeight failed (attempt ${attempt}/${maxRetries}): ${error.message}`);

        if (attempt < maxRetries) {
          await this.sleep(retryDelay);
        } else {
          this.logger.error(`getPageHeight failed after ${maxRetries} attempts`);
          // Return a safe default rather than crashing
          return 0;
        }
      }
    }

    return 0;
  }

  /**
   * Scroll down by 80% of viewport height
   * Includes error handling to prevent scroll failures from crashing
   */
  async performScroll() {
    try {
      await this.page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 0.8);
      });
    } catch (error) {
      this.logger.warn(`performScroll failed: ${error.message}`);
      // Wait a bit and try once more
      await this.sleep(500);
      try {
        await this.page.evaluate(() => {
          window.scrollBy(0, window.innerHeight * 0.8);
        });
      } catch (retryError) {
        this.logger.error(`performScroll retry failed: ${retryError.message}`);
        // Continue anyway - scroll might have worked partially
      }
    }
  }

  /**
   * Try to click "Load More" button if it exists
   * @returns {boolean} - True if button was clicked
   */
  async clickLoadMoreIfExists() {
    const selectors = [
      'button[class*="load-more"]',
      'button[class*="loadmore"]',
      'button[class*="show-more"]',
      'a[class*="load-more"]',
      '[data-load-more]',
      '.load-more',
      '#load-more'
    ];

    for (const selector of selectors) {
      try {
        const button = await this.page.$(selector);
        if (button) {
          const isVisible = await this.page.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   el.offsetParent !== null;
          }, button);

          if (isVisible) {
            await button.click();
            return true;
          }
        }
      } catch (error) {
        // Selector might not work, continue
        continue;
      }
    }

    return false;
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ScrollController;

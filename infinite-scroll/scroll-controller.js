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
   */
  async getPageHeight() {
    return await this.page.evaluate(() => document.body.scrollHeight);
  }

  /**
   * Scroll down by 80% of viewport height
   */
  async performScroll() {
    await this.page.evaluate(() => {
      window.scrollBy(0, window.innerHeight * 0.8);
    });
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

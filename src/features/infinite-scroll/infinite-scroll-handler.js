/**
 * InfiniteScrollHandler
 *
 * Handles infinite scroll detection and content extraction for pages
 * that load additional content dynamically as the user scrolls.
 */

class InfiniteScrollHandler {
  constructor(page, config, logger) {
    this.page = page;
    this.config = config;
    this.logger = logger;
    this.seenContent = new Set();
    this.scrollAttempts = 0;
    this.maxScrollAttempts = config.infiniteScroll?.maxScrollAttempts || 50;
    this.scrollDelay = config.infiniteScroll?.scrollDelay || 1500;
    this.noNewContentThreshold = config.infiniteScroll?.noNewContentThreshold || 3;
  }

  /**
   * Detect if page uses infinite scroll
   * @returns {Promise<boolean>}
   */
  async detectInfiniteScroll() {
    try {
      const cardSelector = this.config.cardSelector;
      if (!cardSelector) return false;

      // Get initial card count
      const initialCount = await this.page.$$eval(cardSelector, cards => cards.length);

      // Scroll down
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      // Wait for potential new content
      await this.page.waitForTimeout(this.scrollDelay);

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
   * @returns {Promise<Array>}
   */
  async scrollAndCollect(extractFn, maxItems = Infinity) {
    const allItems = [];
    let noNewContentCount = 0;
    let previousHeight = 0;

    this.logger.info('Starting infinite scroll collection...');

    while (this.scrollAttempts < this.maxScrollAttempts) {
      // Extract current visible items
      const currentItems = await extractFn();
      let newItemsFound = 0;

      for (const item of currentItems) {
        const itemKey = this.getItemKey(item);
        if (!this.seenContent.has(itemKey)) {
          this.seenContent.add(itemKey);
          allItems.push(item);
          newItemsFound++;

          if (allItems.length >= maxItems) {
            this.logger.info(`Reached max items limit (${maxItems})`);
            return allItems;
          }
        }
      }

      this.logger.debug(`Scroll ${this.scrollAttempts + 1}: Found ${newItemsFound} new items (total: ${allItems.length})`);

      // Check if we got new content
      if (newItemsFound === 0) {
        noNewContentCount++;
        if (noNewContentCount >= this.noNewContentThreshold) {
          this.logger.info(`No new content after ${this.noNewContentThreshold} scrolls, stopping`);
          break;
        }
      } else {
        noNewContentCount = 0;
      }

      // Scroll down
      const currentHeight = await this.page.evaluate(() => document.body.scrollHeight);

      if (currentHeight === previousHeight && noNewContentCount > 0) {
        this.logger.info('Page height unchanged, likely reached end');
        break;
      }

      previousHeight = currentHeight;

      await this.page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 0.8);
      });

      // Wait for content to load
      await this.waitForNewContent();
      this.scrollAttempts++;
    }

    this.logger.info(`Infinite scroll complete: ${allItems.length} total items collected`);
    return allItems;
  }

  /**
   * Wait for new content to load after scroll
   * @returns {Promise<void>}
   */
  async waitForNewContent() {
    const cardSelector = this.config.cardSelector;

    try {
      // Wait for network to be idle or timeout
      await Promise.race([
        this.page.waitForNetworkIdle({ idleTime: 500, timeout: this.scrollDelay }),
        new Promise(resolve => setTimeout(resolve, this.scrollDelay))
      ]);

      // Additional wait for DOM updates if card selector is provided
      if (cardSelector) {
        const currentCount = await this.page.$$eval(cardSelector, cards => cards.length);
        await this.page.waitForFunction(
          (selector, prevCount) => {
            const cards = document.querySelectorAll(selector);
            return cards.length > prevCount;
          },
          { timeout: 1000 },
          cardSelector,
          currentCount
        ).catch(() => {
          // Timeout is OK - might have reached the end
        });
      }
    } catch (error) {
      // Ignore timeout errors
    }
  }

  /**
   * Generate unique key for an item to detect duplicates
   * @param {Object} item - Item to generate key for
   * @returns {string}
   */
  getItemKey(item) {
    // Use email as primary key if available
    if (item.email) {
      return `email:${item.email.toLowerCase()}`;
    }
    // Fall back to name + phone
    if (item.name && item.phone) {
      return `name-phone:${item.name.toLowerCase()}-${item.phone}`;
    }
    // Fall back to just name
    if (item.name) {
      return `name:${item.name.toLowerCase()}`;
    }
    // Last resort: stringify the item
    return `item:${JSON.stringify(item)}`;
  }

  /**
   * Reset state for new page
   */
  reset() {
    this.seenContent.clear();
    this.scrollAttempts = 0;
  }

  /**
   * Get statistics about the scroll session
   * @returns {Object}
   */
  getStats() {
    return {
      scrollAttempts: this.scrollAttempts,
      uniqueItemsFound: this.seenContent.size,
      maxScrollAttempts: this.maxScrollAttempts
    };
  }
}

module.exports = InfiniteScrollHandler;

/**
 * ScrollController - Improved scroll-to-bottom handler
 *
 * Strategy: Keep scrolling until page stops growing AND no new cards load
 * Includes diagnostics for container detection and card counting
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
   * Detect which element is actually scrollable on the page
   * @returns {Promise<Array>} - Info about scrollable elements
   */
  async detectScrollContainer() {
    try {
      const containerInfo = await this.page.evaluate(() => {
        const results = [];

        // Check window/document
        results.push({
          type: 'window',
          selector: 'document',
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: window.innerHeight,
          scrollable: document.documentElement.scrollHeight > window.innerHeight
        });

        // Check body
        results.push({
          type: 'body',
          selector: 'body',
          scrollHeight: document.body.scrollHeight,
          clientHeight: document.body.clientHeight,
          scrollable: document.body.scrollHeight > document.body.clientHeight
        });

        // Check all elements with overflow scroll/auto
        document.querySelectorAll('*').forEach(el => {
          const style = window.getComputedStyle(el);
          const overflowY = style.overflowY;

          if ((overflowY === 'scroll' || overflowY === 'auto') &&
              el.scrollHeight > el.clientHeight + 50) { // 50px threshold
            const selector = el.id ? `#${el.id}` :
                           el.className ? `.${el.className.split(' ')[0]}` :
                           el.tagName.toLowerCase();
            results.push({
              type: 'container',
              selector: selector,
              scrollHeight: el.scrollHeight,
              clientHeight: el.clientHeight,
              scrollable: true,
              overflowY: overflowY
            });
          }
        });

        return results;
      });

      console.log('\n=== SCROLLABLE ELEMENTS DETECTED ===');
      this.logger.info('=== SCROLLABLE ELEMENTS DETECTED ===');
      containerInfo.forEach((info, idx) => {
        const msg = `${idx + 1}. ${info.type}: ${info.selector} - Height: ${info.scrollHeight}px, Visible: ${info.clientHeight}px, Scrollable: ${info.scrollable}`;
        console.log(msg);
        this.logger.info(msg);
      });

      return containerInfo;
    } catch (error) {
      this.logger.error(`detectScrollContainer failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Count contact cards currently visible on page
   * @returns {Promise<Object>} - { count, selector }
   */
  async countContactCards() {
    try {
      const result = await this.page.evaluate(() => {
        // Try multiple selector patterns for contact cards
        const selectors = [
          '[class*="lawyer"]',
          '[class*="Lawyer"]',
          '[class*="attorney"]',
          '[class*="Attorney"]',
          '[class*="professional"]',
          '[class*="card"]',
          '[class*="profile"]',
          '[class*="member"]',
          '[class*="person"]',
          '[class*="contact"]',
          '[class*="result"]',
          '[class*="item"]',
          'li[class]',
          'article',
          '.result',
          '[data-lawyer]',
          '[data-attorney]',
          '[data-profile]',
          // Sullivan & Cromwell specific patterns
          '[class*="listing"]',
          '[class*="Listing"]',
          '[class*="row"]'
        ];

        let maxCount = 0;
        let bestSelector = null;

        for (const selector of selectors) {
          try {
            const elements = document.querySelectorAll(selector);
            // Filter out containers that are too large (likely wrapper divs)
            const validElements = Array.from(elements).filter(el => {
              const rect = el.getBoundingClientRect();
              // Cards should be smaller than viewport, not too tiny
              return rect.height > 50 && rect.height < window.innerHeight * 0.8;
            });

            if (validElements.length > maxCount && validElements.length < 1000) {
              maxCount = validElements.length;
              bestSelector = selector;
            }
          } catch (e) {
            // Invalid selector, skip
          }
        }

        // Also check for mailto links as a proxy for contact count
        const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]');
        if (mailtoLinks.length > maxCount) {
          maxCount = mailtoLinks.length;
          bestSelector = 'a[href^="mailto:"]';
        }

        // Check for "Email" text links (Sullivan & Cromwell pattern)
        const emailTextLinks = Array.from(document.querySelectorAll('a')).filter(a => {
          const text = a.textContent.trim().toLowerCase();
          return text === 'email' || text === 'e-mail';
        });
        if (emailTextLinks.length > maxCount) {
          maxCount = emailTextLinks.length;
          bestSelector = 'a:contains("Email")';
        }

        return {
          count: maxCount,
          selector: bestSelector
        };
      });

      return result;
    } catch (error) {
      this.logger.error(`countContactCards failed: ${error.message}`);
      return { count: 0, selector: null };
    }
  }

  /**
   * Scroll to end of page (IMPROVED VERSION)
   * Detects scrollable container, counts cards, uses longer delays
   * @returns {Object} - { scrollsPerformed, finalHeight, cardsFound }
   */
  async scrollToEnd() {
    console.log('\n' + '='.repeat(60));
    console.log('ScrollController: Starting improved scroll to end...');
    console.log('='.repeat(60));
    this.logger.info('Starting improved scroll to end...');

    // PHASE 1: Detect scrollable container
    console.log('\n=== PHASE 1: CONTAINER DETECTION ===');
    await this.detectScrollContainer();

    // PHASE 2: Initial card count
    console.log('\n=== PHASE 2: INITIAL CARD COUNT ===');
    let cardData = await this.countContactCards();
    console.log(`Initial cards found: ${cardData.count} (using selector: ${cardData.selector})`);
    this.logger.info(`Initial cards found: ${cardData.count} (selector: ${cardData.selector})`);

    let previousCardCount = cardData.count;
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
          cardsFound: cardData.count,
          error: 'Page not ready'
        };
      }
    }

    console.log(`Initial page height: ${previousHeight}px`);
    this.logger.info(`Initial page height: ${previousHeight}px`);

    // PHASE 3: Scroll loop with card counting
    console.log('\n=== PHASE 3: SCROLLING ===');
    let scrollAttempts = 0;
    let noChangeCount = 0;

    while (scrollAttempts < this.maxScrolls) {
      // Try clicking "Load More" button first
      const clickedLoadMore = await this.clickLoadMoreIfExists();
      if (clickedLoadMore) {
        console.log(`Clicked "Load More" button (scroll ${scrollAttempts + 1})`);
        this.logger.info(`Clicked "Load More" button (scroll ${scrollAttempts + 1})`);
      }

      // Perform scroll
      await this.performScroll();

      // IMPORTANT: Wait for scroll delay + extra time for network/rendering
      await this.sleep(this.scrollDelay);
      await this.sleep(1500); // Additional 1.5s for content to load

      // Check both height AND card count
      const currentHeight = await this.getPageHeight();
      cardData = await this.countContactCards();
      const currentCardCount = cardData.count;

      // Calculate changes
      const heightChange = currentHeight - previousHeight;
      const cardChange = currentCardCount - previousCardCount;

      const statusMsg =
        `Scroll ${scrollAttempts + 1}/${this.maxScrolls}: ` +
        `Height: ${previousHeight}px → ${currentHeight}px (${heightChange >= 0 ? '+' : ''}${heightChange}px) | ` +
        `Cards: ${previousCardCount} → ${currentCardCount} (${cardChange >= 0 ? '+' : ''}${cardChange})`;

      console.log(statusMsg);
      this.logger.info(statusMsg);

      // Check if EITHER height or cards increased
      if (heightChange === 0 && cardChange === 0) {
        noChangeCount++;
        console.log(`  No change detected (${noChangeCount}/${this.noChangeThreshold})`);
        this.logger.info(`No change (${noChangeCount}/${this.noChangeThreshold})`);

        if (noChangeCount >= this.noChangeThreshold) {
          console.log('  No new content loading, scroll complete');
          this.logger.info('No new content loading, scroll complete');
          break;
        }
      } else {
        // Reset counter if we got new content
        noChangeCount = 0;
        if (cardChange > 0) {
          console.log(`  ✓ ${cardChange} new cards loaded!`);
        }
      }

      previousHeight = currentHeight;
      previousCardCount = currentCardCount;
      scrollAttempts++;
    }

    if (scrollAttempts >= this.maxScrolls) {
      console.log(`\nWARNING: Reached max scrolls (${this.maxScrolls})`);
      this.logger.warn(`Reached max scrolls (${this.maxScrolls})`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('ScrollController complete:');
    console.log(`  - Scrolls performed: ${scrollAttempts}`);
    console.log(`  - Final height: ${previousHeight}px`);
    console.log(`  - Total cards found: ${previousCardCount}`);
    console.log('='.repeat(60));

    return {
      scrollsPerformed: scrollAttempts,
      finalHeight: previousHeight,
      cardsFound: previousCardCount
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
          return 0;
        }
      }
    }

    return 0;
  }

  /**
   * Scroll down by 80% of viewport height
   * Tries both window scroll and container scroll
   */
  async performScroll() {
    try {
      await this.page.evaluate(() => {
        // Scroll window
        window.scrollBy(0, window.innerHeight * 0.8);

        // Also try scrolling any scrollable containers
        document.querySelectorAll('*').forEach(el => {
          const style = window.getComputedStyle(el);
          if ((style.overflowY === 'scroll' || style.overflowY === 'auto') &&
              el.scrollHeight > el.clientHeight) {
            el.scrollTop = el.scrollTop + (el.clientHeight * 0.8);
          }
        });
      });
    } catch (error) {
      this.logger.warn(`performScroll failed: ${error.message}`);
      await this.sleep(500);
      try {
        await this.page.evaluate(() => {
          window.scrollBy(0, window.innerHeight * 0.8);
        });
      } catch (retryError) {
        this.logger.error(`performScroll retry failed: ${retryError.message}`);
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
      'button[class*="showmore"]',
      'a[class*="load-more"]',
      'a[class*="show-more"]',
      '[data-load-more]',
      '[data-action="load-more"]',
      '.load-more',
      '.show-more',
      '#load-more',
      '#show-more',
      // Sullivan & Cromwell specific
      'button[class*="more"]',
      'a[class*="more"]'
    ];

    for (const selector of selectors) {
      try {
        const button = await this.page.$(selector);
        if (button) {
          const isVisible = await this.page.evaluate(el => {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   el.offsetParent !== null &&
                   rect.width > 0 &&
                   rect.height > 0;
          }, button);

          if (isVisible) {
            await button.click();
            // Wait for content to load after clicking
            await this.sleep(1000);
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

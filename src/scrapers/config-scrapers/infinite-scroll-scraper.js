/**
 * Infinite Scroll Scraper - Mouse Wheel Simulation Architecture
 *
 * Handles scraping from infinite scroll pages using rapid mouse wheel events.
 * This approach is much more reliable than passive scrollbar monitoring because
 * it actively triggers the site's infinite scroll JavaScript.
 *
 * PHASE 1 - LOAD ALL CONTENT:
 * - Fire rapid wheel events + scrollBy commands (20 per second)
 * - Monitor page height for new content detection
 * - Stop when height stable for 5 consecutive checks AND at bottom
 * - NO extraction during this phase - just loading content
 *
 * PHASE 2 - EXTRACT ALL CARDS:
 * - Page is now fully loaded with all content
 * - Find ALL card elements in one query
 * - Extract contacts from cards in single pass
 *
 * Why This Works:
 * - Wheel events trigger site's infinite scroll JavaScript listeners
 * - scrollBy ensures actual scroll position changes
 * - Rapid firing (50ms intervals) loads pages in 10-30 seconds
 * - Height monitoring detects when new content has loaded
 * - Dual mechanism (wheel + scrollBy) maximizes compatibility
 */

const BaseConfigScraper = require('./base-config-scraper');

class InfiniteScrollScraper extends BaseConfigScraper {
  constructor(browserManager, rateLimiter, logger, options = {}) {
    super(browserManager, rateLimiter, logger, options);

    this.scraperType = 'infinite-scroll';
    this.maxScrolls = options.maxScrolls || 1000;  // Safety limit
    this.scrollDelay = options.scrollDelay || 50;  // 50ms between scrolls = 20/second
    this.scrollAmount = options.scrollAmount || 300;  // Pixels per scroll
    this.stabilityChecks = options.stabilityChecks || 5;  // Height stable for 5 checks
    this.contentWaitTimeout = options.contentWaitTimeout || 5000;
  }

  /**
   * Scrape contacts using mouse-wheel simulation
   * Phase 1: Rapid scroll to fully load page
   * Phase 2: Extract all cards in single pass
   * @param {string} url - URL to scrape
   * @param {number} limit - Max contacts to extract (0 = unlimited)
   * @returns {Promise<Object>} - Scraping results
   */
  async scrape(url, limit = 0) {
    this.startTime = Date.now();
    this.requestedLimit = limit;

    try {
      this.logger.info(`[InfiniteScrollScraper] Starting scrape: ${url}`);
      this.logger.info(`[InfiniteScrollScraper] Limit: ${limit > 0 ? limit : 'unlimited'}, Method: mouse-wheel-simulation`);

      // Ensure output path is set
      this.ensureOutputPath();

      // Get browser page
      const page = await this.browserManager.getPage();
      if (!page) {
        throw new Error('Failed to get browser page');
      }
      this.page = page;

      // Navigate to page
      this.logger.info(`[InfiniteScrollScraper] Navigating to page...`);
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for initial page load
      this.logger.info(`[InfiniteScrollScraper] Waiting for initial page load...`);

      // Wait for card selector
      try {
        await page.waitForSelector(this.cardSelector, { timeout: 10000 });
        this.logger.info(`[InfiniteScrollScraper] ✓ Card selector found: ${this.cardSelector}`);
      } catch (err) {
        this.logger.warn(`[InfiniteScrollScraper] ⚠ Card selector not found: ${this.cardSelector}`);
      }

      // Wait for initial render
      await page.waitForTimeout(3000);

      // Count initial cards
      const initialCards = await this.findCardElements(page);
      const initialCardCount = initialCards.length;
      this.logger.info(`[InfiniteScrollScraper] Initial cards loaded: ${initialCardCount}`);

      // Get initial page dimensions
      const initialHeight = await page.evaluate(() => document.body.scrollHeight);
      this.logger.info(`[InfiniteScrollScraper] Initial page height: ${initialHeight}px`);

      // Initialize extractors
      await this.initializeExtractors(page);

      // ═══════════════════════════════════════════════════════════
      // PHASE 1: RAPID SCROLL TO FULLY LOAD PAGE
      // ═══════════════════════════════════════════════════════════

      this.logger.info(`[InfiniteScrollScraper] ═══════════════════════════════════════`);
      this.logger.info(`[InfiniteScrollScraper] PHASE 1: Rapid scrolling to load all content`);
      this.logger.info(`[InfiniteScrollScraper] ═══════════════════════════════════════`);

      await this.scrollToFullyLoad(page);

      // Get final page dimensions
      const finalHeight = await page.evaluate(() => document.body.scrollHeight);
      this.logger.info(`[InfiniteScrollScraper] Final page height: ${finalHeight}px (grew ${finalHeight - initialHeight}px)`);

      // Wait for any final lazy-loaded content
      this.logger.info(`[InfiniteScrollScraper] Waiting 2s for final content to render...`);
      await page.waitForTimeout(2000);

      // ═══════════════════════════════════════════════════════════
      // PHASE 2: EXTRACT ALL CARDS FROM FULLY-LOADED PAGE
      // ═══════════════════════════════════════════════════════════

      return await this.extractAllCards(page, limit);

    } catch (error) {
      this.logger.error(`[InfiniteScrollScraper] Scraping failed: ${error.message}`);
      this.logger.error(error.stack);
      throw error;
    }
  }

  /**
   * Rapidly scroll page using wheel events + scrollBy until fully loaded
   * @param {Object} page - Puppeteer page
   */
  async scrollToFullyLoad(page) {
    let scrollCount = 0;
    let lastHeight = await page.evaluate(() => document.body.scrollHeight);
    let stableCount = 0;
    let lastLogTime = Date.now();

    this.logger.info(`[InfiniteScrollScraper] Starting rapid scroll (${this.scrollAmount}px every ${this.scrollDelay}ms)`);

    while (scrollCount < this.maxScrolls && stableCount < this.stabilityChecks) {
      scrollCount++;

      // Fire BOTH wheel event AND scrollBy for maximum compatibility
      await page.evaluate((amount) => {
        // Fire wheel event (triggers infinite scroll JS listeners)
        const wheelEvent = new WheelEvent('wheel', {
          deltaY: amount,
          bubbles: true,
          cancelable: true
        });
        document.dispatchEvent(wheelEvent);

        // Also do actual scroll (ensures position changes)
        window.scrollBy(0, amount);
      }, this.scrollAmount);

      // Wait between scrolls
      await page.waitForTimeout(this.scrollDelay);

      // Check height every 20 scrolls (once per second at 50ms intervals)
      if (scrollCount % 20 === 0) {
        const currentHeight = await page.evaluate(() => document.body.scrollHeight);
        const scrollY = await page.evaluate(() => window.scrollY);
        const viewportHeight = await page.evaluate(() => window.innerHeight);
        const maxScroll = currentHeight - viewportHeight;
        const atBottom = scrollY >= maxScroll - 100;  // Within 100px of bottom

        // Count cards periodically
        const cards = await this.findCardElements(page);
        const cardCount = cards.length;

        // Log progress
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        this.logger.info(`[InfiniteScrollScraper] Scroll ${scrollCount}: Position ${scrollY}px/${maxScroll}px | Height: ${currentHeight}px | Cards: ${cardCount} | ${elapsed}s`);

        // Check if height is stable
        if (currentHeight === lastHeight) {
          stableCount++;
          this.logger.info(`[InfiniteScrollScraper] ⚠ Height stable (${stableCount}/${this.stabilityChecks})`);

          // If at bottom AND height stable, we're done
          if (atBottom && stableCount >= this.stabilityChecks) {
            this.logger.info(`[InfiniteScrollScraper] ✓ Page fully loaded: at bottom AND height stable`);
            break;
          }
        } else {
          // Height changed - new content loaded
          if (stableCount > 0) {
            this.logger.info(`[InfiniteScrollScraper] ✓ New content detected, resetting stable count`);
          }
          stableCount = 0;
          lastHeight = currentHeight;
        }
      }
    }

    // Log why we stopped
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    if (scrollCount >= this.maxScrolls) {
      this.logger.warn(`[InfiniteScrollScraper] ⚠ Max scrolls reached (${this.maxScrolls})`);
    } else {
      this.logger.info(`[InfiniteScrollScraper] ✓ Scrolling complete after ${scrollCount} scrolls (${elapsed}s)`);
    }
  }

  /**
   * Extract all cards from the fully-loaded page (Phase 2)
   * @param {Object} page - Puppeteer page
   * @param {number} limit - Max contacts to extract (0 = unlimited)
   * @returns {Promise<Object>} - Results object
   */
  async extractAllCards(page, limit) {
    this.logger.info(`[InfiniteScrollScraper] ═══════════════════════════════════════`);
    this.logger.info(`[InfiniteScrollScraper] PHASE 2: Extracting all contacts from loaded page`);
    this.logger.info(`[InfiniteScrollScraper] ═══════════════════════════════════════`);

    // Wait for card selector to ensure cards are rendered
    try {
      await page.waitForSelector(this.cardSelector, { timeout: 5000 });
    } catch (err) {
      this.logger.warn(`[InfiniteScrollScraper] Warning: Card selector not found: ${this.cardSelector}`);
    }

    // Find ALL cards on the fully-loaded page
    const allCardElements = await this.findCardElements(page);
    const totalCards = allCardElements.length;

    this.logger.info(`[InfiniteScrollScraper] Found ${totalCards} total cards on page`);

    // Determine how many to extract based on limit
    const cardsToExtract = limit > 0 ? Math.min(totalCards, limit) : totalCards;
    this.logger.info(`[InfiniteScrollScraper] Extracting ${cardsToExtract} contacts (limit: ${limit > 0 ? limit : 'unlimited'})`);

    // Extract contacts from all cards in single pass
    for (let i = 0; i < cardsToExtract; i++) {
      const card = allCardElements[i];

      try {
        const contact = await this.extractContactFromCard(card, i);

        if (contact) {
          this.addContact(contact);

          // Progress update every 10 contacts
          if ((i + 1) % 10 === 0 || (i + 1) === cardsToExtract) {
            this.logger.info(`[InfiniteScrollScraper] Extracted ${i + 1}/${cardsToExtract} contacts`);

            // Report progress to frontend
            this.reportProgress('Extracting', {
              cards: `${i + 1}/${cardsToExtract}`
            });
          }
        }
      } catch (err) {
        this.logger.warn(`[InfiniteScrollScraper] Error extracting card ${i}: ${err.message}`);
      }
    }

    this.logger.info(`[InfiniteScrollScraper] ✓ Extraction complete: ${this.contactCount} contacts`);

    // Flush remaining contacts
    this.flushContactBuffer();

    return this.getResults();
  }

  /**
   * Scroll to absolute bottom of page (used by diagnose)
   * @param {Object} page - Puppeteer page
   * @returns {Promise<Object>} - { beforeHeight }
   */
  async scrollDown(page) {
    const beforeHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    return { beforeHeight };
  }

  /**
   * Wait for new content and return height info (used by diagnose)
   * @param {Object} page - Puppeteer page
   * @param {number} beforeHeight - Height before scrolling
   * @returns {Promise<Object>} - { newContentLoaded, afterHeight, heightIncrease }
   */
  async waitForNewContent(page, beforeHeight) {
    await this.sleep(2000);

    let newContentLoaded = false;
    try {
      await page.waitForFunction(
        (oldHeight) => document.body.scrollHeight > oldHeight,
        { timeout: this.contentWaitTimeout },
        beforeHeight
      );
      newContentLoaded = true;
    } catch (err) {
      newContentLoaded = false;
    }

    const afterHeight = await page.evaluate(() => document.body.scrollHeight);
    const heightIncrease = afterHeight - beforeHeight;

    await this.sleep(500);

    return { newContentLoaded, afterHeight, heightIncrease };
  }

  /**
   * Perform initial diagnosis of infinite scroll behavior
   * @param {Object} page - Puppeteer page
   * @returns {Promise<Object>} - Diagnosis results
   */
  async diagnose(page) {
    this.logger.info('[InfiniteScrollScraper] Running diagnosis...');

    // Get initial state
    const initialHeight = await page.evaluate(() => document.body.scrollHeight);
    const initialCards = await this.findCardElements(page);
    const initialCount = initialCards.length;

    // Scroll using wheel event
    await page.evaluate(() => {
      for (let i = 0; i < 10; i++) {
        const wheelEvent = new WheelEvent('wheel', {
          deltaY: 300,
          bubbles: true,
          cancelable: true
        });
        document.dispatchEvent(wheelEvent);
        window.scrollBy(0, 300);
      }
    });

    await this.sleep(3000);

    // Get post-scroll state
    const afterHeight = await page.evaluate(() => document.body.scrollHeight);
    const afterScrollCards = await this.findCardElements(page);
    const afterScrollCount = afterScrollCards.length;
    const scrollY = await page.evaluate(() => window.scrollY);

    const newCards = afterScrollCount - initialCount;
    const heightIncrease = afterHeight - initialHeight;

    const diagnosis = {
      type: 'infinite-scroll',
      method: 'mouse-wheel-simulation',
      initialCards: initialCount,
      afterScrollCards: afterScrollCount,
      newCardsPerScroll: newCards,
      initialHeight: initialHeight,
      afterHeight: afterHeight,
      heightIncrease: heightIncrease,
      scrollPosition: scrollY,
      isInfiniteScroll: newCards > 0 || heightIncrease > 0,
      confidence: (newCards > 0 || heightIncrease > 0) ? 'high' : 'low'
    };

    this.logger.info(`[InfiniteScrollScraper] Diagnosis: ${JSON.stringify(diagnosis, null, 2)}`);

    return diagnosis;
  }
}

module.exports = InfiniteScrollScraper;

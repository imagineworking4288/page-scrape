/**
 * Infinite Scroll Scraper - Two-Phase Architecture
 *
 * Handles scraping from infinite scroll pages using a simplified two-phase approach:
 *
 * PHASE 1 - LOAD ALL CONTENT:
 * - Scroll to absolute page bottom repeatedly
 * - Wait for page height to increase after each scroll
 * - Continue until height stops increasing (5 consecutive failures)
 * - NO extraction during this phase - just loading content
 *
 * PHASE 2 - EXTRACT ALL CARDS:
 * - Page is now fully loaded with all content
 * - Find ALL card elements in one query
 * - Extract contacts from cards in single pass
 * - No scrolling, no duplicate detection needed
 *
 * Benefits:
 * - Simpler logic: scroll until done, then extract
 * - More reliable: doesn't exit prematurely on slow lazy-loading
 * - No incremental complexity: each card processed exactly once
 * - Better link rendering: all content loads during Phase 1
 *
 * Features:
 * - Absolute bottom scroll: scrolls to document.body.scrollHeight
 * - Height-based content detection: waits for page height to increase
 * - 5 retry threshold: more forgiving for slow lazy-loading
 * - Comprehensive logging: shows page height changes
 */

const BaseConfigScraper = require('./base-config-scraper');

class InfiniteScrollScraper extends BaseConfigScraper {
  constructor(browserManager, rateLimiter, logger, options = {}) {
    super(browserManager, rateLimiter, logger, options);

    this.scraperType = 'infinite-scroll';
    this.maxScrolls = options.maxScrolls || 100;
    this.scrollDelay = options.scrollDelay || 2000;
    // Increased from 3 to 5 retries for more forgiving lazy-load handling
    this.noNewContentThreshold = options.noNewContentThreshold || 5;
    this.contentWaitTimeout = options.contentWaitTimeout || 5000;
  }

  /**
   * Scrape contacts using two-phase architecture
   * Phase 1: Scroll until page fully loaded (no extraction)
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
      this.logger.info(`[InfiniteScrollScraper] Limit: ${limit > 0 ? limit : 'unlimited'}, Max scrolls: ${this.maxScrolls}`);

      // Ensure output path is set
      this.ensureOutputPath();

      // Get browser page
      const page = await this.browserManager.getPage();
      if (!page) {
        throw new Error('Failed to get browser page');
      }

      // Navigate to page
      this.logger.info(`[InfiniteScrollScraper] Navigating to page...`);
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for initial page render
      await page.waitForTimeout(2000);

      // Initialize extractors based on config
      await this.initializeExtractors(page);

      // ═══════════════════════════════════════════════════════════
      // PHASE 1: SCROLL UNTIL PAGE FULLY LOADED (NO EXTRACTION)
      // ═══════════════════════════════════════════════════════════

      this.logger.info(`[InfiniteScrollScraper] ═══════════════════════════════════════`);
      this.logger.info(`[InfiniteScrollScraper] PHASE 1: Loading all content via scrolling`);
      this.logger.info(`[InfiniteScrollScraper] ═══════════════════════════════════════`);

      let scrollCount = 0;
      let noHeightChangeCount = 0;
      const maxScrolls = this.maxScrolls;
      const maxNoChangeRetries = this.noNewContentThreshold; // 5 retries
      let lastHeight = 0;

      while (scrollCount < maxScrolls && noHeightChangeCount < maxNoChangeRetries) {
        scrollCount++;

        // Get current page height BEFORE scrolling
        const beforeHeight = await page.evaluate(() => document.body.scrollHeight);

        this.logger.info(`[InfiniteScrollScraper] Scroll ${scrollCount}/${maxScrolls}: Height = ${beforeHeight}px`);

        // Scroll to ABSOLUTE BOTTOM of page (not relative viewport scroll)
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });

        // Wait for scroll animation to complete
        await page.waitForTimeout(this.scrollDelay);

        // Wait for potential new content to load by detecting page height increase
        let newContentLoaded = false;
        try {
          await page.waitForFunction(
            (oldHeight) => document.body.scrollHeight > oldHeight,
            { timeout: this.contentWaitTimeout },
            beforeHeight
          );
          newContentLoaded = true;
        } catch (err) {
          // Timeout - page height didn't increase (might be end of content)
          newContentLoaded = false;
        }

        // Get page height AFTER waiting for content
        const afterHeight = await page.evaluate(() => document.body.scrollHeight);
        const heightIncrease = afterHeight - beforeHeight;

        // Log height change
        if (newContentLoaded && heightIncrease > 0) {
          this.logger.info(`[InfiniteScrollScraper] ✓ Height increased by ${heightIncrease}px (${beforeHeight} → ${afterHeight})`);
          // Reset retry counter - we got new content
          noHeightChangeCount = 0;
          lastHeight = afterHeight;
        } else {
          noHeightChangeCount++;
          this.logger.info(`[InfiniteScrollScraper] ⚠ No height change (retry ${noHeightChangeCount}/${maxNoChangeRetries})`);
        }

        // Extra wait for content rendering (cards, links, images)
        await page.waitForTimeout(500);

        // Report progress during loading phase
        this.reportProgress('Loading', { scroll: `${scrollCount}/${maxScrolls}` });
      }

      // Log why we stopped scrolling
      if (noHeightChangeCount >= maxNoChangeRetries) {
        this.logger.info(`[InfiniteScrollScraper] ✓ Page fully loaded (height stable after ${maxNoChangeRetries} retries)`);
      } else {
        this.logger.info(`[InfiniteScrollScraper] ⚠ Max scrolls reached (${maxScrolls}), proceeding with extraction`);
      }

      this.logger.info(`[InfiniteScrollScraper] Final page height: ${lastHeight}px after ${scrollCount} scrolls`);

      // ═══════════════════════════════════════════════════════════
      // PHASE 2: EXTRACT ALL CARDS FROM FULLY-LOADED PAGE
      // ═══════════════════════════════════════════════════════════

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

    } catch (error) {
      this.logger.error(`[InfiniteScrollScraper] Scraping failed: ${error.message}`);
      this.logger.error(error.stack);
      throw error;
    }
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
    await this.sleep(this.scrollDelay);

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

    // Count initial cards
    const initialCards = await this.findCardElements(page);
    const initialCount = initialCards.length;

    // Get initial page height
    const initialHeight = await page.evaluate(() => document.body.scrollHeight);

    // Scroll to bottom
    const { beforeHeight } = await this.scrollDown(page);

    // Wait for content to load
    const { afterHeight, heightIncrease } = await this.waitForNewContent(page, beforeHeight);

    // Count cards after scroll
    const afterScrollCards = await this.findCardElements(page);
    const afterScrollCount = afterScrollCards.length;

    // Calculate new cards
    const newCards = afterScrollCount - initialCount;

    const diagnosis = {
      type: 'infinite-scroll',
      initialCards: initialCount,
      afterScrollCards: afterScrollCount,
      newCardsPerScroll: newCards,
      initialHeight: initialHeight,
      afterHeight: afterHeight,
      heightIncrease: heightIncrease,
      isInfiniteScroll: newCards > 0 || heightIncrease > 0,
      confidence: (newCards > 0 || heightIncrease > 0) ? 'high' : 'low'
    };

    this.logger.info(`[InfiniteScrollScraper] Diagnosis: ${JSON.stringify(diagnosis)}`);

    return diagnosis;
  }
}

module.exports = InfiniteScrollScraper;

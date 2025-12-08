/**
 * Infinite Scroll Scraper - Scrollbar Monitor Architecture
 *
 * Handles scraping from infinite scroll pages using scrollbar position monitoring.
 * More reliable than height-based detection which suffers from timing issues.
 *
 * PHASE 1 - LOAD ALL CONTENT:
 * - Initiate smooth scroll to bottom
 * - Monitor scrollbar position percentage (0-100%)
 * - Wait for scrollbar to reach 99%+ AND stay stable
 * - Auto-scrolls again if page grows (new content loaded)
 * - NO extraction during this phase - just loading content
 *
 * PHASE 2 - EXTRACT ALL CARDS:
 * - Page is now fully loaded with all content
 * - Find ALL card elements in one query
 * - Extract contacts from cards in single pass
 * - No scrolling, no duplicate detection needed
 *
 * Benefits:
 * - Scrollbar position is more reliable than height measurements
 * - Automatically handles page growth during loading
 * - Smooth scrolling triggers lazy-load better than instant jumps
 * - Clear stability detection (scrollbar stable at bottom)
 */

const BaseConfigScraper = require('./base-config-scraper');
const ScrollbarMonitor = require('./scrollbar-monitor');

class InfiniteScrollScraper extends BaseConfigScraper {
  constructor(browserManager, rateLimiter, logger, options = {}) {
    super(browserManager, rateLimiter, logger, options);

    this.scraperType = 'infinite-scroll';
    this.maxScrolls = options.maxScrolls || 100;
    this.scrollDelay = options.scrollDelay || 2000;
    this.noNewContentThreshold = options.noNewContentThreshold || 5;
    this.contentWaitTimeout = options.contentWaitTimeout || 5000;

    // Scrollbar monitoring options
    this.stabilityChecks = options.stabilityChecks || 10;  // 10 checks at 500ms = 5 seconds stable
    this.checkInterval = options.checkInterval || 500;
    this.scrollbarThreshold = options.scrollbarThreshold || 99;
  }

  /**
   * Scrape contacts using scrollbar-monitor architecture
   * Phase 1: Scroll and monitor scrollbar until stable at bottom
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
      this.logger.info(`[InfiniteScrollScraper] Limit: ${limit > 0 ? limit : 'unlimited'}, Method: scrollbar-monitor`);

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

      // ═══════════════════════════════════════════════════════════
      // CRITICAL: Wait for initial page content to fully load
      // ═══════════════════════════════════════════════════════════

      this.logger.info(`[InfiniteScrollScraper] Waiting for initial page load...`);

      // Wait for card selector
      try {
        await page.waitForSelector(this.cardSelector, { timeout: 10000 });
        this.logger.info(`[InfiniteScrollScraper] ✓ Card selector found: ${this.cardSelector}`);
      } catch (err) {
        this.logger.warn(`[InfiniteScrollScraper] ⚠ Card selector not found: ${this.cardSelector}`);
      }

      // Wait for initial render (5 seconds for lazy content)
      await page.waitForTimeout(5000);

      // Count initial cards
      const initialCards = await this.findCardElements(page);
      const initialCardCount = initialCards.length;
      this.logger.info(`[InfiniteScrollScraper] Initial cards loaded: ${initialCardCount}`);

      // Initialize extractors
      await this.initializeExtractors(page);

      // Initialize scrollbar monitor
      const scrollbarMonitor = new ScrollbarMonitor(page, this.logger);

      // Check if page has scrollbar
      const hasScrollbar = await scrollbarMonitor.hasScrollbar();

      if (!hasScrollbar) {
        this.logger.info(`[InfiniteScrollScraper] No scrollbar detected - page fits in viewport`);
        this.logger.info(`[InfiniteScrollScraper] Proceeding directly to extraction`);

        // Skip Phase 1, go straight to Phase 2
        return await this.extractAllCards(page, limit);
      }

      // ═══════════════════════════════════════════════════════════
      // PHASE 1: AUTO-SCROLL TO BOTTOM AND WAIT FOR STABILITY
      // ═══════════════════════════════════════════════════════════

      this.logger.info(`[InfiniteScrollScraper] ═══════════════════════════════════════`);
      this.logger.info(`[InfiniteScrollScraper] PHASE 1: Auto-scrolling to load all content`);
      this.logger.info(`[InfiniteScrollScraper] ═══════════════════════════════════════`);

      // Get initial page dimensions
      const initialDimensions = await scrollbarMonitor.getPageDimensions();
      this.logger.info(`[InfiniteScrollScraper] Initial page: ${initialDimensions.scrollHeight}px, viewport: ${initialDimensions.viewportHeight}px`);

      // Initiate smooth scroll to bottom
      this.logger.info(`[InfiniteScrollScraper] Initiating smooth scroll to bottom...`);
      await scrollbarMonitor.scrollToBottom();

      // Monitor scrollbar position with periodic card counting
      let checkCounter = 0;
      const monitorResult = await scrollbarMonitor.waitForScrollbarStability({
        stabilityChecks: this.stabilityChecks,
        checkInterval: this.checkInterval,
        scrollbarThreshold: this.scrollbarThreshold,
        movementTolerance: 0.5,
        maxWaitTime: 180000,
        onProgress: async (progress) => {
          checkCounter++;
          // Count cards every 10 checks (5 seconds)
          if (checkCounter % 10 === 0) {
            try {
              const cards = await this.findCardElements(page);
              this.logger.info(`[InfiniteScrollScraper] Progress: ${progress.percentage.toFixed(1)}% | Height: ${progress.scrollHeight}px | Cards: ${cards.length}`);
            } catch (e) {
              // Ignore card counting errors during scroll
            }
          }
        }
      });

      if (!monitorResult.success) {
        this.logger.warn(`[InfiniteScrollScraper] Scrollbar monitoring ${monitorResult.reason}`);
        if (monitorResult.finalPosition) {
          this.logger.warn(`[InfiniteScrollScraper] Final position: ${monitorResult.finalPosition.toFixed(1)}%`);
        }
        this.logger.warn(`[InfiniteScrollScraper] Proceeding with extraction of loaded content`);
      } else {
        this.logger.info(`[InfiniteScrollScraper] ✓ Page fully loaded - scrollbar stable at bottom`);
        this.logger.info(`[InfiniteScrollScraper] Stability achieved after ${monitorResult.elapsed}s`);
      }

      // Wait additional 2 seconds for final lazy-load stragglers
      this.logger.info(`[InfiniteScrollScraper] Waiting 2s for final content to render...`);
      await page.waitForTimeout(2000);

      // Get final page dimensions
      const finalDimensions = await scrollbarMonitor.getPageDimensions();
      this.logger.info(`[InfiniteScrollScraper] Final page: ${finalDimensions.scrollHeight}px (grew ${finalDimensions.scrollHeight - initialDimensions.scrollHeight}px)`);

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

    // Initialize scrollbar monitor for diagnosis
    const scrollbarMonitor = new ScrollbarMonitor(page, this.logger);

    // Get initial state
    const initialDimensions = await scrollbarMonitor.getPageDimensions();
    const initialCards = await this.findCardElements(page);
    const initialCount = initialCards.length;
    const initialPosition = await scrollbarMonitor.getScrollbarPosition();

    // Scroll to bottom
    await scrollbarMonitor.scrollToBottom();
    await this.sleep(this.scrollDelay);

    // Get post-scroll state
    const afterDimensions = await scrollbarMonitor.getPageDimensions();
    const afterScrollCards = await this.findCardElements(page);
    const afterScrollCount = afterScrollCards.length;
    const afterPosition = await scrollbarMonitor.getScrollbarPosition();

    const newCards = afterScrollCount - initialCount;
    const heightIncrease = afterDimensions.scrollHeight - initialDimensions.scrollHeight;

    const diagnosis = {
      type: 'infinite-scroll',
      method: 'scrollbar-monitor',
      initialCards: initialCount,
      afterScrollCards: afterScrollCount,
      newCardsPerScroll: newCards,
      initialHeight: initialDimensions.scrollHeight,
      afterHeight: afterDimensions.scrollHeight,
      heightIncrease: heightIncrease,
      scrollbarBefore: initialPosition.percentage.toFixed(1) + '%',
      scrollbarAfter: afterPosition.percentage.toFixed(1) + '%',
      hasScrollbar: initialDimensions.hasScrollbar,
      isInfiniteScroll: newCards > 0 || heightIncrease > 0,
      confidence: (newCards > 0 || heightIncrease > 0) ? 'high' : 'low'
    };

    this.logger.info(`[InfiniteScrollScraper] Diagnosis: ${JSON.stringify(diagnosis, null, 2)}`);

    return diagnosis;
  }
}

module.exports = InfiniteScrollScraper;

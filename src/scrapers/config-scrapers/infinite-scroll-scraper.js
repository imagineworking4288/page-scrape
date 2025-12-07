/**
 * Infinite Scroll Scraper
 *
 * Handles scraping from infinite scroll pages.
 * Workflow:
 * 1. Extract all currently loaded cards
 * 2. Scroll down
 * 3. Check for new cards
 * 4. Repeat until:
 *    A) No new cards appear after consecutive retries
 *    B) Max scrolls reached
 *    C) Contact limit reached
 *
 * Features:
 * - Retry logic: continues scrolling up to 3 times even with no new cards
 * - Dynamic content wait: waits for cards to render after each scroll
 * - Comprehensive logging for debugging
 */

const BaseConfigScraper = require('./base-config-scraper');

class InfiniteScrollScraper extends BaseConfigScraper {
  constructor(browserManager, rateLimiter, logger, options = {}) {
    super(browserManager, rateLimiter, logger, options);

    this.scraperType = 'infinite-scroll';
    this.maxScrolls = options.maxScrolls || 100;
    this.scrollDelay = options.scrollDelay || 2000;
    this.noNewContentThreshold = options.noNewContentThreshold || 3;
    this.scrollAmount = options.scrollAmount || 0.8; // Scroll 80% of viewport
    this.contentWaitTimeout = options.contentWaitTimeout || 5000; // Wait for cards after scroll
  }

  /**
   * Scrape contacts with infinite scroll
   * @param {string} url - URL to scrape
   * @param {number} limit - Max contacts to extract (0 = unlimited)
   * @returns {Promise<Object>} - Scraping results
   */
  async scrape(url, limit = 0) {
    this.logger.info(`[InfiniteScrollScraper] Starting scrape: ${url}`);
    this.logger.info(`[InfiniteScrollScraper] Limit: ${limit || 'unlimited'}, Max scrolls: ${this.maxScrolls}`);
    this.startTime = Date.now();
    this.requestedLimit = limit;

    // Ensure output path is set
    this.ensureOutputPath();

    // Get browser page
    const page = await this.browserManager.getPage();
    if (!page) {
      throw new Error('Failed to get browser page');
    }

    try {
      // Navigate to URL
      this.logger.info('[InfiniteScrollScraper] Navigating to page...');
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for initial content
      const waitSelector = this.config.cardPattern?.primarySelector ||
                          this.config.extraction?.waitFor;
      if (waitSelector) {
        try {
          await page.waitForSelector(waitSelector, {
            timeout: this.config.extraction?.waitTimeout || 15000
          });
        } catch (e) {
          this.logger.warn(`[InfiniteScrollScraper] Wait selector timeout: ${waitSelector}`);
        }
      }

      // Initialize extractors
      await this.initializeExtractors(page);

      // Tracking variables
      let scrollCount = 0;
      let noNewContentCount = 0;
      let processedCardCount = 0;
      const processedCardIds = new Set();
      let previousCardCount = 0;

      this.logger.info(`[InfiniteScrollScraper] ═══════════════════════════════════════`);
      this.logger.info(`[InfiniteScrollScraper] Starting scroll loop`);
      this.logger.info(`[InfiniteScrollScraper] Target: ${limit || 'unlimited'} contacts`);
      this.logger.info(`[InfiniteScrollScraper] Max scrolls: ${this.maxScrolls}`);
      this.logger.info(`[InfiniteScrollScraper] Retry threshold: ${this.noNewContentThreshold}`);
      this.logger.info(`[InfiniteScrollScraper] ═══════════════════════════════════════`);

      // Main scroll loop
      while (scrollCount < this.maxScrolls && noNewContentCount < this.noNewContentThreshold) {
        // Check limit BEFORE processing
        if (limit > 0 && this.contactCount >= limit) {
          this.logger.info(`[InfiniteScrollScraper] ✓ Reached contact limit: ${limit}`);
          break;
        }

        // Find all current card elements
        const cardElements = await this.findCardElements(page);
        const currentCardCount = cardElements.length;
        const newCardsSinceLastScroll = currentCardCount - previousCardCount;

        // Log detailed scroll info
        this.logger.info(`[InfiniteScrollScraper] Scroll ${scrollCount + 1}/${this.maxScrolls}: Cards ${previousCardCount} → ${currentCardCount} (+${newCardsSinceLastScroll} new)`);

        // Process new cards only
        let contactsExtractedThisScroll = 0;

        for (let i = processedCardCount; i < cardElements.length; i++) {
          // Check limit during extraction
          if (limit > 0 && this.contactCount >= limit) {
            this.logger.info(`[InfiniteScrollScraper] ✓ Limit reached during extraction`);
            break;
          }

          const cardElement = cardElements[i];

          // Create unique identifier for card
          const cardId = await this.getCardIdentifier(page, cardElement, i);
          if (processedCardIds.has(cardId)) {
            continue;
          }
          processedCardIds.add(cardId);

          try {
            const contact = await this.extractContactFromCard(cardElement, i);

            if (contact) {
              this.addContact(contact);
              contactsExtractedThisScroll++;
            }
          } catch (error) {
            this.logger.warn(`[InfiniteScrollScraper] Error extracting card ${i}: ${error.message}`);
          }
        }

        processedCardCount = cardElements.length;
        previousCardCount = currentCardCount;

        // Track if we got new content
        if (contactsExtractedThisScroll === 0 && newCardsSinceLastScroll === 0) {
          noNewContentCount++;
          this.logger.info(`[InfiniteScrollScraper] ⚠ No new cards found (retry ${noNewContentCount}/${this.noNewContentThreshold}), scrolling again...`);
        } else {
          // Reset retry counter when we find new content
          if (noNewContentCount > 0) {
            this.logger.info(`[InfiniteScrollScraper] ✓ Found new content, resetting retry counter`);
          }
          noNewContentCount = 0;
          this.logger.info(`[InfiniteScrollScraper] ✓ Extracted ${contactsExtractedThisScroll} contacts this scroll (total: ${this.contactCount})`);
        }

        // Report progress
        this.reportProgress('Scrolling', {
          scroll: `${scrollCount + 1}/${this.maxScrolls}`,
          cards: processedCardCount
        });

        // Scroll down
        await this.scrollDown(page);
        scrollCount++;

        // Wait for new content to load with dynamic wait
        await this.waitForNewContent(page, currentCardCount);
      }

      // Log exit reason
      this.logger.info(`[InfiniteScrollScraper] ═══════════════════════════════════════`);
      if (limit > 0 && this.contactCount >= limit) {
        this.logger.info(`[InfiniteScrollScraper] Exit reason: Contact limit reached (${this.contactCount}/${limit})`);
      } else if (scrollCount >= this.maxScrolls) {
        this.logger.info(`[InfiniteScrollScraper] Exit reason: Max scrolls reached (${scrollCount}/${this.maxScrolls})`);
      } else if (noNewContentCount >= this.noNewContentThreshold) {
        this.logger.info(`[InfiniteScrollScraper] Exit reason: No new content after ${this.noNewContentThreshold} retries`);
      }
      this.logger.info(`[InfiniteScrollScraper] ═══════════════════════════════════════`);

      // Flush remaining contacts
      this.flushContactBuffer();

      this.logger.info(`[InfiniteScrollScraper] Completed after ${scrollCount} scrolls`);
      this.logger.info(`[InfiniteScrollScraper] Total contacts: ${this.contactCount}`);
      this.reportProgress('Complete', { scroll: scrollCount, cards: processedCardCount });

      return this.getResults();

    } catch (error) {
      this.logger.error(`[InfiniteScrollScraper] Scrape error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Scroll down the page
   * @param {Object} page - Puppeteer page
   */
  async scrollDown(page) {
    await page.evaluate((scrollAmount) => {
      window.scrollBy(0, window.innerHeight * scrollAmount);
    }, this.scrollAmount);
  }

  /**
   * Wait for new content to load after scrolling
   * Uses a combination of fixed delay and dynamic card detection
   * @param {Object} page - Puppeteer page
   * @param {number} previousCardCount - Number of cards before scroll
   */
  async waitForNewContent(page, previousCardCount) {
    // First, wait the base delay for network requests to start
    await this.sleep(this.scrollDelay);

    // Then try to detect if new cards appeared
    try {
      // Wait for card selector with timeout
      if (this.cardSelector) {
        await page.waitForSelector(this.cardSelector, {
          timeout: this.contentWaitTimeout
        });

        // Check if card count increased
        const currentCards = await this.findCardElements(page);
        if (currentCards.length > previousCardCount) {
          // Give extra time for all cards to fully render (links, images, etc.)
          await this.sleep(500);
        }
      }
    } catch (e) {
      // Timeout waiting for cards is not fatal, just continue
      this.logger.debug(`[InfiniteScrollScraper] Content wait timeout (cards may not have loaded)`);
    }
  }

  /**
   * Get unique identifier for a card element
   * @param {Object} page - Puppeteer page
   * @param {Object} cardElement - Card element handle
   * @param {number} index - Card index
   * @returns {Promise<string>} - Unique identifier
   */
  async getCardIdentifier(page, cardElement, index) {
    try {
      // Try to get unique identifier from card content
      const identifier = await page.evaluate(el => {
        // Try multiple strategies for unique ID
        // 1. Check for data attributes
        if (el.dataset.id) return `data-id:${el.dataset.id}`;
        if (el.dataset.personId) return `person-id:${el.dataset.personId}`;

        // 2. Check for email or profile link
        const emailLink = el.querySelector('a[href^="mailto:"]');
        if (emailLink) return `email:${emailLink.href}`;

        const profileLink = el.querySelector('a[href*="/profile"], a[href*="/lawyer"], a[href*="/person"]');
        if (profileLink) return `profile:${profileLink.href}`;

        // 3. Use first link href
        const firstLink = el.querySelector('a[href]');
        if (firstLink) return `link:${firstLink.href}`;

        // 4. Use text content hash
        const text = el.textContent.trim().substring(0, 100);
        return `text:${text}`;
      }, cardElement);

      return identifier || `index:${index}`;
    } catch (error) {
      return `index:${index}`;
    }
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

    // Scroll down once
    await this.scrollDown(page);
    await this.sleep(this.scrollDelay);

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
      isInfiniteScroll: newCards > 0,
      confidence: newCards > 0 ? 'high' : 'low'
    };

    this.logger.info(`[InfiniteScrollScraper] Diagnosis: ${JSON.stringify(diagnosis)}`);

    return diagnosis;
  }
}

module.exports = InfiniteScrollScraper;

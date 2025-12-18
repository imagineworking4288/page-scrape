/**
 * Single Page Scraper
 *
 * Handles scraping from single-page results (no pagination, no infinite scroll).
 * Simply extracts all cards visible on the page.
 *
 * Use case: Pages where all contacts are loaded at once
 */

const BaseConfigScraper = require('./base-config-scraper');

class SinglePageScraper extends BaseConfigScraper {
  constructor(browserManager, rateLimiter, logger, options = {}) {
    super(browserManager, rateLimiter, logger, options);
    this.scraperType = 'single-page';
  }

  /**
   * Scrape contacts from a single page
   * @param {string} url - URL to scrape
   * @param {number} limit - Max contacts to extract (0 = unlimited)
   * @param {Object} options - Scraping options
   * @param {boolean} options.skipNavigation - If true, extract from current page without navigating
   * @returns {Promise<Object>} - Scraping results
   */
  async scrape(url, limit = 0, options = {}) {
    const { skipNavigation = false } = options;

    this.logger.info(`[SinglePageScraper] Starting scrape: ${url}`);
    this.logger.info(`[SinglePageScraper] Limit: ${limit || 'unlimited'}, skipNavigation: ${skipNavigation}`);
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
      // Only navigate if not skipping navigation
      if (!skipNavigation) {
        // Navigate to URL
        this.logger.info('[SinglePageScraper] Navigating to page...');
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });

        // Wait for content to load
        const waitSelector = this.config.cardPattern?.primarySelector ||
                            this.config.extraction?.waitFor;
        if (waitSelector) {
          try {
            await page.waitForSelector(waitSelector, {
              timeout: this.config.extraction?.waitTimeout || 15000
            });
          } catch (e) {
            this.logger.warn(`[SinglePageScraper] Wait selector timeout: ${waitSelector}`);
          }
        }
      } else {
        this.logger.info('[SinglePageScraper] Using current page DOM (skipNavigation=true)');
        // Scroll to top to ensure consistent starting point
        await page.evaluate(() => window.scrollTo(0, 0));
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Apply rate limiting
      await this.rateLimiter.wait();

      // Initialize extractors
      await this.initializeExtractors(page);

      // Find all card elements
      const cardElements = await this.findCardElements(page);
      this.logger.info(`[SinglePageScraper] Found ${cardElements.length} cards`);

      if (cardElements.length === 0) {
        this.logger.warn('[SinglePageScraper] No cards found on page');
        return this.getResults();
      }

      // Determine how many to process
      const cardsToProcess = limit > 0
        ? cardElements.slice(0, limit)
        : cardElements;

      this.logger.info(`[SinglePageScraper] Processing ${cardsToProcess.length} cards...`);

      // Extract contacts from each card
      for (let i = 0; i < cardsToProcess.length; i++) {
        const cardElement = cardsToProcess[i];

        try {
          const contact = await this.extractContactFromCard(cardElement, i);

          if (contact) {
            this.addContact(contact);
          }

          // Report progress every 10 cards
          if ((i + 1) % 10 === 0) {
            this.reportProgress('Extracting', {
              cards: `${i + 1}/${cardsToProcess.length}`
            });
          }
        } catch (error) {
          this.logger.warn(`[SinglePageScraper] Error extracting card ${i}: ${error.message}`);
        }

        // Check limit
        if (limit > 0 && this.contactCount >= limit) {
          this.logger.info(`[SinglePageScraper] Reached contact limit: ${limit}`);
          break;
        }
      }

      // Flush remaining contacts
      this.flushContactBuffer();

      this.logger.info(`[SinglePageScraper] Completed. Total contacts: ${this.contactCount}`);
      this.reportProgress('Complete', { cards: cardElements.length });

      return this.getResults();

    } catch (error) {
      this.logger.error(`[SinglePageScraper] Scrape error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = SinglePageScraper;

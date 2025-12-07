/**
 * Pagination Scraper
 *
 * Handles scraping from pages with traditional pagination.
 * Uses existing Paginator class for URL generation and navigation.
 *
 * Workflow:
 * 1. Use Paginator to discover pagination pattern
 * 2. Generate all page URLs
 * 3. Sequentially navigate and extract from each page
 * 4. Deduplicate contacts across pages
 */

const BaseConfigScraper = require('./base-config-scraper');
const Paginator = require('../../features/pagination/paginator');

class PaginationScraper extends BaseConfigScraper {
  constructor(browserManager, rateLimiter, logger, configLoader, options = {}) {
    super(browserManager, rateLimiter, logger, options);

    this.scraperType = 'pagination';
    this.configLoader = configLoader;
    this.paginator = new Paginator(browserManager, rateLimiter, logger, configLoader);

    // Pagination options
    this.maxPages = options.maxPages || 200;
    this.pageDelay = options.pageDelay || 2000;
    this.minContactsPerPage = options.minContactsPerPage || 1;
  }

  /**
   * Scrape contacts across multiple pages
   * @param {string} url - Starting URL
   * @param {number} limit - Max contacts to extract (0 = unlimited)
   * @param {Object} diagnosisResults - Pre-discovered pagination info (optional)
   * @returns {Promise<Object>} - Scraping results
   */
  async scrape(url, limit = 0, diagnosisResults = null) {
    this.logger.info(`[PaginationScraper] Starting scrape: ${url}`);
    this.logger.info(`[PaginationScraper] Limit: ${limit || 'unlimited'}, Max pages: ${this.maxPages}`);
    this.startTime = Date.now();

    // Get browser page
    const page = await this.browserManager.getPage();
    if (!page) {
      throw new Error('Failed to get browser page');
    }

    try {
      // Discover pagination pattern (or use pre-discovered)
      let paginationResult;

      if (diagnosisResults?.pattern) {
        this.logger.info('[PaginationScraper] Using pre-discovered pagination pattern');
        paginationResult = diagnosisResults;
      } else {
        this.logger.info('[PaginationScraper] Discovering pagination pattern...');
        paginationResult = await this.paginator.paginate(url, {
          maxPages: this.maxPages,
          minContacts: this.minContactsPerPage,
          discoverOnly: false
        });
      }

      if (!paginationResult.success) {
        this.logger.error(`[PaginationScraper] Pagination discovery failed: ${paginationResult.error}`);
        // Fall back to single page scrape
        return await this.scrapeCurrentPage(page, url, limit);
      }

      const pageUrls = paginationResult.urls || [url];
      this.logger.info(`[PaginationScraper] Found ${pageUrls.length} pages to scrape`);

      // Navigate to first page if needed
      const currentUrl = page.url();
      if (currentUrl !== url) {
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
      }

      // Initialize extractors
      await this.initializeExtractors(page);

      // Process each page
      for (let i = 0; i < pageUrls.length; i++) {
        const pageUrl = pageUrls[i];
        const pageNum = i + 1;

        // Check limit
        if (limit > 0 && this.contactCount >= limit) {
          this.logger.info(`[PaginationScraper] Reached contact limit: ${limit}`);
          break;
        }

        this.logger.info(`[PaginationScraper] Processing page ${pageNum}/${pageUrls.length}`);

        // Navigate to page (skip first if already there)
        if (i > 0) {
          try {
            await page.goto(pageUrl, {
              waitUntil: 'networkidle2',
              timeout: 30000
            });
          } catch (error) {
            this.logger.warn(`[PaginationScraper] Failed to navigate to page ${pageNum}: ${error.message}`);
            continue;
          }

          // Apply rate limiting
          await this.rateLimiter.wait();
        }

        // Wait for content
        const waitSelector = this.config.cardPattern?.primarySelector ||
                            this.config.extraction?.waitFor;
        if (waitSelector) {
          try {
            await page.waitForSelector(waitSelector, {
              timeout: this.config.extraction?.waitTimeout || 10000
            });
          } catch (e) {
            this.logger.warn(`[PaginationScraper] Wait selector timeout on page ${pageNum}`);
          }
        }

        // Extract from this page
        const pageContactsBefore = this.contactCount;
        await this.extractFromCurrentPage(page, pageNum, limit);
        const pageContactsExtracted = this.contactCount - pageContactsBefore;

        // Report progress
        this.reportProgress('Pagination', {
          page: `${pageNum}/${pageUrls.length}`,
          cards: `+${pageContactsExtracted}`
        });

        // If no contacts on this page, might be at the end
        if (pageContactsExtracted === 0 && i > 0) {
          this.logger.info(`[PaginationScraper] No new contacts on page ${pageNum}, may have reached end`);
        }

        // Add delay between pages
        if (i < pageUrls.length - 1) {
          await this.sleep(this.pageDelay);
        }
      }

      // Flush remaining contacts
      this.flushContactBuffer();

      this.logger.info(`[PaginationScraper] Completed. Total contacts: ${this.contactCount}`);
      this.reportProgress('Complete', { page: pageUrls.length });

      return this.getResults();

    } catch (error) {
      this.logger.error(`[PaginationScraper] Scrape error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract contacts from current page
   * @param {Object} page - Puppeteer page
   * @param {number} pageNum - Current page number
   * @param {number} limit - Contact limit
   */
  async extractFromCurrentPage(page, pageNum, limit) {
    // Find card elements
    const cardElements = await this.findCardElements(page);
    this.logger.debug(`[PaginationScraper] Page ${pageNum}: Found ${cardElements.length} cards`);

    if (cardElements.length === 0) {
      return;
    }

    // Process each card
    for (let i = 0; i < cardElements.length; i++) {
      // Check limit
      if (limit > 0 && this.contactCount >= limit) {
        break;
      }

      const cardElement = cardElements[i];

      try {
        const contact = await this.extractContactFromCard(cardElement, i);

        if (contact) {
          contact.pageNum = pageNum;
          this.addContact(contact);
        }
      } catch (error) {
        this.logger.warn(`[PaginationScraper] Error extracting card ${i} on page ${pageNum}: ${error.message}`);
      }
    }
  }

  /**
   * Scrape just the current page (fallback)
   * @param {Object} page - Puppeteer page
   * @param {string} url - URL
   * @param {number} limit - Contact limit
   * @returns {Promise<Object>} - Results
   */
  async scrapeCurrentPage(page, url, limit) {
    this.logger.info('[PaginationScraper] Falling back to single page scrape');

    // Navigate if needed
    const currentUrl = page.url();
    if (currentUrl !== url) {
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
    }

    // Initialize extractors
    await this.initializeExtractors(page);

    // Extract from current page
    await this.extractFromCurrentPage(page, 1, limit);

    // Flush
    this.flushContactBuffer();

    return this.getResults();
  }

  /**
   * Perform diagnosis of pagination
   * @param {Object} page - Puppeteer page
   * @param {string} url - URL to diagnose
   * @returns {Promise<Object>} - Diagnosis results
   */
  async diagnose(page, url) {
    this.logger.info('[PaginationScraper] Running pagination diagnosis...');

    const result = await this.paginator.paginate(url, {
      maxPages: 10, // Limit for diagnosis
      discoverOnly: true
    });

    const diagnosis = {
      type: result.paginationType,
      success: result.success,
      pattern: result.pattern,
      totalPages: result.totalPages,
      urls: result.urls,
      confidence: result.confidence || 'unknown',
      error: result.error
    };

    this.logger.info(`[PaginationScraper] Diagnosis: ${JSON.stringify(diagnosis, null, 2)}`);

    return diagnosis;
  }
}

module.exports = PaginationScraper;

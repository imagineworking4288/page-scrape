/**
 * InfiniteScrollScraper - Simple 2-phase scraper
 *
 * Phase 1: Scroll to load all content (ScrollController)
 * Phase 2: Extract contacts (reuse SimpleScraper methods)
 *
 * NO complex tracking, NO serialization issues, NO multiple strategies
 */

const path = require('path');
const ScrollController = require('./scroll-controller');

class InfiniteScrollScraper {
  constructor(browserManager, rateLimiter, logger) {
    this.browserManager = browserManager;
    this.rateLimiter = rateLimiter;
    this.logger = logger;

    // Import SimpleScraper to reuse its extraction methods
    const SimpleScraper = require(path.join(__dirname, '..', 'src', 'scrapers', 'simple-scraper'));
    this.simpleScraper = new SimpleScraper(browserManager, rateLimiter, logger);
  }

  /**
   * Main scrape method for infinite scroll pages
   * @param {string} url - URL to scrape
   * @param {Object} options - Scraping options
   * @param {number} options.maxScrolls - Max scroll attempts (default: 50)
   * @param {number} options.scrollDelay - Delay between scrolls in ms (default: 1500)
   * @param {number} options.limit - Max contacts to extract (default: null)
   * @returns {Promise<Array>} - Array of contact objects
   */
  async scrape(url, options = {}) {
    try {
      this.logger.info('========================================');
      this.logger.info('  INFINITE SCROLL SCRAPER (Simple)');
      this.logger.info('========================================');
      this.logger.info(`URL: ${url}`);
      this.logger.info('');

      // PHASE 1: Navigate to page
      this.logger.info('Phase 1: Navigation');
      this.logger.info('-------------------');

      const page = await this.browserManager.getPage();
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      await this.sleep(3000); // Let JavaScript render

      this.logger.info('Page loaded successfully');
      this.logger.info('');

      // PHASE 2: Scroll to load all content
      this.logger.info('Phase 2: Scroll to End');
      this.logger.info('----------------------');

      const scrollController = new ScrollController(page, this.logger, {
        maxScrolls: options.maxScrolls || 50,
        scrollDelay: options.scrollDelay || 1500,
        noChangeThreshold: options.noChangeThreshold || 3
      });

      const scrollStats = await scrollController.scrollToEnd();

      this.logger.info('');
      this.logger.info(`Scroll complete: ${scrollStats.scrollsPerformed} scrolls performed`);
      this.logger.info(`Final page height: ${scrollStats.finalHeight}px`);
      this.logger.info('');

      // PHASE 3: Extract contacts using SimpleScraper methods
      this.logger.info('Phase 3: Extract Contacts');
      this.logger.info('-------------------------');
      this.logger.info('Using SimpleScraper extraction (proven method)');

      // Scroll back to top before extraction
      await page.evaluate(() => window.scrollTo(0, 0));
      await this.sleep(1000);

      // SimpleScraper.scrape() handles:
      // - Card detection
      // - Email extraction (mailto + plain text)
      // - Phone extraction (tel + plain text)
      // - Name extraction (universal method)
      // - PDF fallback for missing names
      // - Business domain filtering

      const contacts = await this.simpleScraper.scrape(url, options.limit);

      this.logger.info('');
      this.logger.info('========================================');
      this.logger.info(`  COMPLETE: ${contacts.length} contacts extracted`);
      this.logger.info('========================================');

      return contacts;

    } catch (error) {
      this.logger.error(`Infinite scroll scraping failed: ${error.message}`);
      this.logger.error(error.stack);
      throw error;
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = InfiniteScrollScraper;

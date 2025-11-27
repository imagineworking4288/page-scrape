/**
 * Scraping Workflow
 *
 * Manages the complete scraping workflow including:
 * - Browser initialization
 * - Pagination discovery
 * - Multi-page scraping
 * - Contact deduplication
 */

class ScrapingWorkflow {
  constructor(options = {}) {
    this.logger = options.logger;
    this.browserManager = options.browserManager;
    this.rateLimiter = options.rateLimiter;
    this.paginator = options.paginator;
    this.configLoader = options.configLoader;
    this.domainExtractor = options.domainExtractor;

    // Scraping options
    this.method = options.method || 'hybrid';
    this.limit = options.limit || null;
    this.keepPdfs = options.keepPdfs || false;

    // Pagination options
    this.paginationEnabled = options.paginationEnabled || false;
    this.maxPages = options.maxPages || 200;
    this.minContacts = options.minContacts || 1;
    this.startPage = options.startPage || 1;
    this.discoverOnly = options.discoverOnly || false;
  }

  /**
   * Create the appropriate scraper instance based on method
   * @returns {Object} - Scraper instance
   */
  createScraper() {
    switch (this.method) {
      case 'html':
        const SimpleScraper = require('../../scrapers/simple-scraper');
        return new SimpleScraper(this.browserManager, this.rateLimiter, this.logger);

      case 'pdf':
        const PdfScraper = require('../../scrapers/pdf-scraper');
        return new PdfScraper(this.browserManager, this.rateLimiter, this.logger);

      case 'hybrid':
        const HybridScraper = require('../../scrapers/simple-scraper');
        return new HybridScraper(this.browserManager, this.rateLimiter, this.logger);

      case 'select':
        const SelectScraper = require('../../scrapers/select-scraper');
        return new SelectScraper(this.browserManager, this.rateLimiter, this.logger);

      default:
        throw new Error(`Invalid scraping method: ${this.method}`);
    }
  }

  /**
   * Discover pagination for a URL
   * @param {string} url - Target URL
   * @returns {Promise<Object>} - Pagination discovery result
   */
  async discoverPagination(url) {
    if (!this.paginationEnabled || !this.paginator) {
      return {
        success: true,
        urls: [url],
        pattern: null,
        totalPages: 1,
        paginationType: 'none'
      };
    }

    // Set start page if resuming
    if (this.startPage > 1) {
      this.paginator.setStartPage(this.startPage);
    }

    // Load site config for pagination settings
    const siteConfig = this.configLoader?.loadConfig?.(url) || null;

    // Discover pagination
    const paginationResult = await this.paginator.paginate(url, {
      maxPages: this.maxPages,
      minContacts: this.minContacts,
      timeout: 30000,
      discoverOnly: this.discoverOnly,
      siteConfig: siteConfig
    });

    return paginationResult;
  }

  /**
   * Scrape a single page
   * @param {Object} scraper - Scraper instance
   * @param {string} url - Page URL
   * @param {number} pageNum - Page number
   * @returns {Promise<Array>} - Array of contacts
   */
  async scrapePage(scraper, url, pageNum) {
    if (this.method === 'pdf') {
      return await scraper.scrapePdf(url, this.limit, this.keepPdfs, pageNum, url);
    } else {
      return await scraper.scrape(url, this.limit, this.keepPdfs, pageNum, url);
    }
  }

  /**
   * Scrape multiple pages
   * @param {Array<string>} urls - Array of page URLs
   * @returns {Promise<Object>} - Scraping result with contacts and stats
   */
  async scrapePages(urls) {
    const scraper = this.createScraper();
    let allContacts = [];
    let pageNumber = this.startPage;

    // Reset paginator state before scraping
    if (this.paginationEnabled && this.paginator) {
      this.paginator.resetSeenContent();
      this.logger.info('Paginator state reset for scraping');
    }

    // Loop through all pages
    for (let i = 0; i < urls.length; i++) {
      const pageUrl = urls[i];
      const currentPage = pageNumber + i;

      if (urls.length > 1) {
        this.logger.info(`Scraping page ${currentPage} of ${urls.length}: ${pageUrl}`);
      }

      try {
        // Scrape the page
        const pageContacts = await this.scrapePage(scraper, pageUrl, currentPage);

        // Add to all contacts FIRST (before any break conditions)
        allContacts = allContacts.concat(pageContacts);

        // Validate page content if paginating
        if (this.paginationEnabled && urls.length > 1 && this.paginator) {
          const page = await this.browserManager.getPage();
          const validation = await this.paginator.validatePage(page);

          // Skip duplicate check for first page
          if (i > 0 && this.paginator.isDuplicateContent(validation.contentHash)) {
            this.logger.warn(`Page ${currentPage} has duplicate content - stopping pagination`);
            break;
          }

          // Mark content as seen
          this.paginator.markContentAsSeen(validation.contentHash);

          // Check minimum contacts threshold
          if (pageContacts.length < this.minContacts) {
            this.logger.warn(`Page ${currentPage} has only ${pageContacts.length} contacts - stopping pagination`);
            break;
          }

          this.logger.info(`Page ${currentPage}: Found ${pageContacts.length} contacts`);
        }

        // Rate limiting between pages
        if (i < urls.length - 1) {
          await this.rateLimiter.waitBeforeRequest();
        }

      } catch (error) {
        this.logger.error(`Error scraping page ${currentPage}: ${error.message}`);

        if (this.paginationEnabled && urls.length > 1) {
          this.logger.warn(`Skipping page ${currentPage} and continuing`);
          continue;
        } else {
          throw error;
        }
      }
    }

    // Deduplicate contacts
    const uniqueContacts = this.deduplicateContacts(allContacts);

    return {
      contacts: uniqueContacts,
      totalExtracted: allContacts.length,
      duplicatesRemoved: allContacts.length - uniqueContacts.length,
      pagesScraped: urls.length
    };
  }

  /**
   * Deduplicate contacts by email or name+phone
   * @param {Array} contacts - Array of contacts
   * @returns {Array} - Deduplicated contacts
   */
  deduplicateContacts(contacts) {
    const uniqueContactsMap = new Map();

    for (const contact of contacts) {
      const key = contact.email || `${contact.name}_${contact.phone}`;
      if (!uniqueContactsMap.has(key)) {
        uniqueContactsMap.set(key, contact);
      } else {
        // Keep the one with more complete information
        const existing = uniqueContactsMap.get(key);
        const existingComplete = (existing.name ? 1 : 0) + (existing.email ? 1 : 0) + (existing.phone ? 1 : 0);
        const newComplete = (contact.name ? 1 : 0) + (contact.email ? 1 : 0) + (contact.phone ? 1 : 0);
        if (newComplete > existingComplete) {
          uniqueContactsMap.set(key, contact);
        }
      }
    }

    return Array.from(uniqueContactsMap.values());
  }

  /**
   * Run the complete scraping workflow
   * @param {string} url - Target URL
   * @returns {Promise<Object>} - Complete workflow result
   */
  async run(url) {
    // Step 1: Discover pagination
    const paginationResult = await this.discoverPagination(url);

    if (!paginationResult.success) {
      this.logger.warn(`Pagination discovery failed: ${paginationResult.error}`);
    }

    // Check if discovery-only mode
    if (this.discoverOnly) {
      return {
        discoveryOnly: true,
        pagination: paginationResult
      };
    }

    // Get page URLs
    const pageUrls = paginationResult.urls || [url];

    // Step 2: Scrape all pages
    const scrapingResult = await this.scrapePages(pageUrls);

    // Step 3: Generate domain statistics
    let domainStats = null;
    if (this.domainExtractor && scrapingResult.contacts.length > 0) {
      domainStats = this.domainExtractor.getDomainStats(scrapingResult.contacts);
    }

    return {
      discoveryOnly: false,
      pagination: paginationResult,
      contacts: scrapingResult.contacts,
      stats: {
        totalExtracted: scrapingResult.totalExtracted,
        duplicatesRemoved: scrapingResult.duplicatesRemoved,
        pagesScraped: scrapingResult.pagesScraped,
        uniqueContacts: scrapingResult.contacts.length
      },
      domainStats: domainStats
    };
  }
}

module.exports = ScrapingWorkflow;

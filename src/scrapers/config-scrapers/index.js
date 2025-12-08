/**
 * Config Scrapers Module
 *
 * Provides specialized config-based scrapers for different pagination types:
 * - InfiniteScrollScraper: For pages that load content on scroll (Selenium PAGE_DOWN)
 * - PaginationScraper: For traditional paginated pages
 * - SinglePageScraper: For single-page results
 *
 * Includes factory method for automatic scraper selection based on diagnosis.
 *
 * INFINITE SCROLL ARCHITECTURE:
 * All infinite scroll scraping uses Selenium with PAGE_DOWN key simulation.
 * This is proven more reliable than Puppeteer wheel events:
 * - Selenium PAGE_DOWN: Found 584 contacts on Sullivan & Cromwell
 * - Puppeteer wheel: Found only 10 contacts on the same page
 */

const BaseConfigScraper = require('./base-config-scraper');
const InfiniteScrollScraper = require('./infinite-scroll-scraper');
const PaginationScraper = require('./pagination-scraper');
const SinglePageScraper = require('./single-page-scraper');

/**
 * Create appropriate scraper based on pagination type
 * @param {string} paginationType - 'infinite-scroll', 'pagination', or 'single-page'
 * @param {Object} browserManager - Browser manager instance (Puppeteer) - used for pagination/single-page
 * @param {Object} rateLimiter - Rate limiter instance
 * @param {Object} logger - Logger instance
 * @param {Object} configLoader - Config loader instance (optional, required for pagination)
 * @param {Object} options - Additional options
 * @param {Object} seleniumManager - Selenium manager instance (REQUIRED for infinite-scroll)
 * @param {Object} config - Loaded config object (optional)
 * @returns {BaseConfigScraper} - Appropriate scraper instance
 */
function createScraper(paginationType, browserManager, rateLimiter, logger, configLoader = null, options = {}, seleniumManager = null, config = null) {
  const normalizedType = paginationType.toLowerCase().replace(/_/g, '-');

  logger.info(`[createScraper] Creating scraper for type: ${paginationType} (normalized: ${normalizedType})`);

  let scraper;
  switch (normalizedType) {
    case 'infinite-scroll':
      // Infinite scroll ALWAYS requires Selenium
      if (!seleniumManager) {
        throw new Error('SeleniumManager is required for infinite-scroll scraping. Initialize SeleniumManager before creating scraper.');
      }
      logger.info('[createScraper] Creating InfiniteScrollScraper (Selenium PAGE_DOWN)');
      scraper = new InfiniteScrollScraper(seleniumManager, rateLimiter, logger, options);
      break;

    case 'pagination':
    case 'traditional':
    case 'traditional-pagination':
      if (!configLoader) {
        logger.warn('[createScraper] ConfigLoader not provided for pagination scraper, some features may be limited');
      }
      logger.info('[createScraper] Creating PaginationScraper');
      scraper = new PaginationScraper(browserManager, rateLimiter, logger, configLoader, options);
      break;

    case 'single-page':
    case 'single':
    case 'none':
      logger.info('[createScraper] Creating SinglePageScraper');
      scraper = new SinglePageScraper(browserManager, rateLimiter, logger, options);
      break;

    default:
      logger.warn(`[createScraper] Unknown pagination type: ${paginationType}, defaulting to single-page`);
      scraper = new SinglePageScraper(browserManager, rateLimiter, logger, options);
      break;
  }

  logger.info(`[createScraper] Scraper created successfully: ${scraper.scraperType || 'unknown'}`);
  return scraper;
}

/**
 * Diagnose pagination type for a URL
 * @param {Object} page - Puppeteer page (already navigated to URL)
 * @param {Object} browserManager - Browser manager instance
 * @param {Object} rateLimiter - Rate limiter instance
 * @param {Object} logger - Logger instance
 * @param {Object} configLoader - Config loader instance
 * @param {Object} config - Loaded config object
 * @returns {Promise<Object>} - Diagnosis results with recommended scraper type
 */
async function diagnosePagination(page, browserManager, rateLimiter, logger, configLoader, config) {
  logger.info('[diagnosePagination] Starting pagination diagnosis...');

  // Get card selector from config
  const cardSelector = config.cardPattern?.primarySelector ||
                      config.cardPattern?.selector;

  if (!cardSelector) {
    throw new Error('Config is missing card selector');
  }

  // Count initial cards
  const initialCards = await page.$$(cardSelector);
  const initialCount = initialCards.length;

  logger.info(`[diagnosePagination] Initial cards: ${initialCount}`);

  // Try to detect pagination controls first
  const Paginator = require('../../features/pagination/paginator');
  const paginator = new Paginator(browserManager, rateLimiter, logger, configLoader);

  // Check for pagination controls in DOM
  const paginationControls = await page.evaluate(() => {
    // Look for common pagination patterns
    const selectors = {
      numeric: [
        '.pagination', '[class*="pagination"]',
        '.pager', '[class*="pager"]',
        'nav[aria-label*="page" i]',
        '[class*="page-numbers"]'
      ],
      nextButton: [
        'a[rel="next"]', '[class*="next"]',
        'button[aria-label*="next" i]',
        '[class*="Next"]'
      ],
      loadMore: [
        '[class*="load-more"]', 'button[class*="more"]',
        '[data-load-more]'
      ],
      infiniteScroll: [
        '[data-infinite-scroll]', '[class*="infinite"]',
        '[class*="lazy-load"]'
      ]
    };

    const results = {};

    for (const [type, sels] of Object.entries(selectors)) {
      for (const sel of sels) {
        try {
          const el = document.querySelector(sel);
          if (el) {
            results[type] = { found: true, selector: sel };
            break;
          }
        } catch (e) {
          // Invalid selector, skip
        }
      }
      if (!results[type]) {
        results[type] = { found: false };
      }
    }

    return results;
  });

  logger.info(`[diagnosePagination] Controls detected: ${JSON.stringify(paginationControls)}`);

  // Determine type based on controls
  let detectedType = 'single-page';
  let confidence = 'high';
  let details = {};

  if (paginationControls.numeric?.found || paginationControls.nextButton?.found) {
    // Likely traditional pagination
    detectedType = 'pagination';
    details.controlsFound = paginationControls;

    // Try to discover pattern
    try {
      const paginationResult = await paginator.paginate(page.url(), {
        maxPages: 5,
        discoverOnly: true
      });

      if (paginationResult.success && paginationResult.pattern) {
        details.pattern = paginationResult.pattern;
        details.totalPages = paginationResult.totalPages;
        details.urls = paginationResult.urls?.slice(0, 3);
        confidence = paginationResult.confidence > 80 ? 'high' : 'medium';
      }
    } catch (e) {
      logger.warn(`[diagnosePagination] Pagination pattern detection failed: ${e.message}`);
      confidence = 'medium';
    }
  } else if (paginationControls.infiniteScroll?.found || paginationControls.loadMore?.found) {
    // Likely infinite scroll
    detectedType = 'infinite-scroll';
    details.controlsFound = paginationControls;

    // Test scroll behavior
    const scrollY = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
    await new Promise(r => setTimeout(r, 2000));

    const afterScrollCards = await page.$$(cardSelector);
    const afterScrollCount = afterScrollCards.length;

    details.cardCounts = {
      initial: initialCount,
      afterScroll: afterScrollCount
    };
    details.scrollsPerformed = 1;

    if (afterScrollCount > initialCount) {
      confidence = 'high';
    } else {
      // May not be infinite scroll after all
      confidence = 'medium';
      if (paginationControls.loadMore?.found) {
        details.note = 'Load more button detected but no new cards after scroll';
      }
    }

    // Scroll back
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
  } else {
    // Single page - no pagination detected
    detectedType = 'single-page';
    details.cardCounts = { initial: initialCount };

    // Double-check by scrolling
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
    await new Promise(r => setTimeout(r, 2000));

    const afterScrollCards = await page.$$(cardSelector);
    if (afterScrollCards.length > initialCount) {
      // Actually infinite scroll!
      detectedType = 'infinite-scroll';
      confidence = 'medium';
      details.note = 'Detected via scroll test (no explicit indicators)';
      details.cardCounts.afterScroll = afterScrollCards.length;
    }

    // Scroll back
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  const diagnosis = {
    success: true,
    type: detectedType,
    confidence: confidence,
    cardSelector: cardSelector,
    ...details
  };

  logger.info(`[diagnosePagination] Result: ${detectedType} (${confidence} confidence)`);

  return diagnosis;
}

module.exports = {
  BaseConfigScraper,
  InfiniteScrollScraper,
  PaginationScraper,
  SinglePageScraper,
  createScraper,
  diagnosePagination
};

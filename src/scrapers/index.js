/**
 * Scrapers Module Index
 *
 * Exports all scraper classes for easy importing.
 *
 * v2.3 ARCHITECTURE (December 2025):
 * - Use config-scrapers/ for all new code
 * - ConfigScraper is DEPRECATED - do not use in new code
 */

const BaseScraper = require('./base-scraper');

// v2.3 Scrapers (PREFERRED - use these)
const {
  BaseConfigScraper,
  SinglePageScraper,
  PaginationScraper,
  InfiniteScrollScraper,
  createScraper,
  diagnosePagination
} = require('./config-scrapers');

// DEPRECATED - Legacy ConfigScraper for backward compatibility only
// Use SinglePageScraper, PaginationScraper, or InfiniteScrollScraper instead
const ConfigScraper = require('./config-scraper');

module.exports = {
  // Base classes
  BaseScraper,

  // v2.3 Scrapers (PREFERRED)
  BaseConfigScraper,
  SinglePageScraper,
  PaginationScraper,
  InfiniteScrollScraper,
  createScraper,
  diagnosePagination,

  // DEPRECATED - only for backward compatibility
  ConfigScraper
};

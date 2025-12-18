/**
 * Scrapers Module Index - v3.0
 *
 * All scrapers use v2.3 architecture.
 * ConfigScraper removed in v3.0 cleanup (December 2025).
 */

const BaseScraper = require('./base-scraper');

const {
  BaseConfigScraper,
  SinglePageScraper,
  PaginationScraper,
  InfiniteScrollScraper,
  createScraper,
  diagnosePagination
} = require('./config-scrapers');

module.exports = {
  BaseScraper,
  BaseConfigScraper,
  SinglePageScraper,
  PaginationScraper,
  InfiniteScrollScraper,
  createScraper,
  diagnosePagination
};

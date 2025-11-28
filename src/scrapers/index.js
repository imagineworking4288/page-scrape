/**
 * Scrapers Module Index
 *
 * Exports all scraper classes for easy importing.
 */

const BaseScraper = require('./base-scraper');
const SimpleScraper = require('./simple-scraper');
const PdfScraper = require('./pdf-scraper');
const SelectScraper = require('./select-scraper');
const InfiniteScrollScraper = require('./infinite-scroll-scraper');

module.exports = {
  BaseScraper,
  SimpleScraper,
  PdfScraper,
  SelectScraper,
  InfiniteScrollScraper
};

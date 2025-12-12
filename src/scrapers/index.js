/**
 * Scrapers Module Index
 *
 * Exports all scraper classes for easy importing.
 */

const BaseScraper = require('./base-scraper');
const ConfigScraper = require('./config-scraper');

module.exports = {
  BaseScraper,
  ConfigScraper
};

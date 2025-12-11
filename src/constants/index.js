/**
 * Centralized constants for the page scraper
 * Import pattern constants from here
 */

const paginationPatterns = require('./pagination-patterns');

module.exports = {
  // Namespaced export
  PAGINATION_PATTERNS: paginationPatterns,

  // Direct exports for convenience
  ...paginationPatterns
};

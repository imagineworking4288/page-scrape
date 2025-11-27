/**
 * Shared Constants
 *
 * Centralized configuration values used across the scraper project.
 * Import this file instead of hardcoding magic numbers.
 */

module.exports = {
  // Timeouts (milliseconds)
  DEFAULT_TIMEOUT: 30000,
  NAVIGATION_TIMEOUT: 60000,
  PDF_RENDER_TIMEOUT: 60000,

  // Pagination
  DEFAULT_MAX_PAGES: 200,
  DEFAULT_MIN_CONTACTS: 1,
  DEFAULT_PAGINATION_TIMEOUT: 30000,
  MAX_BINARY_SEARCH_ITERATIONS: 20,

  // Scrolling
  DEFAULT_SCROLL_DELAY: 500,
  DEFAULT_MAX_SCROLLS: 50,

  // Rate Limiting
  DEFAULT_MIN_DELAY: 2000,
  DEFAULT_MAX_DELAY: 5000,
  DEFAULT_MAX_RETRIES: 3,

  // Memory Management
  MAX_NAVIGATIONS_BEFORE_RECYCLE: 50,
  MAX_MEMORY_GROWTH_MB: 1024,

  // Thresholds
  DEFAULT_PDF_COMPLETENESS: 0.7,
  EMAIL_CONTEXT_BEFORE_CHARS: 200,
  EMAIL_CONTEXT_AFTER_CHARS: 100,
  NAME_SEARCH_PROXIMITY_CHARS: 100,

  // File paths
  OUTPUT_DIR: 'output',
  PDF_DIR: 'output/pdfs',
  LOGS_DIR: 'logs',
  CONFIGS_DIR: 'configs',

  // Confidence levels
  CONFIDENCE_HIGH: 'high',
  CONFIDENCE_MEDIUM: 'medium',
  CONFIDENCE_LOW: 'low',

  // Pagination pattern types
  PATTERN_PARAMETER: 'parameter',
  PATTERN_PATH: 'path',
  PATTERN_OFFSET: 'offset',
};

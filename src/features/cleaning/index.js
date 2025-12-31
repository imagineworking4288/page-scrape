/**
 * Cleaning Module Index
 *
 * Exports the data cleaning system for post-enrichment data cleaning.
 * Cleans contact data by extracting valid patterns and removing foreign patterns.
 */

const { DataCleaner } = require('./data-cleaner');
const { ReportGenerator } = require('./report-generator');
const PATTERNS = require('./patterns');

// Re-export extractors
const { EmailExtractor, PhoneExtractor } = require('./extractors');

// Re-export cleaners
const { NameCleaner, TitleCleaner, LocationCleaner } = require('./cleaners');

module.exports = {
  // Main classes
  DataCleaner,
  ReportGenerator,

  // Extractors
  EmailExtractor,
  PhoneExtractor,

  // Cleaners
  NameCleaner,
  TitleCleaner,
  LocationCleaner,

  // Patterns
  PATTERNS
};

/**
 * Extraction Module - Field extraction system for page-scrape
 *
 * This module provides all extraction functionality:
 * - Individual field extractors (email, phone, link, label, screenshot, coordinate)
 * - Multi-method extractor for v2.1/v2.2 configs
 * - Smart field extractor with proximity-based detection
 */

const extractors = require('./extractors');
const MultiMethodExtractor = require('./multi-method-extractor');
const SmartFieldExtractor = require('./smart-field-extractor');

module.exports = {
  // Individual extractors
  ...extractors,

  // High-level extractors
  MultiMethodExtractor,
  SmartFieldExtractor,

  // Convenience aliases
  extractors
};

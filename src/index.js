/**
 * Page Scrape - Main Module Index
 *
 * This file provides unified imports for the reorganized codebase.
 * During the transition period, modules are available from both old and new paths.
 *
 * New Structure (v2.3):
 * - src/core/         - Core infrastructure (browser, logging, rate limiting)
 * - src/config/       - Configuration management and schemas
 * - src/extraction/   - Field extraction system
 * - src/scrapers/     - Scraper implementations
 *
 * Legacy paths still work for backward compatibility.
 */

// Core infrastructure
const core = require('./core');

// Configuration management
const config = require('./config');

// Extraction system
const extraction = require('./extraction');

// Features
const features = require('./features');

// Re-export all modules
module.exports = {
  // Core
  ...core,
  core,

  // Config
  ...config,
  config,

  // Extraction
  ...extraction,
  extraction,

  // Features
  features,
  enrichment: features.enrichment,
  pagination: features.pagination,

  // Legacy aliases for backward compatibility
  logger: core.logger,
  BrowserManager: core.BrowserManager,
  RateLimiter: core.RateLimiter,
  ConfigLoader: config.ConfigLoader
};

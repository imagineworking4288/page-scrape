/**
 * Core Infrastructure Module
 *
 * Exports shared infrastructure components used across the scraping project.
 */

const BrowserManager = require('./browser-manager');
const SeleniumManager = require('./selenium-manager');
const RateLimiter = require('./rate-limiter');
const logger = require('./logger');

module.exports = {
  BrowserManager,
  SeleniumManager,
  RateLimiter,
  logger,
  // Alias for backwards compatibility
  Logger: logger
};

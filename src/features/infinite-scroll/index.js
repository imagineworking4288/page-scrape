/**
 * Infinite Scroll Module Index
 *
 * Exports infinite scroll handling classes for detecting and extracting
 * content from pages that load dynamically as users scroll.
 */

const InfiniteScrollHandler = require('./infinite-scroll-handler');
const ContentTracker = require('./content-tracker');
const ScrollDetector = require('./scroll-detector');

module.exports = {
  InfiniteScrollHandler,
  ContentTracker,
  ScrollDetector
};

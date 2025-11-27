/**
 * Pagination Module Index
 *
 * Exports all pagination-related classes for easy importing.
 */

const PatternDetector = require('./pattern-detector');
const BinarySearcher = require('./binary-searcher');
const UrlGenerator = require('./url-generator');

module.exports = {
  PatternDetector,
  BinarySearcher,
  UrlGenerator
};

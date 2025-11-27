/**
 * Pagination Module Index
 *
 * Exports all pagination-related classes for easy importing.
 */

const Paginator = require('./paginator');
const PatternDetector = require('./pattern-detector');
const BinarySearcher = require('./binary-searcher');
const UrlGenerator = require('./url-generator');

module.exports = {
  Paginator,
  PatternDetector,
  BinarySearcher,
  UrlGenerator
};

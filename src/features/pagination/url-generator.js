/**
 * URL Generator
 *
 * Generates page URLs based on detected pagination patterns.
 * Supports parameter, path, and offset pattern types.
 */

const { URL } = require('url');

class UrlGenerator {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Generate URL for a single page number
   * @param {object} pattern - Pagination pattern
   * @param {number} pageNum - Page number
   * @returns {string} - Generated URL
   */
  generatePageUrl(pattern, pageNum) {
    switch (pattern.type) {
      case 'parameter':
        return this._generateParameterUrl(pattern, pageNum);

      case 'path':
        return this._generatePathUrl(pattern, pageNum);

      case 'offset':
        return this._generateOffsetUrl(pattern, pageNum);

      default:
        throw new Error(`Unknown pattern type: ${pattern.type}`);
    }
  }

  /**
   * Create a URL generator function bound to a specific pattern
   * @param {object} pattern - Pagination pattern
   * @returns {function} - Function that takes page number and returns URL
   */
  createGenerator(pattern) {
    return (pageNum) => this.generatePageUrl(pattern, pageNum);
  }

  /**
   * Generate URLs for a range of pages
   * @param {object} pattern - Pagination pattern
   * @param {number} startPage - Starting page number
   * @param {number} endPage - Ending page number
   * @returns {Array<string>} - Array of URLs
   */
  generatePageRange(pattern, startPage, endPage) {
    const urls = [];
    for (let i = startPage; i <= endPage; i++) {
      urls.push(this.generatePageUrl(pattern, i));
    }
    return urls;
  }

  /**
   * Generate URL with parameter
   * @param {object} pattern - Pattern object
   * @param {number} pageNum - Page number
   * @returns {string} - Generated URL
   * @private
   */
  _generateParameterUrl(pattern, pageNum) {
    const url = new URL(pattern.baseUrl);
    url.searchParams.set(pattern.paramName, pageNum.toString());
    return url.toString();
  }

  /**
   * Generate URL with path segment
   * @param {object} pattern - Pattern object
   * @param {number} pageNum - Page number
   * @returns {string} - Generated URL
   * @private
   */
  _generatePathUrl(pattern, pageNum) {
    const path = pattern.urlPattern.replace('{page}', pageNum.toString());
    return `${pattern.baseUrl}${path}`;
  }

  /**
   * Generate URL with offset parameter
   * @param {object} pattern - Pattern object
   * @param {number} pageNum - Page number
   * @returns {string} - Generated URL
   * @private
   */
  _generateOffsetUrl(pattern, pageNum) {
    const offset = (pageNum - 1) * pattern.itemsPerPage;
    const url = new URL(pattern.baseUrl);
    url.searchParams.set(pattern.paramName, offset.toString());
    return url.toString();
  }
}

module.exports = UrlGenerator;

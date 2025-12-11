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
   * Preserves ALL existing query parameters from the original URL
   * @param {object} pattern - Pattern object
   * @param {number} pageNum - Page number
   * @returns {string} - Generated URL
   * @private
   */
  _generateParameterUrl(pattern, pageNum) {
    // Use originalUrl if available (preserves all filter params like offices, practices)
    // Otherwise fall back to baseUrl
    const sourceUrl = pattern.originalUrl || pattern.baseUrl;
    const url = new URL(sourceUrl);

    // Update ONLY the pagination parameter, all others preserved
    url.searchParams.set(pattern.paramName, pageNum.toString());

    if (this.logger && this.logger.debug) {
      const paramCount = Array.from(url.searchParams.keys()).length;
      this.logger.debug(`[URL Generator] Generated page ${pageNum} URL with ${paramCount} parameters preserved`);
    }

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
   * Preserves ALL existing query parameters from the original URL
   * @param {object} pattern - Pattern object
   * @param {number} pageNum - Page number
   * @returns {string} - Generated URL
   * @private
   */
  _generateOffsetUrl(pattern, pageNum) {
    const offset = (pageNum - 1) * pattern.itemsPerPage;

    // Use originalUrl if available (preserves all filter params)
    const sourceUrl = pattern.originalUrl || pattern.baseUrl;
    const url = new URL(sourceUrl);

    // Update ONLY the offset parameter, all others preserved
    url.searchParams.set(pattern.paramName, offset.toString());

    if (this.logger && this.logger.debug) {
      const paramCount = Array.from(url.searchParams.keys()).length;
      this.logger.debug(`[URL Generator] Generated offset ${offset} URL with ${paramCount} parameters preserved`);
    }

    return url.toString();
  }
}

module.exports = UrlGenerator;

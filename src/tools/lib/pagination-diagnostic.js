/**
 * Pagination Diagnostic
 *
 * Wrapper around Paginator to extract detailed diagnostic information.
 * Provides additional analysis for testing purposes.
 */

const Paginator = require('../../utils/paginator');

class PaginationDiagnostic {
  constructor(browserManager, rateLimiter, logger, configLoader) {
    this.browserManager = browserManager;
    this.rateLimiter = rateLimiter;
    this.logger = logger;
    this.configLoader = configLoader;

    // Create internal paginator
    this.paginator = new Paginator(browserManager, rateLimiter, logger, configLoader);
  }

  /**
   * Run pagination diagnostic
   * @param {string} url - Target URL
   * @param {Object} options - Diagnostic options
   * @returns {Promise<Object>} - Detailed diagnostic results
   */
  async diagnose(url, options = {}) {
    const startTime = Date.now();

    try {
      // Check for manual config first
      const siteConfig = this.configLoader?.loadConfig?.(url);
      const hasManualConfig = !!(siteConfig?.pagination?.patterns);

      // Run discovery
      const result = await this.paginator.paginate(url, {
        maxPages: options.maxPages || 200,
        minContacts: options.minContacts || 1,
        timeout: options.timeout || 30000,
        discoverOnly: true,
        siteConfig: siteConfig
      });

      const diagnosticTime = ((Date.now() - startTime) / 1000).toFixed(1);

      // Build diagnostic report
      const diagnostic = {
        url: url,
        diagnosticTime: diagnosticTime + 's',
        success: result.success,

        // Detection details
        detection: {
          hasManualConfig: hasManualConfig,
          detectionMethod: result.detectionMethod || 'none',
          paginationType: result.paginationType || 'none',
          confidence: result.confidence || 0
        },

        // Pattern details
        pattern: result.pattern ? {
          type: result.pattern.type,
          paramName: result.pattern.paramName,
          baseUrl: result.pattern.baseUrl,
          urlPattern: result.pattern.urlPattern,
          maxPage: result.pattern.maxPage,
          currentPage: result.pattern.currentPage
        } : null,

        // Page count details
        pages: {
          totalPages: result.totalPages || 1,
          trueMaxPage: result.trueMaxPage || null,
          visualMaxPage: result.visualMaxPage || null,
          boundaryConfirmed: result.boundaryConfirmed || false,
          isCapped: result.isCapped || false
        },

        // Binary search details (if available)
        binarySearch: result.testedPages ? {
          pagesTestedCount: result.testedPages.length,
          testedPages: result.testedPages,
          searchPath: result.searchPath || []
        } : null,

        // Errors
        error: result.error || null,

        // Recommendations
        recommendations: this._generateRecommendations(result, hasManualConfig)
      };

      return diagnostic;

    } catch (error) {
      return {
        url: url,
        diagnosticTime: ((Date.now() - startTime) / 1000).toFixed(1) + 's',
        success: false,
        error: error.message,
        recommendations: ['Fix the error before proceeding']
      };
    }
  }

  /**
   * Generate pagination recommendations
   * @param {Object} result - Paginator result
   * @param {boolean} hasManualConfig - Whether manual config exists
   * @returns {Array<string>} - Recommendations
   * @private
   */
  _generateRecommendations(result, hasManualConfig) {
    const recommendations = [];

    if (!result.success) {
      recommendations.push('Pagination detection failed - consider manual pattern configuration');
      return recommendations;
    }

    if (result.paginationType === 'none') {
      recommendations.push('No pagination detected - site appears to be single page');
      return recommendations;
    }

    if (result.paginationType === 'infinite-scroll') {
      recommendations.push('Infinite scroll detected - not currently supported');
      recommendations.push('Consider using browser automation to scroll and extract');
      return recommendations;
    }

    // Confidence-based recommendations
    if (result.confidence >= 80) {
      recommendations.push(`High confidence detection (${result.confidence}%) - safe to use pagination`);
    } else if (result.confidence >= 50) {
      recommendations.push(`Moderate confidence (${result.confidence}%) - test with small page count first`);
      recommendations.push('Use --max-pages 5 initially to verify');
    } else {
      recommendations.push(`Low confidence (${result.confidence}%) - consider manual verification`);
    }

    // Boundary confirmation
    if (result.boundaryConfirmed) {
      recommendations.push('Page boundary confirmed - total page count is accurate');
    } else if (result.totalPages > 10) {
      recommendations.push('Page boundary not confirmed - true max may differ');
    }

    // Manual config recommendation
    if (!hasManualConfig && result.pattern) {
      recommendations.push('Consider saving pattern to site config for faster future detection');
    }

    // Page count recommendations
    if (result.totalPages > 100) {
      recommendations.push(`Large site (${result.totalPages} pages) - consider batching with --start-page`);
    }

    return recommendations;
  }

  /**
   * Test a specific page number
   * @param {string} url - Base URL
   * @param {Object} pattern - Pagination pattern
   * @param {number} pageNum - Page number to test
   * @returns {Promise<Object>} - Page validation result
   */
  async testPage(url, pattern, pageNum) {
    if (!pattern) {
      throw new Error('Pattern is required to test specific page');
    }

    const page = await this.browserManager.getPage();

    // Generate page URL using paginator's URL generator
    const pageUrl = this.paginator._generateSinglePageUrl(pattern, pageNum);

    // Navigate and validate
    await page.goto(pageUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    const validation = await this.paginator.validatePage(page);

    return {
      pageNum: pageNum,
      url: pageUrl,
      hasContent: validation.hasContent,
      emailCount: validation.emailCount,
      contactEstimate: validation.contactEstimate,
      contentHash: validation.contentHash
    };
  }

  /**
   * Generate sample URLs for pattern verification
   * @param {Object} pattern - Pagination pattern
   * @param {number} count - Number of URLs to generate
   * @returns {Array<string>} - Sample URLs
   */
  generateSampleUrls(pattern, count = 5) {
    if (!pattern) return [];

    const urls = [];
    for (let i = 1; i <= count; i++) {
      urls.push({
        page: i,
        url: this.paginator._generateSinglePageUrl(pattern, i)
      });
    }
    return urls;
  }
}

module.exports = PaginationDiagnostic;

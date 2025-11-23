const crypto = require('crypto');
const { URL } = require('url');

/**
 * Paginator - Handles automatic pagination detection and URL generation for scraping
 *
 * Features:
 * - Auto-detects pagination patterns (URL params, path segments, offsets, cursors)
 * - Validates page content to prevent infinite loops
 * - Detects duplicate/empty pages
 * - Supports infinite scroll detection
 * - Caches discovered patterns
 */
class Paginator {
  constructor(browserManager, rateLimiter, logger, configLoader) {
    this.browserManager = browserManager;
    this.rateLimiter = rateLimiter;
    this.logger = logger;
    this.configLoader = configLoader;
    this.startPage = 1;
    this.seenContentHashes = new Set();
  }

  /**
   * Main pagination method
   * @param {string} url - Base URL to paginate
   * @param {object} options - Pagination options
   * @returns {Promise<object>} - {success, urls, pattern, totalPages, paginationType, error}
   */
  async paginate(url, options = {}) {
    const {
      maxPages = 200,
      minContacts = 1,
      timeout = 30000,
      discoverOnly = false,
      siteConfig = null
    } = options;

    try {
      this.logger.info(`[Paginator] Starting pagination for: ${url}`);

      // Check if infinite scroll
      const page = await this.browserManager.getPage();
      await this.rateLimiter.waitBeforeRequest();

      await page.goto(url, { waitUntil: 'networkidle0', timeout });

      const isInfiniteScroll = await this._detectInfiniteScroll(page);
      if (isInfiniteScroll) {
        this.logger.warn('[Paginator] Infinite scroll detected - not supported yet');
        return {
          success: false,
          urls: [url],
          pattern: null,
          totalPages: 1,
          paginationType: 'infinite-scroll',
          error: 'Infinite scroll not supported'
        };
      }

      // Validate first page
      const firstPageValidation = await this.validatePage(page);
      if (!firstPageValidation.hasContent || firstPageValidation.emailCount < minContacts) {
        this.logger.warn('[Paginator] First page has insufficient content');
        return {
          success: false,
          urls: [url],
          pattern: null,
          totalPages: 1,
          paginationType: 'none',
          error: 'First page has insufficient content'
        };
      }

      // Store first page content hash
      this.seenContentHashes.add(firstPageValidation.contentHash);

      // Discover pagination pattern
      const pattern = await this._discoverPaginationPattern(page, url, siteConfig);

      if (!pattern) {
        this.logger.info('[Paginator] No pagination detected - single page');
        return {
          success: true,
          urls: [url],
          pattern: null,
          totalPages: 1,
          paginationType: 'none',
          error: null
        };
      }

      this.logger.info(`[Paginator] Detected pagination type: ${pattern.type}`);

      if (discoverOnly) {
        return {
          success: true,
          urls: [url],
          pattern: pattern,
          totalPages: 1,
          paginationType: pattern.type,
          error: null
        };
      }

      // Generate page URLs
      const urls = await this._generatePageUrls(url, pattern, maxPages, minContacts);

      this.logger.info(`[Paginator] Generated ${urls.length} page URLs`);

      return {
        success: true,
        urls: urls,
        pattern: pattern,
        totalPages: urls.length,
        paginationType: pattern.type,
        error: null
      };

    } catch (error) {
      this.logger.error(`[Paginator] Error: ${error.message}`);
      return {
        success: false,
        urls: [url],
        pattern: null,
        totalPages: 1,
        paginationType: 'error',
        error: error.message
      };
    }
  }

  /**
   * Validate page content
   * @param {object} page - Puppeteer page object
   * @returns {Promise<object>} - {hasContent, emailCount, contactEstimate, contentHash}
   */
  async validatePage(page) {
    try {
      const validation = await page.evaluate(() => {
        // Count emails
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const bodyText = document.body.innerText;
        const emails = bodyText.match(emailRegex) || [];
        const uniqueEmails = [...new Set(emails)];

        // Estimate contacts (count of mailto links or email matches)
        const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]').length;
        const contactEstimate = Math.max(mailtoLinks, uniqueEmails.length);

        // Generate content hash (first 1000 chars to detect duplicates)
        const contentSample = bodyText.substring(0, 1000).replace(/\s+/g, ' ').trim();

        return {
          hasContent: bodyText.length > 100,
          emailCount: uniqueEmails.length,
          contactEstimate: contactEstimate,
          contentSample: contentSample
        };
      });

      // Generate MD5 hash of content
      const contentHash = crypto.createHash('md5').update(validation.contentSample).digest('hex');

      return {
        hasContent: validation.hasContent,
        emailCount: validation.emailCount,
        contactEstimate: validation.contactEstimate,
        contentHash: contentHash
      };

    } catch (error) {
      this.logger.error(`[Paginator] Page validation error: ${error.message}`);
      return {
        hasContent: false,
        emailCount: 0,
        contactEstimate: 0,
        contentHash: null
      };
    }
  }

  /**
   * Set the starting page number (for resume functionality)
   * @param {number} pageNumber - Page number to start from
   */
  setStartPage(pageNumber) {
    this.startPage = Math.max(1, pageNumber);
    this.logger.info(`[Paginator] Starting from page ${this.startPage}`);
  }

  /**
   * Detect if page uses infinite scroll
   * @param {object} page - Puppeteer page object
   * @returns {Promise<boolean>} - True if infinite scroll detected
   * @private
   */
  async _detectInfiniteScroll(page) {
    try {
      const hasInfiniteScroll = await page.evaluate(() => {
        // Check for common infinite scroll indicators
        const indicators = [
          () => document.querySelector('[data-infinite-scroll]') !== null,
          () => document.querySelector('[class*="infinite"]') !== null,
          () => document.querySelector('[class*="lazy-load"]') !== null,
          () => document.querySelector('[class*="load-more"]') !== null,
          () => {
            // Check for scroll event listeners (limited detection)
            const scripts = Array.from(document.querySelectorAll('script'));
            return scripts.some(script =>
              script.textContent.includes('scroll') &&
              (script.textContent.includes('infinite') || script.textContent.includes('lazy'))
            );
          }
        ];

        return indicators.some(check => check());
      });

      return hasInfiniteScroll;
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle infinite scroll (stub for future implementation)
   * @param {object} page - Puppeteer page object
   * @param {object} options - Scroll options
   * @returns {Promise<null>} - Returns null (not implemented)
   * @private
   */
  async _handleInfiniteScroll(page, options = {}) {
    this.logger.warn('[Paginator] Infinite scroll handling not yet implemented');
    this.logger.warn('[Paginator] Please use traditional pagination or scrape single pages');
    return null;
  }

  /**
   * Discover pagination pattern from current page
   * @param {object} page - Puppeteer page object
   * @param {string} currentUrl - Current page URL
   * @param {object} siteConfig - Site-specific configuration
   * @returns {Promise<object|null>} - Pattern object or null
   * @private
   */
  async _discoverPaginationPattern(page, currentUrl, siteConfig = null) {
    try {
      // Check site config for manual pattern first
      if (siteConfig?.pagination?.patterns) {
        const manualPattern = this._extractManualPattern(currentUrl, siteConfig.pagination.patterns);
        if (manualPattern) {
          this.logger.info('[Paginator] Using manual pagination pattern from config');
          return manualPattern;
        }
      }

      // Check for cached pattern
      const domain = new URL(currentUrl).hostname;
      const cachedPattern = this.configLoader.getCachedPattern?.(domain);
      if (cachedPattern) {
        this.logger.info('[Paginator] Using cached pagination pattern');
        return cachedPattern;
      }

      // Auto-detect pattern
      const detectedPattern = await this._autoDetectPattern(page, currentUrl);

      // Cache the pattern if detected
      if (detectedPattern && this.configLoader.saveCachedPattern) {
        this.configLoader.saveCachedPattern(domain, detectedPattern);
      }

      return detectedPattern;

    } catch (error) {
      this.logger.error(`[Paginator] Pattern discovery error: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract manual pattern from config
   * @param {string} url - Current URL
   * @param {object} patterns - Pattern configuration
   * @returns {object|null} - Pattern object or null
   * @private
   */
  _extractManualPattern(url, patterns) {
    if (!patterns) return null;

    const urlObj = new URL(url);

    // Check for URL parameter pattern
    if (patterns.pageParameterName) {
      return {
        type: 'parameter',
        paramName: patterns.pageParameterName,
        baseUrl: `${urlObj.origin}${urlObj.pathname}`
      };
    }

    // Check for offset parameter pattern
    if (patterns.offsetParameterName) {
      return {
        type: 'offset',
        paramName: patterns.offsetParameterName,
        baseUrl: `${urlObj.origin}${urlObj.pathname}`,
        itemsPerPage: 10 // Default, should be discovered
      };
    }

    // Check for cursor pattern
    if (patterns.cursorParameterName) {
      return {
        type: 'cursor',
        paramName: patterns.cursorParameterName,
        baseUrl: `${urlObj.origin}${urlObj.pathname}`
      };
    }

    // Check for URL pattern with placeholder
    if (patterns.urlPattern) {
      return {
        type: 'path',
        urlPattern: patterns.urlPattern
      };
    }

    return null;
  }

  /**
   * Auto-detect pagination pattern
   * @param {object} page - Puppeteer page object
   * @param {string} currentUrl - Current URL
   * @returns {Promise<object|null>} - Pattern object or null
   * @private
   */
  async _autoDetectPattern(page, currentUrl) {
    const urlObj = new URL(currentUrl);
    const params = urlObj.searchParams;

    // Strategy 1: Check URL parameters for page/p/pg
    const pageParams = ['page', 'p', 'pg', 'pageNum', 'pageNumber'];
    for (const param of pageParams) {
      if (params.has(param)) {
        const value = params.get(param);
        if (/^\d+$/.test(value)) {
          this.logger.info(`[Paginator] Detected URL parameter pattern: ${param}`);
          return {
            type: 'parameter',
            paramName: param,
            baseUrl: `${urlObj.origin}${urlObj.pathname}`,
            currentPage: parseInt(value)
          };
        }
      }
    }

    // Strategy 2: Check for offset/limit parameters
    const offsetParams = ['offset', 'start', 'from'];
    for (const param of offsetParams) {
      if (params.has(param)) {
        const value = params.get(param);
        if (/^\d+$/.test(value)) {
          this.logger.info(`[Paginator] Detected offset parameter pattern: ${param}`);
          return {
            type: 'offset',
            paramName: param,
            baseUrl: `${urlObj.origin}${urlObj.pathname}`,
            currentOffset: parseInt(value),
            itemsPerPage: 10 // Will be refined
          };
        }
      }
    }

    // Strategy 3: Check URL path for page numbers
    const pathMatch = urlObj.pathname.match(/\/(?:page|p)\/(\d+)/i);
    if (pathMatch) {
      this.logger.info('[Paginator] Detected path-based pagination');
      return {
        type: 'path',
        urlPattern: urlObj.pathname.replace(/\/(\d+)/, '/{page}'),
        baseUrl: urlObj.origin,
        currentPage: parseInt(pathMatch[1])
      };
    }

    // Strategy 4: Look for next/prev links
    const paginationLinks = await page.evaluate(() => {
      const links = [];
      const selectors = [
        'a[rel="next"]',
        'a[class*="next"]',
        'a[class*="Next"]',
        'a:contains("Next")',
        'a[aria-label*="next" i]',
        'li.next a',
        'button[class*="next"]'
      ];

      for (const selector of selectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const href = el.getAttribute('href');
            const text = el.textContent.trim().toLowerCase();
            if (href && (text.includes('next') || text === '>' || text === '»')) {
              links.push(href);
            }
          }
        } catch (e) {
          // Selector might not be valid
        }
      }

      return links;
    });

    if (paginationLinks.length > 0) {
      const nextUrl = new URL(paginationLinks[0], currentUrl);

      // Analyze the next URL to determine pattern
      const nextParams = nextUrl.searchParams;

      // Check if it's a parameter-based pattern
      for (const param of pageParams) {
        if (nextParams.has(param) && !params.has(param)) {
          this.logger.info(`[Paginator] Detected pagination via next link: ${param}`);
          return {
            type: 'parameter',
            paramName: param,
            baseUrl: `${nextUrl.origin}${nextUrl.pathname}`,
            currentPage: 1
          };
        }
      }

      // Check if it's path-based
      if (nextUrl.pathname !== urlObj.pathname) {
        const pathDiff = nextUrl.pathname.replace(urlObj.pathname, '');
        if (/\/\d+/.test(pathDiff)) {
          this.logger.info('[Paginator] Detected path-based pagination via next link');
          return {
            type: 'path',
            urlPattern: urlObj.pathname + '/{page}',
            baseUrl: urlObj.origin,
            currentPage: 1
          };
        }
      }
    }

    // No pagination detected
    this.logger.info('[Paginator] No pagination pattern detected');
    return null;
  }

  /**
   * Generate URLs for all pages
   * @param {string} baseUrl - Base URL
   * @param {object} pattern - Pagination pattern
   * @param {number} maxPages - Maximum pages to generate
   * @param {number} minContacts - Minimum contacts required per page
   * @returns {Promise<Array>} - Array of URLs
   * @private
   */
  async _generatePageUrls(baseUrl, pattern, maxPages, minContacts) {
    const urls = [baseUrl]; // Start with the base URL

    try {
      for (let i = this.startPage + 1; i <= maxPages; i++) {
        let pageUrl;

        switch (pattern.type) {
          case 'parameter':
            pageUrl = this._generateParameterUrl(pattern, i);
            break;

          case 'path':
            pageUrl = this._generatePathUrl(pattern, i);
            break;

          case 'offset':
            pageUrl = this._generateOffsetUrl(pattern, i);
            break;

          case 'cursor':
            // Cursor-based pagination requires actual navigation
            this.logger.warn('[Paginator] Cursor-based pagination not fully supported yet');
            return urls;

          default:
            this.logger.warn(`[Paginator] Unknown pagination type: ${pattern.type}`);
            return urls;
        }

        // Validate the page URL (optional: can be disabled for performance)
        // For now, we'll generate all URLs and let the scraper handle validation
        urls.push(pageUrl);
      }

      return urls;

    } catch (error) {
      this.logger.error(`[Paginator] URL generation error: ${error.message}`);
      return urls;
    }
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

  /**
   * Check if content hash has been seen before
   * @param {string} hash - Content hash
   * @returns {boolean} - True if duplicate
   */
  isDuplicateContent(hash) {
    return this.seenContentHashes.has(hash);
  }

  /**
   * Add content hash to seen set
   * @param {string} hash - Content hash
   */
  markContentAsSeen(hash) {
    this.seenContentHashes.add(hash);
  }

  /**
   * Reset seen content hashes
   */
  resetSeenContent() {
    this.seenContentHashes.clear();
  }
}

module.exports = Paginator;

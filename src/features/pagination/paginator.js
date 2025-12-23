const crypto = require('crypto');
const { URL } = require('url');
const PatternDetector = require('./pattern-detector');
const BinarySearcher = require('./binary-searcher');
const UrlGenerator = require('./url-generator');

/**
 * Paginator - Handles automatic pagination detection and URL generation for scraping
 *
 * Features:
 * - Auto-detects pagination patterns (URL params, path segments, offsets, cursors)
 * - Validates page content to prevent infinite loops
 * - Detects duplicate/empty pages
 * - Detects infinite scroll (returns "not supported" error)
 * - Caches discovered patterns
 *
 * Delegates to specialized modules:
 * - PatternDetector: Discovers pagination patterns
 * - BinarySearcher: Finds true max page using binary search
 * - UrlGenerator: Generates page URLs from patterns
 */
class Paginator {
  constructor(browserManager, rateLimiter, logger, configLoader) {
    this.browserManager = browserManager;
    this.rateLimiter = rateLimiter;
    this.logger = logger;
    this.configLoader = configLoader;
    this.startPage = 1;
    this.seenContentHashes = new Set();

    // Initialize sub-modules
    this.patternDetector = new PatternDetector(logger, configLoader);
    this.binarySearcher = new BinarySearcher(logger, rateLimiter);
    this.urlGenerator = new UrlGenerator(logger);
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
      siteConfig = null,
      preDiscoveredPattern = null,  // NEW: Accept pre-discovered pattern
      cardSelector = null  // Card selector from config for accurate validation
    } = options;

    // Store cardSelector for use in binary search
    this.cardSelector = cardSelector;
    if (cardSelector) {
      this.logger.debug(`[Paginator] Using card selector for validation: ${cardSelector}`);
    }

    try {
      this.logger.info(`[Paginator] Starting pagination for: ${url}`);

      // Get page and navigate
      const page = await this.browserManager.getPage();
      await this.rateLimiter.waitBeforeRequest();

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

      // NEW: Validate we're on the correct starting URL
      const currentUrl = page.url();
      const targetUrl = new URL(url);
      const currentUrlObj = new URL(currentUrl);
      if (currentUrlObj.origin !== targetUrl.origin || currentUrlObj.pathname !== targetUrl.pathname) {
        this.logger.warn(`[Paginator] URL mismatch after navigation. Expected: ${url}, Got: ${currentUrl}`);
        // Allow redirects within same domain
        if (currentUrlObj.hostname.replace(/^www\./, '') !== targetUrl.hostname.replace(/^www\./, '')) {
          return {
            success: false,
            urls: [url],
            pattern: null,
            totalPages: 1,
            paginationType: 'error',
            error: 'URL redirected to different domain'
          };
        }
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

      // PRIORITY 1: Discover pagination pattern FIRST
      // NEW: Use pre-discovered pattern if provided, otherwise discover
      let pattern;
      if (preDiscoveredPattern) {
        this.logger.info('[Paginator] Using pre-discovered pattern');
        pattern = preDiscoveredPattern;
      } else {
        try {
          pattern = await this._discoverPaginationPattern(page, url, siteConfig);
        } catch (error) {
          this.logger.error(`[Paginator] Pattern detection error: ${error.message}`);
          this.logger.error(error.stack);

          return {
            success: false,
            urls: [url],
            pattern: null,
            totalPages: 1,
            paginationType: 'error',
            confidence: 0,
            detectionMethod: 'error',
            error: `Pattern detection failed: ${error.message}`
          };
        }
      }

      // PRIORITY 2: Check if infinite scroll ONLY if no clear pagination detected
      // Bypass infinite scroll check if:
      // 1. Pattern discovered with high confidence (>= 80%), OR
      // 2. Visual numeric pagination controls exist
      const visualControls = pattern ? { hasPagination: true, controlsType: 'numeric' } : await this._detectPaginationControls(page);

      const shouldCheckInfiniteScroll = !(
        (pattern && pattern.confidence >= 80) ||
        (visualControls?.hasPagination && visualControls?.controlsType === 'numeric')
      );

      if (shouldCheckInfiniteScroll) {
        this.logger.debug('[Paginator] Checking for infinite scroll...');
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
      } else {
        this.logger.debug('[Paginator] Skipping infinite scroll check - clear pagination detected');
      }

      if (!pattern) {
        this.logger.info('[Paginator] No pagination detected - single page');
        return {
          success: true,
          urls: [url],
          pattern: null,
          totalPages: 1,
          paginationType: 'none',
          confidence: 100,
          detectionMethod: 'none',
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

      // NEW: Find true max page using binary search
      const visualMax = pattern.maxPage || null;
      this.logger.info('[Paginator] Finding true max page via binary search...');

      const maxPageResult = await this._findTrueMaxPage(
        page,
        pattern,
        visualMax,
        minContacts,
        maxPages  // Hard cap
      );

      this.logger.info(`[Paginator] True max page: ${maxPageResult.trueMax}`);
      this.logger.info(`[Paginator] Pages tested: ${maxPageResult.testedPages.length}`);

      if (maxPageResult.isCapped) {
        this.logger.warn(`[Paginator] Hit hard cap at ${maxPages} pages - actual max may be higher`);
      }

      // Generate URLs based on true max (not visual max or hard cap)
      const urls = [];
      for (let i = 1; i <= maxPageResult.trueMax; i++) {
        const pageUrl = this._generateSinglePageUrl(pattern, i);
        urls.push(pageUrl);
      }

      this.logger.info(`[Paginator] Generated ${urls.length} page URLs (true max: ${maxPageResult.trueMax})`);

      // Calculate overall confidence score
      const confidence = this._calculateOverallConfidence(pattern, maxPageResult);

      this.logger.info(`[Paginator] Overall confidence: ${confidence}/100`);
      this.logger.info('');

      return {
        success: true,
        urls: urls,
        pattern: pattern,
        totalPages: urls.length,
        trueMaxPage: maxPageResult.trueMax,
        visualMaxPage: visualMax,
        isCapped: maxPageResult.isCapped,
        boundaryConfirmed: maxPageResult.boundaryConfirmed,
        testedPages: maxPageResult.testedPages,
        searchPath: maxPageResult.searchPath,
        paginationType: pattern.type,
        confidence: confidence,
        detectionMethod: pattern.detectionMethod || 'unknown',
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
      const infiniteScrollData = await page.evaluate(() => {
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

        // Count how many indicators are present
        const indicatorCount = indicators.filter(check => check()).length;

        return {
          count: indicatorCount,
          detected: indicatorCount >= 2  // Require at least 2 indicators
        };
      });

      if (infiniteScrollData.detected) {
        this.logger.debug(`[Paginator] Infinite scroll indicators found: ${infiniteScrollData.count}/5`);
      }

      return infiniteScrollData.detected;
    } catch (error) {
      return false;
    }
  }

  /**
   * Discover pagination pattern from current page (VISUAL-FIRST APPROACH)
   * Delegates to PatternDetector module
   * @param {object} page - Puppeteer page object
   * @param {string} currentUrl - Current page URL
   * @param {object} siteConfig - Site-specific configuration
   * @returns {Promise<object|null>} - Pattern object or null
   * @private
   */
  async _discoverPaginationPattern(page, currentUrl, siteConfig = null) {
    return await this.patternDetector.discoverPattern(page, currentUrl, siteConfig);
  }

  /**
   * Detect visual pagination controls in the DOM
   * Delegates to PatternDetector module
   * @param {object} page - Puppeteer page object
   * @returns {Promise<object>} - {hasPagination, maxPage, nextButton, prevButton, pageNumbers, controlsType, currentPage}
   * @private
   */
  async _detectPaginationControls(page) {
    return await this.patternDetector.detectPaginationControls(page);
  }

  /**
   * Extract max page number from text content
   * @param {object} page - Puppeteer page object
   * @returns {Promise<number|null>} - Max page number or null
   * @private
   */
  async _extractMaxPage(page) {
    try {
      return await page.evaluate(() => {
        const bodyText = document.body.innerText;

        // Strategy 1: Parse "Page X of Y" patterns
        const pageOfPatterns = [
          /page\s+\d+\s+of\s+(\d+)/i,
          /showing page\s+\d+\s+of\s+(\d+)/i,
          /\d+\s+of\s+(\d+)\s+pages/i,
          /page\s+\d+\/(\d+)/i
        ];

        for (const pattern of pageOfPatterns) {
          const match = bodyText.match(pattern);
          if (match) {
            const num = parseInt(match[1]);
            if (!isNaN(num) && num > 0 && num < 10000) {
              return num;
            }
          }
        }

        // Strategy 2: Calculate from results count
        const resultsPatterns = [
          /(\d+)-(\d+)\s+of\s+(\d+)/i, // "1-20 of 1000"
          /showing\s+(\d+)-(\d+)\s+of\s+(\d+)/i,
          /results\s+(\d+)-(\d+)\s+of\s+(\d+)/i
        ];

        for (const pattern of resultsPatterns) {
          const match = bodyText.match(pattern);
          if (match) {
            const perPage = parseInt(match[2]) - parseInt(match[1]) + 1;
            const total = parseInt(match[3]);
            if (!isNaN(perPage) && !isNaN(total) && perPage > 0) {
              const maxPage = Math.ceil(total / perPage);
              if (maxPage > 0 && maxPage < 10000) {
                return maxPage;
              }
            }
          }
        }

        // Strategy 3: Look for data attributes
        const elements = document.querySelectorAll('[data-total-pages], [data-max-page], [data-page-count]');
        for (const el of elements) {
          const totalPages = el.getAttribute('data-total-pages') ||
                           el.getAttribute('data-max-page') ||
                           el.getAttribute('data-page-count');
          if (totalPages) {
            const num = parseInt(totalPages);
            if (!isNaN(num) && num > 0 && num < 10000) {
              return num;
            }
          }
        }

        return null;
      });
    } catch (error) {
      return null;
    }
  }

  /**
   * Discover pagination pattern by clicking next button
   * @param {object} page - Puppeteer page object
   * @param {string} currentUrl - Current URL
   * @returns {Promise<object|null>} - Pattern object or null
   * @private
   */
  async _discoverPatternByNavigation(page, currentUrl) {
    try {
      // Store initial URL
      const url1 = currentUrl;

      // Click next button
      const nextClicked = await this._clickNextButton(page);
      if (!nextClicked) {
        return null;
      }

      // Wait for navigation with timeout handling
      try {
        await Promise.race([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
          page.waitForTimeout(5000) // Fallback for AJAX pagination
        ]);
      } catch (e) {
        // Navigation might fail for AJAX pagination
      }

      await page.waitForTimeout(1000); // Additional wait for content load

      // Get new URL
      const url2 = page.url();

      // If URL didn't change, it might be AJAX pagination (not supported yet)
      if (url1 === url2) {
        this.logger.warn('[Paginator] URL did not change after clicking next - possible AJAX pagination');
        return null;
      }

      // Compare URLs to find pattern
      const pattern = this._compareUrlsForPattern(url1, url2);

      // Navigate back to page 1
      try {
        await page.goto(url1, { waitUntil: 'domcontentloaded', timeout: 10000 });
      } catch (e) {
        this.logger.warn('[Paginator] Failed to navigate back to first page');
      }

      return pattern;
    } catch (error) {
      this.logger.error(`[Paginator] Navigation discovery error: ${error.message}`);
      return null;
    }
  }

  /**
   * Click next button
   * @param {object} page - Puppeteer page object
   * @returns {Promise<boolean>} - True if clicked successfully
   * @private
   */
  async _clickNextButton(page) {
    try {
      return await page.evaluate(() => {
        const selectors = [
          'a[rel="next"]:not(.disabled):not([aria-disabled="true"])',
          'a[aria-label*="next" i]:not([aria-disabled="true"])',
          'button[aria-label*="next" i]:not([disabled])',
          'a[class*="next"]:not(.disabled)',
          'button[class*="next"]:not(.disabled)',
          'a[class*="Next"]:not(.disabled)',
          'button[class*="Next"]:not(.disabled)',
          'a:has(svg[data-icon="chevron-right"])'
        ];

        for (const selector of selectors) {
          try {
            const button = document.querySelector(selector);
            if (button &&
                !button.disabled &&
                !button.classList.contains('disabled') &&
                button.getAttribute('aria-disabled') !== 'true' &&
                button.offsetParent !== null) { // visible check
              button.click();
              return true;
            }
          } catch (e) {
            // Selector might not work, continue to next
          }
        }
        return false;
      });
    } catch (error) {
      return false;
    }
  }

  /**
   * Compare two URLs to find pagination pattern
   * @param {string} url1 - First URL
   * @param {string} url2 - Second URL
   * @returns {object|null} - Pattern object or null
   * @private
   */
  _compareUrlsForPattern(url1, url2) {
    try {
      const parsed1 = new URL(url1);
      const parsed2 = new URL(url2);

      // Check parameters that changed
      const params1 = parsed1.searchParams;
      const params2 = parsed2.searchParams;

      for (const [key, value] of params2.entries()) {
        const oldValue = params1.get(key);
        if (oldValue !== value) {
          const oldNum = parseInt(oldValue);
          const newNum = parseInt(value);

          // Check if it incremented by 1
          if (!isNaN(oldNum) && !isNaN(newNum)) {
            if (newNum === oldNum + 1 || (oldNum === 0 && newNum === 1) || (!oldValue && newNum === 2)) {
              return {
                type: 'parameter',
                paramName: key,
                baseUrl: `${parsed2.origin}${parsed2.pathname}`,
                startValue: oldNum || 1
              };
            }

            // Check for offset pattern (0->20, 0->10, etc.)
            if (oldNum === 0 && newNum > 1 && newNum <= 100) {
              return {
                type: 'offset',
                paramName: key,
                baseUrl: `${parsed2.origin}${parsed2.pathname}`,
                itemsPerPage: newNum
              };
            }
          }
        }
      }

      // Check path changes
      if (parsed1.pathname !== parsed2.pathname) {
        const pathPattern = this._extractPathPattern(parsed1.pathname, parsed2.pathname);
        if (pathPattern) {
          pathPattern.baseUrl = parsed2.origin;
          return pathPattern;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract path-based pagination pattern
   * @param {string} path1 - First path
   * @param {string} path2 - Second path
   * @returns {object|null} - Pattern object or null
   * @private
   */
  _extractPathPattern(path1, path2) {
    try {
      // Split paths into segments
      const segments1 = path1.split('/').filter(s => s);
      const segments2 = path2.split('/').filter(s => s);

      if (segments1.length !== segments2.length) return null;

      // Find segment that changed from number to number+1
      for (let i = 0; i < segments1.length; i++) {
        const num1 = parseInt(segments1[i]);
        const num2 = parseInt(segments2[i]);

        if (!isNaN(num1) && !isNaN(num2) && num2 === num1 + 1) {
          // Build pattern with {page} placeholder
          const patternSegments = [...segments1];
          patternSegments[i] = '{page}';

          return {
            type: 'path',
            urlPattern: '/' + patternSegments.join('/')
          };
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate confidence score for pagination pattern
   * @param {object} pattern - Pattern object
   * @param {object} controls - Visual controls object
   * @returns {number} - Confidence score 0-100
   * @private
   */
  _calculatePatternConfidence(pattern, controls = null) {
    let confidence = 0;

    // Detection method scoring
    if (pattern.detectionMethod === 'manual') confidence += 40;
    else if (pattern.detectionMethod === 'cache') confidence += 35;
    else if (pattern.detectionMethod === 'navigation') confidence += 30;
    else if (pattern.detectionMethod === 'url-analysis') confidence += 15;

    // Pattern type scoring
    if (pattern.type === 'parameter' || pattern.type === 'path') confidence += 20;
    else if (pattern.type === 'offset') confidence += 15;

    // Visual controls found
    if (controls?.hasPagination) confidence += 20;

    // Max page known
    if (pattern.maxPage || controls?.maxPage) confidence += 15;

    // Has next button
    if (controls?.nextButton) confidence += 10;

    return Math.min(100, confidence);
  }

  /**
   * Calculate overall confidence including binary search results
   * @param {object} pattern - Pattern object
   * @param {object} binarySearchResult - Binary search result
   * @returns {number} - Confidence score 0-100
   * @private
   */
  _calculateOverallConfidence(pattern, binarySearchResult) {
    let confidence = 0;

    // Pattern detected: +30
    if (pattern) confidence += 30;

    // Detection method quality: +20
    if (pattern?.detectionMethod === 'manual') confidence += 20;
    else if (pattern?.detectionMethod === 'cache') confidence += 18;
    else if (pattern?.detectionMethod === 'navigation') confidence += 20;
    else if (pattern?.detectionMethod === 'url-analysis') confidence += 15;

    // Boundary confirmed: +25
    if (binarySearchResult?.boundaryConfirmed) confidence += 25;

    // True max found: +15
    if (binarySearchResult?.trueMax > 0) confidence += 15;

    // Not capped: +10
    if (!binarySearchResult?.isCapped) confidence += 10;

    return Math.min(100, confidence);
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
    const pageParams = [
      'page', 'p', 'pg', 'pageNum', 'pageNumber',
      'pn', 'pageNo', 'paging', 'pageindex', 'pageIndex',
      'currentPage', 'pageno'
    ];
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
    const offsetParams = [
      'offset', 'start', 'from', 'skip',
      'startIndex', 'startindex', 'begin'
    ];
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

  /**
   * Generate URL for a single page number
   * Delegates to UrlGenerator module
   * @param {object} pattern - Pagination pattern
   * @param {number} pageNum - Page number
   * @returns {string} - Generated URL
   * @private
   */
  _generateSinglePageUrl(pattern, pageNum) {
    return this.urlGenerator.generatePageUrl(pattern, pageNum);
  }

  /**
   * Test if a specific page number is valid (has contacts)
   * @param {object} page - Puppeteer page object
   * @param {object} pattern - Pagination pattern
   * @param {number} pageNum - Page number to test
   * @param {number} minContacts - Minimum contacts for validity
   * @returns {Promise<object>} - {hasContacts, contactCount, isEmpty, url, emailCount}
   * @private
   */
  async _testPageValidity(page, pattern, pageNum, minContacts = 1) {
    try {
      // Generate URL for this page
      const pageUrl = this._generateSinglePageUrl(pattern, pageNum);

      this.logger.debug(`[Paginator] Testing page ${pageNum}: ${pageUrl}`);

      // Navigate to page
      await page.goto(pageUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await page.waitForTimeout(1000);

      // Count contacts on page
      const validation = await this.validatePage(page);

      return {
        hasContacts: validation.contactEstimate >= minContacts,
        contactCount: validation.contactEstimate,
        isEmpty: validation.contactEstimate === 0,
        url: pageUrl,
        emailCount: validation.emailCount
      };

    } catch (error) {
      this.logger.error(`[Paginator] Error testing page ${pageNum}: ${error.message}`);
      return {
        hasContacts: false,
        contactCount: 0,
        isEmpty: true,
        url: null,
        error: error.message
      };
    }
  }

  /**
   * Find the true maximum page using binary search
   * Delegates to BinarySearcher module
   * @param {object} page - Puppeteer page object
   * @param {object} pattern - Pagination pattern object
   * @param {number|null} visualMax - Max page from visual detection (hint)
   * @param {number} minContacts - Minimum contacts to consider page valid
   * @param {number} hardCap - Maximum pages to search (default: 200)
   * @returns {Promise<object>} - {trueMax, isCapped, testedPages, searchPath, boundaryConfirmed}
   * @private
   */
  async _findTrueMaxPage(page, pattern, visualMax, minContacts, hardCap = 200) {
    const urlGeneratorFn = this.urlGenerator.createGenerator(pattern);
    return await this.binarySearcher.findTrueMaxPage(
      page,
      pattern,
      urlGeneratorFn,
      visualMax,
      minContacts,
      hardCap,
      this.cardSelector  // Pass card selector for accurate validation
    );
  }
}

module.exports = Paginator;

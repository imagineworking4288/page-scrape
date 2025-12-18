/**
 * Pagination Pattern Detector
 *
 * Discovers pagination patterns from web pages using multiple strategies:
 * 1. Manual config patterns
 * 2. Cached patterns
 * 3. Visual detection + navigation
 * 4. URL analysis (fallback)
 */

const { URL } = require('url');
const {
  PAGE_PARAMETER_NAMES,
  OFFSET_PARAMETER_NAMES,
  getPaginationParameterType
} = require('../../constants/pagination-patterns');

class PatternDetector {
  constructor(logger, configLoader = null) {
    this.logger = logger;
    this.configLoader = configLoader;
  }

  /**
   * Detect pagination parameters directly from URL (HIGHEST AUTOMATIC PRIORITY)
   * @param {string} url - URL to analyze
   * @returns {object} Detection result with type, paramName, value, confidence
   */
  detectUrlPaginationParams(url) {
    try {
      const urlObj = new URL(url);
      const params = urlObj.searchParams;

      // Check page parameters first (highest priority)
      for (const [paramName, paramValue] of params.entries()) {
        const paramType = getPaginationParameterType(paramName);

        if (paramType === 'page' && /^\d+$/.test(paramValue)) {
          return {
            found: true,
            type: 'parameter',
            paramName: paramName,
            currentValue: parseInt(paramValue),
            confidence: 'high',
            source: 'url-parameter'
          };
        }

        if (paramType === 'offset' && /^\d+$/.test(paramValue)) {
          return {
            found: true,
            type: 'offset',
            paramName: paramName,
            currentValue: parseInt(paramValue),
            confidence: 'high',
            source: 'url-parameter'
          };
        }
      }

      return { found: false };
    } catch (error) {
      this.logger.warn(`[PatternDetector] Error parsing URL: ${error.message}`);
      return { found: false, error: error.message };
    }
  }

  /**
   * Extract base URL without pagination parameters
   * @param {string} url - Full URL
   * @returns {string} Base URL with pagination params removed
   */
  extractBaseUrl(url) {
    try {
      const urlObj = new URL(url);

      // Remove known pagination parameters
      const allPaginationParams = [
        ...PAGE_PARAMETER_NAMES,
        ...OFFSET_PARAMETER_NAMES
      ];

      allPaginationParams.forEach(param => {
        urlObj.searchParams.delete(param);
      });

      return urlObj.toString();
    } catch (error) {
      return url;
    }
  }

  /**
   * Extract domain from URL
   * @param {string} url - URL to parse
   * @returns {string|null} Domain without www prefix
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch (error) {
      return null;
    }
  }

  /**
   * Discover pagination pattern from current page (URL-PARAMS-FIRST APPROACH)
   *
   * DETECTION PRIORITY ORDER (December 2025):
   * 1. Manual config patterns (highest)
   * 2. Cached patterns (from previous runs)
   * 3. URL parameters (HIGHEST AUTOMATIC) - page=N, offset=N, etc.
   * 4. Visual controls (medium) - Load More buttons, pagination links
   * 5. Scroll behavior (lowest) - Infinite scroll indicators
   *
   * @param {object} page - Puppeteer page object
   * @param {string} currentUrl - Current page URL
   * @param {object} siteConfig - Site-specific configuration
   * @returns {Promise<object|null>} - Pattern object or null
   */
  async discoverPattern(page, currentUrl, siteConfig = null) {
    try {
      this.logger.info('[PatternDetector] ========================================');
      this.logger.info('[PatternDetector] PAGINATION PATTERN DETECTION');
      this.logger.info('[PatternDetector] ========================================');
      this.logger.info('[PatternDetector] Detection priority order:');
      this.logger.info('[PatternDetector]   1. Manual config (if specified)');
      this.logger.info('[PatternDetector]   2. Cached patterns (from previous runs)');
      this.logger.info('[PatternDetector]   3. URL parameters (HIGHEST AUTOMATIC)');
      this.logger.info('[PatternDetector]   4. Visual controls (medium priority)');
      this.logger.info('[PatternDetector]   5. Scroll behavior (lowest priority)');
      this.logger.info('[PatternDetector] ========================================');

      // PRIORITY 1: Check manual config
      if (siteConfig?.pagination?.patterns) {
        const manualPattern = this._extractManualPattern(currentUrl, siteConfig.pagination.patterns);
        if (manualPattern) {
          this.logger.info('[PatternDetector] ✓ STEP 1: Using manual pattern from config');
          manualPattern.detectionMethod = 'manual';
          return manualPattern;
        }
      }
      this.logger.info('[PatternDetector] Step 1: No manual config pattern');

      // PRIORITY 2: Check cache
      const domain = this.extractDomain(currentUrl);
      const cachedPattern = this.configLoader?.getCachedPattern?.(domain);
      if (cachedPattern?.pattern) {
        this.logger.info('[PatternDetector] ✓ STEP 2: Using cached pattern');
        return cachedPattern.pattern;
      }
      this.logger.info('[PatternDetector] Step 2: No cached pattern');

      // PRIORITY 3: URL PARAMETERS (HIGHEST AUTOMATIC PRIORITY)
      this.logger.info('[PatternDetector] ========================================');
      this.logger.info('[PatternDetector] STEP 3: URL PARAMETER CHECK');
      this.logger.info('[PatternDetector] ========================================');
      const urlParams = this.detectUrlPaginationParams(currentUrl);

      if (urlParams.found) {
        this.logger.info(`[PatternDetector] ✓ URL parameter detected: ${urlParams.paramName}=${urlParams.currentValue}`);
        this.logger.info(`[PatternDetector] Pattern type: ${urlParams.type}`);
        this.logger.info(`[PatternDetector] Confidence: ${urlParams.confidence}`);
        this.logger.info(`[PatternDetector] This is the strongest automatic detection signal`);

        // Check if visual controls also exist (log warning but don't use them)
        const controls = await this.detectPaginationControls(page);
        if (controls.hasPagination || controls.hasLoadMore) {
          this.logger.warn('[PatternDetector] ----------------------------------------');
          this.logger.warn('[PatternDetector] ⚠ CONFLICT DETECTED');
          this.logger.warn('[PatternDetector] ----------------------------------------');
          this.logger.warn('[PatternDetector] Both URL params AND visual controls found');
          this.logger.warn('[PatternDetector] Resolution: URL parameters take precedence');
          this.logger.warn('[PatternDetector] Reason: URL params indicate server-side pagination');
          this.logger.warn('[PatternDetector]         (content replaces, not accumulates)');
          this.logger.warn('[PatternDetector] ----------------------------------------');
        }

        this.logger.info('[PatternDetector] Skipping remaining detection steps');
        this.logger.info('[PatternDetector] ========================================');

        return {
          type: urlParams.type,
          paginationType: urlParams.type,
          paramName: urlParams.paramName,
          currentPage: urlParams.currentValue,
          confidence: 1.0,  // High confidence for URL params
          source: urlParams.source,
          baseUrl: currentUrl,
          originalUrl: currentUrl,
          detectionMethod: 'url-parameter'
        };
      }

      this.logger.info('[PatternDetector] No URL parameters found');
      this.logger.info('[PatternDetector] ========================================');

      // PRIORITY 4: Visual detection + navigation (only if no URL params)
      this.logger.info('[PatternDetector] STEP 4: VISUAL CONTROL CHECK');
      this.logger.info('[PatternDetector] ========================================');
      const controls = await this.detectPaginationControls(page);

      if (controls.hasPagination) {
        this.logger.info(`[PatternDetector] ✓ Found pagination controls: type=${controls.controlsType}, maxPage=${controls.maxPage}`);

        // Try to discover pattern by clicking next
        const navPattern = await this._discoverPatternByNavigation(page, currentUrl);
        if (navPattern) {
          navPattern.maxPage = controls.maxPage;
          navPattern.currentPage = controls.currentPage;
          navPattern.detectionMethod = 'navigation';
          const confidence = this.calculatePatternConfidence(navPattern, controls);
          navPattern.confidence = confidence;
          this.logger.info(`[PatternDetector] Discovered pattern by navigation: ${navPattern.type} (confidence: ${confidence})`);
          return navPattern;
        }
      } else {
        this.logger.info('[PatternDetector] No visual pagination controls found');
      }

      // PRIORITY 5: Check for infinite scroll (lowest priority)
      this.logger.info('[PatternDetector] ========================================');
      this.logger.info('[PatternDetector] STEP 5: SCROLL BEHAVIOR CHECK');
      this.logger.info('[PatternDetector] ========================================');
      const infiniteScrollResult = await this.detectInfiniteScroll(page);
      if (infiniteScrollResult.detected) {
        this.logger.info(`[PatternDetector] ✓ Detected infinite scroll (score: ${infiniteScrollResult.score}/10)`);
        return {
          type: 'infinite-scroll',
          paginationType: 'infinite-scroll',
          detectionMethod: 'infinite-scroll-detection',
          confidence: infiniteScrollResult.score / 10,
          indicators: infiniteScrollResult.indicators
        };
      }

      this.logger.info('[PatternDetector] No infinite scroll detected');

      // PRIORITY 6: URL pattern detection via page analysis (last resort fallback)
      this.logger.info('[PatternDetector] ========================================');
      this.logger.info('[PatternDetector] STEP 6: URL PATTERN ANALYSIS (FALLBACK)');
      this.logger.info('[PatternDetector] ========================================');
      const urlPattern = await this._autoDetectPattern(page, currentUrl);
      if (urlPattern) {
        urlPattern.detectionMethod = 'url-analysis';
        const confidence = this.calculatePatternConfidence(urlPattern, controls);
        urlPattern.confidence = confidence;
        this.logger.info(`[PatternDetector] ✓ Detected URL pattern: ${urlPattern.type} (confidence: ${confidence})`);
        return urlPattern;
      }

      this.logger.info('[PatternDetector] ========================================');
      this.logger.info('[PatternDetector] DETECTION COMPLETE: No pagination found');
      this.logger.info('[PatternDetector] ========================================');
      return null;

    } catch (error) {
      this.logger.error(`[PatternDetector] Pattern discovery error: ${error.message}`);
      return null;
    }
  }

  /**
   * Detect visual pagination controls in the DOM
   * @param {object} page - Puppeteer page object
   * @returns {Promise<object>} - Control detection result
   */
  async detectPaginationControls(page) {
    try {
      const controls = await page.evaluate(() => {
        // Container selectors
        const containerSelectors = [
          'nav[aria-label*="pagination" i]',
          'nav[role="navigation"]',
          '.pagination',
          '[class*="paginat"]',
          '[class*="Paginat"]',
          'ul.pagination',
          'div.pagination'
        ];

        // Next button selectors
        const nextSelectors = [
          'a[rel="next"]:not(.disabled):not([aria-disabled="true"])',
          'a[aria-label*="next" i]:not([aria-disabled="true"])',
          'button[aria-label*="next" i]:not([disabled])',
          'a[class*="next"]:not(.disabled)',
          'button[class*="next"]:not(.disabled)',
          'a:has(svg[data-icon="chevron-right"])',
          'a[class*="Next"]:not(.disabled)',
          'button[class*="Next"]:not(.disabled)'
        ];

        // Prev button selectors
        const prevSelectors = [
          'a[rel="prev"]:not(.disabled)',
          'a[aria-label*="prev" i]:not([aria-disabled="true"])',
          'a[aria-label*="previous" i]:not([aria-disabled="true"])',
          'button[aria-label*="prev" i]:not([disabled])',
          'a[class*="prev"]:not(.disabled)',
          'button[class*="prev"]:not(.disabled)'
        ];

        // Page number selectors
        const pageNumberSelectors = [
          'a[aria-label*="page" i]',
          '.page-link',
          '[class*="page-number"]',
          '[data-page]',
          'button[data-page]',
          'a.page',
          '[class*="PageNumber"]'
        ];

        // Current page indicators
        const currentPageSelectors = [
          '.active[data-page]',
          '[aria-current="page"]',
          '.current',
          '[class*="active"][data-page]',
          '.selected[data-page]'
        ];

        // Find pagination container
        let container = null;
        for (const selector of containerSelectors) {
          const el = document.querySelector(selector);
          if (el) {
            container = el;
            break;
          }
        }

        // Find next button
        let nextButton = null;
        for (const selector of nextSelectors) {
          const el = document.querySelector(selector);
          if (el && el.offsetParent !== null) {
            nextButton = { selector, text: el.textContent.trim() };
            break;
          }
        }

        // Find prev button
        let prevButton = null;
        for (const selector of prevSelectors) {
          const el = document.querySelector(selector);
          if (el && el.offsetParent !== null) {
            prevButton = { selector, text: el.textContent.trim() };
            break;
          }
        }

        // Extract page numbers
        const pageNumbers = [];
        for (const selector of pageNumberSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const text = el.textContent.trim();
            const num = parseInt(text);
            if (!isNaN(num) && num > 0 && num < 10000) {
              pageNumbers.push(num);
            }
            const dataPage = el.getAttribute('data-page');
            if (dataPage) {
              const num = parseInt(dataPage);
              if (!isNaN(num) && num > 0 && num < 10000) {
                pageNumbers.push(num);
              }
            }
          }
        }

        // Find current page
        let currentPage = null;
        for (const selector of currentPageSelectors) {
          const el = document.querySelector(selector);
          if (el) {
            const text = el.textContent.trim();
            const num = parseInt(text);
            if (!isNaN(num) && num > 0) {
              currentPage = num;
              break;
            }
            const dataPage = el.getAttribute('data-page');
            if (dataPage) {
              const num = parseInt(dataPage);
              if (!isNaN(num) && num > 0) {
                currentPage = num;
                break;
              }
            }
          }
        }

        // Determine control type
        let controlsType = 'none';
        if (pageNumbers.length > 0) {
          controlsType = 'numeric';
        } else if (nextButton || prevButton) {
          controlsType = 'next-prev';
        }

        const maxPage = pageNumbers.length > 0 ? Math.max(...pageNumbers) : null;

        return {
          hasPagination: !!container || !!nextButton || pageNumbers.length > 0,
          maxPage,
          nextButton,
          prevButton,
          pageNumbers: [...new Set(pageNumbers)].sort((a, b) => a - b),
          controlsType,
          currentPage
        };
      });

      // Try to extract max page from text
      if (!controls.maxPage) {
        const maxPageFromText = await this._extractMaxPage(page);
        if (maxPageFromText) {
          controls.maxPage = maxPageFromText;
        }
      }

      return controls;
    } catch (error) {
      this.logger.error(`[PatternDetector] Error detecting pagination controls: ${error.message}`);
      return {
        hasPagination: false,
        maxPage: null,
        nextButton: null,
        prevButton: null,
        pageNumbers: [],
        controlsType: 'none',
        currentPage: null
      };
    }
  }

  /**
   * Calculate confidence score for pagination pattern
   * @param {object} pattern - Pattern object
   * @param {object} controls - Visual controls object
   * @returns {number} - Confidence score 0-100
   */
  calculatePatternConfidence(pattern, controls = null) {
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
          /(\d+)-(\d+)\s+of\s+(\d+)/i,
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
      const url1 = currentUrl;

      // Click next button
      const nextClicked = await this._clickNextButton(page);
      if (!nextClicked) {
        return null;
      }

      // Wait for navigation
      try {
        await Promise.race([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
          page.waitForTimeout(5000)
        ]);
      } catch (e) {
        // Navigation might fail for AJAX pagination
      }

      await page.waitForTimeout(1000);

      const url2 = page.url();

      if (url1 === url2) {
        this.logger.warn('[PatternDetector] URL did not change after clicking next - possible AJAX pagination');
        return null;
      }

      // Compare URLs to find pattern
      const pattern = this._compareUrlsForPattern(url1, url2);

      // Navigate back to page 1
      try {
        await page.goto(url1, { waitUntil: 'domcontentloaded', timeout: 10000 });
      } catch (e) {
        this.logger.warn('[PatternDetector] Failed to navigate back to first page');
      }

      return pattern;
    } catch (error) {
      this.logger.error(`[PatternDetector] Navigation discovery error: ${error.message}`);
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
                button.offsetParent !== null) {
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

      const params1 = parsed1.searchParams;
      const params2 = parsed2.searchParams;

      for (const [key, value] of params2.entries()) {
        const oldValue = params1.get(key);
        if (oldValue !== value) {
          const oldNum = parseInt(oldValue);
          const newNum = parseInt(value);

          if (!isNaN(oldNum) && !isNaN(newNum)) {
            if (newNum === oldNum + 1 || (oldNum === 0 && newNum === 1) || (!oldValue && newNum === 2)) {
              return {
                type: 'parameter',
                paramName: key,
                baseUrl: `${parsed2.origin}${parsed2.pathname}`,
                startValue: oldNum || 1
              };
            }

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
      const segments1 = path1.split('/').filter(s => s);
      const segments2 = path2.split('/').filter(s => s);

      if (segments1.length !== segments2.length) return null;

      for (let i = 0; i < segments1.length; i++) {
        const num1 = parseInt(segments1[i]);
        const num2 = parseInt(segments2[i]);

        if (!isNaN(num1) && !isNaN(num2) && num2 === num1 + 1) {
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
   * Extract manual pattern from config
   * @param {string} url - Current URL
   * @param {object} patterns - Pattern configuration
   * @returns {object|null} - Pattern object or null
   * @private
   */
  _extractManualPattern(url, patterns) {
    if (!patterns) return null;

    const urlObj = new URL(url);

    if (patterns.pageParameterName) {
      return {
        type: 'parameter',
        paramName: patterns.pageParameterName,
        baseUrl: `${urlObj.origin}${urlObj.pathname}`
      };
    }

    if (patterns.offsetParameterName) {
      return {
        type: 'offset',
        paramName: patterns.offsetParameterName,
        baseUrl: `${urlObj.origin}${urlObj.pathname}`,
        itemsPerPage: 10
      };
    }

    if (patterns.cursorParameterName) {
      return {
        type: 'cursor',
        paramName: patterns.cursorParameterName,
        baseUrl: `${urlObj.origin}${urlObj.pathname}`
      };
    }

    if (patterns.urlPattern) {
      return {
        type: 'path',
        urlPattern: patterns.urlPattern
      };
    }

    return null;
  }

  /**
   * Auto-detect pagination pattern from URL and page analysis
   * @param {object} page - Puppeteer page object
   * @param {string} currentUrl - Current URL
   * @returns {Promise<object|null>} - Pattern object or null
   * @private
   */
  async _autoDetectPattern(page, currentUrl) {
    const urlObj = new URL(currentUrl);
    const params = urlObj.searchParams;

    // Strategy 1: Check URL parameters using centralized constants
    // This automatically supports new pagination formats added to PAGE_PARAMETER_NAMES
    for (const [paramName, paramValue] of params.entries()) {
      const paramType = getPaginationParameterType(paramName);

      if (paramType === 'page' && /^\d+$/.test(paramValue)) {
        this.logger.info(`[PatternDetector] Detected page parameter: "${paramName}" (value: ${paramValue})`);
        return {
          type: 'parameter',
          paramName: paramName,
          baseUrl: currentUrl, // Preserve full URL with all query params
          originalUrl: currentUrl,
          currentPage: parseInt(paramValue)
        };
      }

      if (paramType === 'offset' && /^\d+$/.test(paramValue)) {
        this.logger.info(`[PatternDetector] Detected offset parameter: "${paramName}" (value: ${paramValue})`);
        return {
          type: 'offset',
          paramName: paramName,
          baseUrl: currentUrl, // Preserve full URL with all query params
          originalUrl: currentUrl,
          currentOffset: parseInt(paramValue),
          itemsPerPage: 10
        };
      }
    }

    // Fallback: Check known parameter names that might not be in URL yet
    for (const param of PAGE_PARAMETER_NAMES) {
      if (params.has(param)) {
        const value = params.get(param);
        if (/^\d+$/.test(value)) {
          this.logger.info(`[PatternDetector] Detected URL parameter pattern: ${param}`);
          return {
            type: 'parameter',
            paramName: param,
            baseUrl: currentUrl,
            originalUrl: currentUrl,
            currentPage: parseInt(value)
          };
        }
      }
    }

    for (const param of OFFSET_PARAMETER_NAMES) {
      if (params.has(param)) {
        const value = params.get(param);
        if (/^\d+$/.test(value)) {
          this.logger.info(`[PatternDetector] Detected offset parameter pattern: ${param}`);
          return {
            type: 'offset',
            paramName: param,
            baseUrl: currentUrl,
            originalUrl: currentUrl,
            currentOffset: parseInt(value),
            itemsPerPage: 10
          };
        }
      }
    }

    // Strategy 3: Check URL path for page numbers
    const pathMatch = urlObj.pathname.match(/\/(?:page|p)\/(\d+)/i);
    if (pathMatch) {
      this.logger.info('[PatternDetector] Detected path-based pagination');
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
      const nextParams = nextUrl.searchParams;

      for (const param of pageParams) {
        if (nextParams.has(param) && !params.has(param)) {
          this.logger.info(`[PatternDetector] Detected pagination via next link: ${param}`);
          return {
            type: 'parameter',
            paramName: param,
            baseUrl: `${nextUrl.origin}${nextUrl.pathname}`,
            currentPage: 1
          };
        }
      }

      if (nextUrl.pathname !== urlObj.pathname) {
        const pathDiff = nextUrl.pathname.replace(urlObj.pathname, '');
        if (/\/\d+/.test(pathDiff)) {
          this.logger.info('[PatternDetector] Detected path-based pagination via next link');
          return {
            type: 'path',
            urlPattern: urlObj.pathname + '/{page}',
            baseUrl: urlObj.origin,
            currentPage: 1
          };
        }
      }
    }

    this.logger.info('[PatternDetector] No pagination pattern detected');
    return null;
  }

  /**
   * Detect if page uses infinite scroll
   * @param {object} page - Puppeteer page object
   * @returns {Promise<object>} - { detected, score, indicators }
   */
  async detectInfiniteScroll(page) {
    try {
      const indicators = await page.evaluate(() => {
        const result = {
          hasInfiniteScrollLibrary: false,
          hasLazyLoadElements: false,
          hasScrollListeners: false,
          containerHeight: 0,
          hasLoadMoreZone: false,
          hasLoadMoreButton: false,
          hasVirtualList: false,
          hasObserverAPI: false
        };

        // Check for infinite scroll libraries
        if (window.InfiniteScroll || window.infiniteScroll ||
            window.__INFINITE_SCROLL__ || window.Waypoints) {
          result.hasInfiniteScrollLibrary = true;
        }

        // Check for lazy-load attributes
        const lazyElements = document.querySelectorAll(
          '[data-lazy], [loading="lazy"], .lazy-load, .lazy, [data-src], .lazyload'
        );
        result.hasLazyLoadElements = lazyElements.length > 5;

        // Check for scroll event listeners in scripts
        const scripts = Array.from(document.querySelectorAll('script'));
        result.hasScrollListeners = scripts.some(s =>
          s.textContent &&
          (s.textContent.includes('addEventListener') || s.textContent.includes('onscroll')) &&
          (s.textContent.includes('scroll') || s.textContent.includes('loadMore'))
        );

        // Check if main content container is very tall
        const mainContainer = document.querySelector(
          'main, #main, .main-content, [role="main"], .content, #content'
        );
        if (mainContainer) {
          result.containerHeight = mainContainer.scrollHeight;
        }

        // Check for "load more" zones or triggers
        const loadZone = document.querySelector(
          '[data-load-more], .load-more-zone, #load-more-trigger, ' +
          '.infinite-scroll-trigger, [data-infinite], .loading-trigger'
        );
        result.hasLoadMoreZone = !!loadZone;

        // Check for Load More button
        const loadMoreButton = document.querySelector(
          'button[class*="load-more"], button[class*="loadmore"], ' +
          'a[class*="load-more"], .show-more, #show-more, ' +
          '[data-action="load-more"], button:contains("Load More")'
        );
        result.hasLoadMoreButton = !!loadMoreButton;

        // Check for virtual list/windowing libraries
        if (document.querySelector('[data-index], [style*="height:"][style*="position:"]')) {
          const potentialVirtual = document.querySelectorAll('[data-index]');
          result.hasVirtualList = potentialVirtual.length > 10;
        }

        // Check if page uses IntersectionObserver
        result.hasObserverAPI = typeof IntersectionObserver !== 'undefined' &&
          document.querySelectorAll('[data-observe], .observe').length > 0;

        return result;
      });

      // Calculate score
      let score = 0;
      if (indicators.hasInfiniteScrollLibrary) score += 3;
      if (indicators.hasLazyLoadElements) score += 2;
      if (indicators.hasScrollListeners) score += 2;
      if (indicators.hasLoadMoreZone) score += 2;
      if (indicators.hasLoadMoreButton) score += 1;
      if (indicators.hasVirtualList) score += 2;
      if (indicators.hasObserverAPI) score += 1;
      if (indicators.containerHeight > 5000) score += 1;

      // Additional check: Try scrolling to detect dynamic content loading
      if (score < 4) {
        const scrollTest = await this._testScrollLoading(page);
        if (scrollTest.hasNewContent) {
          score += 3;
          indicators.scrollTestPassed = true;
        }
      }

      return {
        detected: score >= 4,
        score: Math.min(score, 10),
        indicators
      };

    } catch (error) {
      this.logger.warn(`[PatternDetector] Infinite scroll detection error: ${error.message}`);
      return { detected: false, score: 0, indicators: {} };
    }
  }

  /**
   * Test if scrolling loads new content
   * @param {object} page - Puppeteer page object
   * @returns {Promise<object>} - { hasNewContent, initialCount, finalCount }
   */
  async _testScrollLoading(page) {
    try {
      // Get initial state
      const initialState = await page.evaluate(() => {
        const containers = document.querySelectorAll(
          'article, .card, .item, .result, [class*="card"], [class*="item"]'
        );
        return {
          count: containers.length,
          height: document.body.scrollHeight
        };
      });

      // Scroll down
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      // Wait for potential content
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check new state
      const finalState = await page.evaluate(() => {
        const containers = document.querySelectorAll(
          'article, .card, .item, .result, [class*="card"], [class*="item"]'
        );
        return {
          count: containers.length,
          height: document.body.scrollHeight
        };
      });

      // Scroll back to top
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });

      return {
        hasNewContent: finalState.count > initialState.count ||
                       finalState.height > initialState.height + 100,
        initialCount: initialState.count,
        finalCount: finalState.count,
        heightDiff: finalState.height - initialState.height
      };

    } catch (error) {
      return { hasNewContent: false, error: error.message };
    }
  }
}

module.exports = PatternDetector;

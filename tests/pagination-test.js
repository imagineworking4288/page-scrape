#!/usr/bin/env node

/**
 * Pagination Testing Utility
 *
 * Comprehensive pagination detection and validation for the Universal Professional Directory Scraper.
 * Analyzes pagination patterns, validates page URLs, and provides confidence scoring.
 *
 * Usage:
 *   node tests/pagination-test.js --url <url> [options]
 *
 * Options:
 *   --url <url>              Target URL to test (required)
 *   --headless [value]       Run browser in headless mode (default: true)
 *   --max-pages <number>     Maximum pages to generate (default: 200)
 *   --validate-sample <n>    Number of pages to validate (default: 10)
 *   --min-contacts <number>  Minimum contacts per page (default: 1)
 *   --timeout <ms>           Navigation timeout (default: 30000)
 *   --save-cache            Save discovered pattern to cache
 *   --clear-cache           Clear cache before testing
 *   --output <file>         Save JSON results to file
 */

const { Command } = require('commander');
const Table = require('cli-table3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Import utilities
const logger = require('../utils/logger');
const BrowserManager = require('../utils/browser-manager');
const RateLimiter = require('../utils/rate-limiter');
const ConfigLoader = require('../utils/config-loader');
const Paginator = require('../utils/paginator');

// CLI setup
const program = new Command();
program
  .name('pagination-test')
  .description('Comprehensive pagination detection and validation utility')
  .version('1.0.0')
  .requiredOption('--url <url>', 'Target URL to test')
  .option('--headless [value]', 'Run browser in headless mode', 'true')
  .option('--max-pages <number>', 'Maximum pages to generate', parseInt, 200)
  .option('--validate-sample <number>', 'Number of pages to validate', parseInt, 10)
  .option('--min-contacts <number>', 'Minimum contacts per page', parseInt, 1)
  .option('--timeout <ms>', 'Navigation timeout in milliseconds', parseInt, 30000)
  .option('--save-cache', 'Save discovered pattern to cache')
  .option('--clear-cache', 'Clear cache before testing')
  .option('--output <file>', 'Save JSON results to file')
  .parse(process.argv);

const options = program.opts();

// Parse headless option
function parseHeadless(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'false' || lower === '0' || lower === 'no') {
      return false;
    }
  }
  return true;
}

/**
 * Main test execution
 */
async function main() {
  let browserManager = null;
  const startTime = Date.now();

  try {
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('  PAGINATION DETECTION & VALIDATION UTILITY');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('');

    // Initialize components
    logger.info('Initializing components...');
    browserManager = new BrowserManager(logger);
    const rateLimiter = new RateLimiter(logger, { minDelay: 1000, maxDelay: 2000 });
    const configLoader = new ConfigLoader(logger);

    // Clear cache if requested
    if (options.clearCache) {
      logger.info('Clearing pagination cache...');
      configLoader.clearAllCachedPatterns();
    }

    const headless = parseHeadless(options.headless);
    await browserManager.launch(headless);

    logger.info(`Target URL: ${options.url}`);
    logger.info(`Max pages: ${options.maxPages}`);
    logger.info(`Validate sample: ${options.validateSample}`);
    logger.info(`Headless mode: ${headless}`);
    logger.info('');

    // Extract domain
    const domain = new URL(options.url).hostname.replace(/^www\./, '');

    // Initialize results object
    const results = {
      targetUrl: options.url,
      domain: domain,
      testedAt: new Date().toISOString(),
      paginationType: 'none',
      patternDetected: false,
      detectionMethod: null,
      pattern: null,
      totalPagesFound: 1,
      actualPagesValidated: 0,
      uniquePages: 0,
      duplicatePages: 0,
      emptyPages: 0,
      sampleUrls: {
        first5: [],
        middle5: [],
        last5: []
      },
      validationSummary: {
        totalValidated: 0,
        successfulLoads: 0,
        failedLoads: 0,
        averageContactsPerPage: 0,
        averageLoadTime: 0,
        duplicatesDetected: 0
      },
      confidence: 0,
      reliability: 'low',
      warnings: [],
      issues: [],
      wasCached: false,
      savedToCache: false,
      visualMaxPage: null,
      trueMaxPage: null,
      boundaryConfirmed: false,
      hardCapped: false,
      binarySearchTestedPages: 0,
      searchPath: []
    };

    // ═══════════════════════════════════════════════════════
    // PHASE 1: PRE-DETECTION CHECKS
    // ═══════════════════════════════════════════════════════
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('  PHASE 1: PRE-DETECTION CHECKS');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('');

    const page = await browserManager.getPage();
    logger.info(`Navigating to: ${options.url}`);
    await page.goto(options.url, { waitUntil: 'networkidle0', timeout: options.timeout });
    await page.waitForTimeout(2000);

    // Check initial content
    const initialCheck = await analyzePageContent(page);
    logger.info(`Page loaded: ${initialCheck.hasContent ? 'YES' : 'NO'}`);
    logger.info(`Emails found: ${initialCheck.emailCount}`);
    logger.info(`Contact estimate: ${initialCheck.contactEstimate}`);
    logger.info(`Infinite scroll: ${initialCheck.hasInfiniteScroll ? 'DETECTED' : 'NO'}`);
    logger.info('');

    if (!initialCheck.hasContent) {
      results.issues.push('Page has no content');
      results.reliability = 'low';
      await finalize(browserManager, results, startTime);
      return;
    }

    if (initialCheck.hasInfiniteScroll) {
      results.warnings.push('Infinite scroll detected - pagination may not be supported');
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 1.5: VISUAL PAGINATION DETECTION
    // ═══════════════════════════════════════════════════════
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('  PHASE 1.5: VISUAL PAGINATION DETECTION');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('');

    // Detect visual pagination controls
    const visualControls = await detectVisualPaginationControls(page);

    logger.info(`Controls detected: ${visualControls.hasPagination ? 'YES' : 'NO'}`);
    if (visualControls.hasPagination) {
      logger.info(`Controls type: ${visualControls.controlsType}`);
      logger.info(`Current page: ${visualControls.currentPage || 'Unknown'}`);
      logger.info(`Max page: ${visualControls.maxPage || 'Unknown'}`);
      logger.info(`Next button: ${visualControls.nextButton ? 'YES' : 'NO'}`);
      logger.info(`Prev button: ${visualControls.prevButton ? 'YES' : 'NO'}`);
      logger.info(`Page numbers visible: ${visualControls.pageNumbers.length > 0 ? visualControls.pageNumbers.join(', ') : 'NO'}`);
    } else {
      logger.info('No visual pagination controls found in DOM');
    }
    logger.info('');

    // Store visual detection results
    results.visualDetection = {
      hasPagination: visualControls.hasPagination,
      controlsType: visualControls.controlsType,
      currentPage: visualControls.currentPage,
      maxPage: visualControls.maxPage,
      hasNextButton: !!visualControls.nextButton,
      hasPrevButton: !!visualControls.prevButton,
      pageNumbersVisible: visualControls.pageNumbers.length,
      pageNumbers: visualControls.pageNumbers
    };

    // ═══════════════════════════════════════════════════════
    // PHASE 2: PATTERN DETECTION
    // ═══════════════════════════════════════════════════════
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('  PHASE 2: PATTERN DETECTION');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('');

    const detectionResults = {
      manual: null,
      cached: null,
      visual: visualControls.hasPagination ? visualControls : null,
      navigation: null,
      autoUrl: null,
      autoOffset: null,
      autoPath: null,
      autoLinks: null
    };

    // A. Check manual config
    logger.info('[1/5] Checking manual configuration...');
    const siteConfig = configLoader.loadConfig(options.url);
    if (siteConfig && siteConfig.pagination && siteConfig.pagination.patterns) {
      detectionResults.manual = extractManualPattern(options.url, siteConfig.pagination.patterns);
      if (detectionResults.manual) {
        logger.info(`  ✓ Manual pattern found: ${detectionResults.manual.type}`);
      } else {
        logger.info('  ✗ No manual pattern configured');
      }
    } else {
      logger.info('  ✗ No manual pattern configured');
    }

    // B. Check cache
    logger.info('[2/5] Checking cached patterns...');
    const cachedPattern = configLoader.getCachedPattern(domain);
    if (cachedPattern && cachedPattern.pattern) {
      detectionResults.cached = cachedPattern.pattern;
      results.wasCached = true;
      logger.info(`  ✓ Cached pattern found: ${cachedPattern.pattern.type}`);
      logger.info(`    Cached at: ${cachedPattern.cachedAt}`);
    } else {
      logger.info('  ✗ No cached pattern');
    }

    // C. Visual detection (already done in Phase 1.5)
    logger.info('[3/5] Visual pagination controls detection...');
    if (visualControls.hasPagination) {
      logger.info(`  ✓ Visual controls detected: ${visualControls.controlsType}`);
    } else {
      logger.info('  ✗ No visual pagination controls');
    }

    // D. Navigation-based detection (click next and observe)
    logger.info('[4/5] Navigation-based pattern discovery...');
    if (visualControls.hasPagination && visualControls.nextButton) {
      try {
        detectionResults.navigation = await discoverPatternByNavigation(page, options.url, visualControls);
        if (detectionResults.navigation) {
          logger.info(`  ✓ Pattern discovered by navigation: ${detectionResults.navigation.type}`);
        } else {
          logger.info('  ✗ Failed to discover pattern by navigation');
        }
      } catch (error) {
        logger.info(`  ✗ Navigation discovery failed: ${error.message}`);
      }
    } else {
      logger.info('  ⊘ Skipped (no next button found)');
    }

    // E. URL pattern analysis (fallback)
    logger.info('[5/5] URL pattern analysis...');
    detectionResults.autoUrl = await detectUrlParameterPattern(page, options.url);
    detectionResults.autoPath = detectPathPattern(options.url);
    if (detectionResults.autoUrl) {
      logger.info(`  ✓ URL parameter pattern: ${detectionResults.autoUrl.paramName}`);
    } else if (detectionResults.autoPath) {
      logger.info(`  ✓ Path pattern: ${detectionResults.autoPath.urlPattern}`);
    } else {
      logger.info('  ✗ No URL pattern detected');
    }

    logger.info('');

    // Select best pattern
    const selectedPattern = selectBestPattern(detectionResults);
    if (selectedPattern) {
      results.patternDetected = true;
      results.pattern = selectedPattern.pattern;
      results.paginationType = selectedPattern.pattern.type;
      results.detectionMethod = selectedPattern.method;

      logger.info(`✓ Selected pattern: ${selectedPattern.pattern.type} (via ${selectedPattern.method})`);

      // Calculate and display confidence score
      const confidence = calculatePatternConfidence(selectedPattern.pattern, selectedPattern.method, visualControls);
      results.confidence = confidence;

      // Determine reliability level
      if (confidence >= 80) {
        results.reliability = 'high';
      } else if (confidence >= 50) {
        results.reliability = 'medium';
      } else {
        results.reliability = 'low';
      }

      logger.info(`Confidence score: ${confidence}/100 (${results.reliability.toUpperCase()})`);
      logger.info('');
    } else {
      logger.warn('✗ No pagination pattern detected');
      results.issues.push('No pagination pattern detected');
      await finalize(browserManager, results, startTime);
      return;
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 3: TRUE MAX PAGE DISCOVERY (BINARY SEARCH)
    // ═══════════════════════════════════════════════════════
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('  PHASE 3: TRUE MAX PAGE DISCOVERY (BINARY SEARCH)');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('');

    // Use Paginator to get binary search results
    const paginator = new Paginator(browserManager, rateLimiter, logger, configLoader);
    const paginationResult = await paginator.paginate(options.url, {
      maxPages: options.maxPages,
      minContacts: options.minContacts,
      timeout: options.timeout,
      discoverOnly: false,
      siteConfig: siteConfig
    });

    if (!paginationResult.success) {
      logger.error('✗ Pagination failed: ' + paginationResult.error);
      results.issues.push('Pagination failed: ' + paginationResult.error);
      await finalize(browserManager, results, startTime);
      return;
    }

    results.visualMaxPage = paginationResult.visualMaxPage;
    results.trueMaxPage = paginationResult.trueMaxPage;
    results.boundaryConfirmed = paginationResult.boundaryConfirmed;
    results.hardCapped = paginationResult.isCapped;
    results.binarySearchTestedPages = paginationResult.testedPages?.length || 0;
    results.searchPath = paginationResult.searchPath || [];

    logger.info(`Visual max page: ${paginationResult.visualMaxPage || 'N/A'}`);
    logger.info(`True max page: ${paginationResult.trueMaxPage}`);
    logger.info(`Pages tested: ${paginationResult.testedPages?.length || 0}`);
    logger.info(`Boundary confirmed: ${paginationResult.boundaryConfirmed ? 'YES' : 'NO'}`);
    logger.info(`Hard capped: ${paginationResult.isCapped ? 'YES (at ' + options.maxPages + ')' : 'NO'}`);
    logger.info('');

    if (paginationResult.searchPath && paginationResult.searchPath.length > 0) {
      logger.info('Binary search path:');
      paginationResult.searchPath.forEach((step, i) => {
        logger.info(`  ${i + 1}. ${step}`);
      });
      logger.info('');
    }

    if (paginationResult.testedPages && paginationResult.testedPages.length > 0) {
      logger.info('Pages tested during search:');
      paginationResult.testedPages
        .sort((a, b) => a.pageNum - b.pageNum)
        .forEach(p => {
          const status = p.valid ? '✓' : '✗';
          logger.info(`  ${status} Page ${p.pageNum}: ${p.contacts} contacts`);
        });
      logger.info('');
    }

    const generatedUrls = paginationResult.urls;
    results.totalPagesFound = generatedUrls.length;

    logger.info(`Generated ${generatedUrls.length} page URLs (based on true max: ${paginationResult.trueMaxPage})`);
    logger.info(`Pattern type: ${results.pattern.type}`);
    if (results.pattern.paramName) {
      logger.info(`Parameter name: ${results.pattern.paramName}`);
    }
    logger.info('');

    // Sample URLs
    results.sampleUrls.first5 = generatedUrls.slice(0, 5);
    const midStart = Math.floor((generatedUrls.length - 5) / 2);
    results.sampleUrls.middle5 = generatedUrls.slice(midStart, midStart + 5);
    results.sampleUrls.last5 = generatedUrls.slice(-5);

    // ═══════════════════════════════════════════════════════
    // PHASE 4: SPOT CHECK VALIDATION
    // ═══════════════════════════════════════════════════════
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('  PHASE 4: SPOT CHECK VALIDATION');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('');

    if (paginationResult.trueMaxPage > 0) {
      logger.info('Performing spot checks on generated URLs...');
      logger.info('');

      // Test first, middle, and last pages as sanity check
      const spotCheckPages = [
        1,
        Math.floor(paginationResult.trueMaxPage / 2),
        paginationResult.trueMaxPage
      ].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates

      const validationResults = [];
      let totalContacts = 0;
      let totalLoadTime = 0;

      for (let i = 0; i < spotCheckPages.length; i++) {
        const pageNum = spotCheckPages[i];
        const testUrl = generatedUrls[pageNum - 1];

        logger.info(`[${i + 1}/${spotCheckPages.length}] Testing page ${pageNum}: ${testUrl}`);

        try {
          await page.goto(testUrl, { waitUntil: 'networkidle0', timeout: options.timeout });
          const startTime = Date.now();
          await page.waitForTimeout(1000);
          const loadTime = Date.now() - startTime;

          const validation = await analyzePageContent(page);

          validationResults.push({
            success: true,
            pageNum: pageNum,
            contactCount: validation.contactEstimate,
            loadTime: loadTime
          });

          results.validationSummary.successfulLoads++;
          totalContacts += validation.contactEstimate;
          totalLoadTime += loadTime;

          if (validation.contactEstimate === 0) {
            results.emptyPages++;
            logger.warn(`  ⚠ Empty page (no contacts)`);
          } else {
            results.uniquePages++;
            logger.info(`  ✓ Loaded | Contacts: ${validation.contactEstimate} | Time: ${loadTime}ms`);
          }

        } catch (error) {
          logger.error(`  ✗ Failed: ${error.message}`);
          results.validationSummary.failedLoads++;
          validationResults.push({
            success: false,
            pageNum: pageNum,
            error: error.message
          });
        }

        // Rate limit between requests
        if (i < spotCheckPages.length - 1) {
          await rateLimiter.waitBeforeRequest();
        }
      }

      logger.info('');

      // Calculate averages
      results.actualPagesValidated = validationResults.length;
      results.validationSummary.totalValidated = validationResults.length;

      if (results.validationSummary.successfulLoads > 0) {
        results.validationSummary.averageContactsPerPage =
          Math.round(totalContacts / results.validationSummary.successfulLoads);
        results.validationSummary.averageLoadTime =
          Math.round(totalLoadTime / results.validationSummary.successfulLoads);
      }
    } else {
      logger.warn('No pages to validate (true max = 0)');
      logger.info('');
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 5: CONFIDENCE SCORING
    // ═══════════════════════════════════════════════════════
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('  PHASE 5: CONFIDENCE SCORING');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('');

    const binarySearchInfo = {
      boundaryConfirmed: results.boundaryConfirmed,
      trueMaxFound: !!results.trueMaxPage,
      visualMaxAccurate: results.visualMaxPage === results.trueMaxPage
    };

    const confidence = calculateConfidence(results, detectionResults, [], binarySearchInfo);
    results.confidence = confidence.score;
    results.reliability = confidence.reliability;

    logger.info(`Confidence Score: ${results.confidence}/100`);
    logger.info(`Reliability: ${results.reliability.toUpperCase()}`);
    logger.info('');
    logger.info('Score Breakdown:');
    confidence.breakdown.forEach(item => {
      const indicator = item.earned > 0 ? '✓' : '✗';
      logger.info(`  ${indicator} ${item.description}: +${item.earned}/${item.possible}`);
    });
    logger.info('');

    // Add warnings for issues
    if (results.duplicatePages > 0) {
      results.warnings.push(`${results.duplicatePages} duplicate pages detected`);
    }
    if (results.emptyPages > 0) {
      results.warnings.push(`${results.emptyPages} empty pages detected`);
    }
    if (results.validationSummary.failedLoads > 0) {
      results.warnings.push(`${results.validationSummary.failedLoads} pages failed to load`);
    }

    // Save to cache if requested
    if (options.saveCache && results.patternDetected && results.confidence >= 60) {
      logger.info('Saving pattern to cache...');
      configLoader.saveCachedPattern(domain, results.pattern);
      results.savedToCache = true;
      logger.info('✓ Pattern saved to cache');
      logger.info('');
    }

    // Finalize and display results
    await finalize(browserManager, results, startTime);

  } catch (error) {
    logger.error('Fatal error:', error);
    if (browserManager) {
      await browserManager.close();
    }
    process.exit(1);
  }
}

/**
 * Analyze page content
 */
async function analyzePageContent(page) {
  return await page.evaluate(() => {
    const bodyText = document.body.innerText;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = bodyText.match(emailRegex) || [];
    const uniqueEmails = [...new Set(emails)];

    const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]').length;
    const contactEstimate = Math.max(mailtoLinks, uniqueEmails.length);

    // Check for infinite scroll indicators
    const infiniteScrollIndicators = [
      document.querySelector('[data-infinite-scroll]'),
      document.querySelector('[class*="infinite"]'),
      document.querySelector('[class*="lazy-load"]'),
      document.querySelector('[class*="load-more"]')
    ];
    const hasInfiniteScroll = infiniteScrollIndicators.some(el => el !== null);

    return {
      hasContent: bodyText.length > 100,
      emailCount: uniqueEmails.length,
      contactEstimate: contactEstimate,
      hasInfiniteScroll: hasInfiniteScroll
    };
  });
}

/**
 * Extract manual pattern from config
 */
function extractManualPattern(url, patterns) {
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

  if (patterns.urlPattern) {
    return {
      type: 'path',
      urlPattern: patterns.urlPattern
    };
  }

  return null;
}

/**
 * Detect URL parameter pattern
 */
async function detectUrlParameterPattern(page, currentUrl) {
  const urlObj = new URL(currentUrl);
  const params = urlObj.searchParams;

  // Check for page parameters
  const pageParams = ['page', 'p', 'pg', 'pageNum', 'pageNumber'];
  for (const param of pageParams) {
    if (params.has(param)) {
      const value = params.get(param);
      if (/^\d+$/.test(value)) {
        return {
          type: 'parameter',
          paramName: param,
          baseUrl: `${urlObj.origin}${urlObj.pathname}`,
          currentPage: parseInt(value)
        };
      }
    }
  }

  // Check for offset parameters
  const offsetParams = ['offset', 'start', 'from'];
  for (const param of offsetParams) {
    if (params.has(param)) {
      const value = params.get(param);
      if (/^\d+$/.test(value)) {
        return {
          type: 'offset',
          paramName: param,
          baseUrl: `${urlObj.origin}${urlObj.pathname}`,
          currentOffset: parseInt(value),
          itemsPerPage: 10
        };
      }
    }
  }

  // Check DOM for next links
  const nextLinkPattern = await page.evaluate(() => {
    const selectors = [
      'a[rel="next"]',
      'a[class*="next"]',
      'a[aria-label*="next" i]',
      'li.next a',
      'button[class*="next"]'
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const href = el.getAttribute('href');
        if (href) {
          return href;
        }
      }
    }
    return null;
  });

  if (nextLinkPattern) {
    const nextUrl = new URL(nextLinkPattern, currentUrl);
    const nextParams = nextUrl.searchParams;

    for (const param of pageParams) {
      if (nextParams.has(param) && !params.has(param)) {
        return {
          type: 'parameter',
          paramName: param,
          baseUrl: `${nextUrl.origin}${nextUrl.pathname}`,
          currentPage: 1
        };
      }
    }
  }

  return null;
}

/**
 * Detect path-based pattern
 */
function detectPathPattern(currentUrl) {
  const urlObj = new URL(currentUrl);
  const pathMatch = urlObj.pathname.match(/\/(?:page|p)\/(\d+)/i);

  if (pathMatch) {
    return {
      type: 'path',
      urlPattern: urlObj.pathname.replace(/\/(\d+)/, '/{page}'),
      baseUrl: urlObj.origin,
      currentPage: parseInt(pathMatch[1])
    };
  }

  return null;
}

/**
 * Select best pattern from detection results
 */
function selectBestPattern(detectionResults) {
  // Priority: manual > cached > navigation > auto
  if (detectionResults.manual) {
    return { pattern: detectionResults.manual, method: 'manual' };
  }

  if (detectionResults.cached) {
    return { pattern: detectionResults.cached, method: 'cached' };
  }

  if (detectionResults.navigation) {
    return { pattern: detectionResults.navigation, method: 'navigation' };
  }

  // Check URL-based auto detection
  if (detectionResults.autoUrl) {
    return { pattern: detectionResults.autoUrl, method: 'auto-url' };
  }

  if (detectionResults.autoPath) {
    return { pattern: detectionResults.autoPath, method: 'auto-path' };
  }

  if (detectionResults.autoOffset) {
    return { pattern: detectionResults.autoOffset, method: 'auto-offset' };
  }

  return null;
}

/**
 * Generate page URLs based on pattern
 */
function generatePageUrls(baseUrl, pattern, maxPages) {
  const urls = [];

  for (let i = 1; i <= maxPages; i++) {
    let pageUrl;

    switch (pattern.type) {
      case 'parameter':
        const url = new URL(pattern.baseUrl);
        url.searchParams.set(pattern.paramName, i.toString());
        pageUrl = url.toString();
        break;

      case 'path':
        const path = pattern.urlPattern.replace('{page}', i.toString());
        pageUrl = `${pattern.baseUrl}${path}`;
        break;

      case 'offset':
        const offsetUrl = new URL(pattern.baseUrl);
        const offset = (i - 1) * pattern.itemsPerPage;
        offsetUrl.searchParams.set(pattern.paramName, offset.toString());
        pageUrl = offsetUrl.toString();
        break;

      default:
        continue;
    }

    urls.push(pageUrl);
  }

  return urls;
}

/**
 * Select strategic sample of URLs to validate
 */
function selectStrategicSample(urls, sampleSize) {
  if (urls.length <= sampleSize) {
    return urls;
  }

  const sample = new Set();

  // First 3
  for (let i = 0; i < Math.min(3, urls.length); i++) {
    sample.add(urls[i]);
  }

  // Last 3
  for (let i = Math.max(0, urls.length - 3); i < urls.length; i++) {
    sample.add(urls[i]);
  }

  // Middle pages (evenly distributed)
  const remaining = sampleSize - sample.size;
  const step = Math.floor((urls.length - 6) / remaining);

  for (let i = 0; i < remaining && sample.size < sampleSize; i++) {
    const index = 3 + (i * step);
    if (index < urls.length - 3) {
      sample.add(urls[index]);
    }
  }

  return Array.from(sample).sort((a, b) => urls.indexOf(a) - urls.indexOf(b));
}

/**
 * Validate individual page URL
 */
async function validatePageUrl(page, url, pageNum, timeout, rateLimiter) {
  const startTime = Date.now();

  try {
    const response = await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: timeout
    });

    await page.waitForTimeout(1000);

    const loadTime = Date.now() - startTime;
    const statusCode = response.status();

    // Analyze content
    const content = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = bodyText.match(emailRegex) || [];
      const uniqueEmails = [...new Set(emails)];
      const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]').length;

      // Check for "no results" messages
      const noResultsIndicators = [
        'no results found',
        'no agents found',
        '0 results',
        'no listings',
        'nothing found'
      ];
      const hasNoResults = noResultsIndicators.some(indicator =>
        bodyText.toLowerCase().includes(indicator)
      );

      return {
        emailCount: uniqueEmails.length,
        contactEstimate: Math.max(mailtoLinks, uniqueEmails.length),
        hasNoResults: hasNoResults,
        contentSample: bodyText.substring(0, 1000).replace(/\s+/g, ' ').trim()
      };
    });

    // Generate content hash
    const contentHash = crypto.createHash('md5')
      .update(content.contentSample)
      .digest('hex');

    return {
      pageNum: pageNum,
      url: url,
      success: true,
      statusCode: statusCode,
      loadTime: loadTime,
      emailCount: content.emailCount,
      contactCount: content.contactEstimate,
      isEmpty: content.hasNoResults || content.contactEstimate === 0,
      contentHash: contentHash,
      error: null
    };

  } catch (error) {
    return {
      pageNum: pageNum,
      url: url,
      success: false,
      statusCode: null,
      loadTime: Date.now() - startTime,
      emailCount: 0,
      contactCount: 0,
      isEmpty: true,
      contentHash: null,
      error: error.message
    };
  }
}

/**
 * Calculate confidence score
 */
function calculateConfidence(results, detectionResults, validationResults, binarySearchInfo = {}) {
  const breakdown = [];
  let score = 0;

  // Pattern detected (+15, reduced from 20)
  if (results.patternDetected) {
    breakdown.push({ description: 'Pattern detected', possible: 15, earned: 15 });
    score += 15;
  } else {
    breakdown.push({ description: 'Pattern detected', possible: 15, earned: 0 });
  }

  // Visual controls detected (+15)
  if (results.visualDetection?.hasPagination) {
    breakdown.push({ description: 'Visual controls detected', possible: 15, earned: 15 });
    score += 15;
  } else {
    breakdown.push({ description: 'Visual controls detected', possible: 15, earned: 0 });
  }

  // Boundary confirmed with 2 consecutive empty pages (+15)
  if (binarySearchInfo.boundaryConfirmed) {
    breakdown.push({
      description: 'Boundary confirmed (2 consecutive empty pages)',
      possible: 15,
      earned: 15
    });
    score += 15;
  } else {
    breakdown.push({
      description: 'Boundary confirmed (2 consecutive empty pages)',
      possible: 15,
      earned: 0
    });
  }

  // True max page discovered (+10)
  if (binarySearchInfo.trueMaxFound) {
    breakdown.push({ description: 'True max page discovered', possible: 10, earned: 10 });
    score += 10;
  } else {
    breakdown.push({ description: 'True max page discovered', possible: 10, earned: 0 });
  }

  // Visual max matched true max (+5 bonus)
  if (binarySearchInfo.visualMaxAccurate && binarySearchInfo.trueMaxFound) {
    breakdown.push({ description: 'Visual max matched true max', possible: 5, earned: 5 });
    score += 5;
  } else if (binarySearchInfo.trueMaxFound) {
    breakdown.push({ description: 'Visual max matched true max', possible: 5, earned: 0 });
  }

  // All validated pages loaded (+10, reduced from 15)
  const loadSuccessRate = results.validationSummary.totalValidated > 0
    ? results.validationSummary.successfulLoads / results.validationSummary.totalValidated
    : 0;
  const loadScore = Math.round(10 * loadSuccessRate);
  breakdown.push({
    description: `Spot checks passed (${Math.round(loadSuccessRate * 100)}%)`,
    possible: 10,
    earned: loadScore
  });
  score += loadScore;

  // Contact count consistent (+10)
  const avgContacts = results.validationSummary.averageContactsPerPage;
  const contactsConsistent = avgContacts >= 1;
  const contactScore = contactsConsistent ? 10 : 0;
  breakdown.push({
    description: `Contact count consistent (avg: ${avgContacts})`,
    possible: 10,
    earned: contactScore
  });
  score += contactScore;

  // Pattern type valid (+10)
  const validPatternTypes = ['parameter', 'path', 'offset'];
  const patternValid = validPatternTypes.includes(results.paginationType);
  const patternScore = patternValid ? 10 : 0;
  breakdown.push({
    description: 'Valid pagination type',
    possible: 10,
    earned: patternScore
  });
  score += patternScore;

  // Cached or manual (+5, reduced from 10)
  const isCachedOrManual = results.detectionMethod === 'cached' || results.detectionMethod === 'manual';
  const cacheScore = isCachedOrManual ? 5 : 0;
  breakdown.push({
    description: 'Cached or manual configuration',
    possible: 5,
    earned: cacheScore
  });
  score += cacheScore;

  // No empty pages in spot checks (+5, reduced from 10)
  const emptyRate = results.validationSummary.totalValidated > 0
    ? 1 - (results.emptyPages / results.validationSummary.totalValidated)
    : 0;
  const emptyScore = Math.round(5 * emptyRate);
  breakdown.push({
    description: `No empty pages (${Math.round(emptyRate * 100)}%)`,
    possible: 5,
    earned: emptyScore
  });
  score += emptyScore;

  // Determine reliability
  let reliability;
  if (score >= 80) {
    reliability = 'high';
  } else if (score >= 50) {
    reliability = 'medium';
  } else {
    reliability = 'low';
  }

  return {
    score: score,
    reliability: reliability,
    breakdown: breakdown
  };
}

/**
 * Detect visual pagination controls on the page
 */
async function detectVisualPaginationControls(page) {
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

      // Previous button selectors
      const prevSelectors = [
        'a[rel="prev"]:not(.disabled):not([aria-disabled="true"])',
        'a[aria-label*="prev" i]:not([aria-disabled="true"])',
        'button[aria-label*="prev" i]:not([disabled])',
        'a[class*="prev"]:not(.disabled)',
        'button[class*="prev"]:not(.disabled)',
        'a[class*="Prev"]:not(.disabled)',
        'button[class*="Prev"]:not(.disabled)'
      ];

      // Page number selectors
      const pageNumberSelectors = [
        '.pagination a[href*="page"]',
        '.pagination button[aria-label*="page" i]',
        '[class*="paginat"] a[href*="page"]',
        '[class*="paginat"] button',
        'a[aria-label*="page" i]',
        'button[aria-label*="page" i]'
      ];

      // Current page selectors
      const currentPageSelectors = [
        '.pagination .active',
        '.pagination .current',
        '[class*="paginat"] [class*="active"]',
        '[class*="paginat"] [class*="current"]',
        '[aria-current="page"]'
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
        if (el) {
          nextButton = true;
          break;
        }
      }

      // Find prev button
      let prevButton = null;
      for (const selector of prevSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          prevButton = true;
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
        }
      }

      // Determine control type
      let controlsType = 'none';
      if (pageNumbers.length > 0) {
        controlsType = 'numeric';
      } else if (nextButton || prevButton) {
        controlsType = 'next-prev';
      }

      return {
        hasPagination: !!container || !!nextButton || pageNumbers.length > 0,
        maxPage: pageNumbers.length > 0 ? Math.max(...pageNumbers) : null,
        nextButton,
        prevButton,
        pageNumbers: [...new Set(pageNumbers)].sort((a, b) => a - b),
        controlsType,
        currentPage
      };
    });

    return controls;
  } catch (error) {
    logger.error(`[Visual Detection] Error: ${error.message}`);
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
 * Discover pagination pattern by clicking next and observing URL changes
 */
async function discoverPatternByNavigation(page, currentUrl, visualControls) {
  if (!visualControls.nextButton) {
    return null;
  }

  try {
    const url1 = currentUrl;

    // Click next button
    const clicked = await page.evaluate(() => {
      const nextSelectors = [
        'a[rel="next"]:not(.disabled):not([aria-disabled="true"])',
        'a[aria-label*="next" i]:not([aria-disabled="true"])',
        'button[aria-label*="next" i]:not([disabled])',
        'a[class*="next"]:not(.disabled)',
        'button[class*="next"]:not(.disabled)',
        'a[class*="Next"]:not(.disabled)',
        'button[class*="Next"]:not(.disabled)'
      ];

      for (const selector of nextSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          el.click();
          return true;
        }
      }
      return false;
    });

    if (!clicked) {
      return null;
    }

    // Wait for navigation
    try {
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }),
        page.waitForTimeout(5000)
      ]);
    } catch (e) {
      // Navigation might fail for AJAX pagination
    }

    await page.waitForTimeout(1000);

    // Get new URL
    const url2 = page.url();

    // Check if URL changed
    if (url1 === url2) {
      logger.warn('[Navigation Discovery] URL did not change - possible AJAX pagination');
      // Navigate back
      await page.goto(url1, { waitUntil: 'networkidle0', timeout: 10000 });
      return null;
    }

    // Compare URLs to find pattern
    const urlObj1 = new URL(url1);
    const urlObj2 = new URL(url2);

    // Check for parameter changes
    const params1 = urlObj1.searchParams;
    const params2 = urlObj2.searchParams;

    const pageParams = ['page', 'p', 'pg', 'pageNum', 'pageNumber', 'pn', 'pageNo', 'paging'];
    for (const param of pageParams) {
      const val1 = params1.get(param);
      const val2 = params2.get(param);
      if (val2 && val2 !== val1) {
        const num1 = parseInt(val1 || '1');
        const num2 = parseInt(val2);
        if (!isNaN(num2) && num2 === num1 + 1) {
          // Navigate back
          await page.goto(url1, { waitUntil: 'networkidle0', timeout: 10000 });
          return {
            type: 'parameter',
            paramName: param,
            baseUrl: `${urlObj2.origin}${urlObj2.pathname}`,
            currentPage: num1,
            maxPage: visualControls.maxPage
          };
        }
      }
    }

    // Check for path changes
    if (urlObj1.pathname !== urlObj2.pathname) {
      const pathMatch = urlObj2.pathname.match(/\/(?:page|p)\/(\d+)/i);
      if (pathMatch) {
        // Navigate back
        await page.goto(url1, { waitUntil: 'networkidle0', timeout: 10000 });
        return {
          type: 'path',
          urlPattern: urlObj2.pathname.replace(/\/(\d+)/, '/{page}'),
          baseUrl: urlObj2.origin,
          currentPage: parseInt(pathMatch[1]) - 1,
          maxPage: visualControls.maxPage
        };
      }
    }

    // Navigate back
    await page.goto(url1, { waitUntil: 'networkidle0', timeout: 10000 });
    return null;

  } catch (error) {
    logger.error(`[Navigation Discovery] Error: ${error.message}`);
    try {
      await page.goto(currentUrl, { waitUntil: 'networkidle0', timeout: 10000 });
    } catch (e) {
      // Ignore
    }
    return null;
  }
}

/**
 * Calculate pattern confidence score (0-100)
 */
function calculatePatternConfidence(pattern, detectionMethod, visualControls) {
  let confidence = 0;

  // Detection method scoring
  if (detectionMethod === 'manual') {
    confidence += 40;
  } else if (detectionMethod === 'cached') {
    confidence += 35;
  } else if (detectionMethod === 'navigation') {
    confidence += 30;
  } else if (detectionMethod === 'auto-url' || detectionMethod === 'auto-path') {
    confidence += 15;
  }

  // Pattern type scoring
  if (pattern.type === 'parameter' || pattern.type === 'path') {
    confidence += 20;
  } else if (pattern.type === 'offset') {
    confidence += 15;
  }

  // Visual controls found
  if (visualControls?.hasPagination) {
    confidence += 20;
  }

  // Max page known
  if (pattern.maxPage || visualControls?.maxPage) {
    confidence += 15;
  }

  // Has next button
  if (visualControls?.nextButton) {
    confidence += 10;
  }

  return Math.min(100, confidence);
}

/**
 * Finalize test and display results
 */
async function finalize(browserManager, results, startTime) {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  logger.info('═══════════════════════════════════════════════════════');
  logger.info('  TEST RESULTS SUMMARY');
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('');

  // Results table
  const resultsTable = new Table({
    head: ['Metric', 'Value'],
    colWidths: [35, 25]
  });

  resultsTable.push(
    ['Target URL', results.targetUrl],
    ['Domain', results.domain],
    ['', ''],
    ['Pagination Type', results.paginationType],
    ['Detection Method', results.detectionMethod || 'N/A'],
    ['Pattern Detected', results.patternDetected ? 'YES' : 'NO'],
    ['', ''],
    ['Visual Controls Detected', results.visualDetection?.hasPagination ? 'YES' : 'NO'],
    ['Controls Type', results.visualDetection?.controlsType || 'N/A'],
    ['Max Page (Visual)', results.visualDetection?.maxPage || 'Unknown'],
    ['Has Next Button', results.visualDetection?.hasNextButton ? 'YES' : 'NO'],
    ['Has Prev Button', results.visualDetection?.hasPrevButton ? 'YES' : 'NO'],
    ['', ''],
    ['Visual Max Page', results.visualMaxPage || 'N/A'],
    ['True Max Page', results.trueMaxPage || 'N/A'],
    ['Boundary Confirmed', results.boundaryConfirmed ? 'YES' : 'NO'],
    ['Hard Capped at ' + options.maxPages, results.hardCapped ? 'YES' : 'NO'],
    ['Pages Tested (Binary Search)', results.binarySearchTestedPages],
    ['', ''],
    ['Total Pages Found', results.totalPagesFound],
    ['Pages Validated (Spot Check)', results.actualPagesValidated],
    ['Unique Pages', results.uniquePages],
    ['Duplicate Pages', results.duplicatePages],
    ['Empty Pages', results.emptyPages],
    ['', ''],
    ['Successful Loads', results.validationSummary.successfulLoads],
    ['Failed Loads', results.validationSummary.failedLoads],
    ['Avg Contacts/Page', results.validationSummary.averageContactsPerPage],
    ['Avg Load Time (ms)', results.validationSummary.averageLoadTime],
    ['', ''],
    ['Confidence Score', `${results.confidence}/100`],
    ['Reliability', results.reliability.toUpperCase()],
    ['', ''],
    ['Was Cached', results.wasCached ? 'YES' : 'NO'],
    ['Saved to Cache', results.savedToCache ? 'YES' : 'NO'],
    ['', ''],
    ['Test Duration', `${duration}s`]
  );

  console.log(resultsTable.toString());
  logger.info('');

  // Warnings
  if (results.warnings.length > 0) {
    logger.warn('Warnings:');
    results.warnings.forEach(warning => {
      logger.warn(`  ⚠ ${warning}`);
    });
    logger.info('');
  }

  // Issues
  if (results.issues.length > 0) {
    logger.error('Issues:');
    results.issues.forEach(issue => {
      logger.error(`  ✗ ${issue}`);
    });
    logger.info('');
  }

  // Sample URLs
  if (results.sampleUrls.first5.length > 0) {
    logger.info('Sample URLs (First 5):');
    results.sampleUrls.first5.forEach((url, i) => {
      logger.info(`  ${i + 1}. ${url}`);
    });
    logger.info('');
  }

  // Save to file if requested
  if (options.output) {
    const outputPath = path.resolve(options.output);
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    logger.info(`✓ Results saved to: ${outputPath}`);
    logger.info('');
  }

  // Close browser
  if (browserManager) {
    await browserManager.close();
  }

  logger.info('Test completed successfully');
  process.exit(0);
}

// Run main
main();

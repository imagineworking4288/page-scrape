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
      savedToCache: false
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
    // PHASE 2: PATTERN DETECTION
    // ═══════════════════════════════════════════════════════
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('  PHASE 2: PATTERN DETECTION');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('');

    const detectionResults = {
      manual: null,
      cached: null,
      autoUrl: null,
      autoOffset: null,
      autoPath: null,
      autoLinks: null
    };

    // A. Check manual config
    logger.info('[1/4] Checking manual configuration...');
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
    logger.info('[2/4] Checking cached patterns...');
    const cachedPattern = configLoader.getCachedPattern(domain);
    if (cachedPattern && cachedPattern.pattern) {
      detectionResults.cached = cachedPattern.pattern;
      results.wasCached = true;
      logger.info(`  ✓ Cached pattern found: ${cachedPattern.pattern.type}`);
      logger.info(`    Cached at: ${cachedPattern.cachedAt}`);
    } else {
      logger.info('  ✗ No cached pattern');
    }

    // C. Auto-detect URL parameters
    logger.info('[3/4] Auto-detecting URL parameter patterns...');
    detectionResults.autoUrl = await detectUrlParameterPattern(page, options.url);
    if (detectionResults.autoUrl) {
      logger.info(`  ✓ URL parameter pattern: ${detectionResults.autoUrl.paramName}`);
    } else {
      logger.info('  ✗ No URL parameter pattern detected');
    }

    // D. Auto-detect path patterns
    logger.info('[4/4] Auto-detecting path-based patterns...');
    detectionResults.autoPath = detectPathPattern(options.url);
    if (detectionResults.autoPath) {
      logger.info(`  ✓ Path pattern: ${detectionResults.autoPath.urlPattern}`);
    } else {
      logger.info('  ✗ No path pattern detected');
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
      logger.info('');
    } else {
      logger.warn('✗ No pagination pattern detected');
      results.issues.push('No pagination pattern detected');
      await finalize(browserManager, results, startTime);
      return;
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 3: URL GENERATION
    // ═══════════════════════════════════════════════════════
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('  PHASE 3: URL GENERATION');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('');

    const generatedUrls = generatePageUrls(options.url, results.pattern, options.maxPages);
    results.totalPagesFound = generatedUrls.length;

    logger.info(`Generated ${generatedUrls.length} page URLs`);
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
    // PHASE 4: VALIDATION
    // ═══════════════════════════════════════════════════════
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('  PHASE 4: URL VALIDATION');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('');

    // Select strategic sample
    const urlsToValidate = selectStrategicSample(generatedUrls, options.validateSample);
    logger.info(`Validating ${urlsToValidate.length} strategic URLs...`);
    logger.info('');

    const validationResults = [];
    const seenHashes = new Set();
    let totalContacts = 0;
    let totalLoadTime = 0;

    for (let i = 0; i < urlsToValidate.length; i++) {
      const testUrl = urlsToValidate[i];
      const pageNum = generatedUrls.indexOf(testUrl) + 1;

      logger.info(`[${i + 1}/${urlsToValidate.length}] Testing page ${pageNum}: ${testUrl}`);

      const validation = await validatePageUrl(
        page,
        testUrl,
        pageNum,
        options.timeout,
        rateLimiter
      );

      validationResults.push(validation);

      // Track metrics
      if (validation.success) {
        results.validationSummary.successfulLoads++;
        totalContacts += validation.contactCount;
        totalLoadTime += validation.loadTime;

        if (seenHashes.has(validation.contentHash)) {
          results.duplicatePages++;
          results.validationSummary.duplicatesDetected++;
          logger.warn(`  ⚠ Duplicate content detected!`);
        } else {
          results.uniquePages++;
          seenHashes.add(validation.contentHash);
        }

        if (validation.isEmpty) {
          results.emptyPages++;
          logger.warn(`  ⚠ Empty page (no contacts)`);
        }

        logger.info(`  ✓ Loaded: ${validation.statusCode} | Contacts: ${validation.contactCount} | Time: ${validation.loadTime}ms`);
      } else {
        results.validationSummary.failedLoads++;
        logger.error(`  ✗ Failed: ${validation.error}`);
      }

      // Rate limit between requests
      if (i < urlsToValidate.length - 1) {
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

    // ═══════════════════════════════════════════════════════
    // PHASE 5: CONFIDENCE SCORING
    // ═══════════════════════════════════════════════════════
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('  PHASE 5: CONFIDENCE SCORING');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('');

    const confidence = calculateConfidence(results, detectionResults, validationResults);
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
  // Priority: manual > cached > auto
  if (detectionResults.manual) {
    return { pattern: detectionResults.manual, method: 'manual' };
  }

  if (detectionResults.cached) {
    return { pattern: detectionResults.cached, method: 'cache' };
  }

  // Check if multiple auto methods agree
  const autoPatterns = [
    detectionResults.autoUrl,
    detectionResults.autoPath,
    detectionResults.autoOffset
  ].filter(p => p !== null);

  if (autoPatterns.length > 1) {
    return { pattern: autoPatterns[0], method: 'multiple' };
  }

  if (autoPatterns.length === 1) {
    return { pattern: autoPatterns[0], method: 'auto' };
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
function calculateConfidence(results, detectionResults, validationResults) {
  const breakdown = [];
  let score = 0;

  // Pattern detected (+20)
  if (results.patternDetected) {
    breakdown.push({ description: 'Pattern detected', possible: 20, earned: 20 });
    score += 20;
  } else {
    breakdown.push({ description: 'Pattern detected', possible: 20, earned: 0 });
  }

  // Multiple methods agree (+10)
  const autoMethods = [
    detectionResults.autoUrl,
    detectionResults.autoPath,
    detectionResults.autoOffset
  ].filter(p => p !== null);

  if (autoMethods.length > 1) {
    breakdown.push({ description: 'Multiple detection methods agree', possible: 10, earned: 10 });
    score += 10;
  } else {
    breakdown.push({ description: 'Multiple detection methods agree', possible: 10, earned: 0 });
  }

  // All validated pages loaded (+15)
  const loadSuccessRate = results.validationSummary.totalValidated > 0
    ? results.validationSummary.successfulLoads / results.validationSummary.totalValidated
    : 0;
  const loadScore = Math.round(15 * loadSuccessRate);
  breakdown.push({
    description: `Page load success (${Math.round(loadSuccessRate * 100)}%)`,
    possible: 15,
    earned: loadScore
  });
  score += loadScore;

  // No content duplicates (+15)
  const duplicateRate = results.validationSummary.totalValidated > 0
    ? 1 - (results.duplicatePages / results.validationSummary.totalValidated)
    : 0;
  const duplicateScore = Math.round(15 * duplicateRate);
  breakdown.push({
    description: `No duplicate content (${Math.round(duplicateRate * 100)}%)`,
    possible: 15,
    earned: duplicateScore
  });
  score += duplicateScore;

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

  // Cached or manual (+10)
  const isCachedOrManual = results.detectionMethod === 'cache' || results.detectionMethod === 'manual';
  const cacheScore = isCachedOrManual ? 10 : 0;
  breakdown.push({
    description: 'Cached or manual configuration',
    possible: 10,
    earned: cacheScore
  });
  score += cacheScore;

  // No empty pages (+10)
  const emptyRate = results.validationSummary.totalValidated > 0
    ? 1 - (results.emptyPages / results.validationSummary.totalValidated)
    : 0;
  const emptyScore = Math.round(10 * emptyRate);
  breakdown.push({
    description: `No empty pages (${Math.round(emptyRate * 100)}%)`,
    possible: 10,
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
    ['Total Pages Found', results.totalPagesFound],
    ['Pages Validated', results.actualPagesValidated],
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

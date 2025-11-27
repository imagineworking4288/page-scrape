/**
 * Test Orchestrator
 *
 * Coordinates diagnostic tests for a URL:
 * - Pagination detection
 * - Method testing (html, pdf, select)
 * - Results comparison and analysis
 *
 * REUSES ALL EXISTING SCRAPER CODE - no new extraction logic
 */

const { URL } = require('url');

// Import existing scrapers
const SimpleScraper = require('../../scrapers/simple-scraper');
const PdfScraper = require('../../scrapers/pdf-scraper');
const SelectScraper = require('../../scrapers/select-scraper');

// Import utilities
const Paginator = require('../../features/pagination/paginator');
const DomainExtractor = require('../../utils/domain-extractor');

class TestOrchestrator {
  constructor(options = {}) {
    this.browserManager = options.browserManager;
    this.rateLimiter = options.rateLimiter;
    this.logger = options.logger;
    this.configLoader = options.configLoader;
    this.verbose = options.verbose || false;

    // Initialize utilities
    this.domainExtractor = new DomainExtractor(this.logger);
  }

  /**
   * Run complete diagnostic test
   * @param {string} url - Target URL
   * @param {Object} options - Test options
   * @returns {Promise<Object>} - Complete test results
   */
  async runTest(url, options = {}) {
    const {
      methods = ['html', 'pdf', 'select'],
      testPagination = true
    } = options;

    const startTime = Date.now();
    const urlObj = new URL(url);

    // Initialize results structure
    const results = {
      metadata: {
        url: url,
        domain: urlObj.hostname,
        testedAt: new Date().toISOString(),
        testDuration: null
      },
      pagination: null,
      methods: {},
      analysis: null
    };

    try {
      // Step 1: Test pagination (if enabled)
      if (testPagination) {
        this.logger.info('═══════════════════════════════════════════════════════════════');
        this.logger.info('  PHASE 1: PAGINATION DETECTION');
        this.logger.info('═══════════════════════════════════════════════════════════════');
        console.log('');

        results.pagination = await this.testPagination(url);
      } else {
        this.logger.info('Pagination detection skipped');
        results.pagination = { skipped: true };
      }

      // Step 2: Test each method
      this.logger.info('');
      this.logger.info('═══════════════════════════════════════════════════════════════');
      this.logger.info('  PHASE 2: METHOD TESTING');
      this.logger.info('═══════════════════════════════════════════════════════════════');
      console.log('');

      for (const method of methods) {
        this.logger.info(`Testing method: ${method.toUpperCase()}`);
        this.logger.info('─'.repeat(50));

        results.methods[method] = await this.testMethod(url, method);

        console.log('');
        await this.rateLimiter.waitBeforeRequest();
      }

      // Step 3: Generate analysis
      this.logger.info('═══════════════════════════════════════════════════════════════');
      this.logger.info('  PHASE 3: ANALYSIS');
      this.logger.info('═══════════════════════════════════════════════════════════════');
      console.log('');

      results.analysis = this.generateAnalysis(results);

      // Calculate total duration
      results.metadata.testDuration = ((Date.now() - startTime) / 1000).toFixed(1) + 's';

      return results;

    } catch (error) {
      this.logger.error(`Test failed: ${error.message}`);
      results.metadata.testDuration = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
      results.error = error.message;
      return results;
    }
  }

  /**
   * Test pagination detection
   * @param {string} url - Target URL
   * @returns {Promise<Object>} - Pagination test results
   */
  async testPagination(url) {
    const startTime = Date.now();

    try {
      // Create paginator instance
      const paginator = new Paginator(
        this.browserManager,
        this.rateLimiter,
        this.logger,
        this.configLoader
      );

      // Run discovery only (don't scrape all pages)
      const paginationResult = await paginator.paginate(url, {
        maxPages: 200,
        minContacts: 1,
        timeout: 30000,
        discoverOnly: true
      });

      const timing = ((Date.now() - startTime) / 1000).toFixed(1) + 's';

      if (paginationResult.success) {
        this.logger.info(`✓ Pagination detected: ${paginationResult.paginationType}`);
        this.logger.info(`  Total pages: ${paginationResult.totalPages || 'unknown'}`);
        this.logger.info(`  Confidence: ${paginationResult.confidence || 0}/100`);

        return {
          detected: true,
          type: paginationResult.paginationType || 'unknown',
          pattern: paginationResult.pattern,
          totalPages: paginationResult.totalPages || null,
          trueMaxPage: paginationResult.trueMaxPage || null,
          visualMaxPage: paginationResult.visualMaxPage || null,
          confidence: paginationResult.confidence || 0,
          detectionMethod: paginationResult.detectionMethod || 'unknown',
          boundaryConfirmed: paginationResult.boundaryConfirmed || false,
          timing: timing,
          raw: paginationResult
        };
      } else {
        this.logger.info('ℹ No pagination detected (single page)');

        return {
          detected: false,
          type: 'none',
          pattern: null,
          totalPages: 1,
          confidence: 100,
          timing: timing,
          error: paginationResult.error || null
        };
      }

    } catch (error) {
      this.logger.error(`Pagination test error: ${error.message}`);

      return {
        detected: false,
        type: 'error',
        error: error.message,
        timing: ((Date.now() - startTime) / 1000).toFixed(1) + 's'
      };
    }
  }

  /**
   * Test a specific scraping method
   * @param {string} url - Target URL
   * @param {string} method - Method name (html, pdf, select)
   * @returns {Promise<Object>} - Method test results
   */
  async testMethod(url, method) {
    const startTime = Date.now();

    try {
      let scraper;
      let contacts = [];
      let configFound = false;

      // Create appropriate scraper
      switch (method) {
        case 'html':
          scraper = new SimpleScraper(this.browserManager, this.rateLimiter, this.logger);
          break;

        case 'pdf':
          scraper = new PdfScraper(this.browserManager, this.rateLimiter, this.logger);
          break;

        case 'select':
          scraper = new SelectScraper(this.browserManager, this.rateLimiter, this.logger);
          // Check if config exists
          const config = this.configLoader?.loadConfig?.(url);
          configFound = !!config;
          if (!configFound) {
            this.logger.warn('No site config found for select method');
          }
          break;

        default:
          throw new Error(`Unknown method: ${method}`);
      }

      // Scrape first page only with high limit to get all contacts
      // limit = 999 to extract all contacts on page 1
      // pageNum = 1, sourceUrl = url
      if (method === 'pdf') {
        contacts = await scraper.scrapePdf(url, 999, false, 1, url);
      } else {
        contacts = await scraper.scrape(url, 999, false, 1, url);
      }

      const timing = ((Date.now() - startTime) / 1000).toFixed(1) + 's';

      // Calculate completeness metrics
      const completeness = this.calculateCompleteness(contacts);

      // Get domain statistics
      const domainStats = contacts.length > 0
        ? this.domainExtractor.getDomainStats(contacts)
        : null;

      this.logger.info(`✓ ${method.toUpperCase()}: Found ${contacts.length} contacts in ${timing}`);
      this.logger.info(`  Completeness: ${completeness.overall}%`);
      this.logger.info(`  With name: ${completeness.withName}% | With email: ${completeness.withEmail}% | With phone: ${completeness.withPhone}%`);

      return {
        success: true,
        method: method,
        timing: timing,
        configFound: method === 'select' ? configFound : undefined,
        results: {
          contactCount: contacts.length,
          completeness: completeness,
          domainStats: domainStats ? {
            uniqueDomains: domainStats.uniqueDomains,
            businessEmails: domainStats.businessEmailCount,
            personalEmails: domainStats.personalEmailCount
          } : null,
          contacts: contacts, // Include ALL contacts for manual review
          sample: contacts.slice(0, 5) // First 5 for quick preview
        }
      };

    } catch (error) {
      this.logger.error(`${method.toUpperCase()} test error: ${error.message}`);

      return {
        success: false,
        method: method,
        timing: ((Date.now() - startTime) / 1000).toFixed(1) + 's',
        error: error.message,
        results: {
          contactCount: 0,
          completeness: { overall: 0, withName: 0, withEmail: 0, withPhone: 0 },
          contacts: [],
          sample: []
        }
      };
    }
  }

  /**
   * Calculate completeness metrics for contacts
   * @param {Array} contacts - Array of contacts
   * @returns {Object} - Completeness percentages
   */
  calculateCompleteness(contacts) {
    if (!contacts || contacts.length === 0) {
      return {
        overall: 0,
        withName: 0,
        withEmail: 0,
        withPhone: 0,
        complete: 0
      };
    }

    const total = contacts.length;
    const withName = contacts.filter(c => c.name && c.name.trim()).length;
    const withEmail = contacts.filter(c => c.email && c.email.trim()).length;
    const withPhone = contacts.filter(c => c.phone && c.phone.trim()).length;
    const complete = contacts.filter(c =>
      c.name && c.name.trim() &&
      c.email && c.email.trim() &&
      c.phone && c.phone.trim()
    ).length;

    // Overall = average of name, email, phone percentages
    const overall = ((withName + withEmail + withPhone) / (total * 3) * 100).toFixed(1);

    return {
      overall: parseFloat(overall),
      withName: parseFloat(((withName / total) * 100).toFixed(1)),
      withEmail: parseFloat(((withEmail / total) * 100).toFixed(1)),
      withPhone: parseFloat(((withPhone / total) * 100).toFixed(1)),
      complete: parseFloat(((complete / total) * 100).toFixed(1))
    };
  }

  /**
   * Generate analysis and recommendations
   * @param {Object} results - Test results
   * @returns {Object} - Analysis object
   */
  generateAnalysis(results) {
    const analysis = {
      bestMethod: null,
      methodRanking: [],
      recommendations: [],
      concerns: [],
      estimatedFullScrape: null
    };

    // Rank methods by contact count and completeness
    const methodScores = [];

    for (const [method, data] of Object.entries(results.methods)) {
      if (!data.success) {
        methodScores.push({
          method,
          score: 0,
          contacts: 0,
          completeness: 0,
          failed: true
        });
        continue;
      }

      const contacts = data.results.contactCount;
      const completeness = data.results.completeness.overall;

      // Score = contacts * (completeness / 100) weighted
      // More weight on contacts found, some weight on completeness
      const score = contacts * 0.7 + (completeness * contacts / 100) * 0.3;

      methodScores.push({
        method,
        score: parseFloat(score.toFixed(2)),
        contacts,
        completeness,
        failed: false
      });
    }

    // Sort by score descending
    methodScores.sort((a, b) => b.score - a.score);
    analysis.methodRanking = methodScores;

    // Best method (highest score that succeeded)
    const bestMethod = methodScores.find(m => !m.failed);
    if (bestMethod) {
      analysis.bestMethod = bestMethod.method;
      this.logger.info(`Best method: ${bestMethod.method.toUpperCase()} (${bestMethod.contacts} contacts, ${bestMethod.completeness}% complete)`);
    }

    // Generate recommendations
    if (bestMethod) {
      // Recommend based on results
      if (bestMethod.completeness >= 80) {
        analysis.recommendations.push(`Use --method ${bestMethod.method} for best results`);
      } else if (bestMethod.completeness >= 50) {
        analysis.recommendations.push(`Use --method ${bestMethod.method} (moderate completeness - ${bestMethod.completeness}%)`);
        analysis.recommendations.push('Consider manual review of missing fields');
      } else {
        analysis.recommendations.push(`Best available: --method ${bestMethod.method}`);
        analysis.recommendations.push('Low completeness - consider hybrid approach or manual extraction');
      }

      // Check for select method config
      if (results.methods.select && !results.methods.select.configFound) {
        analysis.recommendations.push('Create site config for select method to improve accuracy');
      }

      // Pagination recommendations
      if (results.pagination?.detected && results.pagination.totalPages > 1) {
        analysis.recommendations.push(`Enable pagination: --paginate --max-pages ${Math.min(results.pagination.totalPages, 50)}`);
      }
    } else {
      analysis.recommendations.push('All methods failed - site may be blocking scrapers');
      analysis.recommendations.push('Try with --headless false to debug');
    }

    // Identify concerns
    if (bestMethod && bestMethod.contacts === 0) {
      analysis.concerns.push('No contacts found - page may be dynamic or blocking');
    }

    // Low name extraction
    const bestData = results.methods[bestMethod?.method];
    if (bestData?.results?.completeness?.withName < 50) {
      analysis.concerns.push('Low name extraction rate - consider PDF method or manual review');
    }

    // Compare methods
    const htmlData = results.methods.html;
    const pdfData = results.methods.pdf;
    if (htmlData?.success && pdfData?.success) {
      const htmlContacts = htmlData.results.contactCount;
      const pdfContacts = pdfData.results.contactCount;
      if (pdfContacts > htmlContacts * 1.2) {
        analysis.concerns.push(`PDF found ${pdfContacts - htmlContacts} more contacts than HTML - page may have hidden content`);
      }
    }

    // Estimate full scrape time
    if (results.pagination?.detected && results.pagination.totalPages > 1) {
      const avgTime = this.calculateAverageMethodTime(results.methods);
      const totalPages = results.pagination.totalPages;
      const estimatedMinutes = ((avgTime * totalPages) / 60).toFixed(1);

      analysis.estimatedFullScrape = {
        totalPages: totalPages,
        avgTimePerPage: avgTime.toFixed(1) + 's',
        estimatedTotal: estimatedMinutes + ' minutes',
        estimatedContacts: bestMethod ? bestMethod.contacts * totalPages : null
      };

      this.logger.info(`Estimated full scrape: ${estimatedMinutes} minutes for ${totalPages} pages`);
    }

    return analysis;
  }

  /**
   * Calculate average method execution time
   * @param {Object} methods - Methods results
   * @returns {number} - Average time in seconds
   */
  calculateAverageMethodTime(methods) {
    const times = [];
    for (const data of Object.values(methods)) {
      if (data.timing) {
        const time = parseFloat(data.timing.replace('s', ''));
        if (!isNaN(time)) {
          times.push(time);
        }
      }
    }
    return times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 15;
  }
}

module.exports = TestOrchestrator;

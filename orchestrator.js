#!/usr/bin/env node

require('dotenv').config(); // Load environment variables

const { Command } = require('commander');
const Table = require('cli-table3');
const fs = require('fs');
const path = require('path');

// Import utilities from src/
const logger = require('./src/core/logger');
const BrowserManager = require('./src/core/browser-manager');
const { SeleniumManager } = require('./src/core');
const RateLimiter = require('./src/core/rate-limiter');
const DomainExtractor = require('./src/utils/domain-extractor');
const Paginator = require('./src/features/pagination/paginator');
const ConfigLoader = require('./src/config/config-loader');
const GoogleSheetsExporter = require('./src/utils/google-sheets-exporter');

// Import scrapers from src/
const SimpleScraper = require('./src/scrapers/simple-scraper');
const PdfScraper = require('./src/scrapers/pdf-scraper');

// CLI setup
const program = new Command();
program
  .name('universal-scraper')
  .description('Universal professional directory scraper')
  .version('2.0.0')
  .requiredOption('-u, --url <url>', 'Target URL to scrape')
  .option('-l, --limit <number>', 'Limit number of contacts to scrape', parseInt)
  .option('-m, --method <type>', 'Scraping method: html|pdf|hybrid|select|config', 'hybrid')
  .option('-c, --config <name>', 'Config file name for --method config (e.g., "sullcrom" or "sullcrom.json")')
  .option('-o, --output <format>', 'Output format: sqlite|csv|sheets|all', 'json')
  .option('--headless [value]', 'Run browser in headless mode (true/false, default: true)', 'true')
  .option('--delay <ms>', 'Delay between requests (ms)', '2000-5000')
  .option('--keep', 'Keep PDF files in output/pdfs/ directory (default: delete after parsing)')
  .option('--completeness <threshold>', 'Min completeness for PDF (default: 0.7)', '0.7')
  .option('--use-python', 'Use Python PDF scraper with coordinate-based extraction (recommended for better accuracy)')
  .option('--paginate', 'Enable pagination (scrape multiple pages)')
  .option('--max-pages <number>', 'Maximum number of pages to scrape', parseInt)
  .option('--start-page <number>', 'Start from specific page number (for resume)', parseInt, 1)
  .option('--min-contacts <number>', 'Minimum contacts per page to continue', parseInt)
  .option('--discover-only', 'Only discover pagination pattern without scraping all pages')
  .option('--no-export', 'Skip Google Sheets export (only output JSON)')
  .option('--scroll', 'Enable infinite scroll handling for --method config')
  .option('--max-scrolls <number>', 'Maximum scroll attempts for infinite scroll', parseInt, 50)
  .option('--force-selenium', 'Force Selenium browser for infinite scroll (PAGE_DOWN simulation)')
  .option('--scroll-delay <ms>', 'Selenium scroll delay in ms', parseInt, 400)
  .option('--max-retries <number>', 'Max consecutive no-change attempts for Selenium scroll', parseInt, 25)
  // Full pipeline options
  .option('--full-pipeline', 'Run full pipeline: config → scrape → enrich → export')
  .option('--auto', 'Skip confirmation prompts in full-pipeline mode')
  .option('--skip-config-gen', 'Skip config generation, use existing config (requires --full-pipeline)')
  .option('--no-enrich', 'Skip enrichment stage in full-pipeline mode')
  // Validation tool shortcut
  .option('--validate', 'Run validation tool (quick test with first N contacts)')
  // Export options
  .option('--core-only', 'Export only core contact fields (exclude enrichment metadata)')
  .option('-v, --verbose', 'Verbose logging')
  .parse(process.argv);

const options = program.opts();

// Validate URL
function validateUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (error) {
    logger.error(`Invalid URL: ${url}`);
    return false;
  }
}

// Convert headless string to boolean
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

// Run Python scraper subprocess
function runPythonScraper(options) {
  const { spawn } = require('child_process');

  logger.info('Using Python PDF scraper (coordinate-based extraction)...');
  logger.info('');

  // Build Python command
  const args = [
    '-m', 'python_scraper.cli',
    '--url', options.url
  ];

  if (options.limit) {
    args.push('--limit', options.limit.toString());
  }

  if (options.output) {
    args.push('--output', options.output === 'json' ? 'json' : 'csv');
  }

  args.push('--headless', options.headless || 'true');

  if (options.keep) {
    args.push('--keep');
  }

  // Spawn Python process
  const pythonProcess = spawn('python', args, {
    cwd: __dirname,
    stdio: 'inherit'
  });

  return new Promise((resolve, reject) => {
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Python scraper exited with code ${code}`));
      }
    });

    pythonProcess.on('error', (err) => {
      reject(new Error(`Failed to start Python scraper: ${err.message}`));
    });
  });
}

// Main execution
async function main() {
  let browserManager = null;
  let seleniumManager = null;

  try {
    // Validate URL first
    if (!validateUrl(options.url)) {
      process.exit(1);
    }

    // ===========================================================================
    // ROUTE: Validation Tool (--validate)
    // ===========================================================================
    if (options.validate) {
      const { spawn } = require('child_process');
      const validatePath = path.join(__dirname, 'src', 'tools', 'validate-config.js');

      const args = ['--url', options.url];
      if (options.limit) args.push('--limit', options.limit.toString());
      if (options.verbose) args.push('--verbose');
      if (!parseHeadless(options.headless)) args.push('--show');

      const validateProcess = spawn('node', [validatePath, ...args], {
        stdio: 'inherit',
        cwd: __dirname
      });

      validateProcess.on('close', (code) => {
        process.exit(code);
      });

      return; // Exit main function, let subprocess handle everything
    }

    // ===========================================================================
    // ROUTE: Full Pipeline (--full-pipeline)
    // ===========================================================================
    if (options.fullPipeline) {
      const FullPipelineOrchestrator = require('./src/workflows/full-pipeline');

      const orchestrator = new FullPipelineOrchestrator({
        url: options.url,
        limit: options.limit,
        auto: options.auto,
        autoMode: options.auto,
        skipConfigGen: options.skipConfigGen,
        noEnrich: options.enrich === false,
        noExport: options.export === false,
        coreOnly: options.coreOnly || false,
        headless: parseHeadless(options.headless),
        verbose: options.verbose
      });

      const result = await orchestrator.run();

      if (result.success) {
        logger.info('[Orchestrator] Full pipeline completed successfully');
        process.exit(0);
      } else {
        logger.error(`[Orchestrator] Full pipeline failed: ${result.message}`);
        process.exit(1);
      }

      return; // Exit main function
    }

    // ===========================================================================
    // STANDARD SCRAPING WORKFLOW (existing behavior)
    // ===========================================================================
    logger.info('═══════════════════════════════════════');
    logger.info('  UNIVERSAL PROFESSIONAL SCRAPER v1.0');
    logger.info('═══════════════════════════════════════');
    logger.info('');

    // Check if using Python scraper
    if (options.usePython) {
      const exitCode = await runPythonScraper(options);
      process.exit(exitCode);
    }

    // Parse headless option
    const headless = parseHeadless(options.headless);

    logger.info(`Target URL: ${options.url}`);
    if (options.limit) {
      logger.info(`Limit: ${options.limit} contacts`);
    }
    logger.info(`Method: ${options.method}`);
    logger.info(`Output: ${options.output}`);
    logger.info(`Headless: ${headless}`);
    logger.info(`Keep PDFs: ${options.keep ? 'yes' : 'no'}`);

    // Pagination settings
    const paginationEnabled = options.paginate || (process.env.PAGINATION_ENABLED === 'true');
    const maxPages = options.maxPages || parseInt(process.env.PAGINATION_MAX_PAGES) || 200;
    const minContacts = options.minContacts || parseInt(process.env.PAGINATION_MIN_CONTACTS) || 1;
    const startPage = options.startPage || 1;

    if (paginationEnabled) {
      logger.info(`Pagination: enabled`);
      logger.info(`  Max pages: ${maxPages}`);
      logger.info(`  Start page: ${startPage}`);
      logger.info(`  Min contacts/page: ${minContacts}`);
      if (options.discoverOnly) {
        logger.info(`  Mode: discovery only`);
      }
    }
    logger.info('');

    // Initialize components
    logger.info('Initializing components...');
    browserManager = new BrowserManager(logger);
    browserManagerGlobal = browserManager; // Assign to global for signal handlers
    const domainExtractor = new DomainExtractor(logger);
    const configLoader = new ConfigLoader(logger);

    // Parse delay range
    const [minDelay, maxDelay] = options.delay.split('-').map(d => parseInt(d));
    const rateLimiter = new RateLimiter(logger, {
      minDelay: minDelay || 2000,
      maxDelay: maxDelay || 5000
    });

    // Launch browser
    await browserManager.launch(headless);

    // Initialize paginator if pagination enabled
    let paginator = null;
    let pageUrls = [options.url];
    let siteConfig = null;
    let paginationResult = null;

    if (paginationEnabled) {
      paginator = new Paginator(browserManager, rateLimiter, logger, configLoader);

      // Set start page if resuming
      if (startPage > 1) {
        paginator.setStartPage(startPage);
      }

      // Load site config for pagination settings
      siteConfig = configLoader.loadConfig(options.url);

      // Discover pagination
      logger.info('');
      logger.info('═══════════════════════════════════════════════════════════════');
      logger.info('  PAGINATION DISCOVERY');
      logger.info('═══════════════════════════════════════════════════════════════');
      logger.info('');

      const discoveryStart = Date.now();
      paginationResult = await paginator.paginate(options.url, {
        maxPages: maxPages,
        minContacts: minContacts,
        timeout: parseInt(process.env.PAGINATION_DISCOVERY_TIMEOUT) || 30000,
        discoverOnly: options.discoverOnly,
        siteConfig: siteConfig
      });
      const discoveryTime = ((Date.now() - discoveryStart) / 1000).toFixed(1);

      logger.info('');
      logger.info('─────────────────────────────────────────────────────────────────');
      logger.info('  DISCOVERY RESULTS');
      logger.info('─────────────────────────────────────────────────────────────────');
      logger.info('');

      if (paginationResult.success && paginationResult.urls.length > 1) {
        pageUrls = paginationResult.urls;

        logger.info('✓ Pagination discovered successfully');
        logger.info('');
        logger.logStats({
          'Pattern Type': paginationResult.paginationType || 'N/A',
          'Detection Method': paginationResult.detectionMethod || 'N/A',
          'Total Pages': paginationResult.totalPages,
          'Visual Max': paginationResult.visualMaxPage || 'N/A',
          'True Max': paginationResult.trueMaxPage || 'N/A',
          'Boundary Confirmed': paginationResult.boundaryConfirmed ? 'YES' : 'NO',
          'Confidence': `${paginationResult.confidence || 0}/100`,
          'Discovery Time': `${discoveryTime}s`
        });
        logger.info('');

        // Auto-cache high confidence patterns
        if (paginationResult.pattern && paginationResult.confidence >= 70) {
          const domain = new URL(options.url).hostname.replace(/^www\./, '');
          try {
            configLoader.saveCachedPattern(domain, paginationResult.pattern);
            logger.info('✓ Pattern cached for future use');
            logger.info('');
          } catch (e) {
            logger.warn(`Failed to cache pattern: ${e.message}`);
          }
        }

        if (options.discoverOnly) {
          logger.info('═══════════════════════════════════════════════════════════════');
          logger.info('Discovery complete. Exiting (--discover-only mode)');
          logger.info('═══════════════════════════════════════════════════════════════');
          await browserManager.close();
          process.exit(0);
        }
      } else if (!paginationResult.success) {
        logger.warn('✗ Pagination discovery failed');
        logger.warn(`Error: ${paginationResult.error || 'Unknown error'}`);
        logger.warn('Falling back to single page scraping');
        logger.info('');
        pageUrls = [options.url];
      } else {
        logger.info('ℹ No pagination detected');
        logger.info('Site appears to be a single page');
        logger.info('');
        pageUrls = [options.url];
      }
    }

    // Reset paginator state before scraping
    if (paginationEnabled && paginator) {
      paginator.resetSeenContent();
      logger.info('✓ Paginator state reset for scraping');
    }

    // Load site config if not already loaded (for non-paginated scraping)
    if (!siteConfig) {
      siteConfig = configLoader.loadConfig(options.url);
    }

    // Scrape all pages
    let allContacts = [];
    let pageNumber = startPage;

    // Create scraper instance
    let scraper;
    switch (options.method) {
      case 'html':
        logger.info('Using HTML-first method (PDF fallback for missing names)...');
        scraper = new SimpleScraper(browserManager, rateLimiter, logger);
        break;

      case 'pdf':
        logger.info('Using PDF-primary method (disk-based extraction)...');
        scraper = new PdfScraper(browserManager, rateLimiter, logger);
        break;

      case 'hybrid':
        logger.info('Using hybrid method (HTML + PDF fallback, disk-based)...');
        scraper = new SimpleScraper(browserManager, rateLimiter, logger);
        break;

      case 'select':
        logger.info('Using select method (marker-based extraction)...');
        const SelectScraper = require('./src/scrapers/select-scraper');
        scraper = new SelectScraper(browserManager, rateLimiter, logger);
        break;

      case 'config':
        logger.info('Using config method (v2.0 config-based extraction)...');
        const ConfigScraper = require('./src/scrapers/config-scraper');
        const { createScraper, InfiniteScrollScraper } = require('./src/scrapers/config-scrapers');

        // Load config file
        if (!options.config) {
          // Try to auto-detect config from URL domain
          const urlObj = new URL(options.url);
          const domain = urlObj.hostname.replace(/^www\./, '').replace(/\.[^.]+$/, '');
          options.config = domain;
          logger.info(`Auto-detecting config: ${options.config}`);
        }

        const configScraperInstance = new ConfigScraper(browserManager, rateLimiter, logger);
        const loadedConfig = configScraperInstance.loadConfig(options.config);
        logger.info(`Loaded config: ${loadedConfig.name} (v${loadedConfig.version})`);

        // Determine if this is an infinite scroll page
        const isInfiniteScroll = options.forceSelenium ||
                          options.scroll ||
                          loadedConfig.pagination?.paginationType === 'infinite-scroll' ||
                          loadedConfig.pagination?.type === 'infinite-scroll';

        if (isInfiniteScroll) {
          // Initialize Selenium for infinite scroll (PAGE_DOWN is the only method)
          logger.info('[Orchestrator] Using Selenium for infinite scroll (PAGE_DOWN simulation)');

          seleniumManager = new SeleniumManager(logger);
          seleniumManagerGlobal = seleniumManager; // Assign to global for signal handlers
          await seleniumManager.launch(headless);

          // Create Selenium-based InfiniteScrollScraper
          scraper = new InfiniteScrollScraper(seleniumManager, rateLimiter, logger, {
            scrollDelay: options.scrollDelay || 400,
            maxRetries: options.maxRetries || 25,
            maxScrolls: options.maxScrolls || 1000
          });
          scraper.config = loadedConfig;
          scraper.initializeCardSelector();

          logger.info(`Selenium scroll config: delay=${options.scrollDelay || 400}ms, maxRetries=${options.maxRetries || 25}`);
        } else {
          // Use standard Puppeteer-based scraper for non-infinite-scroll pages
          scraper = new ConfigScraper(browserManager, rateLimiter, logger, loadedConfig);
        }
        break;

      default:
        throw new Error(`Invalid method: ${options.method}. Use html, pdf, hybrid, select, or config.`);
    }

    // Loop through all pages
    for (let i = 0; i < pageUrls.length; i++) {
      const pageUrl = pageUrls[i];
      const currentPage = pageNumber + i;

      if (pageUrls.length > 1) {
        logger.info('');
        logger.info(`${'='.repeat(50)}`);
        logger.info(`Scraping page ${currentPage} of ${pageUrls.length}`);
        logger.info(`URL: ${pageUrl}`);
        logger.info(`${'='.repeat(50)}`);
      }

      try {
        // Scrape the page
        let pageContacts;

        if (options.method === 'pdf') {
          pageContacts = await scraper.scrapePdf(pageUrl, options.limit, options.keep, currentPage, pageUrl);
        } else if (options.method === 'config' && (options.scroll || scraper.config?.pagination?.type === 'infinite-scroll')) {
          // Use scroll-based scraping for config method with infinite scroll
          pageContacts = await scraper.scrapeWithScroll(pageUrl, options.limit, options.maxScrolls || 50);
        } else if (options.method === 'config' && paginationEnabled) {
          // Use pagination-aware scraping for config method
          pageContacts = await scraper.scrapeWithPagination(pageUrl, options.limit, maxPages);
          // Skip the rest of the loop since pagination is handled internally
          allContacts = pageContacts;
          break;
        } else {
          pageContacts = await scraper.scrape(pageUrl, options.limit, options.keep, currentPage, pageUrl);
        }

        // Add to all contacts FIRST (before any break conditions)
        allContacts = allContacts.concat(pageContacts);

        // Validate page content if paginating (for pagination continuation decision)
        if (paginationEnabled && pageUrls.length > 1) {
          const page = await browserManager.getPage();
          const validation = await paginator.validatePage(page);

          // Skip duplicate check for first page (already validated during discovery)
          if (i > 0 && paginator.isDuplicateContent(validation.contentHash)) {
            logger.warn(`Page ${currentPage} has duplicate content - stopping pagination`);
            break;
          }

          // Mark content as seen
          paginator.markContentAsSeen(validation.contentHash);

          // Check minimum contacts threshold
          if (pageContacts.length < minContacts) {
            logger.warn(`Page ${currentPage} has only ${pageContacts.length} contacts (minimum: ${minContacts}) - stopping pagination`);
            break;
          }

          logger.info(`Page ${currentPage}: Found ${pageContacts.length} contacts`);
        }

        // Respect rate limiting between pages
        if (i < pageUrls.length - 1) {
          await rateLimiter.waitBeforeRequest();
        }

      } catch (error) {
        logger.error(`Error scraping page ${currentPage}: ${error.message}`);

        // For pagination, decide whether to continue or stop
        if (paginationEnabled && pageUrls.length > 1) {
          logger.warn(`Skipping page ${currentPage} and continuing with next page`);
          continue;
        } else {
          throw error;
        }
      }
    }

    // Deduplicate contacts across all pages (by email)
    const uniqueContactsMap = new Map();
    for (const contact of allContacts) {
      const key = contact.email || `${contact.name}_${contact.phone}`;
      if (!uniqueContactsMap.has(key)) {
        uniqueContactsMap.set(key, contact);
      } else {
        // Keep the one with more complete information
        const existing = uniqueContactsMap.get(key);
        const existingComplete = (existing.name ? 1 : 0) + (existing.email ? 1 : 0) + (existing.phone ? 1 : 0);
        const newComplete = (contact.name ? 1 : 0) + (contact.email ? 1 : 0) + (contact.phone ? 1 : 0);
        if (newComplete > existingComplete) {
          uniqueContactsMap.set(key, contact);
        }
      }
    }

    const contacts = Array.from(uniqueContactsMap.values());

    // Post-process contacts
    const processedContacts = contacts;
    
    // NEW: Generate domain statistics
    logger.info('Analyzing domain distribution...');
    const domainStats = domainExtractor.getDomainStats(processedContacts);
    
    // Log statistics
    logger.info('');
    logger.info('═══════════════════════════════════════');
    logger.info('  SCRAPING COMPLETE');
    logger.info('═══════════════════════════════════════');

    const stats = {
      'Total Contacts': processedContacts.length,
      'With Email': processedContacts.filter(c => c.email).length,
      'With Phone': processedContacts.filter(c => c.phone).length,
      'With Both': processedContacts.filter(c => c.email && c.phone).length,
      'Complete (Name+Email+Phone)': processedContacts.filter(c => c.name && c.email && c.phone).length,
      'High Confidence': processedContacts.filter(c => c.confidence === 'high').length,
      'Medium Confidence': processedContacts.filter(c => c.confidence === 'medium').length,
      'Low Confidence': processedContacts.filter(c => c.confidence === 'low').length,
      'From HTML': processedContacts.filter(c => c.source === 'html').length,
      'From PDF': processedContacts.filter(c => c.source === 'pdf').length,
      'Merged': processedContacts.filter(c => c.source === 'merged').length
    };

    // Add pagination stats if applicable
    if (paginationEnabled && pageUrls.length > 1) {
      stats['Pages Scraped'] = pageUrls.length;
      stats['Total Extracted'] = allContacts.length;
      stats['Duplicates Removed'] = allContacts.length - processedContacts.length;
    }

    logger.logStats(stats);
    logger.info('');
    
    // NEW: Log domain statistics
    logger.info('═══════════════════════════════════════');
    logger.info('  DOMAIN ANALYSIS');
    logger.info('═══════════════════════════════════════');
    logger.logStats({
      'Unique Domains': domainStats.uniqueDomains,
      'Business Domains': domainStats.businessDomains,
      'Business Emails': domainStats.businessEmailCount,
      'Personal Emails': domainStats.personalEmailCount,
      'Business Email %': domainStats.withEmail > 0 
        ? `${((domainStats.businessEmailCount / domainStats.withEmail) * 100).toFixed(1)}%` 
        : '0.0%'
    });
    logger.info('');
    
    // NEW: Display top domains table
    if (domainStats.topDomains.length > 0) {
      logger.info('Top Domains (all):');
      const domainTable = new Table({
        head: ['Domain', 'Count', '%', 'Type'],
        colWidths: [35, 10, 10, 12],
        wordWrap: true
      });
      
      domainStats.topDomains.slice(0, 5).forEach(item => {
        const isBusiness = domainExtractor.isBusinessDomain(item.domain);
        domainTable.push([
          item.domain,
          item.count,
          item.percentage + '%',
          isBusiness ? 'Business' : 'Personal'
        ]);
      });
      
      console.log(domainTable.toString());
      logger.info('');
    }
    
    // NEW: Display top business domains table
    if (domainStats.topBusinessDomains.length > 0) {
      logger.info('Top Business Domains:');
      const businessDomainTable = new Table({
        head: ['Domain', 'Count', '% of Business'],
        colWidths: [40, 10, 18],
        wordWrap: true
      });
      
      domainStats.topBusinessDomains.slice(0, 5).forEach(item => {
        businessDomainTable.push([
          item.domain,
          item.count,
          item.percentage + '%'
        ]);
      });
      
      console.log(businessDomainTable.toString());
      logger.info('');
    }
    
    // Display sample contacts in table
    if (processedContacts.length > 0) {
      logger.info('Sample Contacts (first 5):');
      const table = new Table({
        head: ['Name', 'Email', 'Phone', 'Domain', 'Type'],
        colWidths: [20, 25, 18, 20, 10],
        wordWrap: true
      });
      
      processedContacts.slice(0, 5).forEach(contact => {
        table.push([
          contact.name || 'N/A',
          contact.email || 'N/A',
          contact.phone || 'N/A',
          contact.domain || 'N/A',
          contact.domainType || 'N/A'
        ]);
      });
      
      console.log(table.toString());
      logger.info('');
    }
    
    // Save to JSON
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(outputDir, `contacts-${timestamp}.json`);
    
    // NEW: Include domain statistics in output file
    const outputData = {
      metadata: {
        scrapedAt: new Date().toISOString(),
        url: options.url,
        totalContacts: processedContacts.length,
        domainStats: {
          uniqueDomains: domainStats.uniqueDomains,
          businessDomains: domainStats.businessDomains,
          personalDomains: domainStats.personalEmailCount,
          businessEmailCount: domainStats.businessEmailCount,
          personalEmailCount: domainStats.personalEmailCount,
          topDomains: domainStats.topDomains.slice(0, 10),
          topBusinessDomains: domainStats.topBusinessDomains.slice(0, 10)
        }
      },
      contacts: processedContacts
    };
    
    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));

    logger.info(`Contacts saved to: ${outputFile}`);
    logger.info('');

    // Google Sheets export
    if (options.export !== false) {
      const sheetsExporter = new GoogleSheetsExporter(logger);

      if (sheetsExporter.isConfigured()) {
        try {
          logger.info('Exporting to Google Sheets...');
          const sheetName = await sheetsExporter.exportFromJson(outputFile);
          if (sheetName) {
            logger.info(`Exported to Google Sheets: "${sheetName}"`);
          }
        } catch (error) {
          logger.warn(`Google Sheets export failed: ${error.message}`);
          logger.warn('Continuing without export. JSON file was saved successfully.');
        }
      } else {
        logger.debug('Google Sheets not configured. Skipping export.');
        logger.debug('Set GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY, and GOOGLE_SHEETS_SPREADSHEET_ID in .env to enable.');
      }
    }

    // Close browsers
    if (browserManager) {
      await browserManager.close();
    }
    if (seleniumManager) {
      await seleniumManager.close();
    }

    logger.info('Scraping completed successfully');
    process.exit(0);

  } catch (error) {
    if (error.message === 'CAPTCHA_DETECTED') {
      logger.error('CAPTCHA detected! The site is blocking automated access.');
      logger.error(`URL: ${options.url}`);
      logger.info('Suggestions:');
      logger.info('  1. Try running with --headless false to solve CAPTCHA manually');
      logger.info('  2. Increase delays with --delay option');
      logger.info('  3. Try a different URL or subdomain');
    } else {
      logger.error('Fatal error:', error);
    }

    if (browserManager) {
      await browserManager.close();
    }
    if (seleniumManager) {
      await seleniumManager.close();
    }

    process.exit(1);
  }
}

// Handle graceful shutdown with proper browser cleanup
let browserManagerGlobal = null;
let seleniumManagerGlobal = null;

process.on('SIGINT', async () => {
  logger.warn('Received SIGINT, shutting down gracefully...');
  if (browserManagerGlobal) {
    try {
      await browserManagerGlobal.close();
    } catch (error) {
      logger.error(`Error closing browser during SIGINT: ${error.message}`);
    }
  }
  if (seleniumManagerGlobal) {
    try {
      await seleniumManagerGlobal.close();
    } catch (error) {
      logger.error(`Error closing Selenium during SIGINT: ${error.message}`);
    }
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.warn('Received SIGTERM, shutting down gracefully...');
  if (browserManagerGlobal) {
    try {
      await browserManagerGlobal.close();
    } catch (error) {
      logger.error(`Error closing browser during SIGTERM: ${error.message}`);
    }
  }
  if (seleniumManagerGlobal) {
    try {
      await seleniumManagerGlobal.close();
    } catch (error) {
      logger.error(`Error closing Selenium during SIGTERM: ${error.message}`);
    }
  }
  process.exit(0);
});

// Run main
main();
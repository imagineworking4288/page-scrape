#!/usr/bin/env node

require('dotenv').config();

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');

// Core imports
const logger = require('./src/core/logger');
const BrowserManager = require('./src/core/browser-manager');
const { SeleniumManager } = require('./src/core');
const RateLimiter = require('./src/core/rate-limiter');
const ConfigLoader = require('./src/config/config-loader');

// Utilities
const DomainExtractor = require('./src/utils/domain-extractor');
const GoogleSheetsExporter = require('./src/utils/google-sheets-exporter');
const { logScrapingStats, logDomainStats, logSampleContacts } = require('./src/utils/stats-reporter');

// Scraper factory
const { createScraperFromConfig } = require('./src/scrapers/config-scrapers');

// Pagination
const Paginator = require('./src/features/pagination/paginator');
const { detectPaginationFromUrl } = require('./src/constants/pagination-patterns');
const { selectPaginationMode } = require('./src/utils/prompt-helper');

// CLI setup
const program = new Command();
program
  .name('universal-scraper')
  .description('Universal professional directory scraper')
  .version('2.0.0')
  .requiredOption('-u, --url <url>', 'Target URL to scrape')
  .option('-l, --limit <number>', 'Limit number of contacts to scrape', parseInt)
  .option('-c, --config <name>', 'Config file name (e.g., "sullcrom" or "sullcrom.json")')
  .option('-o, --output <format>', 'Output format: json|sheets', 'json')
  .option('--headless [value]', 'Run browser in headless mode (true/false, default: true)', 'true')
  .option('--delay <ms>', 'Delay between requests (ms)', '2000-5000')
  .option('--paginate', 'Enable pagination (scrape multiple pages)')
  .option('--max-pages <number>', 'Maximum number of pages to scrape', parseInt)
  .option('--start-page <number>', 'Start from specific page number (for resume)', parseInt, 1)
  .option('--min-contacts <number>', 'Minimum contacts per page to continue', parseInt)
  .option('--discover-only', 'Only discover pagination pattern without scraping all pages')
  .option('--no-export', 'Skip Google Sheets export (only output JSON)')
  .option('--scroll', 'Enable infinite scroll handling for --method config')
  .option('--single-page', 'Force single-page mode (no pagination or scrolling)')
  .option('--max-scrolls <number>', 'Maximum scroll attempts for infinite scroll', parseInt, 50)
  .option('--force-selenium', 'Force Selenium browser for infinite scroll (PAGE_DOWN simulation)')
  .option('--scroll-delay <ms>', 'Selenium scroll delay in ms', parseInt, 400)
  .option('--max-retries <number>', 'Max consecutive no-change attempts for Selenium scroll', parseInt, 25)
  .option('--full-pipeline', 'Run full pipeline: config -> scrape -> enrich -> export')
  .option('--auto', 'Skip confirmation prompts in full-pipeline mode')
  .option('--skip-config-gen', 'Skip config generation, use existing config (requires --full-pipeline)')
  .option('--no-enrich', 'Skip enrichment stage in full-pipeline mode')
  .option('--validate', 'Run validation tool (quick test with first N contacts)')
  .option('--core-only', 'Export only core contact fields (exclude enrichment metadata)')
  .option('-v, --verbose', 'Verbose logging')
  .parse(process.argv);

const options = program.opts();

// Utility functions
function validateUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    logger.error(`Invalid URL: ${url}`);
    return false;
  }
}

function parseHeadless(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
  }
  return true;
}

// Graceful shutdown handlers
let browserManagerGlobal = null;
let seleniumManagerGlobal = null;

async function cleanup() {
  if (browserManagerGlobal) {
    try { await browserManagerGlobal.close(); } catch (e) { /* ignore */ }
  }
  if (seleniumManagerGlobal) {
    try { await seleniumManagerGlobal.close(); } catch (e) { /* ignore */ }
  }
}

process.on('SIGINT', async () => {
  logger.warn('Received SIGINT, shutting down gracefully...');
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.warn('Received SIGTERM, shutting down gracefully...');
  await cleanup();
  process.exit(0);
});

// Main execution
async function main() {
  let browserManager = null;
  let seleniumManager = null;

  try {
    if (!validateUrl(options.url)) process.exit(1);

    // Route: Validation tool
    if (options.validate) {
      const { spawn } = require('child_process');
      const args = ['--url', options.url];
      if (options.limit) args.push('--limit', options.limit.toString());
      if (options.verbose) args.push('--verbose');
      if (!parseHeadless(options.headless)) args.push('--show');
      const proc = spawn('node', [path.join(__dirname, 'src', 'tools', 'validate-config.js'), ...args], { stdio: 'inherit', cwd: __dirname });
      proc.on('close', (code) => process.exit(code));
      return;
    }

    // Route: Full pipeline
    if (options.fullPipeline) {
      const FullPipelineOrchestrator = require('./src/workflows/full-pipeline');
      const orchestrator = new FullPipelineOrchestrator({
        url: options.url, limit: options.limit, auto: options.auto, autoMode: options.auto,
        skipConfigGen: options.skipConfigGen, noEnrich: options.enrich === false,
        noExport: options.export === false, coreOnly: options.coreOnly || false,
        headless: parseHeadless(options.headless), verbose: options.verbose
      });
      const result = await orchestrator.run();
      process.exit(result.success ? 0 : 1);
      return;
    }

    // Standard scraping workflow
    const headless = parseHeadless(options.headless);
    const paginationEnabled = options.paginate || (process.env.PAGINATION_ENABLED === 'true');
    const maxPages = options.maxPages || parseInt(process.env.PAGINATION_MAX_PAGES) || 200;
    const minContacts = options.minContacts || parseInt(process.env.PAGINATION_MIN_CONTACTS) || 1;
    const startPage = options.startPage || 1;

    logger.info('═══════════════════════════════════════');
    logger.info('  UNIVERSAL PROFESSIONAL SCRAPER v1.0');
    logger.info('═══════════════════════════════════════');
    logger.info(`Target URL: ${options.url}`);
    if (options.limit) logger.info(`Limit: ${options.limit} contacts`);
    logger.info(`Headless: ${headless}`);
    if (paginationEnabled) logger.info(`Pagination: enabled (max ${maxPages} pages)`);
    logger.info('');

    // Initialize components
    browserManager = new BrowserManager(logger);
    browserManagerGlobal = browserManager;
    const configLoader = new ConfigLoader(logger);
    const domainExtractor = new DomainExtractor(logger);

    const [minDelay, maxDelay] = options.delay.split('-').map(d => parseInt(d));
    const rateLimiter = new RateLimiter(logger, { minDelay: minDelay || 2000, maxDelay: maxDelay || 5000 });

    await browserManager.launch(headless);

    // Load config ONCE
    const config = options.config
      ? configLoader.loadConfigByName(options.config) || configLoader.loadConfig(options.url)
      : configLoader.loadConfig(options.url);

    if (!config) {
      logger.error('No config found. Run config generator first:');
      logger.error(`  node src/tools/config-generator.js --url "${options.url}"`);
      process.exit(1);
    }
    logger.info(`Loaded config: ${config.name || config.domain} (v${config.version || '1.0'})`);

    // Determine effective pagination type
    const urlDetection = detectPaginationFromUrl(options.url);
    let effectivePaginationType;

    if (options.scroll || options.forceSelenium) {
      effectivePaginationType = 'infinite-scroll';
      logger.info('[Override] CLI flag: using infinite-scroll mode');
    } else if (options.paginate) {
      effectivePaginationType = 'pagination';
      logger.info('[Override] CLI flag: using pagination mode');
    } else if (options.singlePage) {
      effectivePaginationType = 'single-page';
      logger.info('[Override] CLI flag: using single-page mode');
    } else {
      effectivePaginationType = await selectPaginationMode({
        configPaginationType: config?.pagination?.paginationType,
        urlDetection,
        autoMode: options.auto,
        logger
      });
    }

    const configType = config?.pagination?.paginationType;
    if (configType && effectivePaginationType !== configType) {
      logger.info(`[Pagination] Mode: ${effectivePaginationType} (overriding config: ${configType})`);
    }

    // Update paginationEnabled based on effective type
    const effectivePaginationEnabled = effectivePaginationType === 'pagination';

    // Pagination discovery
    let paginationResult = null;
    let pageUrls = [options.url];

    if (effectivePaginationEnabled) {
      const paginator = new Paginator(browserManager, rateLimiter, logger, configLoader);
      if (startPage > 1) paginator.setStartPage(startPage);

      logger.info('');
      logger.info('═══════════════════════════════════════════════════════════════');
      logger.info('  PAGINATION DISCOVERY');
      logger.info('═══════════════════════════════════════════════════════════════');

      paginationResult = await paginator.paginate(options.url, {
        maxPages, minContacts,
        timeout: parseInt(process.env.PAGINATION_DISCOVERY_TIMEOUT) || 30000,
        discoverOnly: options.discoverOnly,
        siteConfig: config
      });

      if (paginationResult.success && paginationResult.urls?.length > 1) {
        pageUrls = paginationResult.urls;
        logger.info(`✓ Found ${pageUrls.length} pages (${paginationResult.paginationType})`);

        if (paginationResult.pattern && paginationResult.confidence >= 70) {
          const domain = new URL(options.url).hostname.replace(/^www\./, '');
          try { configLoader.saveCachedPattern(domain, paginationResult.pattern); } catch (e) { /* ignore */ }
        }

        if (options.discoverOnly) {
          logger.info('Discovery complete. Exiting (--discover-only mode)');
          await browserManager.close();
          process.exit(0);
        }
      } else {
        logger.info('ℹ No pagination detected, using single page');
      }

      paginator.resetSeenContent();
    }

    // Determine if infinite scroll is needed based on effective pagination type
    const needsSelenium = effectivePaginationType === 'infinite-scroll';

    if (needsSelenium) {
      seleniumManager = new SeleniumManager(logger);
      seleniumManagerGlobal = seleniumManager;
      await seleniumManager.launch(headless);
      logger.info(`[Orchestrator] Selenium initialized (scrollDelay=${options.scrollDelay || 400}ms)`);
    }

    // Create scraper using factory with effective pagination type
    const { scraper } = createScraperFromConfig(config, {
      browserManager, seleniumManager, rateLimiter, logger, configLoader
    }, {
      scroll: effectivePaginationType === 'infinite-scroll',
      forceSelenium: effectivePaginationType === 'infinite-scroll',
      scrollDelay: options.scrollDelay, maxRetries: options.maxRetries,
      maxScrolls: options.maxScrolls,
      paginate: effectivePaginationType === 'pagination',
      maxPages
    });

    // Use effective pagination type for execution strategy
    const scraperType = effectivePaginationType;
    logger.info(`[Orchestrator] Using scraper type: ${scraperType}`);

    // Execute scraping based on type
    let allContacts = [];

    if (scraperType === 'pagination') {
      logger.info('[Orchestrator] PaginationScraper handling all pages internally');
      const result = await scraper.scrape(options.url, options.limit, paginationResult);
      allContacts = Array.isArray(result) ? result : (result.contacts || []);

    } else if (scraperType === 'infinite-scroll') {
      logger.info('[Orchestrator] Using infinite scroll');
      allContacts = await scraper.scrapeWithScroll(options.url, options.limit, options.maxScrolls || 50);

    } else {
      logger.info('[Orchestrator] Single page scrape');
      const result = await scraper.scrape(options.url, options.limit);
      allContacts = Array.isArray(result) ? result : (result.contacts || []);
    }

    // Deduplicate contacts
    const uniqueMap = new Map();
    for (const contact of allContacts) {
      const key = contact.email || `${contact.name}_${contact.phone}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, contact);
      } else {
        const existing = uniqueMap.get(key);
        const existingScore = (existing.name ? 1 : 0) + (existing.email ? 1 : 0) + (existing.phone ? 1 : 0);
        const newScore = (contact.name ? 1 : 0) + (contact.email ? 1 : 0) + (contact.phone ? 1 : 0);
        if (newScore > existingScore) uniqueMap.set(key, contact);
      }
    }
    const contacts = Array.from(uniqueMap.values());

    // Log results using stats reporter
    logScrapingStats(contacts, logger, { paginationEnabled: effectivePaginationEnabled, pageUrls, allContacts });
    const domainStats = logDomainStats(contacts, domainExtractor, logger);
    logSampleContacts(contacts, logger, 5);

    // Save to JSON
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(outputDir, `contacts-${timestamp}.json`);

    const outputData = {
      metadata: {
        scrapedAt: new Date().toISOString(),
        url: options.url,
        totalContacts: contacts.length,
        domainStats: {
          uniqueDomains: domainStats.uniqueDomains,
          businessDomains: domainStats.businessDomains,
          businessEmailCount: domainStats.businessEmailCount,
          personalEmailCount: domainStats.personalEmailCount,
          topDomains: domainStats.topDomains.slice(0, 10),
          topBusinessDomains: domainStats.topBusinessDomains.slice(0, 10)
        }
      },
      contacts
    };

    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
    logger.info(`Contacts saved to: ${outputFile}`);

    // Google Sheets export
    if (options.export !== false) {
      const sheetsExporter = new GoogleSheetsExporter(logger);
      if (sheetsExporter.isConfigured()) {
        try {
          const sheetName = await sheetsExporter.exportFromJson(outputFile);
          if (sheetName) logger.info(`Exported to Google Sheets: "${sheetName}"`);
        } catch (error) {
          logger.warn(`Google Sheets export failed: ${error.message}`);
        }
      }
    }

    await cleanup();
    logger.info('Scraping completed successfully');
    process.exit(0);

  } catch (error) {
    if (error.message === 'CAPTCHA_DETECTED') {
      logger.error('CAPTCHA detected! Try --headless false to solve manually.');
    } else {
      logger.error('Fatal error:', error);
    }
    await cleanup();
    process.exit(1);
  }
}

main();

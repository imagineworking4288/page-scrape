#!/usr/bin/env node

const { Command } = require('commander');
const BrowserManager = require('../src/core/browser-manager');
const RateLimiter = require('../src/core/rate-limiter');
const ConfigLoader = require('../src/config/config-loader');
const Paginator = require('../src/features/pagination/paginator');
const SelectScraper = require('../src/scrapers/select-scraper');
const logger = require('../src/core/logger');

const program = new Command();
program
  .name('pagination-integration-test')
  .description('Test complete pagination + scraping workflow')
  .requiredOption('--url <url>', 'Target URL to test')
  .option('--headless [value]', 'Run browser in headless mode', 'true')
  .option('--max-pages <number>', 'Maximum pages to scrape', parseInt, 5)
  .option('--min-contacts <number>', 'Minimum contacts per page', parseInt, 1)
  .parse(process.argv);

const options = program.opts();

async function main() {
  let browserManager = null;
  const startTime = Date.now();

  try {
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('  PAGINATION INTEGRATION TEST');
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('');
    logger.info(`URL: ${options.url}`);
    logger.info(`Max pages: ${options.maxPages}`);
    logger.info(`Min contacts/page: ${options.minContacts}`);
    logger.info('');

    // Initialize
    browserManager = new BrowserManager(logger);
    const rateLimiter = new RateLimiter(logger, { minDelay: 1000, maxDelay: 2000 });
    const configLoader = new ConfigLoader(logger);
    const headless = options.headless !== 'false';

    await browserManager.launch(headless);

    // ═══════════════════════════════════════
    // PHASE 1: PAGINATION DISCOVERY
    // ═══════════════════════════════════════

    logger.info('─────────────────────────────────────────────────────────────────');
    logger.info('  PHASE 1: DISCOVERING PAGINATION');
    logger.info('─────────────────────────────────────────────────────────────────');
    logger.info('');

    const discoveryStart = Date.now();
    const paginator = new Paginator(browserManager, rateLimiter, logger, configLoader);
    const paginationResult = await paginator.paginate(options.url, {
      maxPages: options.maxPages,
      minContacts: options.minContacts,
      timeout: 30000
    });
    const discoveryTime = ((Date.now() - discoveryStart) / 1000).toFixed(1);

    if (!paginationResult.success) {
      logger.error('✗ Pagination discovery failed');
      logger.error(`Error: ${paginationResult.error}`);
      await browserManager.close();
      process.exit(1);
    }

    logger.info('');
    logger.info('✓ DISCOVERY RESULTS:');
    logger.logStats({
      'Pattern Type': paginationResult.paginationType,
      'Detection Method': paginationResult.detectionMethod || 'N/A',
      'Total Pages': paginationResult.totalPages,
      'Visual Max': paginationResult.visualMaxPage || 'N/A',
      'True Max': paginationResult.trueMaxPage || 'N/A',
      'Boundary Confirmed': paginationResult.boundaryConfirmed ? 'YES' : 'NO',
      'Confidence': `${paginationResult.confidence}/100`,
      'Discovery Time': `${discoveryTime}s`
    });
    logger.info('');

    // ═══════════════════════════════════════
    // PHASE 2: SCRAPING ALL PAGES
    // ═══════════════════════════════════════

    logger.info('─────────────────────────────────────────────────────────────────');
    logger.info('  PHASE 2: SCRAPING ALL PAGES');
    logger.info('─────────────────────────────────────────────────────────────────');
    logger.info('');

    const scraper = new SelectScraper(browserManager, rateLimiter, logger);
    const allContacts = [];

    for (let i = 0; i < paginationResult.urls.length; i++) {
      const url = paginationResult.urls[i];
      logger.info(`Scraping page ${i + 1}/${paginationResult.urls.length}...`);

      try {
        const contacts = await scraper.scrape(url, null, false, i + 1, url);
        allContacts.push(...contacts);

        logger.info(`  ✓ Extracted ${contacts.length} contacts`);

        if (i < paginationResult.urls.length - 1) {
          await rateLimiter.waitBeforeRequest();
        }
      } catch (error) {
        logger.error(`  ✗ Failed to scrape page ${i + 1}: ${error.message}`);
      }
    }

    logger.info('');
    logger.info(`✓ Total contacts extracted: ${allContacts.length}`);
    logger.info('');

    // ═══════════════════════════════════════
    // PHASE 3: VALIDATION
    // ═══════════════════════════════════════

    logger.info('─────────────────────────────────────────────────────────────────');
    logger.info('  PHASE 3: VALIDATING RESULTS');
    logger.info('─────────────────────────────────────────────────────────────────');
    logger.info('');

    const withEmail = allContacts.filter(c => c.email).length;
    const withPhone = allContacts.filter(c => c.phone).length;
    const withName = allContacts.filter(c => c.name).length;
    const complete = allContacts.filter(c => c.name && c.email && c.phone).length;

    logger.logStats({
      'Total Contacts': allContacts.length,
      'With Email': `${withEmail} (${allContacts.length > 0 ? ((withEmail/allContacts.length)*100).toFixed(1) : 0}%)`,
      'With Phone': `${withPhone} (${allContacts.length > 0 ? ((withPhone/allContacts.length)*100).toFixed(1) : 0}%)`,
      'With Name': `${withName} (${allContacts.length > 0 ? ((withName/allContacts.length)*100).toFixed(1) : 0}%)`,
      'Complete (All 3)': `${complete} (${allContacts.length > 0 ? ((complete/allContacts.length)*100).toFixed(1) : 0}%)`
    });
    logger.info('');

    // ═══════════════════════════════════════
    // SUCCESS CRITERIA
    // ═══════════════════════════════════════

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    const passed =
      paginationResult.totalPages > 1 &&
      allContacts.length > 0 &&
      withEmail > 0 &&
      paginationResult.confidence >= 70;

    logger.info('═══════════════════════════════════════════════════════════════');
    if (passed) {
      logger.info('  ✓ INTEGRATION TEST PASSED');
    } else {
      logger.info('  ✗ INTEGRATION TEST FAILED');
    }
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('');
    logger.info(`Total time: ${totalTime}s`);
    logger.info('');

    await browserManager.close();
    process.exit(passed ? 0 : 1);

  } catch (error) {
    logger.error('');
    logger.error('✗ Test failed with error:');
    logger.error(error.message);
    logger.error('');
    logger.error('Stack trace:');
    logger.error(error.stack);
    logger.info('');

    if (browserManager) {
      await browserManager.close();
    }
    process.exit(1);
  }
}

main();

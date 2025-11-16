#!/usr/bin/env node

const { Command } = require('commander');
const Table = require('cli-table3');
const fs = require('fs');
const path = require('path');

// Import utilities
const logger = require('./utils/logger');
const BrowserManager = require('./utils/browser-manager');
const RateLimiter = require('./utils/rate-limiter');
const DomainExtractor = require('./utils/domain-extractor');

// Import scrapers
const SimpleScraper = require('./scrapers/simple-scraper');
const PdfScraper = require('./scrapers/pdf-scraper');

// CLI setup
const program = new Command();
program
  .name('universal-scraper')
  .description('Universal professional directory scraper')
  .version('1.0.0')
  .requiredOption('-u, --url <url>', 'Target URL to scrape')
  .option('-l, --limit <number>', 'Limit number of contacts to scrape', parseInt)
  .option('-m, --method <type>', 'Scraping method: html|pdf|hybrid', 'hybrid')
  .option('-o, --output <format>', 'Output format: sqlite|csv|sheets|all', 'json')
  .option('--headless [value]', 'Run browser in headless mode (true/false, default: true)', 'true')
  .option('--delay <ms>', 'Delay between requests (ms)', '2000-5000')
  .option('--keep', 'Keep PDF files in output/pdfs/ directory (default: delete after parsing)')
  .option('--completeness <threshold>', 'Min completeness for PDF (default: 0.7)', '0.7')
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

// Main execution
async function main() {
  let browserManager = null;
  
  try {
    logger.info('═══════════════════════════════════════');
    logger.info('  UNIVERSAL PROFESSIONAL SCRAPER v1.0');
    logger.info('═══════════════════════════════════════');
    logger.info('');
    
    // Validate URL
    if (!validateUrl(options.url)) {
      process.exit(1);
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
    logger.info('');
    
    // Initialize components
    logger.info('Initializing components...');
    browserManager = new BrowserManager(logger);
    browserManagerGlobal = browserManager; // FIXED: Assign to global for signal handlers
    const domainExtractor = new DomainExtractor(logger);
    
    // Parse delay range
    const [minDelay, maxDelay] = options.delay.split('-').map(d => parseInt(d));
    const rateLimiter = new RateLimiter(logger, {
      minDelay: minDelay || 2000,
      maxDelay: maxDelay || 5000
    });
    
    // Launch browser
    await browserManager.launch(headless);

    // Create scraper based on method
    let contacts;

    switch (options.method) {
      case 'html':
        logger.info('Using HTML-first method (PDF fallback for missing names)...');
        const htmlScraper = new SimpleScraper(browserManager, rateLimiter, logger);
        contacts = await htmlScraper.scrape(options.url, options.limit, options.keep);
        break;

      case 'pdf':
        logger.info('Using PDF-primary method (disk-based extraction)...');
        const pdfScraper = new PdfScraper(browserManager, rateLimiter, logger);
        contacts = await pdfScraper.scrapePdf(options.url, options.limit, options.keep);
        break;

      case 'hybrid':
        logger.info('Using hybrid method (HTML + PDF fallback, disk-based)...');
        const hybridScraper = new SimpleScraper(browserManager, rateLimiter, logger);
        contacts = await hybridScraper.scrape(options.url, options.limit, options.keep);
        break;

      default:
        throw new Error(`Invalid method: ${options.method}. Use html, pdf, or hybrid.`);
    }

    // Post-process contacts (deduplication now handled by scrapers)
    const processedContacts = contacts;
    
    // NEW: Generate domain statistics
    logger.info('Analyzing domain distribution...');
    const domainStats = domainExtractor.getDomainStats(processedContacts);
    
    // Log statistics
    logger.info('');
    logger.info('═══════════════════════════════════════');
    logger.info('  SCRAPING COMPLETE');
    logger.info('═══════════════════════════════════════');
    logger.logStats({
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
    });
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
    
    // Close browser
    await browserManager.close();
    
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
    
    process.exit(1);
  }
}

// FIXED: Handle graceful shutdown with proper browser cleanup
let browserManagerGlobal = null;

process.on('SIGINT', async () => {
  logger.warn('Received SIGINT, shutting down gracefully...');
  if (browserManagerGlobal) {
    try {
      await browserManagerGlobal.close();
    } catch (error) {
      logger.error(`Error closing browser during SIGINT: ${error.message}`);
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
  process.exit(0);
});

// Run main
main();
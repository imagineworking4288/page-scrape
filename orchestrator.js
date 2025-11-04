#!/usr/bin/env node

const { Command } = require('commander');
const Table = require('cli-table3');
const fs = require('fs');
const path = require('path');

// Import utilities
const logger = require('./utils/logger');
const BrowserManager = require('./utils/browser-manager');
const RateLimiter = require('./utils/rate-limiter');

// Import scrapers
const SimpleScraper = require('./scrapers/simple-scraper');
const PdfScraper = require('./scrapers/pdf-scraper');
const DataMerger = require('./scrapers/data-merger');

// CLI setup
const program = new Command();
program
  .name('universal-scraper')
  .description('Universal professional directory scraper')
  .version('1.0.0')
  .requiredOption('-u, --url <url>', 'Target URL to scrape')
  .option('-l, --limit <number>', 'Limit number of contacts to scrape', parseInt)
  .option('-o, --output <format>', 'Output format: sqlite|csv|sheets|all', 'json')
  .option('--headless [value]', 'Run browser in headless mode (true/false, default: true)', 'true')
  .option('--delay <ms>', 'Delay between requests (ms)', '2000-5000')
  .option('--no-pdf', 'Disable PDF fallback (HTML only)')
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
    logger.info(`Output: ${options.output}`);
    logger.info(`Headless: ${headless}`);
    logger.info(`PDF Fallback: ${options.pdf !== false ? 'enabled' : 'disabled'}`);
    if (options.pdf !== false) {
      logger.info(`Completeness Threshold: ${(parseFloat(options.completeness) * 100).toFixed(0)}%`);
    }
    logger.info('');
    
    // Initialize components
    logger.info('Initializing components...');
    browserManager = new BrowserManager(logger);
    
    // Parse delay range
    const [minDelay, maxDelay] = options.delay.split('-').map(d => parseInt(d));
    const rateLimiter = new RateLimiter(logger, {
      minDelay: minDelay || 2000,
      maxDelay: maxDelay || 5000
    });
    
    // Launch browser
    await browserManager.launch(headless);
    
    // Create scrapers and merger
    logger.info('Starting hybrid HTML+PDF scraper...');
    const simpleScraper = new SimpleScraper(browserManager, rateLimiter, logger);
    const pdfScraper = new PdfScraper(browserManager, rateLimiter, logger);
    const merger = new DataMerger(logger);
    
    // Step 1: HTML scraping
    logger.info('Step 1: HTML scraping...');
    const htmlContacts = await simpleScraper.scrape(options.url, options.limit);
    
    // Calculate completeness
    const complete = htmlContacts.filter(c => c.name && c.email && c.phone).length;
    const completeness = htmlContacts.length > 0 ? complete / htmlContacts.length : 0;
    logger.info(`HTML completeness: ${(completeness * 100).toFixed(1)}% (${complete}/${htmlContacts.length} contacts have all fields)`);
    
    // Step 2: PDF fallback if needed
    let finalContacts = htmlContacts;
    const usePdf = options.pdf !== false;
    const minCompleteness = parseFloat(options.completeness) || 0.7;
    
    if (usePdf && completeness < minCompleteness) {
      logger.info(`Completeness ${(completeness * 100).toFixed(1)}% < ${(minCompleteness * 100).toFixed(0)}%, using PDF fallback...`);
      
      try {
        const pdfContacts = await pdfScraper.scrapePdf(options.url, options.limit);
        logger.info(`PDF extracted ${pdfContacts.length} contacts`);
        
        // Merge
        logger.info('Merging HTML and PDF results...');
        finalContacts = merger.mergeContacts(htmlContacts, pdfContacts);
        logger.info(`Merged result: ${finalContacts.length} total contacts`);
      } catch (error) {
        logger.warn(`PDF scraping failed: ${error.message}`);
        logger.warn('Falling back to HTML results only');
        finalContacts = htmlContacts;
      }
    } else {
      logger.info('HTML extraction sufficient, skipping PDF');
    }
    
    // Post-process contacts
    const processedContacts = simpleScraper.postProcessContacts(finalContacts);
    
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
    
    // Display sample contacts in table
    if (processedContacts.length > 0) {
      logger.info('Sample Contacts (first 5):');
      const table = new Table({
        head: ['Name', 'Email', 'Phone', 'Source', 'Confidence'],
        colWidths: [25, 30, 20, 10, 12],
        wordWrap: true
      });
      
      processedContacts.slice(0, 5).forEach(contact => {
        table.push([
          contact.name || 'N/A',
          contact.email || 'N/A',
          contact.phone || 'N/A',
          contact.source || 'N/A',
          contact.confidence || 'N/A'
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
    fs.writeFileSync(outputFile, JSON.stringify(processedContacts, null, 2));
    
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

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.warn('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.warn('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run main
main();
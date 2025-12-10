#!/usr/bin/env node

/**
 * Enrich Contacts CLI Tool
 *
 * Enriches scraped contacts using profile page data to:
 * - Fill missing fields (email, title, bio, etc.)
 * - Validate existing data
 * - Clean contaminated fields
 * - Generate audit trails
 *
 * Usage:
 *   node src/tools/enrich-contacts.js --input output/scrape.json
 *   node src/tools/enrich-contacts.js --input output/scrape.json --limit 10 --verbose
 */

require('dotenv').config();

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');

const logger = require('../core/logger');
const BrowserManager = require('../core/browser-manager');
const RateLimiter = require('../core/rate-limiter');
const ProfileEnricher = require('../features/enrichment/profile-enricher');
const { generateReport, saveReport, printReport } = require('../features/enrichment/report-generator');
const { FieldCleaner } = require('../features/enrichment/post-cleaners');
const { SheetExporter } = require('../features/export');

const program = new Command();

program
  .name('enrich-contacts')
  .description('Enrich scraped contacts using profile page data')
  .requiredOption('-i, --input <file>', 'Input JSON file (scraped contacts)')
  .option('-o, --output <file>', 'Output enriched JSON file (default: adds -enriched suffix)')
  .option('-l, --limit <n>', 'Limit contacts to enrich (for testing)', parseInt)
  .option('--delay <ms>', 'Delay between profile visits (ms)', parseInt, 3000)
  .option('--headless', 'Run browser in headless mode', true)
  .option('--no-headless', 'Run browser in visible mode')
  .option('--validate-only', 'Only validate, don\'t enrich (faster)', false)
  .option('--resume-from <n>', 'Resume from contact index', parseInt, 0)
  .option('--save-every <n>', 'Save progress every N contacts', parseInt, 50)
  .option('--skip-errors', 'Continue on errors', true)
  .option('--no-skip-errors', 'Stop on first error')
  .option('--review-output <file>', 'Output manual review queue to file')
  .option('--report <file>', 'Generate enrichment report to file')
  .option('--report-format <format>', 'Report format: json or text', 'text')
  .option('--fields <fields>', 'Comma-separated list of fields to enrich (e.g., name,email,phone)')
  .option('--core-fields-only', 'Only enrich core fields (name, email, phone, location, title)', false)
  .option('--export-sheets [name]', 'Export enriched contacts to Google Sheets (optional sheet name)')
  .option('--prioritize-us', 'Prioritize US locations in multi-location contacts (default: true)')
  .option('--no-prioritize-us', 'Do not prioritize US locations')
  .option('--strict-validation', 'Enable strict phone-location validation', false)
  .option('--no-post-clean', 'Skip post-enrichment cleaning phase')
  .option('-v, --verbose', 'Verbose logging', false)
  .parse(process.argv);

const options = program.opts();

/**
 * Main entry point
 */
async function main() {
  let browserManager = null;

  try {
    // Validate input file
    const inputPath = path.resolve(options.input);
    if (!fs.existsSync(inputPath)) {
      console.error(`Error: Input file not found: ${inputPath}`);
      process.exit(1);
    }

    // Set log level
    if (options.verbose) {
      logger.level = 'debug';
    }

    console.log('');
    console.log('================================================================================');
    console.log('PROFILE ENRICHMENT');
    console.log('================================================================================');
    console.log(`Input file:    ${inputPath}`);
    console.log(`Limit:         ${options.limit || 'None'}`);
    console.log(`Delay:         ${options.delay}ms`);
    console.log(`Headless:      ${options.headless}`);
    console.log(`Resume from:   ${options.resumeFrom}`);
    console.log(`Validate only: ${options.validateOnly}`);
    console.log(`Fields:        ${options.fields || (options.coreFieldsOnly ? 'core fields only' : 'auto-detect')}`);
    console.log('================================================================================');
    console.log('');

    // Initialize browser manager
    logger.info('[EnrichContacts] Initializing browser...');
    browserManager = new BrowserManager(logger);
    await browserManager.launch(options.headless);

    // Initialize rate limiter
    const rateLimiter = new RateLimiter(logger, {
      minDelay: options.delay,
      maxDelay: options.delay + 2000,
      maxRetries: 2
    });

    // Initialize enricher
    const enricher = new ProfileEnricher(browserManager, rateLimiter, logger);

    // Determine output file
    const outputFile = options.output || getDefaultOutputFile(inputPath);

    // Parse fields option if provided
    const fieldsToEnrich = options.fields
      ? options.fields.split(',').map(f => f.trim()).filter(f => f)
      : null;

    // Run enrichment
    logger.info('[EnrichContacts] Starting enrichment process...');
    const result = await enricher.enrichContacts(inputPath, {
      limit: options.limit,
      delay: options.delay,
      headless: options.headless,
      validateOnly: options.validateOnly,
      saveProgressEvery: options.saveEvery,
      resumeFrom: options.resumeFrom,
      skipErrors: options.skipErrors,
      outputFile,
      fieldsToEnrich,
      onlyCoreFields: options.coreFieldsOnly
    });

    // Post-enrichment cleaning phase (unless skipped)
    if (options.postClean !== false && result.contacts && result.contacts.length > 0) {
      console.log('');
      console.log('================================================================================');
      console.log('POST-ENRICHMENT CLEANING');
      console.log('================================================================================');
      logger.info('[Post-Cleaning] Starting field cleaning...');

      const fieldCleaner = new FieldCleaner(logger);
      const cleanedContacts = await fieldCleaner.cleanContacts(result.contacts, {
        prioritizeUS: options.prioritizeUs !== false,
        strictValidation: options.strictValidation || false
      });

      // Update result with cleaned contacts
      result.contacts = cleanedContacts;

      // Get and display cleaning statistics
      const cleaningStats = fieldCleaner.getStatistics(cleanedContacts);
      console.log(`Processed:        ${cleaningStats.totalProcessed} contacts`);
      console.log(`Multi-location:   ${cleaningStats.multiLocation}`);
      console.log(`Phones removed:   ${cleaningStats.locationPhonesRemoved} (from locations)`);
      console.log(`Location issues:  ${cleaningStats.correlationIssues}`);
      console.log(`High confidence:  ${cleaningStats.highConfidence}`);
      console.log('================================================================================');

      // Re-save the output file with cleaned contacts
      fs.writeFileSync(result.outputFile, JSON.stringify(result.contacts, null, 2), 'utf8');
      logger.info(`[Post-Cleaning] Updated output file: ${result.outputFile}`);
    }

    // Save manual review queue if requested
    if (options.reviewOutput && result.reviewQueue.length > 0) {
      enricher.saveReviewQueue(options.reviewOutput);
      console.log(`Review queue saved to: ${options.reviewOutput}`);
    }

    // Generate and save report if requested
    if (options.report) {
      const report = generateReport(result);
      saveReport(report, options.report, options.reportFormat);
      console.log(`Report saved to: ${options.report}`);
    }

    // Print completion message
    console.log('');
    console.log('Enrichment complete!');
    console.log(`Output file: ${result.outputFile}`);

    if (result.reviewQueue.length > 0) {
      console.log(`Contacts requiring review: ${result.reviewQueue.length}`);
      if (!options.reviewOutput) {
        console.log('Use --review-output <file> to save review queue');
      }
    }

    // Print summary report to console if verbose
    if (options.verbose) {
      console.log('');
      const report = generateReport(result);
      printReport(report);
    }

    // Export to Google Sheets if requested
    if (options.exportSheets !== undefined) {
      await exportToGoogleSheets(result, options.exportSheets);
    }

    // Cleanup
    await browserManager.close();
    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('================================================================================');
    console.error('ENRICHMENT FAILED');
    console.error('================================================================================');
    console.error(`Error: ${error.message}`);

    if (options.verbose) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }

    // Cleanup
    if (browserManager) {
      try {
        await browserManager.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }

    process.exit(1);
  }
}

/**
 * Get default output file name
 * @param {string} inputFile - Input file path
 * @returns {string} - Output file path
 */
function getDefaultOutputFile(inputFile) {
  const parsed = path.parse(inputFile);
  return path.join(parsed.dir, `${parsed.name}-enriched${parsed.ext}`);
}

/**
 * Export enriched contacts to Google Sheets
 * @param {Object} enrichmentResult - Result from enrichment process
 * @param {string|boolean} sheetNameArg - Sheet name or true for auto-generate
 */
async function exportToGoogleSheets(enrichmentResult, sheetNameArg) {
  try {
    console.log('');
    logger.info('[EnrichContacts] Exporting to Google Sheets...');

    const exporter = new SheetExporter(logger);

    // Check if Google Sheets is configured
    if (!exporter.isConfigured()) {
      logger.warn('[EnrichContacts] Google Sheets not configured. Skipping export.');
      console.log('');
      console.log('To enable Google Sheets export, add credentials to .env:');
      console.log('  GOOGLE_SHEETS_CLIENT_EMAIL=...');
      console.log('  GOOGLE_SHEETS_PRIVATE_KEY="..."');
      console.log('  GOOGLE_SHEETS_SPREADSHEET_ID=...');
      return;
    }

    // Determine sheet name
    const sheetName = typeof sheetNameArg === 'string' && sheetNameArg.length > 0
      ? sheetNameArg
      : null; // Let exporter auto-generate

    // Export using the enriched output file
    const exportResult = await exporter.exportToSheet(enrichmentResult.outputFile, {
      sheetName,
      includeEnrichment: true // Include enrichment metadata by default
    });

    console.log('');
    console.log(`Google Sheets export successful!`);
    console.log(`Sheet URL: ${exportResult.spreadsheetUrl}`);

  } catch (error) {
    // Don't fail the entire operation if export fails
    logger.error(`[EnrichContacts] Google Sheets export failed: ${error.message}`);
    console.error('');
    console.error(`Warning: Google Sheets export failed: ${error.message}`);
    console.error('Enrichment completed successfully, but export to Sheets failed.');
  }
}

/**
 * Handle process signals for cleanup
 */
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT. Cleaning up...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM. Cleaning up...');
  process.exit(0);
});

// Run main
main();

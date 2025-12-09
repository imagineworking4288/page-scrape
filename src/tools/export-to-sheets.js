#!/usr/bin/env node

/**
 * Export to Google Sheets CLI Tool
 *
 * Exports scraped or enriched contact data to Google Sheets.
 *
 * Usage:
 *   node src/tools/export-to-sheets.js --input output/scrape-enriched.json
 *   node src/tools/export-to-sheets.js --input output/scrape.json --name "My Contacts" --include-enrichment
 */

require('dotenv').config();

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');

const logger = require('../core/logger');
const { SheetExporter } = require('../features/export');

const program = new Command();

program
  .name('export-to-sheets')
  .description('Export contacts to Google Sheets')
  .requiredOption('-i, --input <file>', 'Input JSON file (required)')
  .option('-n, --name <name>', 'Sheet name (auto-generated if not provided)')
  .option('--sheet-id <id>', 'Existing sheet ID (for append mode)')
  .option('--mode <mode>', 'Export mode: create | append', 'create')
  .option('--columns <list>', 'Comma-separated columns to include')
  .option('--exclude <list>', 'Comma-separated columns to exclude')
  .option('--include-enrichment', 'Include enrichment metadata columns', false)
  .option('--core-only', 'Only include core fields (name, email, phone, title, location, profileUrl)', false)
  .option('--batch-size <n>', 'Rows per batch (default: 100)', parseInt, 100)
  .option('-v, --verbose', 'Verbose logging', false)
  .parse(process.argv);

const options = program.opts();

/**
 * Main entry point
 */
async function main() {
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
    console.log('GOOGLE SHEETS EXPORT');
    console.log('================================================================================');
    console.log(`Input file:         ${inputPath}`);
    console.log(`Sheet name:         ${options.name || '(auto-generate)'}`);
    console.log(`Mode:               ${options.mode}`);
    console.log(`Include enrichment: ${options.includeEnrichment}`);
    console.log(`Core fields only:   ${options.coreOnly}`);
    console.log(`Batch size:         ${options.batchSize}`);
    console.log('================================================================================');
    console.log('');

    // Initialize exporter
    const exporter = new SheetExporter(logger, {
      batchSize: options.batchSize
    });

    // Check configuration
    if (!exporter.isConfigured()) {
      console.error('');
      console.error('Error: Google Sheets not configured.');
      console.error('');
      console.error('Please add the following to your .env file:');
      console.error('  GOOGLE_SHEETS_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com');
      console.error('  GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"');
      console.error('  GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id');
      console.error('');
      console.error('See .env.example for more details.');
      process.exit(1);
    }

    // Build export options
    const exportOptions = {
      sheetName: options.name,
      sheetId: options.sheetId,
      mode: options.mode,
      includeEnrichment: options.includeEnrichment,
      coreOnly: options.coreOnly
    };

    // Parse columns if provided
    if (options.columns) {
      exportOptions.columns = options.columns.split(',').map(c => c.trim()).filter(c => c);
    }

    // Parse exclude if provided
    if (options.exclude) {
      exportOptions.exclude = options.exclude.split(',').map(c => c.trim()).filter(c => c);
    }

    // Run export
    logger.info('[ExportToSheets] Starting export...');
    const result = await exporter.exportToSheet(inputPath, exportOptions);

    // Print success message
    console.log('');
    console.log('Export successful!');
    console.log(`Open sheet: ${result.spreadsheetUrl}`);

    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('================================================================================');
    console.error('EXPORT FAILED');
    console.error('================================================================================');
    console.error(`Error: ${error.message}`);

    if (options.verbose) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }

    process.exit(1);
  }
}

/**
 * Handle process signals for cleanup
 */
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT. Exiting...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM. Exiting...');
  process.exit(0);
});

// Run main
main();

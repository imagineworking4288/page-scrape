#!/usr/bin/env node

const DataMerger = require('../scrapers/data-merger');
const SimpleScraper = require('../scrapers/simple-scraper');
const PdfScraper = require('../scrapers/pdf-scraper');
const { Command } = require('commander');

// Real imports for live testing
const logger = require('../utils/logger');
const BrowserManager = require('../utils/browser-manager');
const RateLimiter = require('../utils/rate-limiter');

// Mock classes for unit tests
class MockLogger {
  info() {}
  warn() {}
  error() {}
  debug() {}
}

// Test runner
class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
  }

  async test(name, fn) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      this.passed++;
    } catch (error) {
      console.log(`✗ ${name}`);
      console.log(`  Error: ${error.message}`);
      this.failed++;
    }
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  }

  summary() {
    console.log('\n═══════════════════════════════════════');
    console.log('  UNIT TEST SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`Total Tests: ${this.passed + this.failed}`);
    console.log(`Passed: ${this.passed}`);
    console.log(`Failed: ${this.failed}`);
    console.log('');
    
    if (this.failed === 0) {
      console.log('✓ All unit tests passed!');
    } else {
      console.log(`✗ ${this.failed} unit test(s) failed`);
    }
  }
}

// Live URL testing with both scrappers
async function testLiveUrl(url, headless = true) {
  console.log('\n\n╔═══════════════════════════════════════╗');
  console.log('║   LIVE URL TEST - DATA MERGER          ║');
  console.log('╚═══════════════════════════════════════╝\n');
  console.log(`URL: ${url}\n`);

  let browserManager = null;

  try {
    // Initialize real components
    console.log('[1/7] Initializing browser and components...');
    browserManager = new BrowserManager(logger);
    const rateLimiter = new RateLimiter();
    await browserManager.launch(headless);
    
    const simpleScraper = new SimpleScraper(browserManager, rateLimiter, logger);
    const pdfScraper = new PdfScraper(browserManager, rateLimiter, logger);
    const merger = new DataMerger(logger);
    
    console.log('✓ All components initialized\n');

    // Navigate to URL
    console.log('[2/7] Navigating to URL...');
    await browserManager.navigate(url);
    console.log('✓ Page loaded\n');

    // HTML Scraping
    console.log('[3/7] Extracting contacts via HTML scraper...');
    const htmlContacts = await simpleScraper.scrape(url, null);
    console.log(`✓ HTML extracted ${htmlContacts.length} contacts\n`);

    // Display HTML results
    displayScraperResults('HTML', htmlContacts);

    // PDF Scraping
    console.log('[4/7] Extracting contacts via PDF scraper...');
    let pdfContacts = [];
    try {
      pdfContacts = await pdfScraper.scrapePdf(url, null);
      console.log(`✓ PDF extracted ${pdfContacts.length} contacts\n`);
    } catch (error) {
      console.log(`⚠ PDF extraction failed: ${error.message}`);
      console.log('  Continuing with HTML data only\n');
    }

    // Display PDF results
    if (pdfContacts.length > 0) {
      displayScraperResults('PDF', pdfContacts);
    }

    // Merge data
    console.log('[5/7] Merging HTML and PDF data...');
    const mergedContacts = merger.mergeContacts(htmlContacts, pdfContacts);
    console.log(`✓ Merged into ${mergedContacts.length} total contacts\n`);

    // Analyze merge results
    console.log('[6/7] Analyzing merge results...');
    analyzeMergeResults(htmlContacts, pdfContacts, mergedContacts);

    // Display final merged data
    console.log('[7/7] Final merged results:\n');
    displayFinalResults(mergedContacts);

    // Cleanup
    await browserManager.close();

    return { success: true, contacts: mergedContacts };

  } catch (error) {
    console.error(`\n✗ Live test failed: ${error.message}`);
    if (browserManager) {
      await browserManager.close();
    }
    return { success: false, error: error.message };
  }
}

function displayScraperResults(source, contacts) {
  const total = contacts.length;
  if (total === 0) {
    console.log(`  ${source}: No contacts extracted\n`);
    return;
  }

  const withName = contacts.filter(c => c.name).length;
  const withEmail = contacts.filter(c => c.email).length;
  const withPhone = contacts.filter(c => c.phone).length;
  const complete = contacts.filter(c => c.name && c.email && c.phone).length;

  console.log(`  ${source} Data Quality:`);
  console.log(`    Total:    ${total}`);
  console.log(`    Name:     ${withName} (${((withName/total)*100).toFixed(1)}%)`);
  console.log(`    Email:    ${withEmail} (${((withEmail/total)*100).toFixed(1)}%)`);
  console.log(`    Phone:    ${withPhone} (${((withPhone/total)*100).toFixed(1)}%)`);
  console.log(`    Complete: ${complete} (${((complete/total)*100).toFixed(1)}%)`);
  console.log('');
}

function analyzeMergeResults(htmlContacts, pdfContacts, mergedContacts) {
  const htmlCount = htmlContacts.length;
  const pdfCount = pdfContacts.length;
  const mergedCount = mergedContacts.length;

  console.log('  Merge Analysis:');
  console.log(`    HTML input:     ${htmlCount} contacts`);
  console.log(`    PDF input:      ${pdfCount} contacts`);
  console.log(`    Merged output:  ${mergedCount} contacts`);
  
  const expectedMax = htmlCount + pdfCount;
  const mergedAwayCount = expectedMax - mergedCount;
  console.log(`    Merged away:    ${mergedAwayCount} duplicates`);

  // Source breakdown
  const fromHtml = mergedContacts.filter(c => c.source === 'html').length;
  const fromPdf = mergedContacts.filter(c => c.source === 'pdf').length;
  const fromMerged = mergedContacts.filter(c => c.source === 'merged').length;

  console.log(`\n  Source Breakdown:`);
  console.log(`    HTML only:      ${fromHtml} contacts`);
  console.log(`    PDF only:       ${fromPdf} contacts`);
  console.log(`    Merged (both):  ${fromMerged} contacts`);

  // Completeness improvement
  const htmlComplete = htmlContacts.filter(c => c.name && c.email && c.phone).length;
  const mergedComplete = mergedContacts.filter(c => c.name && c.email && c.phone).length;
  const improvement = mergedComplete - htmlComplete;

  console.log(`\n  Data Completeness:`);
  console.log(`    HTML complete:   ${htmlComplete}/${htmlCount} (${htmlCount > 0 ? ((htmlComplete/htmlCount)*100).toFixed(1) : 0}%)`);
  console.log(`    Merged complete: ${mergedComplete}/${mergedCount} (${mergedCount > 0 ? ((mergedComplete/mergedCount)*100).toFixed(1) : 0}%)`);
  console.log(`    Improvement:     ${improvement > 0 ? '+' : ''}${improvement} contacts`);
  console.log('');
}

function displayFinalResults(contacts) {
  console.log('═══════════════════════════════════════════════════');
  console.log('  DATA QUALITY METRICS');
  console.log('═══════════════════════════════════════════════════\n');

  const total = contacts.length;
  const withName = contacts.filter(c => c.name).length;
  const withEmail = contacts.filter(c => c.email).length;
  const withPhone = contacts.filter(c => c.phone).length;
  const complete = contacts.filter(c => c.name && c.email && c.phone).length;

  console.log(`Total Contacts:     ${total}`);
  console.log(`With Name:          ${withName} (${total > 0 ? ((withName/total)*100).toFixed(1) : 0}%)`);
  console.log(`With Email:         ${withEmail} (${total > 0 ? ((withEmail/total)*100).toFixed(1) : 0}%)`);
  console.log(`With Phone:         ${withPhone} (${total > 0 ? ((withPhone/total)*100).toFixed(1) : 0}%)`);
  console.log(`Complete (all 3):   ${complete} (${total > 0 ? ((complete/total)*100).toFixed(1) : 0}%)`);

  const highConf = contacts.filter(c => c.confidence === 'high').length;
  const medConf = contacts.filter(c => c.confidence === 'medium').length;
  const lowConf = contacts.filter(c => c.confidence === 'low').length;

  console.log(`\nConfidence Levels:`);
  console.log(`  High:   ${highConf}`);
  console.log(`  Medium: ${medConf}`);
  console.log(`  Low:    ${lowConf}`);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  RAW MERGED DATA');
  console.log('═══════════════════════════════════════════════════\n');

  if (contacts.length === 0) {
    console.log('(No contacts extracted)');
  } else {
    contacts.forEach((contact, index) => {
      console.log(`Contact #${index + 1}:`);
      console.log(`  Name:       ${contact.name || '(missing)'}`);
      console.log(`  Email:      ${contact.email || '(missing)'}`);
      console.log(`  Phone:      ${contact.phone || '(missing)'}`);
      console.log(`  Source:     ${contact.source || 'unknown'}`);
      console.log(`  Confidence: ${contact.confidence || 'unknown'}`);
      if (contact.rawText) {
        console.log(`  Raw Text:   ${contact.rawText.substring(0, 100)}...`);
      }
      console.log('');
    });
  }

  console.log('═══════════════════════════════════════════════════\n');
}

// Run unit tests
async function runUnitTests() {
  const runner = new TestRunner();
  const mockLogger = new MockLogger();
  const merger = new DataMerger(mockLogger);

  console.log('═══════════════════════════════════════');
  console.log('  DATA MERGER UNIT TESTS');
  console.log('═══════════════════════════════════════');
  console.log('');

  await runner.test('Multi-Key Matching - Email', () => {
    const html = [{ name: 'John', email: 'john@x.com', phone: null }];
    const pdf = [{ name: null, email: 'john@x.com', phone: '5551234567' }];
    const merged = merger.mergeContacts(html, pdf);
    
    runner.assertEqual(merged.length, 1, 'Should merge into 1 contact');
    runner.assertEqual(merged[0].phone, '(555) 123-4567', 'Should add PDF phone');
    runner.assertEqual(merged[0].source, 'merged', 'Source should be merged');
  });

  await runner.test('Multi-Key Matching - Phone', () => {
    const html = [{ name: 'John', email: null, phone: '5551234567' }];
    const pdf = [{ name: null, email: 'john@x.com', phone: '(555) 123-4567' }];
    const merged = merger.mergeContacts(html, pdf);
    
    runner.assertEqual(merged.length, 1, 'Should merge into 1 contact');
    runner.assertEqual(merged[0].email, 'john@x.com', 'Should add PDF email');
    runner.assertEqual(merged[0].source, 'merged', 'Source should be merged');
  });

  await runner.test('Multi-Key Matching - Name Fallback', () => {
    const html = [{ name: 'John Doe', email: null, phone: null }];
    const pdf = [{ name: 'John Doe', email: 'john@x.com', phone: null }];
    const merged = merger.mergeContacts(html, pdf);
    
    runner.assertEqual(merged.length, 1, 'Should merge into 1 contact');
    runner.assertEqual(merged[0].email, 'john@x.com', 'Should add PDF email');
    runner.assertEqual(merged[0].source, 'merged', 'Source should be merged');
  });

  await runner.test('No Match - Different Contacts', () => {
    const html = [{ name: 'John', email: 'john@x.com', phone: '5551234567' }];
    const pdf = [{ name: 'Jane', email: 'jane@x.com', phone: '5559999999' }];
    const merged = merger.mergeContacts(html, pdf);
    
    runner.assertEqual(merged.length, 2, 'Should have 2 separate contacts');
    runner.assert(merged.some(c => c.name === 'John'), 'Should have John');
    runner.assert(merged.some(c => c.name === 'Jane'), 'Should have Jane');
  });

  await runner.test('Phone Normalization', () => {
    const tests = [
      { input: '(123) 456-7890', expected: '1234567890' },
      { input: '123-456-7890', expected: '1234567890' },
      { input: '+1 (123) 456-7890', expected: '1234567890' },
      { input: '1234567890', expected: '1234567890' }
    ];
    
    for (const test of tests) {
      const result = merger.normalizePhone(test.input);
      runner.assertEqual(result, test.expected, `Failed to normalize ${test.input}`);
    }
  });

  await runner.test('Phone Formatting', () => {
    const result = merger.formatPhone('1234567890');
    runner.assertEqual(result, '(123) 456-7890', 'Should format as (123) 456-7890');
  });

  await runner.test('Simple Merge - No Overlap', () => {
    const html = [{ name: 'John Doe', email: 'john@x.com', phone: '5551234567' }];
    const pdf = [{ name: 'Jane Smith', email: 'jane@x.com', phone: '5559876543' }];
    const merged = merger.mergeContacts(html, pdf);
    
    runner.assertEqual(merged.length, 2, 'Should have 2 contacts');
    runner.assert(merged.some(c => c.name === 'John Doe'), 'Should have John');
    runner.assert(merged.some(c => c.name === 'Jane Smith'), 'Should have Jane');
  });

  await runner.test('Merge - Fill Missing Fields', () => {
    const html = [{ name: 'John Doe', email: 'john@x.com', phone: null }];
    const pdf = [{ name: null, email: 'john@x.com', phone: '5551234567' }];
    const merged = merger.mergeContacts(html, pdf);
    
    runner.assertEqual(merged.length, 1, 'Should merge into 1 contact');
    runner.assertEqual(merged[0].name, 'John Doe', 'Should keep HTML name');
    runner.assertEqual(merged[0].phone, '(555) 123-4567', 'Should add PDF phone');
    runner.assertEqual(merged[0].source, 'merged', 'Source should be merged');
  });

  await runner.test('Deduplication', () => {
    const html = [
      { name: 'John Doe', email: 'john@example.com', phone: '5551234567' },
      { name: 'Jane Smith', email: 'jane@example.com', phone: '5559876543' }
    ];
    const pdf = [
      { name: 'John Doe', email: 'john@example.com', phone: '5551234567' },
      { name: 'Bob Johnson', email: 'bob@example.com', phone: '5551111111' }
    ];
    const merged = merger.mergeContacts(html, pdf);
    
    runner.assertEqual(merged.length, 3, 'Should have 3 unique contacts');
  });

  await runner.test('Confidence Recalculation', () => {
    const html = [{ name: 'John Doe', email: 'john@x.com', phone: null, confidence: 'medium' }];
    const pdf = [{ name: null, email: 'john@x.com', phone: '5551234567', confidence: 'medium' }];
    const merged = merger.mergeContacts(html, pdf);
    
    runner.assertEqual(merged[0].confidence, 'high', 'Should be high after merge');
  });

  runner.summary();
  return runner.failed === 0;
}

// Main execution
async function main() {
  // Parse command line arguments
  const program = new Command();
  program
    .option('-u, --url <url>', 'URL to test with live data merging')
    .option('--headless [value]', 'Run browser in headless mode (default: true)', 'true')
    .parse(process.argv);

  const options = program.opts();

  // Run unit tests first
  console.log('Starting Data Merger tests...\n');
  const unitTestsPassed = await runUnitTests();

  // If URL provided, run live test
  if (options.url) {
    const headless = options.headless === 'false' ? false : true;
    const liveResult = await testLiveUrl(options.url, headless);
    
    if (!liveResult.success) {
      console.log('\n✗ Live URL test failed');
      process.exit(1);
    }
  } else {
    console.log('\n\nℹ No URL provided. To test live data merging, run:');
    console.log('  node tests/data-merger-test.js --url "https://example.com/agents"');
  }

  console.log('\n✓ Testing complete\n');
  process.exit(unitTestsPassed ? 0 : 1);
}

main().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});

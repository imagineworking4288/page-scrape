/**
 * Test suite for select scraper (marker-based extraction)
 */

const assert = require('assert');
const ConfigLoader = require('../utils/config-loader');
const TextParser = require('../utils/text-parser');
const logger = require('../utils/logger');
const BrowserManager = require('../utils/browser-manager');
const RateLimiter = require('../utils/rate-limiter');
const SelectScraper = require('../scrapers/select-scraper');

// Test URLs
const TEST_URLS = {
  compass: 'https://www.compass.com/agents/locations/manhattan-ny/21425/',
};

/**
 * Unit Tests
 */
async function runUnitTests() {
  console.log('\n=== UNIT TESTS ===\n');

  // Test 1: Config Loader - Extract Domain
  console.log('Test 1: ConfigLoader.extractDomain()');
  const configLoader = new ConfigLoader(logger);

  assert.strictEqual(
    configLoader.extractDomain('https://www.compass.com/agents/'),
    'compass.com',
    'Should extract domain without www'
  );

  assert.strictEqual(
    configLoader.extractDomain('https://example.com/path'),
    'example.com',
    'Should extract base domain'
  );

  console.log('✓ Domain extraction works\n');

  // Test 2: Config Loader - Load Config
  console.log('Test 2: ConfigLoader.loadConfig()');

  const compassConfig = configLoader.loadConfig(TEST_URLS.compass);
  assert.strictEqual(compassConfig.domain, 'compass.com', 'Should load compass config');
  assert.strictEqual(compassConfig.markers.start.type, 'text', 'Should have text start marker');
  assert.strictEqual(compassConfig.markers.end.type, 'text', 'Should have text end marker');

  console.log('✓ Config loading works\n');

  // Test 3: Config Loader - Default Config
  console.log('Test 3: ConfigLoader default config');

  const defaultConfig = configLoader.loadConfig('https://nonexistent-site-12345.com/');
  assert.strictEqual(defaultConfig.domain, 'nonexistent-site-12345.com', 'Should create default config');
  assert.strictEqual(defaultConfig.markers.start.type, 'coordinate', 'Should use coordinate markers');

  console.log('✓ Default config works\n');

  // Test 4: Text Parser - Extract Emails
  console.log('Test 4: TextParser.extractEmails()');
  const textParser = new TextParser(logger);

  const sampleText = `
    John Doe
    john.doe@example.com
    555-1234

    Jane Smith
    jane.smith@example.com
    555-5678
  `;

  const emails = textParser.extractEmails(sampleText, null);
  assert.strictEqual(emails.length, 2, 'Should find 2 emails');
  assert(emails.includes('john.doe@example.com'), 'Should include first email');
  assert(emails.includes('jane.smith@example.com'), 'Should include second email');

  console.log('✓ Email extraction works\n');

  // Test 5: Text Parser - Filter by Domain
  console.log('Test 5: TextParser email domain filtering');

  const mixedText = `
    john@example.com
    jane@other.com
    bob@example.com
  `;

  const filtered = textParser.extractEmails(mixedText, 'example.com');
  assert.strictEqual(filtered.length, 2, 'Should filter to example.com domain');
  assert(!filtered.includes('jane@other.com'), 'Should exclude other domains');

  console.log('✓ Domain filtering works\n');

  // Test 6: Text Parser - Name Validation
  console.log('Test 6: TextParser.isValidName()');

  assert.strictEqual(textParser.isValidName('John Doe'), true, 'Valid name');
  assert.strictEqual(textParser.isValidName('Sign In'), false, 'UI element (blacklist)');
  assert.strictEqual(textParser.isValidName('contact us'), false, 'Lowercase UI element');
  assert.strictEqual(textParser.isValidName('123'), false, 'Numbers only');
  assert.strictEqual(textParser.isValidName('x'), false, 'Too short');

  console.log('✓ Name validation works\n');

  // Test 7: Text Parser - Phone Extraction
  console.log('Test 7: TextParser.extractPhone()');

  const textWithPhone = 'Contact: (555) 123-4567 or email';
  const phone = textParser.extractPhone(textWithPhone);
  assert(phone.includes('555'), 'Should extract phone');
  assert(phone.includes('123'), 'Should include area code');

  console.log('✓ Phone extraction works\n');

  // Test 8: Text Parser - Full Parse
  console.log('Test 8: TextParser.parse() full workflow');

  const fullText = `
    Agents Found: 2

    John Smith
    john.smith@compass.com
    (212) 555-1234

    Jane Doe
    jane.doe@compass.com
    (212) 555-5678

    Get help finding an agent
  `;

  const config = {
    parsing: {
      emailDomain: 'compass.com',
      nameBeforeEmail: true
    }
  };

  const contacts = textParser.parse(fullText, config);
  assert.strictEqual(contacts.length, 2, 'Should parse 2 contacts');
  assert.strictEqual(contacts[0].email, 'john.smith@compass.com', 'Should have correct email');
  assert(contacts[0].name.includes('John'), 'Should extract name');
  assert(contacts[0].phone, 'Should have phone');

  console.log('✓ Full text parsing works\n');

  console.log('✓ All unit tests passed!\n');
}

/**
 * Integration Test - Live URL
 */
async function runIntegrationTest() {
  console.log('\n=== INTEGRATION TEST ===\n');

  let browserManager = null;

  try {
    console.log('Initializing browser...');
    browserManager = new BrowserManager(logger);
    await browserManager.launch(true); // headless

    const rateLimiter = new RateLimiter(logger);
    const selectScraper = new SelectScraper(browserManager, rateLimiter, logger);

    console.log(`Testing with URL: ${TEST_URLS.compass}\n`);

    const contacts = await selectScraper.scrape(TEST_URLS.compass, 5);

    console.log('\n--- Results ---');
    console.log(`Extracted: ${contacts.length} contacts`);

    if (contacts.length > 0) {
      console.log('\nSample contact:');
      console.log(`  Name: ${contacts[0].name || 'N/A'}`);
      console.log(`  Email: ${contacts[0].email}`);
      console.log(`  Phone: ${contacts[0].phone || 'N/A'}`);
      console.log(`  Domain: ${contacts[0].domain}`);
      console.log(`  Confidence: ${contacts[0].confidence}`);
    }

    // Assertions
    assert(contacts.length > 0, 'Should extract at least 1 contact');
    assert(contacts[0].email.includes('@'), 'Should have valid email');
    assert(contacts[0].source === 'select', 'Should have correct source');

    console.log('\n✓ Integration test passed!\n');

  } catch (error) {
    console.error(`Integration test failed: ${error.message}`);
    throw error;
  } finally {
    if (browserManager) {
      await browserManager.close();
    }
  }
}

/**
 * Main Test Runner
 */
async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   SELECT SCRAPER TEST SUITE          ║');
  console.log('╚══════════════════════════════════════╝');

  try {
    // Run unit tests
    await runUnitTests();

    // Ask user if they want to run integration test
    const args = process.argv.slice(2);
    const skipIntegration = args.includes('--skip-integration');

    if (skipIntegration) {
      console.log('Skipping integration test (--skip-integration flag)');
    } else {
      console.log('Running integration test (use --skip-integration to skip)...\n');
      await runIntegrationTest();
    }

    console.log('╔══════════════════════════════════════╗');
    console.log('║   ALL TESTS PASSED ✓                 ║');
    console.log('╚══════════════════════════════════════╝');

    process.exit(0);

  } catch (error) {
    console.error('\n╔══════════════════════════════════════╗');
    console.error('║   TESTS FAILED ✗                     ║');
    console.error('╚══════════════════════════════════════╝');
    console.error(`\nError: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  main();
}

module.exports = { runUnitTests, runIntegrationTest };

/**
 * Config Testing Tool v2.3
 *
 * Tests a generated config on sample cards from the target site.
 * Validates that extraction methods work correctly for each field.
 *
 * Usage:
 *   node src/tools/test-config.js <config-path> [--limit 5] [--verbose]
 *
 * Example:
 *   node src/tools/test-config.js configs/example-com.json --limit 5 --verbose
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs').promises;
const path = require('path');

// v2.3 extractors
const ScreenshotExtractor = require('./lib/screenshot-extractor');
const CoordinateExtractor = require('./lib/coordinate-extractor');
const EmailExtractor = require('./lib/email-extractor');
const PhoneExtractor = require('./lib/phone-extractor');
const LinkExtractor = require('./lib/link-extractor');
const LabelExtractor = require('./lib/label-extractor');

puppeteer.use(StealthPlugin());

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

/**
 * Test a v2.3 config on the target site
 * @param {string} configPath - Path to config file
 * @param {Object} options - Test options
 * @returns {Object} - Test results
 */
async function testConfig(configPath, options = {}) {
  const { limit = 5, verbose = false, headless = true } = options;

  console.log(`${colors.cyan}${colors.bright}Testing config: ${configPath}${colors.reset}\n`);

  // Load config
  let config;
  try {
    const configData = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(configData);
  } catch (error) {
    console.error(`${colors.red}Failed to load config: ${error.message}${colors.reset}`);
    return { success: false, error: error.message };
  }

  console.log(`Config version: ${config.version}`);
  console.log(`Domain: ${config.domain || 'N/A'}`);
  console.log(`Source URL: ${config.testSite || config.sourceUrl || 'N/A'}`);

  // Check for v2.3 config
  if (config.version !== '2.3' && config.selectionMethod !== 'manual-validated') {
    console.warn(`${colors.yellow}Warning: Config is not v2.3 format${colors.reset}`);
  }

  // Display field configuration
  console.log(`\n${colors.bright}Field Configuration:${colors.reset}`);
  const fields = config.fields || {};
  for (const [fieldName, fieldConfig] of Object.entries(fields)) {
    if (fieldConfig.skipped) {
      console.log(`  ${fieldName}: ${colors.dim}skipped${colors.reset}`);
    } else if (fieldConfig.userValidatedMethod) {
      console.log(`  ${fieldName}: ${colors.green}${fieldConfig.userValidatedMethod}${colors.reset} (${fieldConfig.sampleValue || 'no sample'})`);
    } else {
      console.log(`  ${fieldName}: ${colors.yellow}no method${colors.reset}`);
    }
  }

  // Launch browser
  console.log(`\n${colors.bright}Launching browser...${colors.reset}`);
  const browser = await puppeteer.launch({
    headless: headless ? 'new' : false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Initialize extractors
  const extractors = {
    screenshotExtractor: new ScreenshotExtractor(page),
    coordinateExtractor: new CoordinateExtractor(page),
    emailExtractor: new EmailExtractor(page),
    phoneExtractor: new PhoneExtractor(page),
    linkExtractor: new LinkExtractor(page),
    labelExtractor: new LabelExtractor(page)
  };

  // Initialize OCR if needed
  const usesOCR = Object.values(fields).some(f => f.userValidatedMethod === 'screenshot-ocr');
  if (usesOCR) {
    console.log('Initializing OCR...');
    await extractors.screenshotExtractor.initialize();
  }

  // Navigate to URL
  const url = config.testSite || config.sourceUrl;
  if (!url) {
    console.error(`${colors.red}No URL in config${colors.reset}`);
    await browser.close();
    return { success: false, error: 'No URL in config' };
  }

  console.log(`\n${colors.bright}Navigating to: ${url}${colors.reset}`);
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (error) {
    console.error(`${colors.red}Navigation failed: ${error.message}${colors.reset}`);
    await browser.close();
    return { success: false, error: error.message };
  }

  // Wait for content
  await page.waitForTimeout(2000);

  // Find cards
  const cardSelector = config.cardPattern?.primarySelector;
  if (!cardSelector) {
    console.error(`${colors.red}No card selector in config${colors.reset}`);
    await browser.close();
    return { success: false, error: 'No card selector' };
  }

  const cardElements = await page.$$(cardSelector);
  console.log(`Found ${cardElements.length} cards with selector: ${cardSelector}`);

  if (cardElements.length === 0) {
    console.error(`${colors.red}No cards found${colors.reset}`);
    await browser.close();
    return { success: false, error: 'No cards found' };
  }

  // Test results
  const results = {
    totalCards: Math.min(cardElements.length, limit),
    fields: {},
    successRate: {},
    samples: {}
  };

  // Initialize field results
  for (const fieldName of Object.keys(fields)) {
    results.fields[fieldName] = {
      tested: 0,
      successful: 0,
      failed: 0,
      values: []
    };
  }

  console.log(`\n${colors.bright}Testing ${results.totalCards} cards...${colors.reset}\n`);

  // Test each card
  for (let i = 0; i < Math.min(cardElements.length, limit); i++) {
    const cardElement = cardElements[i];
    console.log(`${colors.cyan}Card ${i + 1}/${results.totalCards}${colors.reset}`);

    // Get card bounding box
    const cardBox = await cardElement.boundingBox();
    if (!cardBox) {
      console.log(`  ${colors.yellow}Skipping - no bounding box${colors.reset}`);
      continue;
    }

    // Test each field
    for (const [fieldName, fieldConfig] of Object.entries(fields)) {
      if (fieldConfig.skipped || !fieldConfig.userValidatedMethod) {
        continue;
      }

      results.fields[fieldName].tested++;

      try {
        const value = await extractField(
          page,
          cardElement,
          fieldConfig,
          extractors
        );

        if (value && value.trim().length > 0) {
          results.fields[fieldName].successful++;
          results.fields[fieldName].values.push(value);

          if (verbose) {
            console.log(`  ${colors.green}✓${colors.reset} ${fieldName}: "${truncate(value, 50)}"`);
          }
        } else {
          results.fields[fieldName].failed++;
          if (verbose) {
            console.log(`  ${colors.red}✗${colors.reset} ${fieldName}: no value`);
          }
        }
      } catch (error) {
        results.fields[fieldName].failed++;
        if (verbose) {
          console.log(`  ${colors.red}✗${colors.reset} ${fieldName}: ${error.message}`);
        }
      }
    }

    if (!verbose) {
      process.stdout.write('.');
    }
  }

  if (!verbose) {
    console.log('\n');
  }

  // Calculate success rates
  for (const [fieldName, fieldResults] of Object.entries(results.fields)) {
    const total = fieldResults.tested;
    results.successRate[fieldName] = total > 0
      ? Math.round((fieldResults.successful / total) * 100)
      : 0;
    results.samples[fieldName] = fieldResults.values.slice(0, 3);
  }

  // Cleanup
  if (usesOCR) {
    await extractors.screenshotExtractor.terminate();
  }
  await browser.close();

  // Display results
  displayResults(config, results);

  return {
    success: true,
    config: path.basename(configPath),
    results: results
  };
}

/**
 * Extract a field from a card using the validated method
 */
async function extractField(page, cardElement, fieldConfig, extractors) {
  const method = fieldConfig.userValidatedMethod;
  const coords = fieldConfig.coordinates;

  switch (method) {
    case 'screenshot-ocr':
      const ocrResult = await extractors.screenshotExtractor.extractFromRegion(cardElement, coords);
      return ocrResult.value;

    case 'coordinate-text':
      const coordResult = await extractors.coordinateExtractor.extractFromRegion(cardElement, coords);
      return coordResult.value;

    case 'mailto-link':
      const mailtoResult = await extractors.emailExtractor.extractFromMailtoLink(cardElement, coords);
      return mailtoResult.value;

    case 'regex-email':
      const regexEmailResult = await extractors.emailExtractor.extractFromRegion(cardElement, coords);
      return regexEmailResult.value;

    case 'tel-link':
      const telResult = await extractors.phoneExtractor.extractFromTelLink(cardElement, coords);
      return telResult.value;

    case 'regex-phone':
      const regexPhoneResult = await extractors.phoneExtractor.extractFromRegion(cardElement, coords);
      return regexPhoneResult.value;

    case 'href-link':
      const linkResult = await extractors.linkExtractor.extractFromRegion(cardElement, coords);
      return linkResult.value;

    case 'data-url':
      const dataUrlResult = await extractors.linkExtractor.extractDataAttribute(cardElement, coords);
      return dataUrlResult.value;

    case 'label-email':
      const labelEmailResult = await extractors.labelExtractor.extractFromRegion(cardElement, coords, 'email');
      return labelEmailResult.value;

    case 'label-phone':
      const labelPhoneResult = await extractors.labelExtractor.extractFromRegion(cardElement, coords, 'phone');
      return labelPhoneResult.value;

    case 'label-title':
      const labelTitleResult = await extractors.labelExtractor.extractFromRegion(cardElement, coords, 'title');
      return labelTitleResult.value;

    case 'label-location':
      const labelLocationResult = await extractors.labelExtractor.extractFromRegion(cardElement, coords, 'location');
      return labelLocationResult.value;

    default:
      // Fallback to coordinate extraction
      const fallbackResult = await extractors.coordinateExtractor.extractFromRegion(cardElement, coords);
      return fallbackResult.value;
  }
}

/**
 * Display test results
 */
function displayResults(config, results) {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bright}CONFIG TEST RESULTS${colors.reset}`);
  console.log('='.repeat(60));
  console.log(`Config: ${config.name || config.domain || 'unknown'}`);
  console.log(`Version: ${config.version}`);
  console.log(`Cards tested: ${results.totalCards}`);
  console.log();

  for (const [fieldName, fieldResults] of Object.entries(results.fields)) {
    const rate = results.successRate[fieldName];
    const tested = fieldResults.tested;

    if (tested === 0) {
      console.log(`${colors.dim}○ ${fieldName.toUpperCase()}: not tested (skipped)${colors.reset}`);
      continue;
    }

    // Choose indicator based on rate
    let indicator, color;
    if (rate >= 80) {
      indicator = '✓';
      color = colors.green;
    } else if (rate >= 50) {
      indicator = '⚠';
      color = colors.yellow;
    } else {
      indicator = '✗';
      color = colors.red;
    }

    console.log(`${color}${indicator}${colors.reset} ${colors.bright}${fieldName.toUpperCase()}${colors.reset}: ${rate}% success rate`);
    console.log(`   ${fieldResults.successful} successful, ${fieldResults.failed} failed out of ${tested}`);

    if (results.samples[fieldName] && results.samples[fieldName].length > 0) {
      console.log(`   Samples: ${results.samples[fieldName].map(s => truncate(s, 30)).join(', ')}`);
    }
  }

  console.log('='.repeat(60));

  // Overall assessment
  const activeFields = Object.values(results.fields).filter(f => f.tested > 0);
  const avgRate = activeFields.length > 0
    ? Math.round(activeFields.reduce((sum, f) => sum + (f.successful / f.tested) * 100, 0) / activeFields.length)
    : 0;

  console.log(`\n${colors.bright}Overall success rate: ${avgRate}%${colors.reset}`);

  if (avgRate >= 80) {
    console.log(`${colors.green}✓ Config is ready for production use${colors.reset}`);
  } else if (avgRate >= 50) {
    console.log(`${colors.yellow}⚠ Config may need refinement${colors.reset}`);
  } else {
    console.log(`${colors.red}✗ Config needs significant improvement${colors.reset}`);
  }
}

/**
 * Truncate string for display
 */
function truncate(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const configPath = args.find(a => !a.startsWith('--'));

  if (!configPath) {
    console.error('Usage: node test-config.js <config-path> [--limit N] [--verbose] [--show]');
    console.error('');
    console.error('Options:');
    console.error('  --limit N   Test only N cards (default: 5)');
    console.error('  --verbose   Show detailed extraction results');
    console.error('  --show      Show browser window (not headless)');
    process.exit(1);
  }

  const options = {
    limit: parseInt(args.find(a => a.startsWith('--limit'))?.split('=')[1] ||
                   args[args.indexOf('--limit') + 1]) || 5,
    verbose: args.includes('--verbose') || args.includes('-v'),
    headless: !args.includes('--show')
  };

  testConfig(configPath, options)
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error(`${colors.red}Test failed: ${err.message}${colors.reset}`);
      process.exit(1);
    });
}

module.exports = { testConfig };

#!/usr/bin/env node

/**
 * Config Validation Tool
 *
 * Validates site configs by testing scraping and enrichment on first N contacts.
 * Quick way to verify a config works before running a full scrape.
 *
 * Usage:
 *   node src/tools/validate-config.js --url "https://example.com/directory"
 *   node src/tools/validate-config.js --url "URL" --limit 5 --verbose
 *   node src/tools/validate-config.js --url "URL" --no-enrich
 */

require('dotenv').config();

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');

const logger = require('../core/logger');
const BrowserManager = require('../core/browser-manager');
const { SeleniumManager } = require('../core');
const RateLimiter = require('../core/rate-limiter');
const ConfigLoader = require('../config/config-loader');
const ProfileEnricher = require('../features/enrichment/profile-enricher');
const { FieldCleaner } = require('../features/enrichment/post-cleaners');
const {
  displayStageHeader,
  displayStageSummary,
  displaySuccess,
  displayError,
  displayWarning,
  displayInfo,
  displayContactsTable,
  displayFieldComparison
} = require('../utils/prompt-helper');

const program = new Command();

program
  .name('validate-config')
  .description('Validate a site config by testing scraping and enrichment on first N contacts')
  .requiredOption('-u, --url <url>', 'Target URL (required)')
  .option('-l, --limit <number>', 'Number of contacts to test (default: 2)', parseInt, 2)
  .option('-c, --config <name>', 'Config name (auto-detect from URL if not provided)')
  .option('--no-enrich', 'Skip enrichment testing')
  .option('--show', 'Show browser (visible mode)')
  .option('--headless <bool>', 'Browser mode (default: true)', 'true')
  .option('-v, --verbose', 'Detailed output with field-level information', false)
  .parse(process.argv);

const options = program.opts();

/**
 * Parse headless option
 */
function parseHeadless(value) {
  if (options.show) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'false' || lower === '0' || lower === 'no') {
      return false;
    }
  }
  return true;
}

/**
 * Extract domain from URL
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Main execution
 */
async function main() {
  let browserManager = null;
  let seleniumManager = null;

  try {
    const headless = parseHeadless(options.headless);

    // Header
    displayStageHeader('CONFIG VALIDATION TOOL');

    // Extract domain
    const domain = extractDomain(options.url);
    if (!domain) {
      displayError(`Invalid URL: ${options.url}`);
      process.exit(1);
    }

    // Ensure limit is a number
    const testLimit = typeof options.limit === 'number' && !isNaN(options.limit) ? options.limit : 2;

    displayInfo(`Target URL: ${options.url}`);
    displayInfo(`Domain: ${domain}`);
    displayInfo(`Test contacts: ${testLimit}`);
    displayInfo(`Test enrichment: ${options.enrich !== false ? 'yes' : 'no'}`);
    displayInfo(`Browser mode: ${headless ? 'headless' : 'visible'}`);
    console.log('');

    // =========================================================================
    // STEP 1: Config Check
    // =========================================================================
    displayStageHeader('STEP 1: CONFIG CHECK');

    const configLoader = new ConfigLoader(logger);
    const configPath = path.join(
      __dirname, '..', '..', 'configs', 'website-configs',
      `${domain.replace(/\./g, '-')}.json`
    );

    // Also check alternate path with dots
    const configPathDots = path.join(
      __dirname, '..', '..', 'configs', 'website-configs',
      `${domain}.json`
    );

    let configFilePath = null;
    if (fs.existsSync(configPath)) {
      configFilePath = configPath;
    } else if (fs.existsSync(configPathDots)) {
      configFilePath = configPathDots;
    }

    if (!configFilePath) {
      displayError(`Config not found for domain: ${domain}`);
      console.log('');
      console.log('Expected path:');
      console.log(`  ${configPath}`);
      console.log('');
      console.log('To create a config, run:');
      console.log(`  node src/tools/config-generator.js --url "${options.url}"`);
      process.exit(1);
    }

    // Load config
    const configContent = fs.readFileSync(configFilePath, 'utf8');
    const config = JSON.parse(configContent);

    displaySuccess(`Found config: ${path.basename(configFilePath)}`);
    console.log('');

    // Display config summary
    const configSummary = {
      'Version': config.version || 'N/A',
      'Created': config.generatedAt ? new Date(config.generatedAt).toLocaleDateString() : 'N/A',
      'Pagination': config.pagination?.paginationType || config.pagination?.type || 'single-page',
      'Card Selector': config.cardPattern?.primarySelector ? 'configured' : 'not set',
      'Fields': Object.keys(config.fields || {}).join(', ') || 'N/A'
    };
    displayStageSummary(configSummary, 'Config Details:');
    console.log('');

    // =========================================================================
    // STEP 2: Scraping Test
    // =========================================================================
    displayStageHeader('STEP 2: SCRAPING TEST');

    // Initialize rate limiter
    const rateLimiter = new RateLimiter(logger, {
      minDelay: 2000,
      maxDelay: 5000
    });

    // Determine pagination type
    // Check explicit pagination config first
    let paginationType = config.pagination?.paginationType ||
                          config.pagination?.type ||
                          null;

    // Detect infinite scroll based on config characteristics
    // V2.3 configs with manual-validated selection and no explicit pagination are often infinite scroll
    const looksLikeInfiniteScroll = !paginationType && (
      config.version === '2.3' ||
      config.selectionMethod === 'manual-validated' ||
      config.selectionMethod === 'manual'
    );

    if (!paginationType) {
      paginationType = looksLikeInfiniteScroll ? 'infinite-scroll' : 'single-page';
    }

    const isInfiniteScroll = paginationType === 'infinite-scroll';

    displayInfo(`Pagination type: ${paginationType}${looksLikeInfiniteScroll ? ' (auto-detected)' : ''}`);
    displayInfo(`Using ${isInfiniteScroll ? 'Selenium (PAGE_DOWN)' : 'Puppeteer'}`);
    console.log('');

    let contacts = [];
    let scrapeSuccess = false;
    let scrapeError = null;

    try {
      if (isInfiniteScroll) {
        // Use Selenium for infinite scroll
        const { InfiniteScrollScraper } = require('../scrapers/config-scrapers');

        seleniumManager = new SeleniumManager(logger);
        await seleniumManager.launch(headless);

        const scraper = new InfiniteScrollScraper(seleniumManager, rateLimiter, logger, {
          scrollDelay: 400,
          maxRetries: 10, // Reduced for validation
          maxScrolls: Math.min(20, testLimit * 5) // Limited scrolls for validation
        });

        scraper.config = config;
        scraper.initializeCardSelector();

        displayInfo('Scrolling to load contacts...');
        const results = await scraper.scrape(options.url, testLimit);
        contacts = results.contacts || results || [];

      } else {
        // Use Puppeteer for traditional/single-page
        const ConfigScraper = require('../scrapers/config-scraper');

        browserManager = new BrowserManager(logger);
        await browserManager.launch(headless);

        const scraper = new ConfigScraper(browserManager, rateLimiter, logger, config);

        displayInfo('Scraping page...');
        contacts = await scraper.scrape(options.url, testLimit);
      }

      // Ensure contacts is an array
      if (!Array.isArray(contacts)) {
        contacts = contacts?.contacts || [];
      }

      // Limit contacts
      if (contacts.length > testLimit) {
        contacts = contacts.slice(0, testLimit);
      }

      scrapeSuccess = contacts.length > 0;

    } catch (error) {
      scrapeError = error.message;
      displayError(`Scraping failed: ${error.message}`);
    }

    // Display scraping results
    console.log('');
    if (scrapeSuccess) {
      displaySuccess(`Scraped ${contacts.length} contacts`);
      console.log('');

      displayContactsTable(contacts, Math.min(5, contacts.length));

      // Analyze data quality
      const withEmail = contacts.filter(c => c.email).length;
      const withPhone = contacts.filter(c => c.phone).length;
      const withName = contacts.filter(c => c.name).length;
      const withProfile = contacts.filter(c => c.profileUrl).length;

      console.log('');
      displayStageSummary({
        'Total scraped': contacts.length,
        'With name': `${withName} (${Math.round(withName / contacts.length * 100)}%)`,
        'With email': `${withEmail} (${Math.round(withEmail / contacts.length * 100)}%)`,
        'With phone': `${withPhone} (${Math.round(withPhone / contacts.length * 100)}%)`,
        'With profile URL': `${withProfile} (${Math.round(withProfile / contacts.length * 100)}%)`
      }, 'Scraping Quality:');

    } else {
      displayError('Scraping failed or returned no contacts');
      if (scrapeError) {
        console.log(`Error: ${scrapeError}`);
      }
    }

    // =========================================================================
    // STEP 3: Enrichment Test (optional)
    // =========================================================================
    let enrichedContacts = [];
    let enrichSuccess = false;

    if (options.enrich !== false && scrapeSuccess && contacts.length > 0) {
      displayStageHeader('STEP 3: ENRICHMENT TEST');

      // Check if contacts have profile URLs
      const contactsWithProfiles = contacts.filter(c => c.profileUrl);

      if (contactsWithProfiles.length === 0) {
        displayWarning('No contacts have profile URLs - skipping enrichment');
      } else {
        displayInfo(`Testing enrichment on ${contactsWithProfiles.length} contacts with profile URLs`);
        console.log('');

        try {
          // Initialize browser if not already running
          if (!browserManager) {
            browserManager = new BrowserManager(logger);
            await browserManager.launch(headless);
          }

          const enrichRateLimiter = new RateLimiter(logger, {
            minDelay: 3000,
            maxDelay: 5000
          });

          const enricher = new ProfileEnricher(browserManager, enrichRateLimiter, logger);

          // Enrich contacts
          enrichedContacts = await enricher.enrichContactsList(contactsWithProfiles, {
            limit: testLimit,
            skipErrors: true,
            onlyCoreFields: true
          });

          enrichSuccess = enrichedContacts.length > 0;

          if (enrichSuccess) {
            displaySuccess(`Enriched ${enrichedContacts.length} contacts`);
            console.log('');

            // Show field-by-field comparison for first contact
            if (options.verbose && enrichedContacts.length > 0) {
              const firstEnriched = enrichedContacts[0];
              const originalContact = contactsWithProfiles.find(
                c => c.profileUrl === firstEnriched.profileUrl
              ) || contactsWithProfiles[0];

              console.log('Sample enrichment comparison:');
              displayFieldComparison(
                originalContact,
                firstEnriched,
                firstEnriched._enrichment?.actions || {}
              );
            }

            // Run post-cleaning
            displayInfo('Running post-enrichment cleaning...');
            const fieldCleaner = new FieldCleaner(logger);
            enrichedContacts = await fieldCleaner.cleanContacts(enrichedContacts);

            // Display enrichment stats
            const enrichmentStats = {
              'Total enriched': enrichedContacts.length,
              'High confidence': enrichedContacts.filter(c => c.confidence === 'high').length,
              'Medium confidence': enrichedContacts.filter(c => c.confidence === 'medium').length,
              'Low confidence': enrichedContacts.filter(c => c.confidence === 'low').length
            };

            console.log('');
            displayStageSummary(enrichmentStats, 'Enrichment Results:');
          }

        } catch (error) {
          displayError(`Enrichment failed: ${error.message}`);
          if (options.verbose) {
            console.log(error.stack);
          }
        }
      }
    }

    // =========================================================================
    // STEP 4: Validation Summary
    // =========================================================================
    displayStageHeader('VALIDATION SUMMARY');

    const issues = [];
    const recommendations = [];

    // Check scraping quality
    if (!scrapeSuccess) {
      issues.push('Scraping failed to extract contacts');
      recommendations.push('Check that the card selector is correct');
      recommendations.push('Try running with --show to see browser behavior');
    } else if (contacts.length < testLimit) {
      issues.push(`Only found ${contacts.length} contacts (requested ${testLimit})`);
      recommendations.push('This may be expected if the page has fewer contacts');
    }

    // Check field quality
    if (scrapeSuccess) {
      const withName = contacts.filter(c => c.name).length;
      const withEmail = contacts.filter(c => c.email).length;
      const withProfile = contacts.filter(c => c.profileUrl).length;

      if (withName < contacts.length * 0.8) {
        issues.push('Many contacts missing names');
        recommendations.push('Check name extraction in config');
      }

      if (withProfile < contacts.length * 0.5) {
        issues.push('Many contacts missing profile URLs');
        recommendations.push('Profile URLs are needed for enrichment');
      }

      // Check for contaminated data
      const contaminated = contacts.filter(c =>
        (c.name && /Partner|Associate|Counsel|Director/i.test(c.name)) ||
        (c.location && /\+\d/.test(c.location))
      );

      if (contaminated.length > 0) {
        issues.push('Some contacts have contaminated data (titles in names, phones in locations)');
        recommendations.push('Enrichment will attempt to clean this data');
      }
    }

    // Check enrichment
    if (options.enrich !== false && scrapeSuccess) {
      if (!enrichSuccess && contacts.filter(c => c.profileUrl).length > 0) {
        issues.push('Enrichment failed');
        recommendations.push('Check that profile URLs are accessible');
      }
    }

    // Display final status
    if (issues.length === 0) {
      console.log('');
      displaySuccess('VALIDATION PASSED');
      console.log('');
      console.log('Config is working correctly. Ready for full scrape:');
      console.log(`  node orchestrator.js --url "${options.url}" --method config --scroll`);

    } else {
      console.log('');
      displayWarning(`ISSUES DETECTED (${issues.length})`);
      console.log('');

      console.log('Issues:');
      issues.forEach((issue, i) => {
        console.log(`  ${i + 1}. ${issue}`);
      });

      if (recommendations.length > 0) {
        console.log('');
        console.log('Recommendations:');
        recommendations.forEach((rec, i) => {
          console.log(`  ${i + 1}. ${rec}`);
        });
      }
    }

    console.log('');

    // Cleanup
    if (browserManager) {
      await browserManager.close();
    }
    if (seleniumManager) {
      await seleniumManager.close();
    }

    // Exit with appropriate code
    process.exit(issues.length > 0 && !scrapeSuccess ? 1 : 0);

  } catch (error) {
    displayError(`Validation failed: ${error.message}`);

    if (options.verbose) {
      console.log('');
      console.log('Stack trace:');
      console.log(error.stack);
    }

    // Cleanup
    if (browserManager) {
      try {
        await browserManager.close();
      } catch (e) {
        // Ignore
      }
    }
    if (seleniumManager) {
      try {
        await seleniumManager.close();
      } catch (e) {
        // Ignore
      }
    }

    process.exit(1);
  }
}

// Handle signals
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT. Exiting...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM. Exiting...');
  process.exit(0);
});

// Run
main();

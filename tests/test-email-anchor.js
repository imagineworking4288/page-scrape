#!/usr/bin/env node

const logger = require('../utils/logger');
const BrowserManager = require('../utils/browser-manager');
const RateLimiter = require('../utils/rate-limiter');
const SimpleScraper = require('../scrapers/simple-scraper');

async function testEmailAnchor() {
  console.log('Testing Email-Anchor Extraction');
  console.log('================================\n');

  const browserManager = new BrowserManager(logger);
  const rateLimiter = new RateLimiter(logger);

  try {
    await browserManager.launch(false); // Non-headless for debugging

    const scraper = new SimpleScraper(browserManager, rateLimiter, logger);

    const url = 'https://www.compass.com/agents/nikki-field/';
    console.log(`Testing URL: ${url}\n`);

    const contacts = await scraper.scrape(url, 20, true); // Keep PDF for inspection

    console.log('\n\nRESULTS:');
    console.log('========\n');

    contacts.forEach((c, i) => {
      console.log(`${i + 1}. ${c.name}`);
      console.log(`   Email: ${c.email}`);
      console.log(`   Phone: ${c.phone || 'N/A'}`);
      console.log(`   Source: ${c.source}`);
      console.log(`   Confidence: ${c.confidence}`);
      if (c._debug) {
        console.log(`   Debug: Email at ${c._debug.emailPos}, name distance ${c._debug.nameDistance}`);
      }
      console.log('');
    });

    // Calculate accuracy
    const withValidName = contacts.filter(c =>
      c.name &&
      c.name.length > 3 &&
      /^[A-Z]/.test(c.name) &&
      c.source !== 'pdf-derived'
    ).length;

    console.log(`\nAccuracy: ${withValidName}/${contacts.length} (${((withValidName/contacts.length)*100).toFixed(1)}%)`);

    await browserManager.close();

  } catch (error) {
    console.error('Test failed:', error);
    if (browserManager) await browserManager.close();
    process.exit(1);
  }
}

testEmailAnchor();

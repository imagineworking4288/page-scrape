#!/usr/bin/env node
/**
 * Card Detection Diagnostic Script
 * Tests why binary searcher fails to detect cards on Compass.com page 56
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const TEST_URL_PAGE_56 = 'https://www.compass.com/agents/locations/new-york-ny/21429/?page=56';
const TEST_URL_PAGE_1 = 'https://www.compass.com/agents/locations/new-york-ny/21429/?page=1';
const CARD_SELECTOR = 'div.agentCard';

async function runDiagnostics() {
  console.log('\n' + '='.repeat(70));
  console.log('CARD DETECTION DIAGNOSTIC SCRIPT');
  console.log('='.repeat(70));
  console.log(`Card Selector: ${CARD_SELECTOR}`);
  console.log(`Test URLs: Page 1 and Page 56`);
  console.log('='.repeat(70) + '\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--window-size=1920,1080'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Test Page 1 first (known working)
    console.log('\n' + '─'.repeat(70));
    console.log('TESTING PAGE 1 (CONTROL - SHOULD WORK)');
    console.log('─'.repeat(70));
    await runAllTests(page, TEST_URL_PAGE_1, 'Page 1');

    // Test Page 56 (problematic)
    console.log('\n' + '─'.repeat(70));
    console.log('TESTING PAGE 56 (PROBLEM PAGE)');
    console.log('─'.repeat(70));
    await runAllTests(page, TEST_URL_PAGE_56, 'Page 56');

    // Summary comparison
    console.log('\n' + '='.repeat(70));
    console.log('DIAGNOSTIC COMPLETE');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Diagnostic error:', error);
  } finally {
    await browser.close();
  }
}

async function runAllTests(page, url, label) {

  // TEST 1: Navigate with domcontentloaded, immediately count cards
  console.log(`\n[TEST 1] ${label}: domcontentloaded + immediate count`);
  const start1 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const time1 = Date.now() - start1;
  const count1 = await page.$$(CARD_SELECTOR).then(els => els.length).catch(() => 0);
  console.log(`  Navigation took: ${time1}ms`);
  console.log(`  Cards found immediately: ${count1}`);

  // TEST 2: waitForSelector with various timeouts
  console.log(`\n[TEST 2] ${label}: waitForSelector with various timeouts`);
  const timeouts = [1000, 2000, 3000, 5000, 10000];
  for (const timeout of timeouts) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const start = Date.now();
    try {
      await page.waitForSelector(CARD_SELECTOR, { timeout });
      const elapsed = Date.now() - start;
      const count = await page.$$(CARD_SELECTOR).then(els => els.length).catch(() => 0);
      console.log(`  ${timeout}ms timeout: SUCCESS in ${elapsed}ms, ${count} cards`);
    } catch (e) {
      console.log(`  ${timeout}ms timeout: FAILED (timeout)`);
    }
  }

  // TEST 3: Fixed delays then count
  console.log(`\n[TEST 3] ${label}: Fixed delays then count`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const delays = [0, 1000, 2000, 3000, 5000, 7000, 10000];
  let lastCount = 0;
  for (const delay of delays) {
    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay - (delays[delays.indexOf(delay) - 1] || 0)));
    }
    const count = await page.$$(CARD_SELECTOR).then(els => els.length).catch(() => 0);
    const changed = count !== lastCount ? ' ← CHANGED' : '';
    console.log(`  After ${delay}ms: ${count} cards${changed}`);
    lastCount = count;
  }

  // TEST 4: Alternative selectors
  console.log(`\n[TEST 4] ${label}: Alternative selectors (after 5s wait)`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  const selectors = [
    'div.agentCard',
    '.agentCard',
    '[class*="agentCard"]',
    '[class*="AgentCard"]',
    '[class*="agent"]',
    '[class*="card"]',
    'a[href*="/agents/"]',
    '[data-test*="agent"]'
  ];

  for (const sel of selectors) {
    const count = await page.$$(sel).then(els => els.length).catch(() => 0);
    const status = count > 0 ? `${count} FOUND` : '0';
    console.log(`  ${sel.padEnd(25)}: ${status}`);
  }

  // TEST 5: Check raw HTML for selector string
  console.log(`\n[TEST 5] ${label}: Check raw HTML for "agentCard"`);
  const html = await page.content();
  const agentCardCount = (html.match(/agentCard/g) || []).length;
  const divAgentCardCount = (html.match(/div.*agentCard/g) || []).length;
  console.log(`  "agentCard" appears in HTML: ${agentCardCount} times`);
  console.log(`  "div...agentCard" patterns: ${divAgentCardCount} times`);
  console.log(`  HTML length: ${html.length} characters`);

  // TEST 6: Check for empty state indicators
  console.log(`\n[TEST 6] ${label}: Check for empty state indicators`);
  const emptyIndicators = await page.evaluate(() => {
    const text = document.body.innerText.toLowerCase();
    return {
      noResults: text.includes('no results'),
      noAgents: text.includes('no agents'),
      notFound: text.includes('not found'),
      emptyPage: text.includes('empty'),
      tryAgain: text.includes('try again'),
      bodyLength: text.length
    };
  });
  console.log(`  "no results": ${emptyIndicators.noResults}`);
  console.log(`  "no agents": ${emptyIndicators.noAgents}`);
  console.log(`  "not found": ${emptyIndicators.notFound}`);
  console.log(`  Body text length: ${emptyIndicators.bodyLength} chars`);

  // TEST 7: networkidle0 navigation
  console.log(`\n[TEST 7] ${label}: networkidle0 navigation`);
  const start7 = Date.now();
  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    const time7 = Date.now() - start7;
    const count7 = await page.$$(CARD_SELECTOR).then(els => els.length).catch(() => 0);
    console.log(`  Navigation took: ${time7}ms`);
    console.log(`  Cards found: ${count7}`);
  } catch (e) {
    console.log(`  networkidle0 FAILED: ${e.message}`);
  }

  // TEST 8: Check page title and URL
  console.log(`\n[TEST 8] ${label}: Page metadata`);
  const title = await page.title();
  const currentUrl = page.url();
  console.log(`  Title: ${title.substring(0, 60)}...`);
  console.log(`  URL: ${currentUrl}`);

  // Check if redirected
  if (currentUrl !== url) {
    console.log(`  ⚠️  REDIRECTED from original URL!`);
  }
}

runDiagnostics().catch(console.error);

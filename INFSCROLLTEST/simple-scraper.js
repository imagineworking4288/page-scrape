/**
 * Simple Infinite Scroll Scraper
 * Scrolls to bottom without external dependencies
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

/**
 * Scroll page to bottom using native Puppeteer
 * @param {Page} page - Puppeteer page object
 * @param {object} options - Scroll options
 */
async function scrollToBottom(page, options = {}) {
  const {
    scrollSize = 500,
    scrollDelay = 300,
    maxScrolls = 500
  } = options;

  let lastHeight = await page.evaluate('document.body.scrollHeight');
  let scrollCount = 0;
  let noChangeCount = 0;

  console.log('[SCROLL] Starting scroll to bottom...');
  console.log(`[SCROLL] Settings: ${scrollSize}px per scroll, ${scrollDelay}ms delay, max ${maxScrolls} scrolls`);

  while (scrollCount < maxScrolls) {
    // Scroll down by scrollSize pixels
    await page.evaluate((distance) => {
      window.scrollBy(0, distance);
    }, scrollSize);

    // Wait for content to load
    await page.waitForTimeout(scrollDelay);

    // Check new height
    const newHeight = await page.evaluate('document.body.scrollHeight');
    scrollCount++;

    if (newHeight > lastHeight) {
      // Height increased - new content loaded
      console.log(`[SCROLL] Scroll ${scrollCount}: Height ${lastHeight}px → ${newHeight}px (+${newHeight - lastHeight}px)`);
      lastHeight = newHeight;
      noChangeCount = 0;
    } else {
      // No height change
      noChangeCount++;
      if (noChangeCount >= 3) {
        // Stopped growing for 3 consecutive checks - we're done
        console.log(`[SCROLL] No height change for ${noChangeCount} scrolls - reached bottom`);
        break;
      }
    }
  }

  if (scrollCount >= maxScrolls) {
    console.log(`[SCROLL] Reached max scroll limit (${maxScrolls})`);
  }

  console.log(`[SCROLL] Complete: ${scrollCount} scrolls, final height ${lastHeight}px`);
  return { scrollCount, finalHeight: lastHeight };
}

/**
 * Scrape a page by scrolling to bottom
 */
async function scrapeWithScroll(url, options = {}) {
  const {
    headless = false,
    scrollSize = 500,
    scrollDelay = 300,
    maxScrolls = 500,
    viewport = { width: 1920, height: 1080 },
    outputFile = null
  } = options;

  console.log('[START] Launching browser (headless:', headless + ')');

  const startTime = Date.now();

  // Launch browser
  const browser = await puppeteer.launch({
    headless: headless ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      `--window-size=${viewport.width},${viewport.height}`
    ]
  });

  const page = await browser.newPage();
  await page.setViewport(viewport);

  // Navigate
  console.log('[NAVIGATE] Going to:', url);
  await page.goto(url, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });
  console.log('[NAVIGATE] Page loaded');

  // Get initial height
  const initialHeight = await page.evaluate('document.body.scrollHeight');
  console.log('[SCROLL] Initial page height:', initialHeight + 'px');

  // Scroll to bottom
  const scrollResult = await scrollToBottom(page, {
    scrollSize,
    scrollDelay,
    maxScrolls
  });

  // Get HTML
  const html = await page.content();
  await browser.close();
  console.log('[CLOSE] Browser closed');

  const duration = (Date.now() - startTime) / 1000;

  // Save to file if requested
  if (outputFile) {
    fs.writeFileSync(outputFile, html);
    console.log('[SAVE] HTML saved to:', outputFile);
  }

  return {
    success: true,
    html,
    stats: {
      initialHeight,
      finalHeight: scrollResult.finalHeight,
      scrollCount: scrollResult.scrollCount,
      htmlSize: html.length,
      durationSeconds: duration
    }
  };
}

/**
 * Extract all href links matching a pattern
 * @param {string} html - HTML content
 * @param {string} hrefPattern - Pattern for href (e.g., '/lawyers/')
 * @returns {string[]} Array of matching hrefs
 */
function extractLinks(html, hrefPattern) {
  const regex = new RegExp(`href="([^"]*${hrefPattern}[^"]*)"`, 'g');
  const links = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    links.push(match[1]);
  }
  return [...new Set(links)]; // Remove duplicates
}

module.exports = { scrapeWithScroll, extractLinks };

/**
 * Simple Infinite Scroll Scraper
 * Uses puppeteer-autoscroll-down for reliable scrolling
 *
 * This is a simpler alternative to the complex src/ implementation.
 * It just scrolls to the bottom and extracts the HTML.
 */

const puppeteer = require('puppeteer');
const scrollPageToBottom = require('puppeteer-autoscroll-down');
const fs = require('fs');

/**
 * Simple scraper that scrolls page to bottom and returns HTML
 * @param {string} url - URL to scrape
 * @param {object} options - Configuration options
 * @returns {object} { success, html, stats, error }
 */
async function scrapeInfiniteScroll(url, options = {}) {
  const config = {
    headless: options.headless !== false,
    timeout: options.timeout || 300000,       // 5 minutes max
    scrollDelay: options.scrollDelay || 500,  // Delay between scrolls (ms)
    scrollStep: options.scrollStep || 500,    // Pixels per scroll step
    outputFile: options.outputFile || null,   // Save HTML to file
    viewport: options.viewport || { width: 1920, height: 1080 },
    ...options
  };

  let browser = null;
  const startTime = Date.now();

  try {
    console.log(`[START] Launching browser (headless: ${config.headless})`);

    browser = await puppeteer.launch({
      headless: config.headless ? 'new' : false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        `--window-size=${config.viewport.width},${config.viewport.height}`
      ]
    });

    const page = await browser.newPage();
    await page.setViewport(config.viewport);

    console.log(`[NAVIGATE] Going to: ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for initial content
    await page.waitForTimeout(2000);

    // Get initial page height
    const initialHeight = await page.evaluate(() => document.body.scrollHeight);
    console.log(`[SCROLL] Initial page height: ${initialHeight}px`);
    console.log(`[SCROLL] Starting auto-scroll to bottom...`);

    // Use puppeteer-autoscroll-down to scroll to bottom
    const lastPosition = await scrollPageToBottom(page, {
      size: config.scrollStep,
      delay: config.scrollDelay,
      stepsLimit: 1000  // Max 1000 scroll steps
    });

    console.log(`[SCROLL] Finished scrolling. Final position: ${lastPosition}px`);

    // Wait for any final content to load
    await page.waitForTimeout(3000);

    // Get final page height
    const finalHeight = await page.evaluate(() => document.body.scrollHeight);
    console.log(`[SCROLL] Final page height: ${finalHeight}px`);

    // Get the HTML
    const html = await page.content();
    const duration = (Date.now() - startTime) / 1000;

    console.log(`[DONE] Scraped ${html.length} bytes in ${duration.toFixed(1)}s`);

    // Save to file if requested
    if (config.outputFile) {
      fs.writeFileSync(config.outputFile, html);
      console.log(`[SAVE] HTML saved to: ${config.outputFile}`);
    }

    return {
      success: true,
      html,
      stats: {
        initialHeight,
        finalHeight,
        htmlSize: html.length,
        durationSeconds: duration,
        lastScrollPosition: lastPosition
      },
      error: null
    };

  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    return {
      success: false,
      html: null,
      stats: {
        durationSeconds: (Date.now() - startTime) / 1000
      },
      error: error.message
    };

  } finally {
    if (browser) {
      await browser.close();
      console.log(`[CLOSE] Browser closed`);
    }
  }
}

/**
 * Count elements matching a selector in HTML
 * @param {string} html - HTML content
 * @param {RegExp|string} pattern - Pattern to match
 * @returns {number} Count of matches
 */
function countMatches(html, pattern) {
  if (typeof pattern === 'string') {
    pattern = new RegExp(pattern, 'g');
  }
  const matches = html.match(pattern);
  return matches ? matches.length : 0;
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

module.exports = {
  scrapeInfiniteScroll,
  countMatches,
  extractLinks
};

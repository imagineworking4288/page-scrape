/**
 * Selenium PAGE_DOWN Infinite Scroll Scraper
 *
 * Uses keyboard simulation (PAGE_DOWN) instead of scrollBy() for more
 * reliable infinite scroll triggering. Direct JavaScript translation of
 * a proven Python/Playwright approach.
 *
 * Key insight: Counter resets to 0 on ANY height change because
 * height only stops changing at the absolute bottom of the page.
 */

const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  scrollDelay: 300,           // ms between PAGE_DOWN presses
  maxRetries: 15,             // consecutive no-change attempts before stopping
  maxScrolls: 1000,           // safety limit for total scrolls
  headless: false,            // show browser window
  outputFile: null,           // optional: save HTML to file
  verbose: true,              // log progress
  initialWait: 5000,          // ms to wait for initial content to load
  scrollContainer: null,      // CSS selector for scroll container (null = use body)
  waitForConfirmation: false  // wait for user to press Enter before scrolling
};

/**
 * Create a Chrome driver instance
 * @param {boolean} headless - Run in headless mode
 * @returns {WebDriver}
 */
async function createDriver(headless = false) {
  const options = new chrome.Options();

  if (headless) {
    options.addArguments('--headless=new');
  }

  // Common options for stability
  options.addArguments('--disable-gpu');
  options.addArguments('--no-sandbox');
  options.addArguments('--disable-dev-shm-usage');
  options.addArguments('--window-size=1920,1080');

  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();

  return driver;
}

/**
 * Core scroll function using PAGE_DOWN key simulation with retry logic
 *
 * This is a direct translation of the Python approach:
 * - Press PAGE_DOWN to scroll
 * - Check if page height increased
 * - If height increased: reset retry counter to 0
 * - If height same: increment retry counter
 * - Stop when retry counter reaches maxRetries
 *
 * @param {WebDriver} driver - Selenium WebDriver instance
 * @param {Object} options - Scroll options
 * @returns {Object} Scroll statistics
 */
async function scrollWithRetryLogic(driver, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const { scrollDelay, maxRetries, maxScrolls, verbose, scrollContainer } = config;

  // Determine which element to use for height checks
  let heightScript = 'return document.body.scrollHeight';
  let scrollElement;

  if (scrollContainer) {
    // Use a specific scroll container
    scrollElement = await driver.findElement(By.css(scrollContainer));
    heightScript = `return document.querySelector('${scrollContainer}').scrollHeight`;
    if (verbose) console.log(`Using scroll container: ${scrollContainer}`);
  } else {
    // Use body for scrolling
    scrollElement = await driver.findElement(By.tagName('body'));
  }

  // Click on the element to ensure it has focus for keyboard events
  await scrollElement.click();
  await driver.sleep(500);

  // Get initial page height
  let lastHeight = await driver.executeScript(heightScript);
  let retries = 0;
  let scrollCount = 0;
  let heightChanges = 0;

  if (verbose) {
    console.log(`Starting scroll: initial height = ${lastHeight}px`);
    console.log(`Config: delay=${scrollDelay}ms, maxRetries=${maxRetries}, maxScrolls=${maxScrolls}`);
  }

  // Main scroll loop
  while (scrollCount < maxScrolls && retries < maxRetries) {
    // Send PAGE_DOWN key to the scroll element
    await scrollElement.sendKeys(Key.PAGE_DOWN);

    scrollCount++;

    // Wait for content to potentially load
    await driver.sleep(scrollDelay);

    // Check new height
    const newHeight = await driver.executeScript(heightScript);

    if (newHeight > lastHeight) {
      // Height increased - reset retry counter!
      // This is the key insight: height only stops changing at absolute bottom
      retries = 0;
      heightChanges++;

      if (verbose) {
        console.log(`[${scrollCount}] Height changed: ${lastHeight} -> ${newHeight} (+${newHeight - lastHeight}px)`);
      }

      lastHeight = newHeight;
    } else {
      // Height unchanged - increment retry counter
      retries++;

      // Every 5 failed attempts, try scroll up then down to trigger lazy loading
      if (retries % 5 === 0 && retries < maxRetries) {
        if (verbose) {
          console.log(`[${scrollCount}] No change (retry ${retries}/${maxRetries}) - trying scroll up/down cycle`);
        }

        // Scroll up a few times
        for (let i = 0; i < 3; i++) {
          await scrollElement.sendKeys(Key.PAGE_UP);
          await driver.sleep(150);
        }

        // Wait a bit
        await driver.sleep(500);

        // Scroll back down
        for (let i = 0; i < 5; i++) {
          await scrollElement.sendKeys(Key.PAGE_DOWN);
          await driver.sleep(150);
        }

        // Wait for content to load
        await driver.sleep(scrollDelay);

        // Check if height changed after the cycle
        const heightAfterCycle = await driver.executeScript(heightScript);
        if (heightAfterCycle > lastHeight) {
          retries = 0;
          heightChanges++;
          if (verbose) {
            console.log(`[${scrollCount}] Scroll cycle triggered content: ${lastHeight} -> ${heightAfterCycle}`);
          }
          lastHeight = heightAfterCycle;
        }
      } else if (verbose && retries % 5 !== 0) {
        // Only log every 5th retry or when cycling
      }
    }
  }

  // Determine stop reason
  let stopReason;
  if (retries >= maxRetries) {
    stopReason = `Reached max retries (${maxRetries} consecutive no-change attempts)`;
  } else if (scrollCount >= maxScrolls) {
    stopReason = `Reached max scrolls (${maxScrolls})`;
  } else {
    stopReason = 'Unknown';
  }

  if (verbose) {
    console.log(`\nScroll complete: ${stopReason}`);
    console.log(`Total scrolls: ${scrollCount}, Height changes: ${heightChanges}`);
    console.log(`Final height: ${lastHeight}px`);
  }

  return {
    scrollCount,
    heightChanges,
    finalHeight: lastHeight,
    stopReason,
    retriesAtEnd: retries
  };
}

/**
 * Try to dismiss common cookie consent banners
 * @param {WebDriver} driver
 * @param {boolean} verbose
 */
async function dismissCookieBanners(driver, verbose = false) {
  const bannerSelectors = [
    '#onetrust-accept-btn-handler',      // OneTrust
    '#onetrust-reject-all-handler',      // OneTrust reject
    '.cookie-accept',                     // Common class
    '[data-testid="cookie-accept"]',     // Test ID pattern
    '#accept-cookies',                    // Common ID
    '.accept-cookies-button',             // Common class
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', // Cookiebot
    '.cc-accept',                         // Cookie consent
    '#gdpr-cookie-accept'                 // GDPR pattern
  ];

  for (const selector of bannerSelectors) {
    try {
      const button = await driver.findElement(By.css(selector));
      if (button) {
        await button.click();
        if (verbose) console.log(`Dismissed cookie banner: ${selector}`);
        await driver.sleep(500);
        return;
      }
    } catch (e) {
      // Button not found, try next
    }
  }

  if (verbose) console.log('No cookie banner found or already dismissed');
}

/**
 * Wait for user to press Enter (for interactive mode)
 * @returns {Promise}
 */
function waitForEnter(prompt = 'Press Enter to continue...') {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * Main scrape function - navigates to URL and scrolls to load all content
 *
 * @param {string} url - URL to scrape
 * @param {Object} options - Scraper options
 * @returns {Object} Result with HTML and statistics
 */
async function scrapeWithScroll(url, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  let driver = null;

  try {
    if (config.verbose) {
      console.log('='.repeat(60));
      console.log('SELENIUM PAGE_DOWN SCRAPER');
      console.log('='.repeat(60));
      console.log(`URL: ${url}`);
      console.log(`Headless: ${config.headless}`);
      console.log('');
    }

    // Create driver
    driver = await createDriver(config.headless);

    // Navigate to URL
    if (config.verbose) console.log('Navigating to URL...');
    await driver.get(url);

    // Wait for page to load
    await driver.wait(until.elementLocated(By.tagName('body')), 10000);

    // Wait for initial dynamic content to load
    if (config.verbose) console.log(`Waiting ${config.initialWait}ms for initial content...`);
    await driver.sleep(config.initialWait);

    // Try to dismiss common cookie banners
    await dismissCookieBanners(driver, config.verbose);

    // If interactive mode, wait for user confirmation
    if (config.waitForConfirmation) {
      console.log('\n>>> Browser is open. Please verify the page has loaded correctly.');
      console.log('>>> Dismiss any popups or cookie banners if needed.');
      await waitForEnter('>>> Press Enter when ready to start scrolling...');
      console.log('');
    }

    if (config.verbose) console.log('Page loaded, starting scroll...\n');

    // Perform scroll
    const stats = await scrollWithRetryLogic(driver, config);

    // Get final HTML
    const html = await driver.getPageSource();

    // Save to file if requested
    if (config.outputFile) {
      fs.writeFileSync(config.outputFile, html);
      if (config.verbose) console.log(`\nHTML saved to: ${config.outputFile}`);
    }

    return {
      success: true,
      html,
      stats
    };

  } catch (error) {
    console.error('Scraper error:', error.message);
    return {
      success: false,
      error: error.message,
      html: null,
      stats: null
    };

  } finally {
    // Always close the driver
    if (driver) {
      await driver.quit();
    }
  }
}

/**
 * Extract links matching a pattern from HTML (case-insensitive)
 *
 * @param {string} html - HTML content
 * @param {string} pattern - Pattern to match in href (e.g., '/lawyers/')
 * @returns {string[]} Array of unique matching URLs
 */
function extractLinks(html, pattern) {
  const regex = /href=["']([^"']*?)["']/gi;
  const links = new Set();
  let match;
  const patternLower = pattern.toLowerCase();

  while ((match = regex.exec(html)) !== null) {
    if (match[1].toLowerCase().includes(patternLower)) {
      // Exclude .vcf files
      if (!match[1].endsWith('.vcf')) {
        links.add(match[1]);
      }
    }
  }

  return Array.from(links).sort();
}

/**
 * Count elements matching a selector in HTML
 * Uses a simple regex approach (won't work for complex selectors)
 *
 * @param {string} html - HTML content
 * @param {string} tagOrClass - Tag name or class to count
 * @returns {number} Count of matches
 */
function countElements(html, tagOrClass) {
  // Try as class first
  const classRegex = new RegExp(`class=["'][^"']*${tagOrClass}[^"']*["']`, 'gi');
  const classMatches = html.match(classRegex);

  if (classMatches && classMatches.length > 0) {
    return classMatches.length;
  }

  // Try as tag
  const tagRegex = new RegExp(`<${tagOrClass}[\\s>]`, 'gi');
  const tagMatches = html.match(tagRegex);

  return tagMatches ? tagMatches.length : 0;
}

// Export functions
module.exports = {
  scrapeWithScroll,
  scrollWithRetryLogic,
  createDriver,
  waitForEnter,
  extractLinks,
  countElements,
  DEFAULT_CONFIG
};

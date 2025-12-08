/**
 * Selenium Manager
 *
 * Parallel browser manager using Selenium WebDriver for reliable infinite scroll handling.
 * Uses PAGE_DOWN key simulation instead of scrollBy() for better compatibility with
 * lazy-loading and infinite scroll triggers.
 *
 * Key Features:
 * - PAGE_DOWN key simulation (not scrollBy)
 * - Retry counter reset on ANY height change
 * - Scroll up/down cycle every 5 failed retries
 * - Cookie banner auto-dismissal
 * - Memory monitoring and driver recycling
 */

const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

class SeleniumManager {
  constructor(logger) {
    this.logger = logger;
    this.driver = null;
    this.navigationCount = 0;
    this.initialMemory = 0;

    // Default scroll configuration
    this.defaultScrollConfig = {
      scrollDelay: 400,           // ms between PAGE_DOWN presses
      maxRetries: 25,             // consecutive no-change attempts before stopping
      maxScrolls: 1000,           // safety limit for total scrolls
      initialWait: 5000,          // ms to wait for initial content to load
      scrollContainer: null,      // CSS selector for scroll container (null = use body)
      verbose: true               // log progress
    };

    // User agent rotation
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
  }

  /**
   * Launch Chrome WebDriver with stealth configuration
   * @param {boolean} headless - Run in headless mode
   * @returns {Promise<boolean>} - Success status
   */
  async launch(headless = true) {
    try {
      // Normalize headless parameter
      if (headless === 'false' || headless === false) {
        headless = false;
      } else {
        headless = true;
      }

      this.logger.info('[Selenium] Launching Chrome WebDriver...');

      const options = new chrome.Options();

      if (headless) {
        options.addArguments('--headless=new');
      }

      // Stealth and stability arguments
      options.addArguments('--disable-gpu');
      options.addArguments('--no-sandbox');
      options.addArguments('--disable-dev-shm-usage');
      options.addArguments('--window-size=1920,1080');
      options.addArguments('--disable-blink-features=AutomationControlled');
      options.addArguments('--disable-web-security');
      options.addArguments('--disable-features=IsolateOrigins,site-per-process');

      // Random user agent
      const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
      options.addArguments(`--user-agent=${userAgent}`);

      this.driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

      this.initialMemory = process.memoryUsage().heapUsed;

      this.logger.info('[Selenium] Chrome WebDriver launched successfully');
      this.logger.info(`[Selenium] Headless mode: ${headless}`);

      return true;
    } catch (error) {
      this.logger.error(`[Selenium] Failed to launch WebDriver: ${error.message}`);
      throw error;
    }
  }

  /**
   * Navigate to URL
   * @param {string} url - URL to navigate to
   * @param {number} timeout - Navigation timeout in ms
   * @returns {Promise<boolean>} - Success status
   */
  async navigate(url, timeout = 30000) {
    try {
      await this.checkMemoryAndRecycle();

      this.logger.info(`[Selenium] Navigating to: ${url}`);

      await this.driver.get(url);

      // Wait for body to be present
      await this.driver.wait(until.elementLocated(By.tagName('body')), timeout);

      this.navigationCount++;

      if (this.navigationCount % 10 === 0) {
        this.logMemoryUsage();
      }

      return true;
    } catch (error) {
      this.logger.error(`[Selenium] Navigation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Scroll page to fully load all infinite scroll content
   * Uses PAGE_DOWN key simulation with retry logic
   *
   * @param {Object} options - Scroll options
   * @returns {Promise<Object>} - Scroll statistics
   */
  async scrollToFullyLoad(options = {}) {
    const config = { ...this.defaultScrollConfig, ...options };
    const { scrollDelay, maxRetries, maxScrolls, initialWait, scrollContainer, verbose } = config;

    // Wait for initial content to load
    if (verbose) this.logger.info(`[Selenium] Waiting ${initialWait}ms for initial content...`);
    await this.driver.sleep(initialWait);

    // Try to dismiss cookie banners
    await this.dismissCookieBanners(verbose);

    // Determine scroll element and height script
    let heightScript = 'return document.body.scrollHeight';
    let scrollElement;

    if (scrollContainer) {
      try {
        scrollElement = await this.driver.findElement(By.css(scrollContainer));
        heightScript = `return document.querySelector('${scrollContainer}').scrollHeight`;
        if (verbose) this.logger.info(`[Selenium] Using scroll container: ${scrollContainer}`);
      } catch (e) {
        this.logger.warn(`[Selenium] Scroll container not found: ${scrollContainer}, using body`);
        scrollElement = await this.driver.findElement(By.tagName('body'));
      }
    } else {
      scrollElement = await this.driver.findElement(By.tagName('body'));
    }

    // Click on element to ensure focus for keyboard events
    try {
      await scrollElement.click();
      await this.driver.sleep(500);
    } catch (e) {
      this.logger.debug('[Selenium] Could not click scroll element, continuing anyway');
    }

    // Get initial page height
    let lastHeight = await this.driver.executeScript(heightScript);
    let retries = 0;
    let scrollCount = 0;
    let heightChanges = 0;

    if (verbose) {
      this.logger.info(`[Selenium] Starting scroll: initial height = ${lastHeight}px`);
      this.logger.info(`[Selenium] Config: delay=${scrollDelay}ms, maxRetries=${maxRetries}, maxScrolls=${maxScrolls}`);
    }

    // Main scroll loop
    while (scrollCount < maxScrolls && retries < maxRetries) {
      // Send PAGE_DOWN key to scroll element
      await scrollElement.sendKeys(Key.PAGE_DOWN);
      scrollCount++;

      // Wait for content to potentially load
      await this.driver.sleep(scrollDelay);

      // Check new height
      const newHeight = await this.driver.executeScript(heightScript);

      if (newHeight > lastHeight) {
        // Height increased - reset retry counter!
        // Key insight: height only stops changing at absolute bottom
        retries = 0;
        heightChanges++;

        if (verbose) {
          this.logger.info(`[Selenium] [${scrollCount}] Height changed: ${lastHeight} -> ${newHeight} (+${newHeight - lastHeight}px)`);
        }

        lastHeight = newHeight;
      } else {
        // Height unchanged - increment retry counter
        retries++;

        // Every 5 failed attempts, try scroll up/down cycle to trigger lazy loading
        if (retries % 5 === 0 && retries < maxRetries) {
          if (verbose) {
            this.logger.info(`[Selenium] [${scrollCount}] No change (retry ${retries}/${maxRetries}) - trying scroll up/down cycle`);
          }

          // Scroll up a few times
          for (let i = 0; i < 3; i++) {
            await scrollElement.sendKeys(Key.PAGE_UP);
            await this.driver.sleep(150);
          }

          // Wait a bit
          await this.driver.sleep(500);

          // Scroll back down
          for (let i = 0; i < 5; i++) {
            await scrollElement.sendKeys(Key.PAGE_DOWN);
            await this.driver.sleep(150);
          }

          // Wait for content to load
          await this.driver.sleep(scrollDelay);

          // Check if height changed after cycle
          const heightAfterCycle = await this.driver.executeScript(heightScript);
          if (heightAfterCycle > lastHeight) {
            retries = 0;
            heightChanges++;
            if (verbose) {
              this.logger.info(`[Selenium] [${scrollCount}] Scroll cycle triggered content: ${lastHeight} -> ${heightAfterCycle}`);
            }
            lastHeight = heightAfterCycle;
          }
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
      this.logger.info(`[Selenium] Scroll complete: ${stopReason}`);
      this.logger.info(`[Selenium] Total scrolls: ${scrollCount}, Height changes: ${heightChanges}`);
      this.logger.info(`[Selenium] Final height: ${lastHeight}px`);
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
   * @param {boolean} verbose - Log actions
   */
  async dismissCookieBanners(verbose = false) {
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
        const button = await this.driver.findElement(By.css(selector));
        if (button) {
          await button.click();
          if (verbose) this.logger.info(`[Selenium] Dismissed cookie banner: ${selector}`);
          await this.driver.sleep(500);
          return;
        }
      } catch (e) {
        // Button not found, try next
      }
    }

    if (verbose) this.logger.debug('[Selenium] No cookie banner found or already dismissed');
  }

  /**
   * Get page HTML source after scrolling
   * @returns {Promise<string>} - HTML content
   */
  async getPageSource() {
    if (!this.driver) {
      throw new Error('[Selenium] Driver not initialized. Call launch() first.');
    }
    return await this.driver.getPageSource();
  }

  /**
   * Get the WebDriver instance
   * @returns {WebDriver} - Selenium WebDriver
   */
  getDriver() {
    if (!this.driver) {
      throw new Error('[Selenium] Driver not initialized. Call launch() first.');
    }
    return this.driver;
  }

  /**
   * Check memory and recycle driver if needed
   */
  async checkMemoryAndRecycle() {
    const currentMemory = process.memoryUsage().heapUsed;
    const memoryGrowthMB = (currentMemory - this.initialMemory) / 1024 / 1024;

    // Recycle after 50 navigations or 1GB memory growth
    if (this.navigationCount >= 50 || memoryGrowthMB >= 1024) {
      this.logger.info(`[Selenium] Recycling driver - Navigations: ${this.navigationCount}, Memory growth: ${memoryGrowthMB.toFixed(2)}MB`);

      // Close and recreate driver
      if (this.driver) {
        await this.driver.quit();
      }

      // Relaunch with same settings
      await this.launch(true); // Headless for recycled instances

      this.navigationCount = 0;
      this.initialMemory = process.memoryUsage().heapUsed;

      if (global.gc) {
        global.gc();
        this.logger.debug('[Selenium] Forced garbage collection');
      }
    }
  }

  /**
   * Log current memory usage
   */
  logMemoryUsage() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
    const rssMB = (memUsage.rss / 1024 / 1024).toFixed(2);

    this.logger.info(`[Selenium] Memory - Heap: ${heapUsedMB}/${heapTotalMB}MB, RSS: ${rssMB}MB, Navigations: ${this.navigationCount}`);
  }

  /**
   * Close WebDriver
   */
  async close() {
    try {
      if (this.driver) {
        await this.driver.quit();
        this.driver = null;
        this.logger.info('[Selenium] WebDriver closed successfully');
      }
    } catch (error) {
      this.logger.error(`[Selenium] Error closing WebDriver: ${error.message}`);
    }
  }
}

module.exports = SeleniumManager;

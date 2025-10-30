const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const logger = require('./logger');

// Apply stealth plugin to avoid bot detection
puppeteer.use(StealthPlugin());

class BrowserManager {
  constructor() {
    this.browser = null;
    this.page = null;
    this.navigationCount = 0;
    this.initialMemory = 0;
    
    // Pool of recent user agents for rotation
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
      'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0'
    ];
  }

  /**
   * Initialize browser with stealth configuration and anti-detection measures
   */
  async initialize() {
    try {
      logger.info('Launching browser with stealth configuration...');
      
      this.browser = await puppeteer.launch({
        headless: 'new', // Use new headless mode
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
          '--disable-blink-features=AutomationControlled'
        ]
      });

      this.page = await this.browser.newPage();
      
      // Set random user agent
      const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
      await this.page.setUserAgent(userAgent);
      
      // Set viewport
      await this.page.setViewport({ width: 1920, height: 1080 });
      
      // Record initial memory
      this.initialMemory = process.memoryUsage().heapUsed;
      
      logger.info(`Browser initialized with user agent: ${userAgent.substring(0, 50)}...`);
      return true;
    } catch (error) {
      logger.error(`Failed to initialize browser: ${error.message}`);
      throw error;
    }
  }

  /**
   * Navigate to URL safely with timeout and error handling
   * @param {string} url - Target URL
   * @param {number} timeout - Navigation timeout in ms (default 30000)
   */
  async navigateSafely(url, timeout = 30000) {
    try {
      // Check if we need to recycle the page
      await this.checkMemoryAndRecycle();
      
      logger.info(`Navigating to: ${url}`);
      
      await this.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: timeout
      });
      
      this.navigationCount++;
      
      // Log memory usage every 10 navigations
      if (this.navigationCount % 10 === 0) {
        this.logMemoryUsage();
      }
      
      // Check for CAPTCHA
      await this.detectCaptcha(url);
      
      return true;
    } catch (error) {
      if (error.name === 'TimeoutError') {
        logger.warn(`Navigation timeout for ${url}`);
      } else if (error.message.includes('CAPTCHA_DETECTED')) {
        throw error; // Re-throw CAPTCHA errors
      } else {
        logger.error(`Navigation failed for ${url}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Detect CAPTCHA or bot challenges on the current page
   * @param {string} url - Current URL for logging
   */
  async detectCaptcha(url) {
    try {
      const pageText = await this.page.evaluate(() => document.body.innerText.toLowerCase());
      
      // Check for CAPTCHA keywords (case-insensitive)
      const captchaKeywords = [
        'captcha',
        'cloudflare',
        'please verify',
        'verify you are human',
        'security check',
        'are you a robot'
      ];
      
      for (const keyword of captchaKeywords) {
        if (pageText.includes(keyword)) {
          logger.error(`CAPTCHA detected on ${url} (keyword: "${keyword}")`);
          const error = new Error('CAPTCHA_DETECTED');
          error.url = url;
          throw error;
        }
      }
    } catch (error) {
      if (error.message === 'CAPTCHA_DETECTED') {
        throw error;
      }
      // Ignore other errors during CAPTCHA detection
      logger.debug(`Could not check for CAPTCHA: ${error.message}`);
    }
  }

  /**
   * Check memory usage and recycle page if necessary
   * Recycles at 50 navigations OR 1GB memory growth
   */
  async checkMemoryAndRecycle() {
    const currentMemory = process.memoryUsage().heapUsed;
    const memoryGrowthMB = (currentMemory - this.initialMemory) / 1024 / 1024;
    
    // Recycle if 50+ navigations or 1GB+ memory growth
    if (this.navigationCount >= 50 || memoryGrowthMB >= 1024) {
      logger.info(`Recycling page - Navigations: ${this.navigationCount}, Memory growth: ${memoryGrowthMB.toFixed(2)}MB`);
      
      await this.page.close();
      this.page = await this.browser.newPage();
      
      // Set random user agent again
      const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
      await this.page.setUserAgent(userAgent);
      await this.page.setViewport({ width: 1920, height: 1080 });
      
      // Reset counters
      this.navigationCount = 0;
      this.initialMemory = process.memoryUsage().heapUsed;
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        logger.debug('Forced garbage collection');
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
    
    logger.info(`Memory - Heap: ${heapUsedMB}/${heapTotalMB}MB, RSS: ${rssMB}MB, Navigations: ${this.navigationCount}`);
  }

  /**
   * Get the current page instance
   */
  getPage() {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }
    return this.page;
  }

  /**
   * Close browser and cleanup
   */
  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        logger.info('Browser closed successfully');
      }
    } catch (error) {
      logger.error(`Error closing browser: ${error.message}`);
    }
  }
}

module.exports = BrowserManager;

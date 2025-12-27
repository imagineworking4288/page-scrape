const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { RetryHandler } = require('../utils/retry');

puppeteer.use(StealthPlugin());

class BrowserManager {
  constructor(logger) {
    this.logger = logger;
    this.browser = null;
    this.page = null;
    this.navigationCount = 0;
    this.initialMemory = 0;

    // Create fallback logger for console operations
    this._safeLogger = {
      debug: (msg) => this._log('debug', msg),
      info: (msg) => this._log('info', msg),
      warn: (msg) => this._log('warn', msg),
      error: (msg) => this._log('error', msg)
    };

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
   * Safe logger helper - checks if logger exists and has the method
   * Falls back to console if logger is unavailable
   * @param {string} level - Log level (debug, info, warn, error)
   * @param {string} message - Message to log
   */
  _log(level, message) {
    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](message);
    } else if (this.logger && typeof this.logger.info === 'function') {
      // Fallback to info if specific level not available
      this.logger.info(message);
    } else {
      // Fallback to console
      const consoleFn = console[level] || console.log;
      consoleFn(message);
    }
  }

  async launch(headless = true) {
    try {
      if (headless === 'false' || headless === false) {
        headless = false;
      } else {
        headless = true;
      }

      this._log('info', 'Launching browser with stealth configuration...');

      this.browser = await puppeteer.launch({
        headless: headless ? 'new' : false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
          '--disable-blink-features=AutomationControlled',
          // CSP bypass flags for script injection on restricted sites
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });

      this.page = await this.browser.newPage();

      // Bypass Content Security Policy restrictions
      await this.page.setBypassCSP(true);

      // Filter out CSP error spam from console
      this.setupConsoleFiltering(this.page);

      const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
      await this.page.setUserAgent(userAgent);

      await this.page.setViewport({ width: 1920, height: 1080 });

      this.initialMemory = process.memoryUsage().heapUsed;

      this._log('info', 'Browser launched successfully');
      this._log('info', `Headless mode: ${headless}`);
      this._log('info', 'CSP bypass enabled');
      return true;
    } catch (error) {
      this._log('error', `Failed to launch browser: ${error.message}`);
      throw error;
    }
  }

  /**
   * Setup console message filtering to suppress CSP errors
   * @param {Object} page - Puppeteer page
   */
  setupConsoleFiltering(page) {
    page.on('console', (msg) => {
      const text = msg.text();
      // Filter out CSP-related error messages
      if (text.includes('Content Security Policy') ||
          text.includes('unsafe-eval') ||
          text.includes('Refused to evaluate') ||
          text.includes('script-src')) {
        return; // Suppress CSP errors
      }
      // Log other messages at appropriate level
      const type = msg.type();
      if (type === 'error') {
        this._log('debug', `[Browser Console Error] ${text}`);
      } else if (type === 'warning') {
        this._log('debug', `[Browser Console Warning] ${text}`);
      }
    });
  }

  async navigate(url, timeout = 30000, options = {}) {
    const retryHandler = new RetryHandler({
      maxRetries: options.maxRetries || 2,
      initialDelay: 2000,
      maxDelay: 10000,
      logger: { info: (m) => this._log('info', m), warn: (m) => this._log('warn', m), error: (m) => this._log('error', m) }
    });

    return retryHandler.execute(async () => {
      await this.checkMemoryAndRecycle();

      this._log('info', `Navigating to: ${url}`);

      await this.page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: timeout
      });

      this.navigationCount++;

      if (this.navigationCount % 10 === 0) {
        this.logMemoryUsage();
      }

      await this.detectCaptcha(url);

      return true;
    }, `navigate(${url})`);
  }

  async detectCaptcha(url) {
    try {
      const pageText = await this.page.evaluate(() => document.body.innerText.toLowerCase());

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
          this._log('error', `CAPTCHA detected on ${url} (keyword: "${keyword}")`);
          const error = new Error('CAPTCHA_DETECTED');
          error.url = url;
          throw error;
        }
      }
    } catch (error) {
      if (error.message === 'CAPTCHA_DETECTED') {
        throw error;
      }
      this._log('debug', `Could not check for CAPTCHA: ${error.message}`);
    }
  }

  async checkMemoryAndRecycle() {
    const currentMemory = process.memoryUsage().heapUsed;
    const memoryGrowthMB = (currentMemory - this.initialMemory) / 1024 / 1024;

    if (this.navigationCount >= 50 || memoryGrowthMB >= 1024) {
      this._log('info', `Recycling page - Navigations: ${this.navigationCount}, Memory growth: ${memoryGrowthMB.toFixed(2)}MB`);

      await this.page.close();
      this.page = await this.browser.newPage();

      // Re-apply CSP bypass on recycled page
      await this.page.setBypassCSP(true);
      this.setupConsoleFiltering(this.page);

      const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
      await this.page.setUserAgent(userAgent);
      await this.page.setViewport({ width: 1920, height: 1080 });

      this.navigationCount = 0;
      this.initialMemory = process.memoryUsage().heapUsed;

      if (global.gc) {
        global.gc();
        this._log('debug', 'Forced garbage collection');
      }
    }
  }

  logMemoryUsage() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
    const rssMB = (memUsage.rss / 1024 / 1024).toFixed(2);

    this._log('info', `Memory - Heap: ${heapUsedMB}/${heapTotalMB}MB, RSS: ${rssMB}MB, Navigations: ${this.navigationCount}`);
  }

  getPage() {
    if (!this.page) {
      throw new Error('Browser not initialized. Call launch() first.');
    }
    return this.page;
  }

  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        this._log('info', 'Browser closed successfully');
      }
    } catch (error) {
      this._log('error', `Error closing browser: ${error.message}`);
    }
  }
}

module.exports = BrowserManager;

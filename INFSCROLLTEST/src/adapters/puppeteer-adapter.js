/**
 * Puppeteer Browser Adapter
 * Implements BrowserAdapter interface using Puppeteer
 */

const puppeteer = require('puppeteer');
const BrowserAdapter = require('./browser-adapter');

class PuppeteerAdapter extends BrowserAdapter {
  constructor() {
    super();
    this.browser = null;
    this.page = null;
    this.config = null;
  }

  /**
   * Initialize Puppeteer browser with configuration
   * @param {object} config - Browser configuration
   */
  async init(config) {
    this.config = config;

    const launchOptions = {
      headless: config.headless !== false ? 'new' : false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        `--window-size=${config.viewport?.width || 1920},${config.viewport?.height || 1080}`
      ]
    };

    this.browser = await puppeteer.launch(launchOptions);
    this.page = await this.browser.newPage();

    // Set viewport
    await this.page.setViewport({
      width: config.viewport?.width || 1920,
      height: config.viewport?.height || 1080
    });

    // Set user agent if provided
    if (config.userAgent) {
      await this.page.setUserAgent(config.userAgent);
    }

    // Set default navigation timeout
    this.page.setDefaultNavigationTimeout(60000);
    this.page.setDefaultTimeout(30000);
  }

  /**
   * Navigate to a URL
   * @param {string} url - URL to navigate to
   * @param {object} options - Navigation options
   */
  async navigateTo(url, options = {}) {
    const navOptions = {
      waitUntil: options.waitUntil || 'networkidle2',
      timeout: options.timeout || 60000
    };
    await this.page.goto(url, navOptions);
  }

  /**
   * Scroll by a specified amount
   * @param {number} amount - Pixels to scroll
   * @param {string} container - 'window' or CSS selector
   */
  async scrollBy(amount, container = 'window') {
    if (container === 'window') {
      await this.page.evaluate((scrollAmount) => {
        window.scrollBy({
          top: scrollAmount,
          behavior: 'smooth'
        });
      }, amount);
    } else {
      await this.page.evaluate((selector, scrollAmount) => {
        const element = document.querySelector(selector);
        if (element) {
          element.scrollBy({
            top: scrollAmount,
            behavior: 'smooth'
          });
        }
      }, container, amount);
    }
  }

  /**
   * Scroll to top of page/container
   * @param {string} container - 'window' or CSS selector
   */
  async scrollToTop(container = 'window') {
    if (container === 'window') {
      await this.page.evaluate(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    } else {
      await this.page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (element) {
          element.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, container);
    }
  }

  /**
   * Scroll to bottom of page/container
   * @param {string} container - 'window' or CSS selector
   */
  async scrollToBottom(container = 'window') {
    if (container === 'window') {
      await this.page.evaluate(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      });
    } else {
      await this.page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (element) {
          element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
        }
      }, container);
    }
  }

  /**
   * Execute JavaScript in page context
   * @param {function|string} script - Script to execute
   * @param {...any} args - Arguments to pass to script
   * @returns {any} Result of script execution
   */
  async evaluateScript(script, ...args) {
    return await this.page.evaluate(script, ...args);
  }

  /**
   * Click an element
   * @param {string} selector - CSS selector for element
   * @param {object} options - Click options
   */
  async click(selector, options = {}) {
    try {
      await this.page.click(selector, options);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Wait for a specified duration
   * @param {number} ms - Milliseconds to wait
   */
  async waitFor(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wait for an element to appear
   * @param {string} selector - CSS selector
   * @param {number} timeout - Timeout in ms
   */
  async waitForElement(selector, timeout = 5000) {
    try {
      await this.page.waitForSelector(selector, { timeout });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the scroll height of a container
   * @param {string} container - 'window' or CSS selector
   * @returns {number} Scroll height in pixels
   */
  async getScrollHeight(container = 'window') {
    if (container === 'window') {
      return await this.page.evaluate(() => {
        return Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        );
      });
    } else {
      return await this.page.evaluate((selector) => {
        const element = document.querySelector(selector);
        return element ? element.scrollHeight : 0;
      }, container);
    }
  }

  /**
   * Get current scroll position
   * @param {string} container - 'window' or CSS selector
   * @returns {number} Current scroll position in pixels
   */
  async getScrollPosition(container = 'window') {
    if (container === 'window') {
      return await this.page.evaluate(() => {
        return window.pageYOffset || document.documentElement.scrollTop;
      });
    } else {
      return await this.page.evaluate((selector) => {
        const element = document.querySelector(selector);
        return element ? element.scrollTop : 0;
      }, container);
    }
  }

  /**
   * Get count of items matching a selector
   * @param {string} selector - CSS selector
   * @returns {number} Count of matching elements
   */
  async getItemCount(selector) {
    return await this.page.evaluate((sel) => {
      return document.querySelectorAll(sel).length;
    }, selector);
  }

  /**
   * Check if an element exists
   * @param {string} selector - CSS selector
   * @returns {boolean} Whether element exists
   */
  async elementExists(selector) {
    return await this.page.evaluate((sel) => {
      return document.querySelector(sel) !== null;
    }, selector);
  }

  /**
   * Check if an element is visible
   * @param {string} selector - CSS selector
   * @returns {boolean} Whether element is visible
   */
  async isElementVisible(selector) {
    return await this.page.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (!element) return false;

      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        style.opacity !== '0'
      );
    }, selector);
  }

  /**
   * Scroll an element into view
   * @param {string} selector - CSS selector
   */
  async scrollIntoView(selector) {
    await this.page.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, selector);
  }

  /**
   * Get the full page HTML content
   * @returns {string} HTML content
   */
  async getPageContent() {
    return await this.page.content();
  }

  /**
   * Get current page URL
   * @returns {string} Current URL
   */
  async getCurrentUrl() {
    return this.page.url();
  }

  /**
   * Take a screenshot
   * @param {string} path - File path to save screenshot
   */
  async screenshot(path) {
    await this.page.screenshot({ path, fullPage: true });
  }

  /**
   * Close the browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

module.exports = PuppeteerAdapter;

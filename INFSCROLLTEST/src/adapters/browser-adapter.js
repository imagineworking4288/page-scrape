/**
 * Abstract Browser Adapter
 * Base class defining the interface for browser automation
 * Enables future support for Playwright, Selenium, etc.
 */

class BrowserAdapter {
  constructor() {
    if (new.target === BrowserAdapter) {
      throw new Error('BrowserAdapter is abstract and cannot be instantiated directly');
    }
  }

  /**
   * Initialize the browser with configuration
   * @param {object} config - Browser configuration
   */
  async init(config) {
    throw new Error('Not implemented: init()');
  }

  /**
   * Navigate to a URL
   * @param {string} url - URL to navigate to
   * @param {object} options - Navigation options
   */
  async navigateTo(url, options = {}) {
    throw new Error('Not implemented: navigateTo()');
  }

  /**
   * Scroll by a specified amount
   * @param {number} amount - Pixels to scroll
   * @param {string} container - 'window' or CSS selector
   */
  async scrollBy(amount, container = 'window') {
    throw new Error('Not implemented: scrollBy()');
  }

  /**
   * Scroll to top of page/container
   * @param {string} container - 'window' or CSS selector
   */
  async scrollToTop(container = 'window') {
    throw new Error('Not implemented: scrollToTop()');
  }

  /**
   * Scroll to bottom of page/container
   * @param {string} container - 'window' or CSS selector
   */
  async scrollToBottom(container = 'window') {
    throw new Error('Not implemented: scrollToBottom()');
  }

  /**
   * Execute JavaScript in page context
   * @param {function|string} script - Script to execute
   * @param {...any} args - Arguments to pass to script
   * @returns {any} Result of script execution
   */
  async evaluateScript(script, ...args) {
    throw new Error('Not implemented: evaluateScript()');
  }

  /**
   * Click an element
   * @param {string} selector - CSS selector for element
   * @param {object} options - Click options
   */
  async click(selector, options = {}) {
    throw new Error('Not implemented: click()');
  }

  /**
   * Wait for a specified duration
   * @param {number} ms - Milliseconds to wait
   */
  async waitFor(ms) {
    throw new Error('Not implemented: waitFor()');
  }

  /**
   * Wait for an element to appear
   * @param {string} selector - CSS selector
   * @param {number} timeout - Timeout in ms
   */
  async waitForElement(selector, timeout = 5000) {
    throw new Error('Not implemented: waitForElement()');
  }

  /**
   * Get the scroll height of a container
   * @param {string} container - 'window' or CSS selector
   * @returns {number} Scroll height in pixels
   */
  async getScrollHeight(container = 'window') {
    throw new Error('Not implemented: getScrollHeight()');
  }

  /**
   * Get current scroll position
   * @param {string} container - 'window' or CSS selector
   * @returns {number} Current scroll position in pixels
   */
  async getScrollPosition(container = 'window') {
    throw new Error('Not implemented: getScrollPosition()');
  }

  /**
   * Get count of items matching a selector
   * @param {string} selector - CSS selector
   * @returns {number} Count of matching elements
   */
  async getItemCount(selector) {
    throw new Error('Not implemented: getItemCount()');
  }

  /**
   * Check if an element exists
   * @param {string} selector - CSS selector
   * @returns {boolean} Whether element exists
   */
  async elementExists(selector) {
    throw new Error('Not implemented: elementExists()');
  }

  /**
   * Check if an element is visible
   * @param {string} selector - CSS selector
   * @returns {boolean} Whether element is visible
   */
  async isElementVisible(selector) {
    throw new Error('Not implemented: isElementVisible()');
  }

  /**
   * Scroll an element into view
   * @param {string} selector - CSS selector
   */
  async scrollIntoView(selector) {
    throw new Error('Not implemented: scrollIntoView()');
  }

  /**
   * Get the full page HTML content
   * @returns {string} HTML content
   */
  async getPageContent() {
    throw new Error('Not implemented: getPageContent()');
  }

  /**
   * Get current page URL
   * @returns {string} Current URL
   */
  async getCurrentUrl() {
    throw new Error('Not implemented: getCurrentUrl()');
  }

  /**
   * Take a screenshot
   * @param {string} path - File path to save screenshot
   */
  async screenshot(path) {
    throw new Error('Not implemented: screenshot()');
  }

  /**
   * Close the browser
   */
  async close() {
    throw new Error('Not implemented: close()');
  }
}

module.exports = BrowserAdapter;

/**
 * Load More Button Handler
 * Detects and clicks "load more" buttons when present
 */

const humanBehavior = require('./human-behavior');

class LoadMoreHandler {
  /**
   * Create a load more handler
   * @param {BrowserAdapter} adapter - Browser adapter instance
   * @param {object} config - Configuration object
   * @param {object} logger - Logger instance
   */
  constructor(adapter, config, logger) {
    this.adapter = adapter;
    this.config = config;
    this.logger = logger;
    this.clickCount = 0;
    this.lastClickedSelector = null;
  }

  /**
   * Reset the handler state
   */
  reset() {
    this.clickCount = 0;
    this.lastClickedSelector = null;
  }

  /**
   * Check for and click a load more button
   * @returns {object} { clicked: boolean, selector: string|null, reason: string }
   */
  async checkAndClick() {
    // Check if we've reached max clicks
    if (this.clickCount >= this.config.maxLoadMoreClicks) {
      return {
        clicked: false,
        selector: null,
        reason: `Maximum load more clicks (${this.config.maxLoadMoreClicks}) reached`
      };
    }

    // No load more selectors configured
    if (!this.config.loadMoreSelectors || this.config.loadMoreSelectors.length === 0) {
      return {
        clicked: false,
        selector: null,
        reason: 'No load more selectors configured'
      };
    }

    // Try to find a visible load more button
    const button = await this._findLoadMoreButton();

    if (!button) {
      return {
        clicked: false,
        selector: null,
        reason: 'No visible load more button found'
      };
    }

    // Click the button
    const clickResult = await this._clickButton(button);

    if (clickResult.success) {
      this.clickCount++;
      this.lastClickedSelector = button;

      this.logger.info(`Clicked load more button: ${button} (click #${this.clickCount})`);

      return {
        clicked: true,
        selector: button,
        reason: 'Button clicked successfully'
      };
    } else {
      return {
        clicked: false,
        selector: button,
        reason: clickResult.error
      };
    }
  }

  /**
   * Find a visible load more button
   * @returns {string|null} Selector of found button, or null
   */
  async _findLoadMoreButton() {
    for (const selector of this.config.loadMoreSelectors) {
      try {
        const exists = await this.adapter.elementExists(selector);
        if (!exists) {
          this.logger.debug(`Load more selector not found: ${selector}`);
          continue;
        }

        const isVisible = await this.adapter.isElementVisible(selector);
        if (!isVisible) {
          this.logger.debug(`Load more button exists but not visible: ${selector}`);
          continue;
        }

        // Check if button is disabled
        const isDisabled = await this.adapter.evaluateScript((sel) => {
          const el = document.querySelector(sel);
          if (!el) return true;
          return el.disabled || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true';
        }, selector);

        if (isDisabled) {
          this.logger.debug(`Load more button is disabled: ${selector}`);
          continue;
        }

        this.logger.debug(`Found clickable load more button: ${selector}`);
        return selector;

      } catch (error) {
        this.logger.debug(`Error checking selector ${selector}: ${error.message}`);
        continue;
      }
    }

    return null;
  }

  /**
   * Check if a button is visible and clickable
   * @param {string} selector - CSS selector
   * @returns {boolean} Whether button is clickable
   */
  async _isButtonClickable(selector) {
    try {
      const exists = await this.adapter.elementExists(selector);
      if (!exists) return false;

      const isVisible = await this.adapter.isElementVisible(selector);
      if (!isVisible) return false;

      // Additional check for disabled state
      const isEnabled = await this.adapter.evaluateScript((sel) => {
        const el = document.querySelector(sel);
        return el && !el.disabled;
      }, selector);

      return isEnabled;
    } catch (error) {
      return false;
    }
  }

  /**
   * Click a load more button with human-like behavior
   * @param {string} selector - CSS selector
   * @returns {object} { success: boolean, error: string|null }
   */
  async _clickButton(selector) {
    try {
      // Scroll button into view first
      await this.adapter.scrollIntoView(selector);

      // Wait a bit after scrolling
      await this.adapter.waitFor(humanBehavior.randomInRange(200, 500));

      // Add pre-click delay (human hesitation)
      const preClickDelay = humanBehavior.getWaitTime(this.config, 'loadMore');
      await this.adapter.waitFor(preClickDelay);

      // Perform the click
      const clicked = await this.adapter.click(selector);

      if (!clicked) {
        return {
          success: false,
          error: 'Click failed - element may have moved or been removed'
        };
      }

      // Wait for content to potentially load
      await this.adapter.waitFor(this.config.waitForContent);

      return { success: true, error: null };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get handler statistics
   * @returns {object} Statistics
   */
  getStats() {
    return {
      clickCount: this.clickCount,
      maxClicks: this.config.maxLoadMoreClicks,
      lastClickedSelector: this.lastClickedSelector
    };
  }
}

module.exports = LoadMoreHandler;

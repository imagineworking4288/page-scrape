/**
 * Progress Detector
 * Detects when new content has loaded or when scrolling should stop
 */

class ProgressDetector {
  /**
   * Create a progress detector
   * @param {BrowserAdapter} adapter - Browser adapter instance
   * @param {object} config - Configuration object
   * @param {object} logger - Logger instance
   */
  constructor(adapter, config, logger) {
    this.adapter = adapter;
    this.config = config;
    this.logger = logger;

    // State tracking
    this.lastItemCount = 0;
    this.lastScrollHeight = 0;
    this.noProgressCount = 0;
    this.lastProgressTime = Date.now();
    this.startTime = Date.now();
  }

  /**
   * Reset the detector state
   */
  reset() {
    this.lastItemCount = 0;
    this.lastScrollHeight = 0;
    this.noProgressCount = 0;
    this.lastProgressTime = Date.now();
    this.startTime = Date.now();
  }

  /**
   * Initialize with current page state
   */
  async initialize() {
    if (this.config.itemSelector) {
      this.lastItemCount = await this.adapter.getItemCount(this.config.itemSelector);
    }
    this.lastScrollHeight = await this.adapter.getScrollHeight(this.config.scrollContainer);
    this.lastProgressTime = Date.now();
    this.startTime = Date.now();

    this.logger.debug(`Progress detector initialized: items=${this.lastItemCount}, scrollHeight=${this.lastScrollHeight}`);
  }

  /**
   * Check if progress was made and whether scrolling should continue
   * @returns {object} { hasProgress: boolean, shouldStop: boolean, reason: string, stats: object }
   */
  async checkProgress() {
    const method = this.config.detectionMethod;

    let result;
    switch (method) {
      case 'itemCount':
        result = await this._checkItemCount();
        break;
      case 'scrollHeight':
        result = await this._checkScrollHeight();
        break;
      case 'sentinel':
        result = await this._checkSentinel();
        break;
      default:
        result = await this._checkItemCount();
    }

    // Also check timeout regardless of method
    const timeoutResult = this._checkTimeout();
    if (timeoutResult.shouldStop) {
      return timeoutResult;
    }

    // Check max duration
    const durationResult = this._checkDuration();
    if (durationResult.shouldStop) {
      return durationResult;
    }

    return result;
  }

  /**
   * Check progress based on item count
   * @returns {object} Progress result
   */
  async _checkItemCount() {
    const currentCount = await this.adapter.getItemCount(this.config.itemSelector);
    const hasProgress = currentCount > this.lastItemCount;

    const stats = {
      previousCount: this.lastItemCount,
      currentCount,
      newItems: currentCount - this.lastItemCount
    };

    if (hasProgress) {
      this.logger.debug(`Item count progress: ${this.lastItemCount} -> ${currentCount} (+${stats.newItems})`);
      this.lastItemCount = currentCount;
      this.noProgressCount = 0;
      this.lastProgressTime = Date.now();

      return {
        hasProgress: true,
        shouldStop: false,
        reason: null,
        stats
      };
    } else {
      this.noProgressCount++;
      this.logger.debug(`No item count progress (attempt ${this.noProgressCount}/${this.config.progressTimeout})`);

      const shouldStop = this.noProgressCount >= this.config.progressTimeout;
      return {
        hasProgress: false,
        shouldStop,
        reason: shouldStop ? `No new items for ${this.noProgressCount} consecutive checks` : null,
        stats
      };
    }
  }

  /**
   * Check progress based on scroll height
   * @returns {object} Progress result
   */
  async _checkScrollHeight() {
    const currentHeight = await this.adapter.getScrollHeight(this.config.scrollContainer);
    const hasProgress = currentHeight > this.lastScrollHeight;

    const stats = {
      previousHeight: this.lastScrollHeight,
      currentHeight,
      heightIncrease: currentHeight - this.lastScrollHeight
    };

    if (hasProgress) {
      this.logger.debug(`Scroll height progress: ${this.lastScrollHeight} -> ${currentHeight} (+${stats.heightIncrease}px)`);
      this.lastScrollHeight = currentHeight;
      this.noProgressCount = 0;
      this.lastProgressTime = Date.now();

      return {
        hasProgress: true,
        shouldStop: false,
        reason: null,
        stats
      };
    } else {
      this.noProgressCount++;
      this.logger.debug(`No scroll height progress (attempt ${this.noProgressCount}/${this.config.progressTimeout})`);

      const shouldStop = this.noProgressCount >= this.config.progressTimeout;
      return {
        hasProgress: false,
        shouldStop,
        reason: shouldStop ? `No scroll height increase for ${this.noProgressCount} consecutive checks` : null,
        stats
      };
    }
  }

  /**
   * Check for sentinel element (end of content marker)
   * @returns {object} Progress result
   */
  async _checkSentinel() {
    if (!this.config.sentinelSelector) {
      this.logger.warn('Sentinel detection enabled but no sentinelSelector provided');
      return await this._checkItemCount();
    }

    const sentinelVisible = await this.adapter.isElementVisible(this.config.sentinelSelector);

    if (sentinelVisible) {
      this.logger.info(`Sentinel element detected: ${this.config.sentinelSelector}`);
      return {
        hasProgress: false,
        shouldStop: true,
        reason: 'End of content sentinel detected',
        stats: { sentinelSelector: this.config.sentinelSelector }
      };
    }

    // If sentinel not found, fall back to item count to track progress
    return await this._checkItemCount();
  }

  /**
   * Check if progress timeout has been exceeded (now attempt-based, not time-based)
   * Note: Time-based check disabled - we use attempt-based checking in _checkItemCount
   * @returns {object} Progress result
   */
  _checkTimeout() {
    // Disabled time-based timeout - using attempt-based in _checkItemCount instead
    // This prevents premature stopping on slow-loading pages
    return {
      hasProgress: false,
      shouldStop: false,
      reason: null,
      stats: { noProgressCount: this.noProgressCount, progressTimeout: this.config.progressTimeout }
    };
  }

  /**
   * Check if max duration has been exceeded
   * @returns {object} Progress result
   */
  _checkDuration() {
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    const maxSeconds = this.config.maxDurationSeconds;

    if (elapsedSeconds >= maxSeconds) {
      return {
        hasProgress: false,
        shouldStop: true,
        reason: `Maximum duration of ${maxSeconds} seconds reached`,
        stats: { elapsedSeconds, maxSeconds }
      };
    }

    return {
      hasProgress: false,
      shouldStop: false,
      reason: null,
      stats: { elapsedSeconds, maxSeconds }
    };
  }

  /**
   * Get current statistics
   * @returns {object} Current stats
   */
  getStats() {
    return {
      itemCount: this.lastItemCount,
      scrollHeight: this.lastScrollHeight,
      noProgressCount: this.noProgressCount,
      elapsedSeconds: (Date.now() - this.startTime) / 1000,
      secondsSinceProgress: (Date.now() - this.lastProgressTime) / 1000
    };
  }
}

module.exports = ProgressDetector;

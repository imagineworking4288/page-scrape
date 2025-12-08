/**
 * Scroll Engine
 * Main orchestration for infinite scroll loading
 */

const ProgressDetector = require('./progress-detector');
const LoadMoreHandler = require('./load-more-handler');
const humanBehavior = require('./human-behavior');

class ScrollEngine {
  /**
   * Create a scroll engine
   * @param {BrowserAdapter} adapter - Browser adapter instance
   * @param {object} config - Configuration object
   * @param {object} logger - Logger instance
   */
  constructor(adapter, config, logger) {
    this.adapter = adapter;
    this.config = config;
    this.logger = logger;

    // Initialize sub-components
    this.progressDetector = new ProgressDetector(adapter, config, logger);
    this.loadMoreHandler = new LoadMoreHandler(adapter, config, logger);

    // State tracking
    this.scrollAttempts = 0;
    this.startTime = null;
    this.running = false;
  }

  /**
   * Run the scroll engine
   * @returns {object} { success: boolean, stats: object, html: string, error: string|null }
   */
  async run() {
    this.running = true;
    this.startTime = Date.now();
    this.scrollAttempts = 0;

    try {
      // Initialize progress detector with current page state
      await this.progressDetector.initialize();

      this.logger.info('Scroll engine started');
      this.logger.info(`Detection method: ${this.config.detectionMethod}`);
      this.logger.info(`Item selector: ${this.config.itemSelector}`);

      // Main scroll loop
      while (this.running) {
        // Check max scroll attempts
        if (this.scrollAttempts >= this.config.maxScrollAttempts) {
          this.logger.info(`Maximum scroll attempts (${this.config.maxScrollAttempts}) reached`);
          break;
        }

        // Perform one scroll iteration
        const iterationResult = await this._performScrollIteration();

        if (iterationResult.shouldStop) {
          this.logger.info(`Stopping: ${iterationResult.reason}`);
          break;
        }

        this.scrollAttempts++;
      }

      // Get final HTML and stats
      const html = await this.adapter.getPageContent();
      const stats = this._buildFinalStats();

      this.logger.info('Scroll engine completed successfully');
      this.logger.info(`Final stats: ${JSON.stringify(stats)}`);

      return {
        success: true,
        stats,
        html,
        error: null
      };

    } catch (error) {
      this.logger.error(`Scroll engine error: ${error.message}`);

      return {
        success: false,
        stats: this._buildFinalStats(),
        html: null,
        error: error.message
      };

    } finally {
      this.running = false;
    }
  }

  /**
   * Stop the scroll engine
   */
  stop() {
    this.running = false;
    this.logger.info('Scroll engine stop requested');
  }

  /**
   * Scroll to the trigger zone near the bottom of the page
   * Infinite scroll typically triggers when user is within ~500-1000px of bottom
   * @returns {object} { scrolled: boolean, reachedBottom: boolean }
   */
  async _scrollToTriggerZone() {
    const viewportHeight = this.config.viewport?.height || 1080;
    const currentHeight = await this.adapter.getScrollHeight(this.config.scrollContainer);
    const currentPosition = await this.adapter.getScrollPosition(this.config.scrollContainer);

    // Target position: 500px above the bottom (trigger zone)
    const targetPosition = currentHeight - viewportHeight - 500;
    const scrollAmount = Math.max(0, targetPosition - currentPosition);

    if (scrollAmount > 100) {
      this.logger.debug(`Scrolling ${scrollAmount}px to trigger zone (${viewportHeight}px from bottom)`);
      await this.adapter.scrollBy(scrollAmount, this.config.scrollContainer);
      return { scrolled: true, reachedBottom: false };
    } else {
      this.logger.debug('At trigger zone, scrolling to bottom');
      await this.adapter.scrollToBottom(this.config.scrollContainer);
      return { scrolled: true, reachedBottom: true };
    }
  }

  /**
   * Perform a single scroll iteration
   * @returns {object} { shouldStop: boolean, reason: string|null }
   */
  async _performScrollIteration() {
    const iterationStart = Date.now();

    // Log progress at start of iteration
    const progressStats = this.progressDetector.getStats();
    this.logger.info(
      `Scroll ${this.scrollAttempts + 1}: ` +
      `Items=${progressStats.itemCount} ` +
      `Height=${progressStats.scrollHeight}px ` +
      `NoProgress=${progressStats.noProgressCount}/${this.config.progressTimeout}`
    );

    // Scroll to trigger zone (near bottom where infinite scroll triggers)
    await this._scrollToTriggerZone();

    // Wait after scroll (human-like behavior)
    const waitTime = humanBehavior.getWaitTime(this.config, 'scroll');
    await this.adapter.waitFor(waitTime);

    // Occasionally add an extra random pause
    if (humanBehavior.shouldAddRandomPause(0.1)) {
      const pauseDuration = humanBehavior.getRandomPauseDuration();
      this.logger.debug(`Adding random pause: ${pauseDuration}ms`);
      await this.adapter.waitFor(pauseDuration);
    }

    // Wait for any content to load
    await this.adapter.waitFor(this.config.waitForContent);

    // Try clicking load more button if available
    const loadMoreResult = await this.loadMoreHandler.checkAndClick();
    if (loadMoreResult.clicked) {
      this.logger.debug(`Load more clicked: ${loadMoreResult.selector}`);
      // Wait additional time after clicking load more
      await this.adapter.waitFor(this.config.waitForContent);
    }

    // Check progress
    const progressResult = await this.progressDetector.checkProgress();

    // Log progress
    const iterationDuration = Date.now() - iterationStart;
    this.logger.debug(`Iteration completed in ${iterationDuration}ms, hasProgress=${progressResult.hasProgress}`);

    return {
      shouldStop: progressResult.shouldStop,
      reason: progressResult.reason
    };
  }

  /**
   * Build final statistics object
   * @returns {object} Statistics
   */
  _buildFinalStats() {
    const progressStats = this.progressDetector.getStats();
    const loadMoreStats = this.loadMoreHandler.getStats();
    const durationSeconds = (Date.now() - (this.startTime || Date.now())) / 1000;

    return {
      scrollAttempts: this.scrollAttempts,
      maxScrollAttempts: this.config.maxScrollAttempts,
      durationSeconds: Math.round(durationSeconds * 10) / 10,
      maxDurationSeconds: this.config.maxDurationSeconds,
      finalItemCount: progressStats.itemCount,
      finalScrollHeight: progressStats.scrollHeight,
      loadMoreClicks: loadMoreStats.clickCount,
      detectionMethod: this.config.detectionMethod,
      stoppedReason: this.running ? 'still running' : 'completed'
    };
  }
}

module.exports = ScrollEngine;

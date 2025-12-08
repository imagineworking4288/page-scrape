/**
 * Scrollbar Position Monitor
 *
 * Monitors browser scrollbar position to detect page load completion.
 * More reliable than height-based detection for infinite scroll pages.
 *
 * Approach:
 * - Tracks scrollbar position as percentage (0-100%)
 * - Considers page "fully loaded" when scrollbar is at bottom AND stable
 * - Uses smooth auto-scroll with periodic stability checks
 * - Handles edge cases like no scrollbar, slow lazy-loading
 */

class ScrollbarMonitor {
  constructor(page, logger) {
    this.page = page;
    this.logger = logger;
  }

  /**
   * Get current scrollbar position as percentage (0-100%)
   * @returns {Promise<Object>} Position details
   */
  async getScrollbarPosition() {
    return await this.page.evaluate(() => {
      const scrollTop = window.scrollY;
      const scrollHeight = document.body.scrollHeight;
      const viewportHeight = window.innerHeight;
      const maxScroll = scrollHeight - viewportHeight;

      // Handle edge case where page fits in viewport
      if (maxScroll <= 0) {
        return {
          scrollTop: 0,
          scrollHeight,
          viewportHeight,
          maxScroll: 0,
          percentage: 100
        };
      }

      const percentage = (scrollTop / maxScroll) * 100;

      return {
        scrollTop,
        scrollHeight,
        viewportHeight,
        maxScroll,
        percentage: Math.min(100, Math.max(0, percentage))
      };
    });
  }

  /**
   * Check if scrollbar is at bottom (within tolerance)
   * @param {number} tolerance - Percentage tolerance (default 1%)
   * @returns {Promise<boolean>}
   */
  async isAtBottom(tolerance = 1) {
    const position = await this.getScrollbarPosition();
    return position.percentage >= (100 - tolerance);
  }

  /**
   * Check if scrollbar has moved significantly
   * @param {number} currentPos - Current percentage
   * @param {number} previousPos - Previous percentage
   * @param {number} threshold - Movement threshold
   * @returns {boolean}
   */
  hasScrollbarMoved(currentPos, previousPos, threshold = 0.5) {
    return Math.abs(currentPos - previousPos) > threshold;
  }

  /**
   * Scroll to bottom with smooth animation
   */
  async scrollToBottom() {
    await this.page.evaluate(() => {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
      });
    });
  }

  /**
   * Wait for scrollbar to stabilize at bottom
   * Returns when scrollbar is at threshold%+ and hasn't moved for specified checks
   * @param {Object} options - Configuration options
   * @returns {Promise<Object>} Result with success status and details
   */
  async waitForScrollbarStability(options = {}) {
    const {
      stabilityChecks = 10,         // Number of consecutive stable checks needed (10 = 5 seconds at 500ms)
      checkInterval = 500,          // Time between checks in ms
      scrollbarThreshold = 99,      // Percentage to consider "at bottom"
      movementTolerance = 0.5,      // Max percentage change to still consider "stable"
      maxWaitTime = 180000,         // Max 3 minutes
      onProgress = null             // Optional progress callback
    } = options;

    const startTime = Date.now();
    let stableCount = 0;
    let previousPosition = null;
    let checkCount = 0;
    let previousScrollHeight = 0;

    this.logger.info(`[ScrollbarMonitor] Starting stability monitoring`);
    this.logger.info(`[ScrollbarMonitor] Target: ${stabilityChecks} consecutive checks at ${scrollbarThreshold}%+`);

    while (stableCount < stabilityChecks) {
      checkCount++;

      // Check timeout
      if (Date.now() - startTime > maxWaitTime) {
        this.logger.warn(`[ScrollbarMonitor] Timeout after ${Math.floor(maxWaitTime / 1000)}s`);
        return {
          success: false,
          reason: 'timeout',
          finalPosition: previousPosition,
          checksPerformed: checkCount
        };
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, checkInterval));

      // Get current scrollbar position
      const position = await this.getScrollbarPosition();
      const currentPercentage = position.percentage;

      // Check if scroll height increased (new content loaded)
      if (position.scrollHeight > previousScrollHeight) {
        this.logger.info(`[ScrollbarMonitor] Page grew: ${previousScrollHeight} → ${position.scrollHeight}px`);
        previousScrollHeight = position.scrollHeight;

        // Scroll to new bottom
        await this.scrollToBottom();

        // Reset stability counter since content is still loading
        stableCount = 0;
        previousPosition = null;
        continue;
      }

      // Check if at bottom
      if (currentPercentage >= scrollbarThreshold) {
        // Check if position is stable
        if (previousPosition !== null) {
          const moved = this.hasScrollbarMoved(currentPercentage, previousPosition, movementTolerance);

          if (!moved) {
            // Scrollbar is stable at bottom
            stableCount++;

            // Only log every few checks to reduce noise
            if (stableCount % 2 === 0 || stableCount === stabilityChecks) {
              this.logger.info(`[ScrollbarMonitor] ✓ Stable at bottom (${stableCount}/${stabilityChecks})`);
            }
          } else {
            // Scrollbar moved
            stableCount = 0;
            this.logger.info(`[ScrollbarMonitor] ⚠ Scrollbar moved: ${previousPosition.toFixed(1)}% → ${currentPercentage.toFixed(1)}%`);
          }
        }
      } else {
        // Not at bottom yet - scroll down
        stableCount = 0;
        this.logger.info(`[ScrollbarMonitor] Scrolling: ${currentPercentage.toFixed(1)}%`);
        await this.scrollToBottom();
      }

      previousPosition = currentPercentage;
      previousScrollHeight = position.scrollHeight;

      // Call progress callback if provided
      if (onProgress) {
        try {
          await onProgress({
            percentage: currentPercentage,
            scrollHeight: position.scrollHeight,
            stableCount,
            checksPerformed: checkCount
          });
        } catch (e) {
          // Ignore callback errors
        }
      }
    }

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    this.logger.info(`[ScrollbarMonitor] ✓ Scrollbar stable at bottom after ${elapsed}s (${checkCount} checks)`);

    return {
      success: true,
      reason: 'stable',
      finalPosition: previousPosition,
      checksPerformed: checkCount,
      elapsed
    };
  }

  /**
   * Check if page has scrollbar (content exceeds viewport)
   * @returns {Promise<boolean>}
   */
  async hasScrollbar() {
    return await this.page.evaluate(() => {
      return document.body.scrollHeight > window.innerHeight;
    });
  }

  /**
   * Get page dimensions for diagnostics
   * @returns {Promise<Object>}
   */
  async getPageDimensions() {
    return await this.page.evaluate(() => {
      return {
        scrollHeight: document.body.scrollHeight,
        viewportHeight: window.innerHeight,
        scrollTop: window.scrollY,
        hasScrollbar: document.body.scrollHeight > window.innerHeight
      };
    });
  }
}

module.exports = ScrollbarMonitor;

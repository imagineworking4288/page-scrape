/**
 * Human behavior simulation for anti-detection
 * Provides randomization functions to mimic human scrolling patterns
 */

/**
 * Generate a random number within a range
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (inclusive)
 * @returns {number} Random number in range
 */
function randomInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a random float within a range
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random float in range
 */
function randomFloatInRange(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Get a random scroll amount based on config
 * @param {object} config - Configuration object with scrollAmount.min and scrollAmount.max
 * @returns {number} Random scroll distance in pixels
 */
function getScrollAmount(config) {
  const { min, max } = config.scrollAmount;
  return randomInRange(min, max);
}

/**
 * Get a random wait time based on config and type
 * @param {object} config - Configuration object
 * @param {string} type - 'scroll' or 'loadMore'
 * @returns {number} Wait time in milliseconds
 */
function getWaitTime(config, type = 'scroll') {
  let range;
  if (type === 'scroll') {
    range = config.waitAfterScroll;
  } else if (type === 'loadMore') {
    range = config.loadMoreClickDelay;
  } else {
    range = config.waitAfterScroll;
  }
  return randomInRange(range.min, range.max);
}

/**
 * Add jitter (random variation) to a base value
 * @param {number} baseValue - The base value
 * @param {number} jitterPercent - Percentage of variation (0-100)
 * @returns {number} Value with jitter applied
 */
function addJitter(baseValue, jitterPercent = 20) {
  const jitterRange = baseValue * (jitterPercent / 100);
  const jitter = randomFloatInRange(-jitterRange, jitterRange);
  return Math.round(baseValue + jitter);
}

/**
 * Calculate exponential backoff delay
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} maxDelay - Maximum delay cap
 * @returns {number} Delay in milliseconds
 */
function exponentialBackoff(attempt, baseDelay = 1000, maxDelay = 30000) {
  const delay = baseDelay * Math.pow(2, attempt);
  const jitteredDelay = addJitter(delay, 25);
  return Math.min(jitteredDelay, maxDelay);
}

/**
 * Decide if we should add an extra pause (simulating human distraction)
 * @param {number} probability - Probability of pause (0-1)
 * @returns {boolean} Whether to pause
 */
function shouldAddRandomPause(probability = 0.1) {
  return Math.random() < probability;
}

/**
 * Get a random pause duration (for human-like breaks)
 * @returns {number} Pause duration in milliseconds (500-2000ms)
 */
function getRandomPauseDuration() {
  return randomInRange(500, 2000);
}

/**
 * Generate a series of micro-scrolls to simulate smooth human scrolling
 * @param {number} totalDistance - Total distance to scroll
 * @param {number} steps - Number of micro-scrolls
 * @returns {array} Array of scroll amounts
 */
function generateMicroScrolls(totalDistance, steps = 5) {
  const scrolls = [];
  let remaining = totalDistance;

  for (let i = 0; i < steps - 1; i++) {
    // Each scroll is a random portion of remaining distance
    const portion = randomFloatInRange(0.15, 0.35);
    const scrollAmount = Math.round(remaining * portion);
    scrolls.push(scrollAmount);
    remaining -= scrollAmount;
  }

  // Last scroll gets whatever is remaining
  scrolls.push(remaining);

  return scrolls;
}

/**
 * Get a human-like typing delay (for any text input simulation)
 * @returns {number} Delay in milliseconds
 */
function getTypingDelay() {
  return randomInRange(50, 150);
}

module.exports = {
  randomInRange,
  randomFloatInRange,
  getScrollAmount,
  getWaitTime,
  addJitter,
  exponentialBackoff,
  shouldAddRandomPause,
  getRandomPauseDuration,
  generateMicroScrolls,
  getTypingDelay
};

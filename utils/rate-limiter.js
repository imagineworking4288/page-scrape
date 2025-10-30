const logger = require('./logger');

class RateLimiter {
  constructor() {
    this.minDelay = 2000; // 2 seconds minimum
    this.maxDelay = 5000; // 5 seconds maximum
    this.backoffMultiplier = 1.5;
    this.maxRetries = 3;
    this.lastRequestTime = 0;
  }

  /**
   * Wait before making the next request
   * Adds random delay between minDelay and maxDelay for human-like behavior
   */
  async waitBeforeRequest() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    // Calculate random delay with jitter
    const randomDelay = Math.random() * (this.maxDelay - this.minDelay) + this.minDelay;
    
    // If not enough time has passed, wait for the remaining time plus random jitter
    if (timeSinceLastRequest < randomDelay) {
      const waitTime = randomDelay - timeSinceLastRequest;
      logger.debug(`Rate limiting: waiting ${(waitTime / 1000).toFixed(2)}s before next request`);
      await this.sleep(waitTime);
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Retry a function with exponential backoff
   * @param {Function} fn - Async function to retry
   * @param {string} context - Description of the operation for logging
   * @returns {Promise} Result of the function
   */
  async retryWithBackoff(fn, context = 'operation') {
    let lastError;
    let currentDelay = this.minDelay;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.debug(`${context} - Attempt ${attempt}/${this.maxRetries}`);
        
        // Wait before request (except first attempt)
        if (attempt > 1) {
          const backoffDelay = currentDelay * Math.pow(this.backoffMultiplier, attempt - 1);
          const jitteredDelay = backoffDelay * (0.8 + Math.random() * 0.4); // +/- 20% jitter
          
          logger.info(`Retrying ${context} after ${(jitteredDelay / 1000).toFixed(2)}s (attempt ${attempt}/${this.maxRetries})`);
          await this.sleep(jitteredDelay);
        }
        
        // Execute the function
        const result = await fn();
        
        // Success - reset delay and return
        if (attempt > 1) {
          logger.info(`${context} succeeded on attempt ${attempt}`);
        }
        return result;
        
      } catch (error) {
        lastError = error;
        logger.warn(`${context} failed (attempt ${attempt}/${this.maxRetries}): ${error.message}`);
        
        // Don't retry CAPTCHA errors
        if (error.message === 'CAPTCHA_DETECTED') {
          throw error;
        }
        
        // If this was the last attempt, throw the error
        if (attempt === this.maxRetries) {
          logger.error(`${context} failed after ${this.maxRetries} attempts`);
          throw lastError;
        }
      }
    }
    
    // Should never reach here, but just in case
    throw lastError;
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Add random human-like delay
   * Useful for simulating user actions like scrolling or clicking
   * @param {number} baseMs - Base delay in milliseconds
   * @param {number} variance - Variance percentage (0-1)
   */
  async randomDelay(baseMs = 1000, variance = 0.3) {
    const minMs = baseMs * (1 - variance);
    const maxMs = baseMs * (1 + variance);
    const delay = Math.random() * (maxMs - minMs) + minMs;
    
    logger.debug(`Random delay: ${(delay / 1000).toFixed(2)}s`);
    await this.sleep(delay);
  }

  /**
   * Set custom delay range
   * @param {number} minMs - Minimum delay in milliseconds
   * @param {number} maxMs - Maximum delay in milliseconds
   */
  setDelayRange(minMs, maxMs) {
    if (minMs < 0 || maxMs < minMs) {
      throw new Error('Invalid delay range');
    }
    this.minDelay = minMs;
    this.maxDelay = maxMs;
    logger.info(`Rate limiter delay range updated: ${minMs}-${maxMs}ms`);
  }

  /**
   * Set maximum number of retries
   * @param {number} retries - Number of retries (1-10)
   */
  setMaxRetries(retries) {
    if (retries < 1 || retries > 10) {
      throw new Error('Max retries must be between 1 and 10');
    }
    this.maxRetries = retries;
    logger.info(`Max retries updated: ${retries}`);
  }

  /**
   * Reset the last request time
   * Useful when starting a new scraping session
   */
  reset() {
    this.lastRequestTime = 0;
    logger.debug('Rate limiter reset');
  }
}

module.exports = RateLimiter;

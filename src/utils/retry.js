/**
 * Retry Utility Module
 *
 * Provides robust retry logic with exponential backoff for operations
 * that may fail transiently (network requests, browser operations, etc.)
 */

/**
 * Default retry configuration
 */
const DEFAULT_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,      // 1 second
  maxDelay: 30000,         // 30 seconds
  backoffMultiplier: 2,
  jitter: true,            // Add randomness to prevent thundering herd
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'EPIPE',
    'ENOTFOUND',
    'ENETUNREACH',
    'EAI_AGAIN',
    'Protocol error',
    'Target closed',
    'Session closed',
    'Navigation timeout',
    'net::ERR_'
  ]
};

/**
 * RetryHandler class for managing retry operations
 */
class RetryHandler {
  /**
   * @param {Object} options - Configuration options
   * @param {number} options.maxRetries - Maximum number of retry attempts
   * @param {number} options.initialDelay - Initial delay in ms before first retry
   * @param {number} options.maxDelay - Maximum delay between retries
   * @param {number} options.backoffMultiplier - Multiplier for exponential backoff
   * @param {boolean} options.jitter - Whether to add random jitter to delays
   * @param {Array<string>} options.retryableErrors - Error patterns that should trigger retry
   * @param {Object} options.logger - Logger instance (defaults to console)
   */
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.logger = options.logger || console;
  }

  /**
   * Calculate delay for a given attempt number with exponential backoff
   * @param {number} attempt - Current attempt number (0-indexed)
   * @returns {number} - Delay in milliseconds
   */
  calculateDelay(attempt) {
    let delay = this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attempt);
    delay = Math.min(delay, this.config.maxDelay);

    if (this.config.jitter) {
      // Add up to 25% jitter
      const jitterFactor = 0.75 + Math.random() * 0.5;
      delay = Math.round(delay * jitterFactor);
    }

    return delay;
  }

  /**
   * Check if an error is retryable based on configured patterns
   * @param {Error} error - The error to check
   * @returns {boolean} - Whether the error is retryable
   */
  isRetryable(error) {
    if (!error) return false;

    const errorString = error.message || error.toString();
    const errorCode = error.code || '';

    return this.config.retryableErrors.some(pattern => {
      return errorString.includes(pattern) || errorCode.includes(pattern);
    });
  }

  /**
   * Execute an operation with retry logic
   * @param {Function} operation - Async function to execute
   * @param {string} context - Description of the operation for logging
   * @param {Object} options - Override options for this specific call
   * @returns {Promise<*>} - Result of the operation
   */
  async execute(operation, context = 'operation', options = {}) {
    const config = { ...this.config, ...options };
    let lastError = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.calculateDelay(attempt - 1);
          this.logger.info(`[Retry] ${context} - Attempt ${attempt + 1}/${config.maxRetries + 1} after ${delay}ms delay`);
          await this.sleep(delay);
        }

        const result = await operation();

        if (attempt > 0) {
          this.logger.info(`[Retry] ${context} - Succeeded on attempt ${attempt + 1}`);
        }

        return result;

      } catch (error) {
        lastError = error;

        const isRetryable = this.isRetryable(error);
        const hasRetriesLeft = attempt < config.maxRetries;

        this.logger.warn(
          `[Retry] ${context} - Attempt ${attempt + 1} failed: ${error.message}`,
          { retryable: isRetryable, hasRetriesLeft }
        );

        if (!isRetryable || !hasRetriesLeft) {
          break;
        }
      }
    }

    this.logger.error(`[Retry] ${context} - All ${config.maxRetries + 1} attempts failed`);
    throw lastError;
  }

  /**
   * Execute with custom retry condition
   * @param {Function} operation - Async function to execute
   * @param {Function} shouldRetry - Function(error, attempt) => boolean
   * @param {string} context - Description of the operation
   * @returns {Promise<*>} - Result of the operation
   */
  async executeWithCondition(operation, shouldRetry, context = 'operation') {
    let lastError = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.calculateDelay(attempt - 1);
          this.logger.info(`[Retry] ${context} - Attempt ${attempt + 1} after ${delay}ms delay`);
          await this.sleep(delay);
        }

        return await operation();

      } catch (error) {
        lastError = error;

        if (!shouldRetry(error, attempt) || attempt >= this.config.maxRetries) {
          break;
        }
      }
    }

    throw lastError;
  }

  /**
   * Promise-based sleep
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Convenience function for one-off retry operations
 * @param {Function} operation - Async function to execute
 * @param {Object} options - Retry configuration options
 * @returns {Promise<*>} - Result of the operation
 */
async function withRetry(operation, options = {}) {
  const handler = new RetryHandler(options);
  return handler.execute(operation, options.context || 'operation');
}

/**
 * Decorator-style retry wrapper for class methods
 * @param {Object} options - Retry configuration options
 * @returns {Function} - Method decorator
 */
function retryable(options = {}) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    const handler = new RetryHandler(options);

    descriptor.value = async function(...args) {
      return handler.execute(
        () => originalMethod.apply(this, args),
        `${target.constructor.name}.${propertyKey}`
      );
    };

    return descriptor;
  };
}

/**
 * Circuit breaker for preventing cascade failures
 */
class CircuitBreaker {
  /**
   * @param {Object} options - Configuration
   * @param {number} options.failureThreshold - Failures before opening circuit
   * @param {number} options.successThreshold - Successes before closing circuit
   * @param {number} options.timeout - Time in ms before attempting to close
   */
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 60000; // 1 minute

    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = null;
    this.logger = options.logger || console;
  }

  /**
   * Execute an operation through the circuit breaker
   * @param {Function} operation - Async function to execute
   * @param {string} context - Description for logging
   * @returns {Promise<*>}
   */
  async execute(operation, context = 'operation') {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure > this.timeout) {
        this.logger.info(`[CircuitBreaker] ${context} - Transitioning to HALF-OPEN`);
        this.state = 'HALF-OPEN';
        this.successes = 0;
      } else {
        throw new Error(`Circuit breaker OPEN for ${context}`);
      }
    }

    try {
      const result = await operation();

      if (this.state === 'HALF-OPEN') {
        this.successes++;
        if (this.successes >= this.successThreshold) {
          this.logger.info(`[CircuitBreaker] ${context} - Transitioning to CLOSED`);
          this.state = 'CLOSED';
          this.failures = 0;
        }
      } else {
        this.failures = 0;
      }

      return result;

    } catch (error) {
      this.failures++;
      this.lastFailure = Date.now();

      if (this.failures >= this.failureThreshold) {
        this.logger.warn(`[CircuitBreaker] ${context} - Transitioning to OPEN after ${this.failures} failures`);
        this.state = 'OPEN';
      }

      throw error;
    }
  }

  /**
   * Get current circuit state
   * @returns {string} - 'CLOSED', 'OPEN', or 'HALF-OPEN'
   */
  getState() {
    return this.state;
  }

  /**
   * Force reset the circuit to closed state
   */
  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = null;
  }
}

module.exports = {
  RetryHandler,
  withRetry,
  retryable,
  CircuitBreaker,
  DEFAULT_CONFIG
};

/**
 * General utility helpers
 */

/**
 * Promise-based sleep/delay
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Resolves after delay
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format duration in milliseconds to human readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "2m 30s" or "45s")
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Format bytes to human readable string
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Validate a CSS selector
 * @param {string} selector - CSS selector to validate
 * @returns {boolean} Whether selector is valid
 */
function isValidSelector(selector) {
  if (!selector || typeof selector !== 'string') {
    return false;
  }
  try {
    document.createDocumentFragment().querySelector(selector);
    return true;
  } catch (e) {
    // In Node.js environment, do basic validation
    if (typeof document === 'undefined') {
      // Basic check for common invalid patterns
      return selector.length > 0 && !selector.includes('{}');
    }
    return false;
  }
}

/**
 * Sanitize and validate URL
 * @param {string} url - URL to sanitize
 * @returns {string} Sanitized URL
 * @throws {Error} If URL is invalid
 */
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('URL is required and must be a string');
  }

  url = url.trim();

  // Add protocol if missing
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  try {
    const parsed = new URL(url);
    return parsed.href;
  } catch (e) {
    throw new Error(`Invalid URL: ${url}`);
  }
}

/**
 * Calculate progress percentage
 * @param {number} current - Current value
 * @param {number} total - Total value
 * @returns {number} Percentage (0-100)
 */
function calculateProgress(current, total) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((current / total) * 100));
}

/**
 * Retry an async function with exponential backoff
 * @param {function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise} Result of function
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Truncate string to max length
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add if truncated
 * @returns {string} Truncated string
 */
function truncate(str, maxLength = 100, suffix = '...') {
  if (!str || str.length <= maxLength) return str;
  return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Check if value is a plain object
 * @param {any} value - Value to check
 * @returns {boolean} Whether value is plain object
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && value.constructor === Object;
}

/**
 * Deep merge objects
 * @param {object} target - Target object
 * @param  {...object} sources - Source objects
 * @returns {object} Merged object
 */
function deepMerge(target, ...sources) {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isPlainObject(target) && isPlainObject(source)) {
    for (const key in source) {
      if (isPlainObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        deepMerge(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return deepMerge(target, ...sources);
}

module.exports = {
  sleep,
  formatDuration,
  formatBytes,
  isValidSelector,
  sanitizeUrl,
  calculateProgress,
  retryWithBackoff,
  truncate,
  isPlainObject,
  deepMerge
};

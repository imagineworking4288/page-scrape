/**
 * Configuration loader and validator
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const defaultConfig = require('./default-config');

const VALID_DETECTION_METHODS = ['itemCount', 'scrollHeight', 'sentinel'];

/**
 * Load configuration from a YAML or JSON file
 * @param {string} filePath - Path to config file
 * @returns {object} Parsed configuration object
 */
function loadConfig(filePath) {
  if (!filePath) {
    return { ...defaultConfig };
  }

  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`);
  }

  const fileContent = fs.readFileSync(absolutePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();

  let userConfig;
  if (ext === '.yaml' || ext === '.yml') {
    userConfig = yaml.load(fileContent);
  } else if (ext === '.json') {
    userConfig = JSON.parse(fileContent);
  } else {
    throw new Error(`Unsupported config file format: ${ext}. Use .yaml, .yml, or .json`);
  }

  return mergeWithDefaults(userConfig);
}

/**
 * Merge user configuration with defaults
 * @param {object} userConfig - User provided configuration
 * @returns {object} Merged configuration
 */
function mergeWithDefaults(userConfig) {
  const merged = { ...defaultConfig };

  for (const key of Object.keys(userConfig)) {
    if (userConfig[key] !== undefined && userConfig[key] !== null) {
      // Deep merge for nested objects like scrollAmount, viewport
      if (typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key]) &&
          typeof merged[key] === 'object' && !Array.isArray(merged[key])) {
        merged[key] = { ...merged[key], ...userConfig[key] };
      } else {
        merged[key] = userConfig[key];
      }
    }
  }

  return merged;
}

/**
 * Validate configuration object
 * @param {object} config - Configuration to validate
 * @throws {Error} If validation fails
 */
function validateConfig(config) {
  const errors = [];

  // Required field check
  if (!config.itemSelector) {
    errors.push('itemSelector is required');
  }

  // Detection method validation
  if (!VALID_DETECTION_METHODS.includes(config.detectionMethod)) {
    errors.push(`detectionMethod must be one of: ${VALID_DETECTION_METHODS.join(', ')}`);
  }

  // Sentinel required for sentinel detection
  if (config.detectionMethod === 'sentinel' && !config.sentinelSelector) {
    errors.push('sentinelSelector is required when detectionMethod is "sentinel"');
  }

  // Numeric range validations
  validateRange(config.scrollAmount, 'scrollAmount', errors);
  validateRange(config.loadMoreClickDelay, 'loadMoreClickDelay', errors);
  validateRange(config.waitAfterScroll, 'waitAfterScroll', errors);

  // Positive number validations
  if (config.maxScrollAttempts <= 0) {
    errors.push('maxScrollAttempts must be positive');
  }
  if (config.maxDurationSeconds <= 0) {
    errors.push('maxDurationSeconds must be positive');
  }
  if (config.progressTimeout <= 0) {
    errors.push('progressTimeout must be positive');
  }
  if (config.waitForContent <= 0) {
    errors.push('waitForContent must be positive');
  }
  if (config.maxLoadMoreClicks < 0) {
    errors.push('maxLoadMoreClicks must be non-negative');
  }

  // Viewport validation
  if (config.viewport) {
    if (config.viewport.width <= 0) {
      errors.push('viewport.width must be positive');
    }
    if (config.viewport.height <= 0) {
      errors.push('viewport.height must be positive');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n  - ${errors.join('\n  - ')}`);
  }

  return true;
}

/**
 * Validate a min/max range object
 * @param {object} range - Range object with min and max
 * @param {string} name - Name of the field for error messages
 * @param {array} errors - Array to push errors to
 */
function validateRange(range, name, errors) {
  if (!range || typeof range !== 'object') {
    errors.push(`${name} must be an object with min and max`);
    return;
  }
  if (typeof range.min !== 'number' || typeof range.max !== 'number') {
    errors.push(`${name}.min and ${name}.max must be numbers`);
    return;
  }
  if (range.min < 0) {
    errors.push(`${name}.min must be non-negative`);
  }
  if (range.max < range.min) {
    errors.push(`${name}.max must be >= ${name}.min`);
  }
}

module.exports = {
  loadConfig,
  validateConfig,
  mergeWithDefaults,
  defaultConfig
};

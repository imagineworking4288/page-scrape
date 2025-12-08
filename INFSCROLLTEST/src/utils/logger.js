/**
 * Logger utility for infinite scroll loader
 * Uses Winston for structured logging
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    if (stack) {
      return `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`;
    }
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Console transport with colors
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),

    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'scroll.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 3,
      format: logFormat
    }),

    // Separate file for errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 3,
      format: logFormat
    })
  ]
});

/**
 * Log scroll progress
 * @param {number} iteration - Current iteration
 * @param {number} itemCount - Current item count
 * @param {number} scrollHeight - Current scroll height
 */
logger.logScrollProgress = function(iteration, itemCount, scrollHeight) {
  this.info(`Scroll #${iteration}: items=${itemCount}, height=${scrollHeight}px`);
};

/**
 * Log memory usage
 * @returns {string} Formatted memory usage string
 */
logger.logMemory = function() {
  const memUsage = process.memoryUsage();
  const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
  const heapTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
  const rssMB = (memUsage.rss / 1024 / 1024).toFixed(2);

  const memoryInfo = `Memory: Heap ${heapUsedMB}/${heapTotalMB}MB, RSS ${rssMB}MB`;
  this.debug(memoryInfo);
  return memoryInfo;
};

/**
 * Log statistics
 * @param {object} stats - Statistics object
 */
logger.logStats = function(stats) {
  this.info('=== Scroll Statistics ===');
  Object.entries(stats).forEach(([key, value]) => {
    this.info(`  ${key}: ${value}`);
  });
  this.info('=========================');
};

/**
 * Format bytes to human readable
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string
 */
logger.formatBytes = function(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Set log level dynamically
 * @param {string} level - Log level (error, warn, info, debug)
 */
logger.setLevel = function(level) {
  this.level = level;
  this.transports.forEach(transport => {
    if (transport.name === 'console') {
      transport.level = level;
    }
  });
};

module.exports = logger;

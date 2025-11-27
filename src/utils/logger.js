const winston = require('winston');
const path = require('path');

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
      filename: path.join('logs', 'scraper.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 3,
      format: logFormat
    }),
    
    // Separate file for errors
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 3,
      format: logFormat
    })
  ]
});

/**
 * Helper function to log memory usage
 * @returns {string} Formatted memory usage string
 */
logger.logMemory = function() {
  const memUsage = process.memoryUsage();
  const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
  const heapTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(2);
  const rssMB = (memUsage.rss / 1024 / 1024).toFixed(2);
  const externalMB = (memUsage.external / 1024 / 1024).toFixed(2);
  
  const memoryInfo = `Memory Usage - Heap: ${heapUsedMB}/${heapTotalMB}MB, RSS: ${rssMB}MB, External: ${externalMB}MB`;
  this.info(memoryInfo);
  return memoryInfo;
};

/**
 * Helper function to format bytes
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
 * Log scraping progress
 * @param {number} current - Current count
 * @param {number} total - Total count
 * @param {string} context - Context description
 */
logger.logProgress = function(current, total, context = 'items') {
  const percentage = total > 0 ? ((current / total) * 100).toFixed(1) : 0;
  this.info(`Progress: ${current}/${total} ${context} (${percentage}%)`);
};

/**
 * Log scraping statistics
 * @param {object} stats - Statistics object
 */
logger.logStats = function(stats) {
  this.info('=== Scraping Statistics ===');
  Object.entries(stats).forEach(([key, value]) => {
    this.info(`  ${key}: ${value}`);
  });
  this.info('==========================');
};

// Handle uncaught exceptions and rejections
logger.exceptions.handle(
  new winston.transports.File({ 
    filename: path.join('logs', 'exceptions.log'),
    maxsize: 5242880,
    maxFiles: 2
  })
);

logger.rejections.handle(
  new winston.transports.File({ 
    filename: path.join('logs', 'rejections.log'),
    maxsize: 5242880,
    maxFiles: 2
  })
);

module.exports = logger;

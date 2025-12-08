/**
 * Default configuration for infinite scroll loader
 */
module.exports = {
  // Item Detection
  itemSelector: null,                    // CSS selector for items (required)
  scrollContainer: 'window',             // 'window' or CSS selector

  // Scroll Behavior
  maxScrollAttempts: 200,                // Maximum scroll iterations
  maxDurationSeconds: 300,               // 5 minutes timeout
  scrollAmount: { min: 1000, max: 1500 },  // Random scroll distance (px) - large to reach trigger zone

  // Progress Detection
  progressTimeout: 5,                    // Consecutive attempts without progress before stopping
  detectionMethod: 'itemCount',          // 'itemCount', 'scrollHeight', 'sentinel'
  sentinelSelector: null,                // Selector for "end of content" element

  // Load More Buttons
  loadMoreSelectors: [],                 // Array of button selectors to try
  loadMoreClickDelay: { min: 1000, max: 2000 },
  maxLoadMoreClicks: 50,

  // Wait Times (ms)
  waitAfterScroll: { min: 1000, max: 2000 },
  waitForContent: 2500,                  // Wait for content after scroll

  // Browser Config
  headless: true,
  viewport: { width: 1920, height: 1080 },
  userAgent: null,

  // Logging
  logLevel: 'info',
  logToFile: false,
  logFilePath: './logs/scroll-log.txt'
};

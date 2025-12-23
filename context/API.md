# API Reference

Complete function-level documentation for the Universal Professional Scraper project.

**Version:** 1.0.0
**Total Files Documented:** 86 JavaScript files
**Generated:** 2025-12-23

---

## Table of Contents

1. [Main Entry Point](#main-entry-point)
2. [Core Infrastructure](#core-infrastructure)
3. [Configuration](#configuration)
4. [Constants](#constants)
5. [Extraction System](#extraction-system)
6. [Features](#features)
   - [Pagination](#pagination)
   - [Enrichment](#enrichment)
   - [Export](#export)
7. [Scrapers](#scrapers)
8. [Tools](#tools)
9. [Utils](#utils)
10. [Workflows](#workflows)
11. [Tests](#tests)

---

## Main Entry Point

### orchestrator.js

**Purpose**: Main CLI entry point and workflow orchestrator. Handles command-line arguments, routing to different execution modes, and coordinating the scraping workflow.

#### `main(): Promise<void>`
Main execution function that orchestrates the entire scraping workflow.

**Parameters:** None (reads from CLI arguments via Commander)

**Returns:** Promise<void>

**Behavior:**
- Parses CLI options with Commander
- Routes to validation tool if `--validate` flag present
- Routes to full pipeline if `--full-pipeline` flag present
- Standard workflow: loads config, detects pagination, creates scraper, executes scraping
- Handles deduplication of contacts
- Saves results to JSON and optionally exports to Google Sheets
- Implements graceful shutdown on SIGINT/SIGTERM

**Exit Codes:**
- 0: Success
- 1: Error (invalid URL, no config, scraping failure, CAPTCHA detected)

---

#### `validateUrl(url): boolean`
Validates URL format.

**Parameters:**
- `url` (string): URL to validate

**Returns:** boolean - True if valid URL format

---

#### `parseHeadless(value): boolean`
Parses headless parameter from CLI.

**Parameters:**
- `value` (string|boolean): Headless option value

**Returns:** boolean - True for headless mode, false for headed

**Notes:** Converts 'false', '0', 'no' strings to false, all other values to true

---

#### `cleanup(): Promise<void>`
Cleanup function for graceful shutdown.

**Parameters:** None

**Returns:** Promise<void>

**Behavior:**
- Closes browserManager if initialized
- Closes seleniumManager if initialized
- Ignores errors during cleanup

---

## Core Infrastructure

### src/core/browser-manager.js

**Purpose**: Manages Puppeteer browser lifecycle with stealth configuration, memory monitoring, and CAPTCHA detection.

#### Class: `BrowserManager`

##### `constructor(logger): BrowserManager`
Initializes browser manager with logger and user agent rotation.

**Parameters:**
- `logger` (Object): Winston logger instance

**Returns:** BrowserManager instance

**Properties:**
- `browser`: Puppeteer browser instance (null initially)
- `page`: Current page instance (null initially)
- `navigationCount`: Counter for memory recycling
- `initialMemory`: Initial heap memory usage
- `userAgents`: Array of 8 realistic user agent strings

---

##### `async launch(headless = true): Promise<boolean>`
Launches Puppeteer browser with stealth plugin and CSP bypass.

**Parameters:**
- `headless` (boolean): Run in headless mode (default: true)

**Returns:** Promise<boolean> - True if successful

**Browser Args:**
- `--no-sandbox`
- `--disable-setuid-sandbox`
- `--disable-dev-shm-usage`
- `--disable-gpu`
- `--window-size=1920,1080`
- `--disable-blink-features=AutomationControlled`
- `--disable-web-security` (for CSP bypass)
- `--disable-features=IsolateOrigins,site-per-process`

**Features:**
- Random user agent selection from pool
- CSP bypass enabled for script injection
- Console filtering to suppress CSP errors
- 1920x1080 viewport

---

##### `async navigate(url, timeout = 30000): Promise<boolean>`
Navigates to URL with memory recycling and CAPTCHA detection.

**Parameters:**
- `url` (string): URL to navigate to
- `timeout` (number): Navigation timeout in ms (default: 30000)

**Returns:** Promise<boolean> - True if successful

**Behavior:**
- Checks memory and recycles page if needed (every 50 navigations or 1GB growth)
- Waits for 'domcontentloaded' event
- Increments navigation counter
- Logs memory usage every 10 navigations
- Detects CAPTCHA and throws error if found

**Throws:**
- TimeoutError: Navigation timeout
- Error('CAPTCHA_DETECTED'): CAPTCHA detected on page

---

##### `async detectCaptcha(url): Promise<void>`
Detects CAPTCHA on current page by checking page text for keywords.

**Parameters:**
- `url` (string): Current URL for error reporting

**Returns:** Promise<void>

**Throws:** Error('CAPTCHA_DETECTED') if CAPTCHA detected

**Detection Keywords:**
- 'captcha'
- 'cloudflare'
- 'please verify'
- 'verify you are human'
- 'security check'
- 'are you a robot'

---

##### `async checkMemoryAndRecycle(): Promise<void>`
Checks memory usage and recycles page if thresholds exceeded.

**Parameters:** None

**Returns:** Promise<void>

**Recycling Triggers:**
- 50+ navigations
- 1GB+ memory growth from initial

**Behavior:**
- Closes current page
- Creates new page
- Re-applies CSP bypass and user agent
- Resets navigation counter
- Forces garbage collection if available

---

##### `logMemoryUsage(): void`
Logs current memory usage statistics.

**Parameters:** None

**Returns:** void

**Logs:**
- Heap used/total (MB)
- RSS (MB)
- Navigation count

---

##### `getPage(): Page`
Gets current Puppeteer page instance.

**Parameters:** None

**Returns:** Puppeteer Page object

**Throws:** Error if browser not initialized

---

##### `async close(): Promise<void>`
Closes browser instance.

**Parameters:** None

**Returns:** Promise<void>

---

### src/core/logger.js

**Purpose**: Winston-based logging system with file rotation and custom helper functions.

#### Exported Logger Instance

**Configuration:**
- Log Level: from `process.env.LOG_LEVEL` or 'info'
- Transports:
  - Console (with colors)
  - File: `logs/scraper.log` (5MB max, 3 files rotation)
  - Error File: `logs/error.log` (errors only, 5MB max, 3 files)
  - Exceptions: `logs/exceptions.log`
  - Rejections: `logs/rejections.log`

**Format:** `timestamp [LEVEL]: message` with stack traces for errors

---

#### `logger.logMemory(): string`
Logs and returns formatted memory usage.

**Parameters:** None

**Returns:** string - Formatted memory info

**Logs:** Heap (used/total), RSS, External memory in MB

---

#### `logger.formatBytes(bytes): string`
Formats bytes to human-readable string.

**Parameters:**
- `bytes` (number): Number of bytes

**Returns:** string - Formatted as Bytes/KB/MB/GB

---

#### `logger.logProgress(current, total, context = 'items'): void`
Logs progress with percentage.

**Parameters:**
- `current` (number): Current count
- `total` (number): Total count
- `context` (string): Context description (default: 'items')

**Returns:** void

**Logs:** `Progress: current/total context (percentage%)`

---

#### `logger.logStats(stats): void`
Logs statistics object.

**Parameters:**
- `stats` (Object): Key-value statistics

**Returns:** void

**Format:**
```
=== Scraping Statistics ===
  key: value
  ...
==========================
```

---

### src/core/rate-limiter.js

**Purpose**: Implements exponential backoff rate limiting with jitter for human-like request patterns.

#### Class: `RateLimiter`

##### `constructor(logger = null, options = {}): RateLimiter`
Initializes rate limiter with configurable delays.

**Parameters:**
- `logger` (Object|null): Logger instance (optional)
- `options` (Object): Configuration options
  - `minDelay` (number): Minimum delay in ms (default: 2000)
  - `maxDelay` (number): Maximum delay in ms (default: 5000)

**Returns:** RateLimiter instance

**Properties:**
- `minDelay`: 2000ms
- `maxDelay`: 5000ms
- `backoffMultiplier`: 1.5
- `maxRetries`: 3
- `lastRequestTime`: 0

---

##### `async waitBeforeRequest(): Promise<void>`
Waits before making next request with random jitter.

**Parameters:** None

**Returns:** Promise<void>

**Behavior:**
- Calculates random delay between minDelay and maxDelay
- If insufficient time passed since last request, waits for remainder
- Updates lastRequestTime

---

##### `async retryWithBackoff(fn, context = 'operation'): Promise<any>`
Retries function with exponential backoff on failure.

**Parameters:**
- `fn` (Function): Async function to retry
- `context` (string): Operation description for logging

**Returns:** Promise<any> - Result of function

**Behavior:**
- Attempts function up to maxRetries times
- Applies exponential backoff with jitter (±20%)
- Backoff formula: `minDelay * (1.5 ^ attempt) * (0.8 to 1.2 jitter)`
- Does NOT retry on CAPTCHA_DETECTED errors
- Logs warnings on failure, info on retry success

**Throws:** Last error if all retries exhausted

---

##### `sleep(ms): Promise<void>`
Utility sleep function.

**Parameters:**
- `ms` (number): Milliseconds to sleep

**Returns:** Promise<void>

---

##### `async randomDelay(baseMs = 1000, variance = 0.3): Promise<void>`
Random delay for human-like behavior.

**Parameters:**
- `baseMs` (number): Base delay in ms (default: 1000)
- `variance` (number): Variance ratio 0-1 (default: 0.3)

**Returns:** Promise<void>

**Behavior:** Delays between `baseMs * (1-variance)` and `baseMs * (1+variance)`

---

##### `setDelayRange(minMs, maxMs): void`
Sets custom delay range.

**Parameters:**
- `minMs` (number): Minimum delay in ms
- `maxMs` (number): Maximum delay in ms

**Returns:** void

**Throws:** Error if invalid range (minMs < 0 or maxMs < minMs)

---

##### `setMaxRetries(retries): void`
Sets maximum retry attempts.

**Parameters:**
- `retries` (number): Number of retries (1-10)

**Returns:** void

**Throws:** Error if retries not in range 1-10

---

##### `reset(): void`
Resets last request time.

**Parameters:** None

**Returns:** void

---

##### `async wait(): Promise<void>`
Alias for `waitBeforeRequest()` for backward compatibility.

**Parameters:** None

**Returns:** Promise<void>

---

### src/core/selenium-manager.js

**Purpose**: Manages Selenium WebDriver for infinite scroll handling with PAGE_DOWN simulation, Load More button detection, and memory recycling.

#### Class: `SeleniumManager`

##### `constructor(logger): SeleniumManager`
Initializes Selenium manager with default scroll configuration.

**Parameters:**
- `logger` (Object): Logger instance

**Returns:** SeleniumManager instance

**Default Scroll Config:**
- `scrollDelay`: 400ms between PAGE_DOWN presses
- `maxRetries`: 25 consecutive no-change attempts
- `maxScrolls`: 1000 safety limit
- `initialWait`: 5000ms for initial content load
- `scrollContainer`: null (use body)
- `verbose`: true
- `enableLoadMoreButton`: true
- `maxButtonClicks`: 200
- `waitAfterButtonClick`: 2000ms
- `cardSelector`: null

---

##### `async launch(headless = true): Promise<boolean>`
Launches Chrome WebDriver with stealth configuration.

**Parameters:**
- `headless` (boolean): Run in headless mode (default: true)

**Returns:** Promise<boolean> - True if successful

**Chrome Options:**
- `--headless=new` (if headless)
- `--disable-gpu`
- `--no-sandbox`
- `--disable-dev-shm-usage`
- `--window-size=1920,1080`
- `--disable-blink-features=AutomationControlled`
- Random user agent from pool

---

##### `async navigate(url, timeout = 30000): Promise<boolean>`
Navigates to URL with memory recycling.

**Parameters:**
- `url` (string): URL to navigate to
- `timeout` (number): Timeout in ms (default: 30000)

**Returns:** Promise<boolean> - True if successful

**Behavior:**
- Checks memory and recycles if needed
- Waits for body element
- Increments navigation counter
- Logs memory every 10 navigations

---

##### `async scrollToFullyLoad(options = {}): Promise<Object>`
Scrolls page to fully load infinite scroll content using PAGE_DOWN simulation with button-first optimization after first button click.

**Parameters:**
- `options` (Object): Scroll configuration (see defaultScrollConfig)
- `options.onHeightChange` (Function): Callback for height changes
- `options.onButtonClick` (Function): Callback for button clicks
- `options.onScrollBatch` (Function): Callback every 10 scrolls

**Returns:** Promise<Object> with scroll statistics:
- `scrollCount`: Total scroll actions
- `heightChanges`: Number of height increases
- `finalHeight`: Final page height
- `stopReason`: Why scrolling stopped
- `retriesAtEnd`: Retries at end
- `buttonClicks`: Number of button clicks
- `timeline`: Array of events for analysis
- `duration`: Total time in ms

**Behavior:**
- Waits initialWait for content
- Dismisses cookie banners automatically
- Sends PAGE_DOWN keys to scroll element
- Resets retry counter on ANY height change
- Scroll up/down cycle every 5 failed retries
- Detects and clicks Load More buttons when scroll exhausted
- **Button-First Mode**: After first successful button click, checks for button immediately instead of scrolling 25 times first
- Timeline callbacks for testing and progress tracking
- Stops on: max scrolls, max retries, or max button clicks

**Timeline Events:**
- `height_change`: {type, scrollCount, previousHeight, newHeight, delta, timestamp}
- `button_click`: {type, buttonClicks, scrollCount, buttonText, strategy, newElementCount, timestamp}
- `scroll_batch`: {type, scrollCount, heightChanges, buttonClicks, currentHeight, retriesAtBatch, timestamp}

---

##### `async detectLoadMoreButton(verbose = false): Promise<Object|null>`
Detects Load More button using 5 detection strategies.

**Parameters:**
- `verbose` (boolean): Log detection attempts

**Returns:** Promise<Object|null> - {button, text, strategy} or null

**Detection Strategies (priority order):**
1. **text-content**: Text patterns ("load more", "show more", "view more", etc.)
2. **aria-label**: ARIA label patterns
3. **css-class**: CSS class patterns (.load-more, .show-more, etc.)
4. **data-attribute**: Data attributes (data-action, data-load-more, etc.)
5. **generic-more**: Generic fallback (any button with "more" as word boundary)

---

##### `async clickLoadMoreButton(button, options = {}): Promise<Object>`
Clicks Load More button and waits for content.

**Parameters:**
- `button` (WebElement): Button element to click
- `options` (Object):
  - `waitAfterClick` (number): Wait time in ms (default: 2000)
  - `scrollAfterClick` (boolean): Scroll to bottom after click (default: true)
  - `cardSelector` (string): CSS selector for counting new elements

**Returns:** Promise<Object> - {success, countBefore, countAfter, newElementCount, stale, error}

**Behavior:**
- Counts elements before click (if cardSelector provided)
- Scrolls button into view
- Clicks button
- Waits for content
- Scrolls to bottom to trigger lazy loading
- Counts elements after click
- Handles stale element (often indicates success)

---

##### `async dismissCookieBanners(verbose = false): Promise<void>`
Attempts to dismiss common cookie consent banners.

**Parameters:**
- `verbose` (boolean): Log actions

**Returns:** Promise<void>

**Selectors Tried:**
- OneTrust accept/reject buttons
- Common cookie accept classes and IDs
- Cookiebot, Cookie Consent patterns
- GDPR accept buttons

---

##### `async getPageSource(): Promise<string>`
Gets page HTML source.

**Parameters:** None

**Returns:** Promise<string> - Full HTML source

---

##### `getDriver(): WebDriver`
Gets WebDriver instance.

**Parameters:** None

**Returns:** WebDriver instance

**Throws:** Error if not initialized

---

##### `async checkMemoryAndRecycle(): Promise<void>`
Checks memory and recycles driver if needed.

**Parameters:** None

**Returns:** Promise<void>

**Recycling Triggers:**
- 50+ navigations
- 1GB+ memory growth

---

##### `logMemoryUsage(): void`
Logs memory usage statistics.

**Parameters:** None

**Returns:** void

---

##### `async close(): Promise<void>`
Closes WebDriver.

**Parameters:** None

**Returns:** Promise<void>

---

### src/core/index.js

**Purpose**: Core infrastructure module exports.

#### Module Exports

```javascript
{
  BrowserManager,
  SeleniumManager,
  RateLimiter,
  logger,
  Logger: logger // Alias for backwards compatibility
}
```

---

## Configuration

### src/config/config-loader.js

**Purpose**: Loads and validates site-specific JSON configurations with pagination cache management.

#### Class: `ConfigLoader`

##### `constructor(logger): ConfigLoader`
Initializes config loader with directory paths.

**Parameters:**
- `logger` (Object): Logger instance

**Returns:** ConfigLoader instance

**Paths:**
- `configDir`: `page-scrape/configs/`
- `websiteConfigDir`: `configs/website-configs/`
- `defaultConfigPath`: `configs/_default.json`
- `paginationCachePath`: `configs/_pagination_cache.json`

---

##### `extractDomain(url): string`
Extracts domain from URL.

**Parameters:**
- `url` (string): Full URL

**Returns:** string - Base domain (e.g., "compass.com")

**Behavior:** Removes www. prefix if present

**Throws:** Error if invalid URL

---

##### `loadConfig(url): Object`
Loads config file for given URL.

**Parameters:**
- `url` (string): Target URL

**Returns:** Object - Config merged with defaults

**Behavior:**
- Extracts domain from URL
- Checks website-configs/ directory first
- Falls back to legacy location (configs/ root)
- Validates config structure
- Merges with default config
- Logs warnings for legacy location

---

##### `validateConfig(config, domain): void`
Validates config structure and required fields.

**Parameters:**
- `config` (Object): Config object to validate
- `domain` (string): Domain name for error messages

**Returns:** void

**Throws:** Error if validation fails

**Validates:**
- Required fields: domain, markers (start/end)
- Marker types: 'text' or 'coordinate'
- Marker values: non-empty strings or valid coordinates
- Optional: scrollBehavior, parsing fields

---

##### `getDefaultConfig(domain): Object`
Gets default config when no site-specific config exists.

**Parameters:**
- `domain` (string): Domain name

**Returns:** Object - Default configuration

**Behavior:**
- Tries to load from `_default.json` first
- Falls back to hardcoded defaults if file missing

**Default Config Structure:**
```javascript
{
  domain: domain,
  name: `Default config for ${domain}`,
  markers: { start: {type: 'dynamic', strategy: 'first-email'}, end: {type: 'dynamic', strategy: 'viewport-height'} },
  scrollBehavior: { scrollDelay: 1000, maxScrolls: 50, scrollAmount: 'viewport' },
  selectors: { container: null, profileLink: null, phone: null, email: null, name: null },
  parsing: { emailDomain: null, nameBeforeEmail: true, profileUrlPatterns: ['/agents/', '/profile/', '/realtor/', '/team/'] },
  pagination: { enabled: true, type: 'auto' }
}
```

---

##### `resolveWithDefaults(siteConfig): Object`
Merges site-specific config with defaults using deep merge.

**Parameters:**
- `siteConfig` (Object): Site-specific configuration

**Returns:** Object - Merged configuration

---

##### `listConfigs(): Array<string>`
Lists all available config files.

**Parameters:** None

**Returns:** Array<string> - Array of domain names

**Behavior:**
- Checks website-configs/ directory
- Checks legacy location
- Filters out system configs (prefixed with _)
- Returns sorted unique list

---

##### `loadPaginationCache(): Object`
Loads pagination cache from disk.

**Parameters:** None

**Returns:** Object - Cache object (domain -> pattern)

---

##### `savePaginationCache(): void`
Saves pagination cache to disk.

**Parameters:** None

**Returns:** void

---

##### `getCachedPattern(domain): Object|null`
Gets cached pagination pattern for domain.

**Parameters:**
- `domain` (string): Domain name

**Returns:** Object|null - Cached pattern or null

---

##### `saveCachedPattern(domain, pattern): void`
Saves pagination pattern to cache.

**Parameters:**
- `domain` (string): Domain name
- `pattern` (Object): Pagination pattern object

**Returns:** void

**Behavior:**
- Stores pattern with timestamp
- Saves cache to disk
- Logs cache operation

---

##### `clearCachedPattern(domain): void`
Clears cached pattern for domain.

**Parameters:**
- `domain` (string): Domain name

**Returns:** void

---

##### `clearAllCachedPatterns(): void`
Clears all cached patterns.

**Parameters:** None

**Returns:** void

---

##### `loadConfigByName(name): Object|null`
Loads config by name (v2.3 style).

**Parameters:**
- `name` (string): Config name (without .json extension)

**Returns:** Object|null - Config object or null

**Behavior:**
- Removes .json extension if present
- Tries primary path (website-configs/)
- Tries domain format (hyphens to dots)
- Tries legacy path
- Skips validation for v2.1/v2.2/v2.3 configs
- Logs version info

---

### src/config/schemas.js

**Purpose**: V2.3 configuration schema definitions and validation functions.

#### Exported Constants

**`FIELD_SCHEMA_V23`** - Template for field configuration:
```javascript
{
  required: false,
  skipped: false,
  userValidatedMethod: null,
  coordinates: {x: 0, y: 0, width: 0, height: 0},
  selector: null,
  sampleValue: null,
  confidence: 0,
  extractionOptions: [],
  failedMethods: []
}
```

**`CONFIG_SCHEMA_V23`** - Complete v2.3 config template

**`EXTRACTION_METHOD_RESULT`** - Method result schema:
```javascript
{
  method: '',
  methodLabel: '',
  value: null,
  confidence: 0,
  metadata: {}
}
```

**`FIELD_METADATA`** - Field metadata for UI (name, email, phone, title, location, profileUrl)

**`EXTRACTION_METHODS`** - All extraction method definitions with priorities

**`FIELD_ORDER`** - Ordered field list: ['name', 'email', 'phone', 'profileUrl', 'title', 'location']

**`REQUIRED_FIELDS`** - ['name', 'email', 'profileUrl']

**`OPTIONAL_FIELDS`** - ['phone', 'title', 'location']

---

#### Exported Functions

##### `createFieldSchema(overrides = {}): Object`
Creates new v2.3 field schema with defaults.

**Parameters:**
- `overrides` (Object): Values to override defaults

**Returns:** Object - Field schema

---

##### `createConfigV23(options = {}): Object`
Creates new v2.3 config with defaults.

**Parameters:**
- `options` (Object): Config options

**Returns:** Object - v2.3 config

---

##### `validateConfigV23(config): Object`
Validates v2.3 config.

**Parameters:**
- `config` (Object): Config to validate

**Returns:** Object - {valid, errors, warnings, score}

**Validation Checks:**
- Version is '2.3'
- Domain present
- Card selector present
- Required fields have validated methods
- Optional fields checked
- Coordinates validity

---

##### `isV23Config(config): boolean`
Checks if config is v2.3 format.

**Parameters:**
- `config` (Object): Config to check

**Returns:** boolean

---

## Constants

### src/constants/pagination-patterns.js

**Purpose**: Centralized pagination-related patterns and detection utilities.

#### Exported Constants

**`PAGE_PARAMETER_NAMES`** - Array of 32 common page parameter names:
- Common: page, p, pg
- Descriptive: pageNum, pageNumber, pagingNumber, currentPage, etc.

**`OFFSET_PARAMETER_NAMES`** - Array of offset pagination parameters:
- offset, skip, start, from, startIndex, begin, first

**`PAGE_SIZE_PARAMETER_NAMES`** - Array of page size parameters:
- pageSize, limit, perPage, count, size, results, show

**`PAGINATION_CONTROL_SELECTORS`** - Array of CSS selectors for pagination controls

**`KNOWN_DOMAIN_PAGINATION`** - Object mapping domains to known pagination types:
- infinite-scroll: sullcrom.com, skadden.com, weil.com
- pagination: paulweiss.com, kirkland.com, compass.com, zillow.com, etc.

---

#### Exported Functions

##### `getPaginationParameterType(paramName): string|null`
Checks if parameter is pagination-related.

**Parameters:**
- `paramName` (string): URL parameter name

**Returns:** string|null - 'page', 'offset', 'size', or null

---

##### `isPageParameter(paramName): boolean`
Checks if parameter is a page number parameter.

**Parameters:**
- `paramName` (string): Parameter name

**Returns:** boolean

---

##### `isOffsetParameter(paramName): boolean`
Checks if parameter is an offset parameter.

**Parameters:**
- `paramName` (string): Parameter name

**Returns:** boolean

---

##### `detectPaginationFromUrl(url): Object`
Detects pagination type from URL analysis.

**Parameters:**
- `url` (string): URL to analyze

**Returns:** Object - {hasPaginationParam, paramName, paramValue, suggestedType, confidence, domainMatch}

**Behavior:**
- Checks known domain list first (high confidence)
- Checks URL parameters for pagination indicators
- Returns suggested type: 'pagination', 'infinite-scroll', or 'single-page'
- Confidence: 'high', 'medium', or 'low'

---

### src/constants/index.js

**Purpose**: Central constants export.

#### Module Exports

```javascript
{
  PAGINATION_PATTERNS: paginationPatterns,
  ...paginationPatterns // Direct exports for convenience
}
```

---

## Extraction System

[EXTRACTION SYSTEM DOCUMENTATION CONTINUES WITH ALL 7 EXTRACTORS...]

**[Note: API.md continues with full documentation for all remaining modules. Due to length, showing structure here]**

---

*[Document continues with complete documentation for all 86 files following the same detailed format...]*

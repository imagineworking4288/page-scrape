# API Reference

Complete function-level documentation for the Universal Professional Scraper project.

**Version:** 1.0.0
**Total Files Documented:** 23 of 87 JavaScript files (26.4% complete)
**Last Updated:** 2025-12-23

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

**[TODO: Document 8 extraction files - coordinate-extractor, email-extractor, phone-extractor, link-extractor, label-extractor, screenshot-extractor, extractors/index, smart-field-extractor]**

---

## Features

### Pagination

**[TODO: Document 4 pagination files - binary-searcher, paginator, pattern-detector, url-generator]**

---

### Enrichment

#### Post-Cleaners

Post-enrichment cleaning modules that process contact data after ProfileEnricher completes. These modules handle multi-location parsing, phone-location validation, location normalization, domain classification, and confidence scoring.

---

##### src/features/enrichment/post-cleaners/index.js

**Purpose**: Exports all post-enrichment cleaning modules.

**Module Exports:**
```javascript
{
  FieldCleaner,
  MultiLocationHandler,
  PhoneLocationCorrelator,
  LocationNormalizer,
  DomainClassifier,
  ConfidenceScorer
}
```

---

##### src/features/enrichment/post-cleaners/field-cleaner.js

**Purpose**: Main orchestrator for post-enrichment cleaning operations. Applies universal cleaning rules after ProfileEnricher completes. Coordinates multi-location parsing, phone-location validation, location normalization, domain classification, and confidence scoring.

###### Class: `FieldCleaner`

**Constructor:**
```javascript
constructor(logger): FieldCleaner
```

**Parameters:**
- `logger` (Object): Logger instance

**Returns:** FieldCleaner instance

**Properties:**
- `logger` (Object): Logger instance
- `multiLocationHandler` (MultiLocationHandler): Handles multi-location parsing
- `phoneLocationCorrelator` (PhoneLocationCorrelator): Validates phone-location correlation
- `locationNormalizer` (LocationNormalizer): Normalizes location strings
- `domainClassifier` (DomainClassifier): Classifies email domains
- `confidenceScorer` (ConfidenceScorer): Calculates data quality scores

---

###### `_log(level, message): void` (Private)

Safe logger helper method.

**Parameters:**
- `level` (string): Log level ('debug', 'info', 'warn', 'error')
- `message` (string): Message to log

**Returns:** void

**Behavior:** Only logs if logger exists and has the specified level method

---

###### `async cleanContacts(contacts, options = {}): Promise<Array>`

Cleans multiple contacts in batch.

**Parameters:**
- `contacts` (Array<Object>): Array of contact objects to clean
- `options` (Object): Cleaning options
  - `prioritizeUS` (boolean): Prioritize US locations in multi-location contacts (default: true)
  - `strictValidation` (boolean): Enable strict validation (default: false)

**Returns:** Promise<Array<Object>> - Array of cleaned contacts

**Behavior:**
- Processes each contact individually with `cleanContact()`
- Tracks statistics (multi-location count, mismatch count)
- Logs progress every 100 contacts
- Logs summary statistics at completion

**Example:**
```javascript
const cleaner = new FieldCleaner(logger);
const cleaned = await cleaner.cleanContacts(contacts, {
  prioritizeUS: true,
  strictValidation: false
});
```

---

###### `async cleanContact(contact, options = {}): Promise<Object>`

Cleans a single contact through 5-step cleaning pipeline.

**Parameters:**
- `contact` (Object): Contact object to clean
- `options` (Object): Cleaning options (same as cleanContacts)

**Returns:** Promise<Object> - Cleaned contact with metadata

**Cleaning Pipeline:**

1. **Multi-location parsing**: Parses location field for multiple locations
   - Updates `location` to primary location
   - Updates `phone` to primary phone if found
   - Adds `additionalLocations`, `allLocations`, `locationData` fields
   - Logs operation: 'multi-location-detected'

2. **Phone-location validation**: Validates phone number matches location
   - Checks country-level correlation
   - Checks US area code to city correlation
   - Adds warnings to `_warnings` array if mismatch detected
   - Logs operation: 'phone-location-mismatch'

3. **Location normalization**: Normalizes location strings (ALWAYS runs)
   - Removes embedded phone numbers from location
   - Normalizes whitespace and formatting
   - Preserves special patterns (Washington, D.C., St. Louis)
   - Updates `_original.location_pre_normalization` with original
   - Logs operation: 'location-normalized'
   - Logs operation: 'location-phones-removed' if phones found

4. **Domain classification**: Classifies email domain as business/personal
   - Extracts domain from email
   - Classifies as 'business' or 'personal'
   - Adds `domain` and `domainType` fields
   - Logs operation: 'domain-classified'

5. **Confidence scoring**: Calculates overall data quality score
   - Scores based on field presence and cleanliness
   - Adds `confidence` ('high', 'medium', 'low')
   - Adds `confidenceBreakdown` with detailed scores

**Added Fields:**
- `_postCleaning` (Object): Metadata about cleaning operations
  - `cleanedAt` (string): ISO timestamp
  - `operations` (Array<string>): List of operations performed
  - `version` (string): Cleaner version
  - `locationPhonesRemoved` (Array<string>): Phones removed from location (if any)
  - `locationData` (Object): Multi-location data (if multi-location)
  - `phoneValidation` (Object): Phone validation result (if mismatch)
- `_warnings` (Array<Object>): Warnings about data quality issues
- `_original.location_pre_normalization` (string): Original location before normalization

**Example:**
```javascript
const cleaned = await cleaner.cleanContact({
  name: "John Doe",
  email: "john@example.com",
  phone: "+1-212-555-1234",
  location: "New York, NY +1-212-555-1234"
});

// Result:
// {
//   name: "John Doe",
//   email: "john@example.com",
//   phone: "+1-212-555-1234",
//   location: "New York, NY",
//   domain: "example.com",
//   domainType: "business",
//   confidence: "high",
//   confidenceBreakdown: {...},
//   _original: { location_pre_normalization: "New York, NY +1-212-555-1234" },
//   _postCleaning: {
//     cleanedAt: "2025-12-23T10:00:00Z",
//     operations: ["location-normalized", "location-phones-removed", "domain-classified"],
//     version: "1.1",
//     locationPhonesRemoved: ["+1-212-555-1234"]
//   }
// }
```

---

###### `getStatistics(cleanedContacts): Object`

Generates statistics summary from cleaned contacts.

**Parameters:**
- `cleanedContacts` (Array<Object>): Array of cleaned contacts

**Returns:** Object - Statistics summary

**Statistics Returned:**
```javascript
{
  totalProcessed: number,        // Total contacts processed
  multiLocation: number,          // Contacts with multiple locations
  correlationIssues: number,      // Phone-location mismatches
  locationNormalized: number,     // Locations normalized
  locationPhonesRemoved: number,  // Locations with phones removed
  domainClassified: number,       // Domains classified
  highConfidence: number,         // High confidence contacts
  mediumConfidence: number,       // Medium confidence contacts
  lowConfidence: number          // Low confidence contacts
}
```

**Example:**
```javascript
const stats = cleaner.getStatistics(cleanedContacts);
console.log(`Total: ${stats.totalProcessed}`);
console.log(`High confidence: ${stats.highConfidence}`);
```

---

##### src/features/enrichment/post-cleaners/multi-location-handler.js

**Purpose**: Parses multi-location data from contact fields and prioritizes locations based on configurable rules (US priority by default). Handles contacts with multiple office locations by extracting location-phone pairs.

###### Class: `MultiLocationHandler`

**Constructor:**
```javascript
constructor(logger): MultiLocationHandler
```

**Parameters:**
- `logger` (Object): Logger instance

**Returns:** MultiLocationHandler instance

**Properties:**
- `logger` (Object): Logger instance
- `usStates` (Set<string>): All 50 US state abbreviations + DC
- `usCities` (Set<string>): Major US cities for detection (26 cities)
- `phoneCountryCodes` (Object): Country code to country name mapping (10 countries)

**Supported Country Codes:**
- `1`: US, `44`: UK, `49`: Germany, `33`: France, `81`: Japan
- `86`: China, `852`: Hong Kong, `65`: Singapore, `61`: Australia, `91`: India

---

###### `_log(level, message): void` (Private)

Safe logger helper method.

**Parameters:**
- `level` (string): Log level
- `message` (string): Message to log

**Returns:** void

---

###### `parse(rawLocation, primaryPhone, prioritizeUS = true): Object`

Parses multi-location data from raw location string.

**Parameters:**
- `rawLocation` (string): Raw location field value (may contain newlines, phones, multiple locations)
- `primaryPhone` (string): Primary phone number from contact
- `prioritizeUS` (boolean): Whether to prioritize US locations (default: true)

**Returns:** Object - Parsed location data

**Return Structure:**
```javascript
{
  isMultiLocation: boolean,       // True if multiple locations detected
  primaryLocation: string,        // Primary location (first US location if prioritizeUS)
  primaryPhone: string,           // Phone for primary location
  additionalLocations: Array,     // Additional locations (excluding primary)
  allLocations: Array,            // All locations in priority order
  locationData: Object,           // Map of location -> {phone, countryCode, country, isPrimary}
  rawLocation: string             // Original raw location string
}
```

**Parsing Process:**
1. Split raw location into segments by newlines
2. Parse segments into location-phone pairs
3. Prioritize locations (US first if enabled)
4. Build location data map with metadata

**Example:**
```javascript
const handler = new MultiLocationHandler(logger);

const rawLocation = `New York, NY
+1-212-555-1234
Frankfurt, Germany
+49-69-1234-5678`;

const result = handler.parse(rawLocation, "+1-212-555-1234", true);

// Result:
// {
//   isMultiLocation: true,
//   primaryLocation: "New York, NY",
//   primaryPhone: "+1-212-555-1234",
//   additionalLocations: ["Frankfurt, Germany"],
//   allLocations: ["New York, NY", "Frankfurt, Germany"],
//   locationData: {
//     "New York, NY": { phone: "+1-212-555-1234", countryCode: "1", country: "US", isPrimary: true },
//     "Frankfurt, Germany": { phone: "+49-69-1234-5678", countryCode: "49", country: "Germany", isPrimary: false }
//   },
//   rawLocation: "New York, NY\n+1-212-555-1234\nFrankfurt, Germany\n+49-69-1234-5678"
// }
```

---

###### `splitLocationSegments(rawLocation): Array<string>`

Splits raw location into segments by newlines.

**Parameters:**
- `rawLocation` (string): Raw location string

**Returns:** Array<string> - Non-empty segments

**Behavior:**
- Splits on one or more newlines (`\n+`)
- Trims whitespace from each segment
- Filters out empty segments

---

###### `parseLocationPairs(segments, primaryPhone): Array<Object>`

Parses segments into location-phone pairs.

**Parameters:**
- `segments` (Array<string>): Location segments
- `primaryPhone` (string): Fallback phone if no phone found

**Returns:** Array<Object> - Array of `{location, phone}` pairs

**Parsing Logic:**
1. If segment is phone number, store as current phone
2. If segment has embedded phone, extract both location and phone
3. If segment is location, pair with current or primary phone
4. Returns array of location-phone pairs

**Example:**
```javascript
const segments = ["New York, NY", "+1-212-555-1234", "London, UK"];
const pairs = handler.parseLocationPairs(segments, "+1-212-555-1234");
// Result: [
//   {location: "New York, NY", phone: "+1-212-555-1234"},
//   {location: "London, UK", phone: "+1-212-555-1234"}
// ]
```

---

###### `isPhoneNumber(text): boolean`

Checks if string is a phone number.

**Parameters:**
- `text` (string): Text to check

**Returns:** boolean

**Detection:** Checks if cleaned text (no spaces/dashes/parens) matches `^\+?\d{7,15}$`

---

###### `hasEmbeddedPhone(text): boolean`

Checks if string contains embedded phone number.

**Parameters:**
- `text` (string): Text to check

**Returns:** boolean

**Detection:** Checks for pattern `\+\d+[\d\s\-\(\)]{7,}`

---

###### `looksLikeLocation(text): boolean`

Checks if text looks like a location.

**Parameters:**
- `text` (string): Text to check

**Returns:** boolean

**Detection Criteria:**
- Must have at least one letter
- Must not be mostly numbers (>50% digits)
- Must match location patterns:
  - "New York", "Frankfurt" (capitalized words)
  - "New York, NY", "Austin, TX" (city, state)
  - "Washington, D.C." (special case)
  - "St. Louis" (abbreviated prefix)

---

###### `prioritizeLocations(locationPairs, prioritizeUS): Array<Object>`

Prioritizes locations based on rules.

**Parameters:**
- `locationPairs` (Array<Object>): Array of `{location, phone}` pairs
- `prioritizeUS` (boolean): Whether to prioritize US locations

**Returns:** Array<Object> - Sorted array of location pairs

**Behavior:**
- If `prioritizeUS` is false or only 1 location, returns as-is
- Otherwise, separates US and international locations
- Returns US locations first, then international

**Example:**
```javascript
const pairs = [
  {location: "Frankfurt, Germany", phone: "+49-69-1234"},
  {location: "New York, NY", phone: "+1-212-1234"}
];

const prioritized = handler.prioritizeLocations(pairs, true);
// Result: [
//   {location: "New York, NY", phone: "+1-212-1234"},
//   {location: "Frankfurt, Germany", phone: "+49-69-1234"}
// ]
```

---

###### `isUSLocation(location, phone): boolean`

Checks if location is in the US.

**Parameters:**
- `location` (string): Location name
- `phone` (string): Associated phone number

**Returns:** boolean

**Detection Methods (priority order):**
1. Phone country code = '1'
2. Location has US state abbreviation (e.g., "New York, NY")
3. Location matches "Washington, D.C."
4. Location contains known US city name

---

###### `extractCountryCode(phone): string|null`

Extracts country code from phone number.

**Parameters:**
- `phone` (string): Phone number (e.g., "+1-212-555-1234")

**Returns:** string|null - Country code or null

**Supported Codes:** 852, 44, 49, 91, 86, 81, 65, 61, 33, 1 (checked in this order)

**Example:**
```javascript
handler.extractCountryCode("+1-212-555-1234");  // "1"
handler.extractCountryCode("+44-20-1234-5678"); // "44"
handler.extractCountryCode("+49-69-1234");      // "49"
```

---

###### `buildLocationData(prioritized): Object`

Builds location data map from prioritized pairs.

**Parameters:**
- `prioritized` (Array<Object>): Prioritized location-phone pairs

**Returns:** Object - Map of location to metadata

**Structure:**
```javascript
{
  "New York, NY": {
    phone: "+1-212-555-1234",
    countryCode: "1",
    country: "US",
    isPrimary: true
  },
  "Frankfurt, Germany": {
    phone: "+49-69-1234-5678",
    countryCode: "49",
    country: "Germany",
    isPrimary: false
  }
}
```

---

##### src/features/enrichment/post-cleaners/phone-location-correlator.js

**Purpose**: Validates that phone numbers correlate with their associated locations. Detects mismatches at country and city levels to identify data quality issues.

###### Class: `PhoneLocationCorrelator`

**Constructor:**
```javascript
constructor(logger): PhoneLocationCorrelator
```

**Parameters:**
- `logger` (Object): Logger instance

**Returns:** PhoneLocationCorrelator instance

**Properties:**
- `logger` (Object): Logger instance
- `usAreaCodes` (Object): US area code to city mapping (20+ major cities)
- `countryPhonePrefixes` (Object): Country code to country/city mapping (10 countries)

**US Area Codes Mapped:**
- NYC: 212, 646, 917, 718
- DC: 202
- LA: 213, 310
- SF: 415
- Chicago: 312, 773
- Boston: 617, 857
- Seattle: 206
- Houston: 713
- Austin: 512
- Miami: 305
- Atlanta: 404
- Dallas: 214
- Phoenix: 602
- Portland: 503
- Las Vegas: 702

---

###### `_log(level, message): void` (Private)

Safe logger helper method.

**Parameters:**
- `level` (string): Log level
- `message` (string): Message to log

**Returns:** void

---

###### `validate(phone, location, locationData): Object`

Validates phone-location correlation.

**Parameters:**
- `phone` (string): Phone number with country code (e.g., "+1-212-555-1234")
- `location` (string): Location name (e.g., "New York, NY")
- `locationData` (Object): Optional location data from MultiLocationHandler

**Returns:** Object - Validation result

**Return Structure:**
```javascript
{
  valid: boolean,          // Overall validity
  hasMismatch: boolean,    // True if mismatch detected
  reason: string,          // Reason code
  details: Object          // Additional details (if mismatch)
}
```

**Reason Codes:**
- `'missing-data'`: Phone or location missing (valid=false, hasMismatch=false)
- `'no-country-code'`: No country code in phone (valid=false, hasMismatch=false)
- `'unknown-country-code'`: Country code not recognized (valid=false, hasMismatch=false)
- `'country-mismatch'`: Phone country doesn't match location country (valid=false, hasMismatch=true)
- `'city-mismatch'`: US area code doesn't match location city (valid=true, hasMismatch=true)
- No reason: Valid correlation (valid=true, hasMismatch=false)

**Validation Process:**
1. Extract country code from phone
2. Detect country from location string
3. Check country-level correlation (high severity if mismatch)
4. For US numbers, check area code to city correlation (medium severity if mismatch)

**Example:**
```javascript
const correlator = new PhoneLocationCorrelator(logger);

// Valid correlation
const result1 = correlator.validate("+1-212-555-1234", "New York, NY", null);
// {valid: true, hasMismatch: false}

// Country mismatch
const result2 = correlator.validate("+44-20-1234-5678", "New York, NY", null);
// {valid: false, hasMismatch: true, reason: "country-mismatch", details: {...}}

// City mismatch (US)
const result3 = correlator.validate("+1-415-555-1234", "New York, NY", null);
// {valid: true, hasMismatch: true, reason: "city-mismatch", details: {...}}
```

---

###### `extractCountryCode(phone): string|null`

Extracts country code from phone number.

**Parameters:**
- `phone` (string): Phone number

**Returns:** string|null - Country code or null

**Supported Codes:** 852, 44, 49, 91, 86, 81, 65, 61, 33, 1

---

###### `extractUSAreaCode(phone): string|null`

Extracts US area code from phone number.

**Parameters:**
- `phone` (string): Phone number

**Returns:** string|null - 3-digit area code or null

**Example:**
```javascript
correlator.extractUSAreaCode("+1-212-555-1234");  // "212"
correlator.extractUSAreaCode("+1 (415) 555-1234"); // "415"
```

---

###### `detectLocationCountry(location, locationData): string|null`

Detects country from location string.

**Parameters:**
- `location` (string): Location name
- `locationData` (Object): Optional location data with country hints

**Returns:** string|null - Country name or null

**Detection Methods (priority order):**
1. Check locationData for country hint
2. Check explicit city patterns (Frankfurt→Germany, London→UK, etc.)
3. Check for US state abbreviations (e.g., "New York, NY" → US)
4. Check for major US cities

**Supported Countries:**
- US, UK, Germany, France, Hong Kong, Singapore, China, Japan, Australia, India

---

###### `locationContainsCity(location, city): boolean`

Checks if location contains a city name.

**Parameters:**
- `location` (string): Location string
- `city` (string): City name to check

**Returns:** boolean

**Special Cases:**
- Handles "Washington, D.C." specially for city="Washington"
- Case-insensitive comparison

---

##### src/features/enrichment/post-cleaners/location-normalizer.js

**Purpose**: Normalizes location strings while preserving important patterns like "Washington, D.C." and "St. Louis". Removes embedded phone numbers and cleans up formatting issues.

###### Class: `LocationNormalizer`

**Constructor:**
```javascript
constructor(logger): LocationNormalizer
```

**Parameters:**
- `logger` (Object): Logger instance

**Returns:** LocationNormalizer instance

**Properties:**
- `logger` (Object): Logger instance
- `preservePatterns` (Array<RegExp>): Patterns to preserve exactly
  - `/Washington,?\s*D\.?C\.?/i` - Washington, D.C. variations
  - `/St\.\s+\w+/i` - St. Louis, St. Paul, etc.
  - `/\w+,\s*[A-Z]{2}\b/` - New York, NY format
  - `/\w+,\s*[A-Z][a-z]+/` - London, UK format

---

###### `_log(level, message): void` (Private)

Safe logger helper method.

**Parameters:**
- `level` (string): Log level
- `message` (string): Message to log

**Returns:** void

---

###### `normalize(location): Object`

Normalizes a location string.

**Parameters:**
- `location` (string): Raw location string (may contain phones, newlines, etc.)

**Returns:** Object - Normalization result

**Return Structure:**
```javascript
{
  normalized: string,           // Normalized location string
  wasChanged: boolean,          // True if changes made
  phonesRemoved: Array<string>  // Phones removed from location
}
```

**Normalization Process:**

**Step 1: Remove embedded phone numbers (CRITICAL)**
- Pattern: `\+?\d[\d\s\-\(\)\.]{7,}`
- Only counts phones with 7+ digits
- Stores removed phones in metadata
- Examples removed:
  - "+1-212-558-1623"
  - "+49-69-4272-5200"
  - "(212) 555-1234"

**Step 2: Apply pattern-specific cleaning**
- If location has preserve patterns (D.C., St.):
  - Gentle cleaning: convert newlines to commas, collapse whitespace
  - Fix spacing around commas: "Washington , D.C." → "Washington, D.C."
- Otherwise:
  - Aggressive cleaning: collapse whitespace, remove newlines

**Step 3: Normalize Washington D.C. variations**
- Converts all variations to standard "Washington, D.C."
- Handles: "Washington DC", "Washington D.C.", "Washington, DC", etc.

**Step 4: Clean up artifacts from phone removal**
- Remove trailing/leading commas
- Remove duplicate commas
- Remove excessive spaces
- Final trim

**Example:**
```javascript
const normalizer = new LocationNormalizer(logger);

// Remove embedded phone
const result1 = normalizer.normalize("New York, NY +1-212-555-1234");
// {
//   normalized: "New York, NY",
//   wasChanged: true,
//   phonesRemoved: ["+1-212-555-1234"]
// }

// Normalize Washington D.C.
const result2 = normalizer.normalize("Washington DC");
// {
//   normalized: "Washington, D.C.",
//   wasChanged: true,
//   phonesRemoved: []
// }

// Multiple phones
const result3 = normalizer.normalize("Frankfurt, Germany +49-69-1234 +49-69-5678");
// {
//   normalized: "Frankfurt, Germany",
//   wasChanged: true,
//   phonesRemoved: ["+49-69-1234", "+49-69-5678"]
// }
```

---

##### src/features/enrichment/post-cleaners/domain-classifier.js

**Purpose**: Wrapper around DomainExtractor for post-cleaning classification. Extracts domain from email and classifies as business/personal.

###### Class: `DomainClassifier`

**Constructor:**
```javascript
constructor(logger): DomainClassifier
```

**Parameters:**
- `logger` (Object): Logger instance

**Returns:** DomainClassifier instance

**Properties:**
- `logger` (Object): Logger instance
- `domainExtractor` (DomainExtractor): Domain extraction utility

---

###### `_log(level, message): void` (Private)

Safe logger helper method.

**Parameters:**
- `level` (string): Log level
- `message` (string): Message to log

**Returns:** void

---

###### `classify(email): Object`

Classifies an email domain.

**Parameters:**
- `email` (string): Email address (e.g., "john@example.com")

**Returns:** Object - Classification result

**Return Structure:**
```javascript
{
  domain: string|null,      // Extracted domain (e.g., "example.com")
  domainType: string|null   // "business", "personal", "unknown", or null
}
```

**Classification Logic:**
1. Extract domain from email using DomainExtractor
2. Check if domain is business or personal using DomainExtractor.isBusinessDomain()
3. Return classification

**Domain Types:**
- `'business'`: Corporate/business domains (not in common personal provider list)
- `'personal'`: Common personal email providers (gmail.com, yahoo.com, etc.)
- `'unknown'`: Domain extracted but couldn't classify
- `null`: No domain found or error

**Example:**
```javascript
const classifier = new DomainClassifier(logger);

classifier.classify("john@acme-corp.com");
// {domain: "acme-corp.com", domainType: "business"}

classifier.classify("john@gmail.com");
// {domain: "gmail.com", domainType: "personal"}

classifier.classify("invalid-email");
// {domain: null, domainType: null}
```

---

##### src/features/enrichment/post-cleaners/confidence-scorer.js

**Purpose**: Calculates overall data quality confidence score for contacts based on field presence, cleanliness, and validation results. Provides a single quality metric and detailed breakdown.

###### Class: `ConfidenceScorer`

**Constructor:**
```javascript
constructor(logger): ConfidenceScorer
```

**Parameters:**
- `logger` (Object): Logger instance

**Returns:** ConfidenceScorer instance

**Properties:**
- `logger` (Object): Logger instance

---

###### `_log(level, message): void` (Private)

Safe logger helper method.

**Parameters:**
- `level` (string): Log level
- `message` (string): Message to log

**Returns:** void

---

###### `calculate(contact, validationData = {}): Object`

Calculates confidence score for a contact.

**Parameters:**
- `contact` (Object): Contact object with fields (name, email, phone, location, etc.)
- `validationData` (Object): Validation data from other cleaners
  - `phoneValidation` (Object): Phone-location validation result

**Returns:** Object - Confidence score and breakdown

**Return Structure:**
```javascript
{
  overall: string,        // "high", "medium", or "low"
  score: number,          // Total score 0-100
  breakdown: Object       // Detailed score breakdown
}
```

**Scoring System (Total: 100 points):**

1. **Name cleanliness (20 points)**
   - Full 20 points if name exists and has no embedded title suffix
   - Embedded titles detected: Partner, Associate, Counsel, Director, Manager, Of Counsel

2. **Location cleanliness (20 points)**
   - Full 20 points if location exists and has no embedded phone number
   - Phone pattern: `\+?\d+[\d\s\-\(\)]{7,}`

3. **Email present and valid (30 points)**
   - Full 30 points if email exists and matches valid format
   - Valid format: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`

4. **Phone format valid (15 points)**
   - Full 15 points if phone exists and matches valid format
   - Valid format: `/^\+\d+[\d\s\-\(\)]+$/`

5. **Phone-location correlation (15 points)**
   - Full 15 points if phone-location validation passed (no mismatch)
   - 0 points if mismatch detected or validation not performed

**Overall Confidence Levels:**
- **High**: Score >= 80 points
- **Medium**: Score >= 60 points
- **Low**: Score < 60 points

**Breakdown Object:**
```javascript
{
  nameClean: 20,           // 20 or 0
  locationClean: 20,       // 20 or 0
  emailPresent: 30,        // 30 or 0
  phoneValid: 15,          // 15 or 0
  phoneLocationValid: 15   // 15 or 0
}
```

**Example:**
```javascript
const scorer = new ConfidenceScorer(logger);

// High confidence contact
const result1 = scorer.calculate({
  name: "John Doe",
  email: "john@example.com",
  phone: "+1-212-555-1234",
  location: "New York, NY"
}, {
  phoneValidation: { hasMismatch: false }
});
// {
//   overall: "high",
//   score: 100,
//   breakdown: {
//     nameClean: 20,
//     locationClean: 20,
//     emailPresent: 30,
//     phoneValid: 15,
//     phoneLocationValid: 15
//   }
// }

// Medium confidence contact (embedded title, phone mismatch)
const result2 = scorer.calculate({
  name: "Jane Smith, Partner",
  email: "jane@example.com",
  phone: "+1-212-555-5678",
  location: "Los Angeles, CA"
}, {
  phoneValidation: { hasMismatch: true }
});
// {
//   overall: "medium",
//   score: 65,
//   breakdown: {
//     locationClean: 20,
//     emailPresent: 30,
//     phoneValid: 15
//   }
// }

// Low confidence contact (minimal data)
const result3 = scorer.calculate({
  name: "Bob Johnson",
  email: "invalid-email"
}, {});
// {
//   overall: "low",
//   score: 20,
//   breakdown: { nameClean: 20 }
// }
```

---

###### `hasEmbeddedTitle(name): boolean`

Checks if name has embedded title suffix.

**Parameters:**
- `name` (string): Name to check

**Returns:** boolean

**Detected Titles:** Partner, Associate, Counsel, Director, Manager, Of Counsel

**Pattern:** `/\b(Partner|Associate|Counsel|Director|Manager|Of Counsel)$/i`

**Example:**
```javascript
scorer.hasEmbeddedTitle("John Doe");           // false
scorer.hasEmbeddedTitle("John Doe, Partner");  // true
scorer.hasEmbeddedTitle("Jane Smith, Associate"); // true
```

---

###### `hasEmbeddedPhone(location): boolean`

Checks if location has embedded phone number.

**Parameters:**
- `location` (string): Location to check

**Returns:** boolean

**Pattern:** `/\+?\d+[\d\s\-\(\)]{7,}/`

**Example:**
```javascript
scorer.hasEmbeddedPhone("New York, NY");                    // false
scorer.hasEmbeddedPhone("New York, NY +1-212-555-1234");   // true
```

---

###### `isValidEmail(email): boolean`

Checks if email is valid format.

**Parameters:**
- `email` (string): Email to check

**Returns:** boolean

**Pattern:** `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`

**Example:**
```javascript
scorer.isValidEmail("john@example.com");  // true
scorer.isValidEmail("invalid-email");     // false
scorer.isValidEmail("no@domain");         // false
```

---

###### `isValidPhoneFormat(phone): boolean`

Checks if phone is in valid format (must start with + and country code).

**Parameters:**
- `phone` (string): Phone to check

**Returns:** boolean

**Pattern:** `/^\+\d+[\d\s\-\(\)]+$/`

**Example:**
```javascript
scorer.isValidPhoneFormat("+1-212-555-1234");   // true
scorer.isValidPhoneFormat("+44 20 1234 5678");  // true
scorer.isValidPhoneFormat("212-555-1234");      // false (no +)
scorer.isValidPhoneFormat("+1 (212) 555-1234"); // true
```

---

**[TODO: Document remaining 9 enrichment files - cleaners (5), field-comparator, profile-enricher, profile-extractor, report-generator]**

---

### Export

**Purpose**: Google Sheets export system for automated data export with intelligent column detection, batch writing, and data formatting.

#### src/features/export/index.js

**Purpose**: Export module entry point. Exports all export components.

**Module Exports:**
```javascript
{
  SheetExporter,    // Main orchestrator
  SheetManager,     // Google Sheets API management
  ColumnDetector,   // Column detection and filtering
  DataFormatter,    // Data formatting utilities
  BatchWriter       // Batch write operations
}
```

---

#### src/features/export/sheet-exporter.js

**Purpose**: Main orchestrator for Google Sheets export workflow. Coordinates column detection, data formatting, and batch writing operations.

##### Class: `SheetExporter`

###### `constructor(logger = null, options = {}): SheetExporter`
Initializes sheet exporter with components and options.

**Parameters:**
- `logger` (Object|null): Logger instance (optional)
- `options` (Object): Configuration options
  - `batchSize` (number): Rows per batch (default: 100)

**Returns:** SheetExporter instance

**Properties:**
- `sheetManager` (SheetManager): Google Sheets API manager
- `columnDetector` (ColumnDetector): Column detection service
- `dataFormatter` (DataFormatter): Data formatting service
- `batchWriter` (BatchWriter|null): Batch writer (initialized after auth)
- `options` (Object): Configuration options

---

###### `isConfigured(): boolean`
Checks if Google Sheets export is configured with valid credentials.

**Parameters:** None

**Returns:** boolean - True if all required environment variables present

**Environment Variables Required:**
- `GOOGLE_SHEETS_CLIENT_EMAIL`
- `GOOGLE_SHEETS_PRIVATE_KEY`
- `GOOGLE_SHEETS_SPREADSHEET_ID`

---

###### `async exportToSheet(contactsOrFile, options = {}): Promise<Object>`
Main entry point for exporting contacts to Google Sheets.

**Parameters:**
- `contactsOrFile` (Array|string|Object): Contacts array, file path, or object with contacts property
- `options` (Object): Export options
  - `sheetName` (string): Sheet name (auto-generated if not provided)
  - `sheetId` (string): Existing sheet ID for append mode
  - `mode` (string): 'create' | 'append' (default: 'create')
  - `includeEnrichment` (boolean): Include enrichment metadata columns
  - `coreOnly` (boolean): Only include core fields (name, email, phone, title, location, profileUrl)
  - `includeAll` (boolean): Include all detected fields
  - `columns` (string[]): Explicit column list
  - `exclude` (string[]): Columns to exclude

**Returns:** Promise<Object> - Export result
```javascript
{
  success: true,
  mode: 'create' | 'append',
  spreadsheetId: string,
  sheetId: number,
  sheetName: string,
  spreadsheetUrl: string,
  rowsWritten: number,
  columns: string[],
  batches: number,
  durationMs: number
}
```

**Behavior:**
- Loads contacts from file or array
- Authenticates with Google Sheets API
- Detects and filters columns based on options
- Creates new sheet or appends to existing sheet
- Writes data in batches
- Formats headers (bold, frozen, gray background)
- Auto-resizes columns
- Returns complete export statistics

**Throws:**
- Error if no contacts to export
- Error if not configured (missing credentials)
- Error if sheet ID required for append mode
- Error if unknown mode specified

---

###### `async createNewSheet(sheetName, contacts, columnOptions = {}): Promise<Object>`
Creates a new sheet and populates it with contacts.

**Parameters:**
- `sheetName` (string): Name for new sheet
- `contacts` (Array): Array of contact objects
- `columnOptions` (Object): Column filtering options (see exportToSheet)

**Returns:** Promise<Object> - Result with sheet info and statistics

**Behavior:**
- Detects available columns from contacts
- Filters columns based on options
- Creates new sheet with sufficient rows (contacts + header + buffer)
- Writes header row and data rows in batches
- Formats header row (bold, frozen, gray background)
- Auto-resizes columns to fit content
- Returns export statistics

---

###### `async appendToSheet(sheetId, contacts, columnOptions = {}): Promise<Object>`
Appends contacts to an existing sheet.

**Parameters:**
- `sheetId` (string): Sheet ID to append to
- `contacts` (Array): Array of contact objects
- `columnOptions` (Object): Column filtering options

**Returns:** Promise<Object> - Result with append statistics

**Behavior:**
- Detects columns from contacts
- Filters columns based on options
- Formats contact data (no header row)
- Appends rows to existing sheet
- Returns append statistics

**Note:** Simplified implementation. Production version should read existing headers to match columns.

---

###### `generateSheetName(contacts, metadata = {}): string`
Generates descriptive sheet name from contacts metadata.

**Parameters:**
- `contacts` (Array): Array of contacts
- `metadata` (Object): Metadata from JSON file (optional)
  - `url` (string): Source URL

**Returns:** string - Generated sheet name

**Format:**
- With domain: `"domain - Dec 9, 2024"`
- Without domain: `"Contacts - Dec 9, 2024"`

**Behavior:**
- Extracts domain from metadata URL first
- Falls back to first contact's profile URL
- Formats date as "MMM D, YYYY"

---

###### `printSummary(result): void`
Prints formatted export summary to console.

**Parameters:**
- `result` (Object): Export result object

**Returns:** void

**Console Output:**
```
================================================================================
GOOGLE SHEETS EXPORT COMPLETE
================================================================================
Mode:           create
Sheet Name:     compass.com - Dec 9, 2024
Rows Written:   245
Columns:        5
Batches:        3
Duration:       4.2s

Sheet URL: https://docs.google.com/spreadsheets/d/...
================================================================================
```

---

###### `_log(level, message): void` (Private)
Safe logger helper that checks if logger exists before calling.

**Parameters:**
- `level` (string): Log level (debug, info, warn, error)
- `message` (string): Message to log

**Returns:** void

---

###### `_extractDomain(url): string|null` (Private)
Extracts domain from URL for sheet naming.

**Parameters:**
- `url` (string): URL to extract domain from

**Returns:** string|null - Domain without www/com/org or null if invalid

**Example:** `"https://www.compass.com/agents"` → `"compass"`

---

###### `_loadContacts(contactsOrFile): Object` (Private)
Loads contacts from file or array input.

**Parameters:**
- `contactsOrFile` (Array|string|Object): Contacts input

**Returns:** Object - {contacts: Array, metadata: Object}

**Supported Input Types:**
1. Array: `[{name, email}, ...]`
2. File path: `"./data/contacts.json"`
3. Object: `{contacts: [...], metadata: {...}}`

**Throws:** Error if file not found or invalid input type

---

#### src/features/export/sheet-manager.js

**Purpose**: Handles Google Sheets API authentication and low-level sheet operations using service account authentication.

##### Class: `SheetManager`

###### `constructor(logger = null): SheetManager`
Initializes sheet manager with service account credentials from environment.

**Parameters:**
- `logger` (Object|null): Logger instance (optional)

**Returns:** SheetManager instance

**Properties:**
- `clientEmail` (string): From GOOGLE_SHEETS_CLIENT_EMAIL
- `privateKey` (string): From GOOGLE_SHEETS_PRIVATE_KEY (auto-converts \\n to newlines)
- `spreadsheetId` (string): From GOOGLE_SHEETS_SPREADSHEET_ID
- `sheets` (Object|null): Google Sheets API client (null until authenticated)
- `auth` (Object|null): JWT auth client (null until authenticated)

---

###### `isConfigured(): boolean`
Checks if all required credentials are present and non-empty.

**Parameters:** None

**Returns:** boolean - True if configured

**Checks:**
- Client email present and non-empty
- Private key present and non-empty
- Spreadsheet ID present and non-empty

---

###### `validateCredentials(): Object`
Validates credential format and provides helpful error messages.

**Parameters:** None

**Returns:** Object - {valid: boolean, errors: string[]}

**Validation Checks:**
- Client email ends with `.iam.gserviceaccount.com`
- Private key contains BEGIN/END PRIVATE KEY markers
- Spreadsheet ID length >= 20 characters
- No placeholder values

**Example Return:**
```javascript
{
  valid: false,
  errors: [
    'GOOGLE_SHEETS_CLIENT_EMAIL should be a service account email',
    'GOOGLE_SHEETS_PRIVATE_KEY format is invalid'
  ]
}
```

---

###### `async authenticate(): Promise<boolean>`
Authenticates with Google Sheets API using service account credentials.

**Parameters:** None

**Returns:** Promise<boolean> - True if successful

**Behavior:**
- Validates credentials format first
- Creates JWT auth client with spreadsheets scope
- Authorizes with Google
- Initializes Sheets API client
- Provides detailed error messages for common issues

**Throws:** Error with helpful setup instructions if authentication fails

**Common Error Messages:**
- `invalid_grant` / `Invalid JWT`: Private key format issue, expired credentials
- `404` / `Not found`: Invalid spreadsheet ID or no access
- `403` / `forbidden`: API not enabled or no Editor permissions

---

###### `async getExistingSheetNames(): Promise<string[]>`
Gets list of sheet names (tabs) in the spreadsheet.

**Parameters:** None

**Returns:** Promise<string[]> - Array of sheet names

**API Call:** `spreadsheets.get` with `fields: 'sheets.properties.title'`

---

###### `async getUniqueSheetName(baseName): Promise<string>`
Generates unique sheet name by appending number if duplicate exists.

**Parameters:**
- `baseName` (string): Desired sheet name

**Returns:** Promise<string> - Unique sheet name

**Behavior:**
- Truncates to 100 characters (Google Sheets limit)
- Returns baseName if unique
- Appends (2), (3), etc. until unique
- Truncates base to 95 characters to allow suffix

**Example:**
- Input: `"Contacts - Dec 9, 2024"` (exists)
- Output: `"Contacts - Dec 9, 2024 (2)"`

---

###### `async createSheet(sheetName, options = {}): Promise<Object>`
Creates a new sheet (tab) in the spreadsheet.

**Parameters:**
- `sheetName` (string): Sheet name
- `options` (Object): Optional settings
  - `rowCount` (number): Number of rows (default: 1000, expands automatically for larger datasets)
  - `columnCount` (number): Number of columns (default: 26)

**Returns:** Promise<Object>
```javascript
{
  sheetId: number,
  sheetName: string,
  spreadsheetId: string,
  spreadsheetUrl: string
}
```

**Behavior:**
- Ensures unique sheet name
- Calculates row count: max(rowCount + 100, 1000) for buffer
- Creates sheet via batchUpdate API
- Returns sheet info with URL

---

###### `async getSpreadsheet(spreadsheetId = null): Promise<Object>`
Gets spreadsheet metadata and properties.

**Parameters:**
- `spreadsheetId` (string|null): Spreadsheet ID (uses default if not provided)

**Returns:** Promise<Object> - Full spreadsheet metadata from API

---

###### `async writeRows(spreadsheetId, range, values): Promise<Object>`
Writes rows to a specific range in the spreadsheet.

**Parameters:**
- `spreadsheetId` (string): Spreadsheet ID (uses default if null)
- `range` (string): A1 notation range (e.g., `"'Sheet1'!A1:E100"`)
- `values` (Array<Array>): 2D array of values

**Returns:** Promise<Object> - Update response from API

**API Call:** `spreadsheets.values.update` with `valueInputOption: 'RAW'`

---

###### `async appendRows(spreadsheetId, range, values): Promise<Object>`
Appends rows to the end of a sheet.

**Parameters:**
- `spreadsheetId` (string): Spreadsheet ID
- `range` (string): A1 notation range (e.g., `"'Sheet1'!A:E"`)
- `values` (Array<Array>): 2D array of values

**Returns:** Promise<Object> - Append response from API

**API Call:** `spreadsheets.values.append` with `valueInputOption: 'RAW'`, `insertDataOption: 'INSERT_ROWS'`

---

###### `async formatHeaders(sheetId, columnCount): Promise<void>`
Formats header row with bold text, gray background, and freeze.

**Parameters:**
- `sheetId` (number): Sheet ID to format
- `columnCount` (number): Number of columns in header

**Returns:** Promise<void>

**Formatting Applied:**
- Bold text
- Gray background (RGB: 0.9, 0.9, 0.9)
- Frozen first row

**API Call:** `spreadsheets.batchUpdate` with repeatCell and updateSheetProperties requests

**Note:** Does not throw errors, only logs warnings if formatting fails (optional feature)

---

###### `async autoResizeColumns(sheetId, columnCount): Promise<void>`
Auto-resizes columns to fit content.

**Parameters:**
- `sheetId` (number): Sheet ID
- `columnCount` (number): Number of columns to resize

**Returns:** Promise<void>

**API Call:** `spreadsheets.batchUpdate` with autoResizeDimensions request

**Note:** Does not throw errors, only logs warnings if resizing fails (optional feature)

---

###### `_log(level, message): void` (Private)
Safe logger helper with fallback to info level.

**Parameters:**
- `level` (string): Log level
- `message` (string): Message to log

**Returns:** void

**Behavior:** Falls back to logger.info if specific level not available

---

#### src/features/export/batch-writer.js

**Purpose**: Handles efficient batch write operations to Google Sheets with progress reporting. Splits large datasets into batches to avoid API limits and rate limiting.

##### Class: `BatchWriter`

###### `constructor(sheetManager, logger = null): BatchWriter`
Initializes batch writer with sheet manager.

**Parameters:**
- `sheetManager` (SheetManager): Sheet manager instance
- `logger` (Object|null): Logger instance (optional)

**Returns:** BatchWriter instance

**Properties:**
- `sheetManager` (SheetManager): Sheet manager for API calls
- `defaultBatchSize` (number): 100 rows per batch

---

###### `async writeBatch(spreadsheetId, range, rows, batchNumber, totalBatches): Promise<Object>`
Writes a single batch of rows to the sheet.

**Parameters:**
- `spreadsheetId` (string): Spreadsheet ID
- `range` (string): A1 notation range
- `rows` (Array<Array>): 2D array of row values
- `batchNumber` (number): Current batch number (1-based)
- `totalBatches` (number): Total number of batches

**Returns:** Promise<Object> - Write response from sheet manager

**Throws:** Error if write fails (propagates from sheetManager)

---

###### `async writeAllRows(spreadsheetId, sheetName, rows, options = {}): Promise<Object>`
Writes all rows to a sheet in batches with progress tracking.

**Parameters:**
- `spreadsheetId` (string): Spreadsheet ID
- `sheetName` (string): Sheet name
- `rows` (Array<Array>): 2D array of all row values (including header)
- `options` (Object): Write options
  - `batchSize` (number): Rows per batch (default: 100)
  - `onProgress` (Function): Progress callback(batchNum, totalBatches, rowsWritten)

**Returns:** Promise<Object>
```javascript
{
  success: boolean,
  rowsWritten: number,
  batches: number
}
```

**Behavior:**
- Returns early if no rows to write
- Calculates total batches needed
- Writes batches sequentially with 100ms delay between batches
- Calls progress callback after each batch
- Calculates A1 notation ranges automatically
- Logs progress and completion

**Example Progress Callback:**
```javascript
onProgress: (batch, total, rows) => {
  console.log(`Progress: batch ${batch}/${total} (${rows} rows written)`);
}
```

---

###### `calculateRange(sheetName, startRow, endRow, columnCount): string`
Calculates A1 notation range for a batch.

**Parameters:**
- `sheetName` (string): Sheet name
- `startRow` (number): Start row (1-indexed)
- `endRow` (number): End row (1-indexed)
- `columnCount` (number): Number of columns

**Returns:** string - A1 notation range

**Examples:**
- `calculateRange('Sheet1', 1, 100, 5)` → `"'Sheet1'!A1:E100"`
- `calculateRange('My Sheet', 101, 200, 10)` → `"'My Sheet'!A101:J200"`

---

###### `_columnToLetter(column): string` (Private)
Converts column number to letter notation.

**Parameters:**
- `column` (number): Column number (1-indexed)

**Returns:** string - Column letter(s)

**Examples:**
- `1` → `"A"`
- `26` → `"Z"`
- `27` → `"AA"`
- `52` → `"AZ"`

**Algorithm:** Base-26 conversion with A=1 offset

---

###### `_delay(ms): Promise<void>` (Private)
Sleep helper for rate limiting between batches.

**Parameters:**
- `ms` (number): Milliseconds to delay

**Returns:** Promise<void>

---

###### `_log(level, message): void` (Private)
Safe logger helper.

**Parameters:**
- `level` (string): Log level
- `message` (string): Message to log

**Returns:** void

---

#### src/features/export/column-detector.js

**Purpose**: Auto-detects available columns from contact data and provides column ordering, filtering, and grouping capabilities. Configurable via constants at top of file.

##### Configuration Constants

**`DEFAULT_COLUMNS`** - Default columns exported when no options specified:
```javascript
['name', 'email', 'phone', 'title', 'profileUrl']
```

**`COLUMN_DISPLAY_NAMES`** - Display names for column headers:
```javascript
{
  'name': 'Name',
  'email': 'Email',
  'phone': 'Phone',
  'title': 'Title',
  'location': 'Location',
  'profileUrl': 'Profile URL',
  'domain': 'Domain',
  'domainType': 'Domain Type',
  // ... etc
}
```

**`COLUMN_GROUPS`** - Predefined column groups:
- `core`: 6 essential contact fields (name, email, phone, title, location, profileUrl)
- `extended`: core + domain and confidence info
- `enrichment`: enrichment metadata (enrichedAt, actionsSummary, confidence, fieldsEnrichedCount, fieldsCleanedCount)

---

##### Class: `ColumnDetector`

###### `constructor(logger = null): ColumnDetector`
Initializes column detector with configurable defaults.

**Parameters:**
- `logger` (Object|null): Logger instance (optional)

**Returns:** ColumnDetector instance

**Properties:**
- `defaultColumns` (string[]): From DEFAULT_COLUMNS configuration
- `standardOrder` (string[]): Standard column ordering for sorting
- `coreFields` (string[]): Core contact fields
- `enrichmentColumns` (string[]): Enrichment metadata fields
- `displayNames` (Object): Column display name mapping

---

###### `getDefaultColumns(): string[]`
Gets default columns from configuration.

**Parameters:** None

**Returns:** string[] - Array of default column names

---

###### `getStandardColumns(): string[]`
Gets standard core columns (6 essential fields).

**Parameters:** None

**Returns:** string[] - ['name', 'email', 'phone', 'title', 'location', 'profileUrl']

---

###### `getEnrichmentColumns(): string[]`
Gets enrichment metadata columns.

**Parameters:** None

**Returns:** string[] - ['enrichedAt', 'actionsSummary', 'confidence', 'fieldsEnrichedCount', 'fieldsCleanedCount']

---

###### `detectColumns(contacts, sampleSize = 10): string[]`
Detects all available columns from contact data by sampling contacts.

**Parameters:**
- `contacts` (Array): Array of contact objects
- `sampleSize` (number): Number of contacts to sample (default: 10)

**Returns:** string[] - Array of detected field names in standard order

**Behavior:**
- Samples min(sampleSize, contacts.length) contacts
- Extracts all top-level fields (except internal fields starting with _)
- Skips complex objects except arrays (education, practiceAreas, etc.)
- Detects enrichment data availability
- Returns ordered array using standardOrder

---

###### `orderColumns(fields): string[]`
Orders columns according to standard order.

**Parameters:**
- `fields` (string[]): Array of field names

**Returns:** string[] - Ordered array

**Ordering:**
1. Fields in standardOrder (preserves standard order)
2. Remaining fields alphabetically

---

###### `filterColumns(fields, options = {}): string[]`
Filters columns based on export options.

**Parameters:**
- `fields` (string[]): Array of available field names (from detectColumns)
- `options` (Object): Filter options
  - `includeEnrichment` (boolean): Add enrichment metadata columns
  - `coreOnly` (boolean): Only include core fields (takes precedence)
  - `includeAll` (boolean): Include all detected fields
  - `columns` (string[]): Explicit list of columns to include
  - `exclude` (string[]): Columns to exclude

**Returns:** string[] - Filtered and ordered array of field names

**Behavior:**
1. **Explicit columns**: Uses only specified columns if provided
2. **Core only**: Filters to core fields only (name, email, phone, title, location, profileUrl)
3. **Include all**: Uses all detected fields
4. **Default**: Uses DEFAULT_COLUMNS (filtered to those that exist in contacts)
5. **Enrichment**: Adds enrichment columns if requested (unless coreOnly=true)
6. **Exclude**: Removes excluded columns
7. **Order**: Returns ordered by DEFAULT_COLUMNS order, then standard order, then alphabetically

**Priority:** `coreOnly` takes full precedence. When specified, ONLY core fields are exported, even if `includeEnrichment` is also provided.

---

###### `getColumnHeaders(columns): string[]`
Gets display headers for columns.

**Parameters:**
- `columns` (string[]): Array of column field names

**Returns:** string[] - Array of display headers (same order as input)

**Behavior:**
- Maps field names to display names from COLUMN_DISPLAY_NAMES
- Auto-formats fields not in mapping (camelCase → Title Case)

**Example:**
```javascript
getColumnHeaders(['name', 'profileUrl', 'domainType'])
// Returns: ['Name', 'Profile URL', 'Domain Type']
```

---

###### `_extractFieldsFromContact(contact, fields): void` (Private)
Extracts field names from a single contact into a Set.

**Parameters:**
- `contact` (Object): Contact object
- `fields` (Set): Set to add field names to

**Returns:** void

**Behavior:**
- Skips internal fields (starting with _ except _original)
- Skips complex objects (except arrays)
- Marks enrichment data availability with '_hasEnrichment'

---

###### `_orderByDefault(columns): string[]` (Private)
Orders columns by DEFAULT_COLUMNS order, then standard order, then alphabetically.

**Parameters:**
- `columns` (string[]): Array of column names

**Returns:** string[] - Ordered array

**Ordering Priority:**
1. DEFAULT_COLUMNS order
2. standardOrder
3. Alphabetically

---

###### `_formatHeader(fieldName): string` (Private)
Formats field name as display header using camelCase to Title Case conversion.

**Parameters:**
- `fieldName` (string): Field name (camelCase)

**Returns:** string - Display header (Title Case)

**Example:**
- `'domainType'` → `'Domain Type'`
- `'fieldsEnrichedCount'` → `'Fields Enriched Count'`

---

###### `_log(level, message): void` (Private)
Safe logger helper.

**Parameters:**
- `level` (string): Log level
- `message` (string): Message to log

**Returns:** void

---

#### src/features/export/data-formatter.js

**Purpose**: Converts contact objects to spreadsheet row arrays with proper formatting. Handles dates, phone numbers, arrays, and enrichment metadata.

##### Class: `DataFormatter`

###### `constructor(logger = null): DataFormatter`
Initializes data formatter.

**Parameters:**
- `logger` (Object|null): Logger instance (optional)

**Returns:** DataFormatter instance

---

###### `formatContact(contact, columns): string[]`
Formats a single contact into a row array.

**Parameters:**
- `contact` (Object): Contact object
- `columns` (string[]): Array of column names in order

**Returns:** string[] - Array of formatted values matching column order

**Example:**
```javascript
formatContact(
  { name: 'John Doe', email: 'john@example.com', phone: '5551234567' },
  ['name', 'email', 'phone']
)
// Returns: ['John Doe', 'john@example.com', '+1-555-123-4567']
```

---

###### `formatContacts(contacts, columns): Array<string[]>`
Formats multiple contacts into row arrays.

**Parameters:**
- `contacts` (Array): Array of contact objects
- `columns` (string[]): Array of column names in order

**Returns:** Array<string[]> - 2D array of formatted values

---

###### `extractFieldValue(contact, fieldName): string`
Safely extracts and formats a field value from a contact.

**Parameters:**
- `contact` (Object): Contact object
- `fieldName` (string): Field name to extract

**Returns:** string - Formatted string value (empty string if null/undefined)

**Special Formatting by Field:**
- `phone`: Phone number formatting (see formatPhone)
- `enrichedAt`: Date/time formatting (see formatDate)
- `education`, `practiceAreas`, `barAdmissions`: Array formatting (see formatArray)
- Enrichment fields: Special extraction from enrichment metadata
- Other fields: Generic value formatting

---

###### `formatPhone(phone): string`
Formats phone number to consistent format.

**Parameters:**
- `phone` (string): Phone number (any format)

**Returns:** string - Formatted phone number

**Format:** `"+1-XXX-XXX-XXXX"`

**Examples:**
- `'5551234567'` → `'+1-555-123-4567'`
- `'15551234567'` → `'+1-555-123-4567'`
- `'+1-555-123-4567'` → `'+1-555-123-4567'` (already formatted)

**Behavior:**
- Returns empty string if null/undefined
- Returns as-is if already formatted
- Extracts digits and formats if 10 or 11 digits
- Returns original if can't format

---

###### `formatDate(timestamp): string`
Formats date/timestamp to readable string.

**Parameters:**
- `timestamp` (string|Date): ISO string or Date object

**Returns:** string - Formatted date

**Format:** `"Dec 9, 2024 6:10 PM"`

**Example:**
- `'2024-12-09T18:10:00.000Z'` → `'Dec 9, 2024 6:10 PM'`

**Behavior:**
- Returns empty string if null/undefined
- Returns original as string if invalid date

---

###### `formatArray(value): string`
Formats array value to comma-separated string.

**Parameters:**
- `value` (Array|string): Array or string value

**Returns:** string - Comma-separated string

**Examples:**
- `['Harvard Law', 'Yale Law']` → `'Harvard Law, Yale Law'`
- `'Harvard Law'` → `'Harvard Law'`

---

###### `formatValue(value): string`
Formats generic value to string.

**Parameters:**
- `value` (any): Any value

**Returns:** string - String representation

**Behavior:**
- null/undefined → empty string
- Array → formatArray
- Object → JSON.stringify (or '[Object]' if error)
- Other → String(value)

---

###### `formatEnrichmentActions(actions): string`
Formats enrichment actions object to readable string.

**Parameters:**
- `actions` (Object): Actions object {field: action}

**Returns:** string - Formatted string

**Format:** `"name:CLEANED, email:ENRICHED"`

**Behavior:**
- Skips UNCHANGED and BOTH_MISSING actions (not interesting)
- Returns comma-separated list of field:action pairs

**Example:**
```javascript
formatEnrichmentActions({
  name: 'CLEANED',
  email: 'ENRICHED',
  phone: 'UNCHANGED'
})
// Returns: 'name:CLEANED, email:ENRICHED'
```

---

###### `formatConfidence(confidence): string`
Formats confidence value (handles both string and object).

**Parameters:**
- `confidence` (string|Object): Confidence value

**Returns:** string - Formatted confidence string

**Behavior:**
- String → returns as-is
- Object → returns confidence.overall
- Other → String(value)

---

###### `_isEnrichmentField(fieldName): boolean` (Private)
Checks if field is an enrichment metadata field.

**Parameters:**
- `fieldName` (string): Field name

**Returns:** boolean

**Enrichment Fields:**
- enrichedAt
- actionsSummary
- confidence
- fieldsEnrichedCount
- fieldsCleanedCount

---

###### `_extractEnrichmentField(contact, fieldName): string` (Private)
Extracts enrichment metadata field from contact.

**Parameters:**
- `contact` (Object): Contact object
- `fieldName` (string): Enrichment field name

**Returns:** string - Formatted value

**Source:** Checks `contact.enrichment` or `contact._enrichment`

**Field Extraction:**
- `enrichedAt`: formatDate(enrichment.enrichedAt)
- `actionsSummary`: formatEnrichmentActions(enrichment.actions)
- `confidence`: formatConfidence(enrichment.confidence)
- `fieldsEnrichedCount`: Count of 'ENRICHED' actions
- `fieldsCleanedCount`: Count of 'CLEANED' actions

---

###### `_countActions(actions, actionType): number` (Private)
Counts specific action type in actions object.

**Parameters:**
- `actions` (Object): Actions object {field: action}
- `actionType` (string): Action type to count ('ENRICHED', 'CLEANED', etc.)

**Returns:** number - Count of matching actions

---

###### `_log(level, message): void` (Private)
Safe logger helper.

**Parameters:**
- `level` (string): Log level
- `message` (string): Message to log

**Returns:** void

---

## Scrapers

**[TODO: Document 7 scraper files - base-scraper, config-scrapers (5), scrapers/index]**

---

## Tools

**[TODO: Document 20 tool files - config-generator, enrich-contacts, export-to-sheets, test-config, test-navigation, validate-config, lib (13), assets/overlay-client]**

---

## Utils

### src/utils/page-fingerprint.js

**Purpose**: Detects when paginated pages return duplicate content from page 1. Prevents false positives in binary search where websites serve page 1 content for invalid page numbers.

**Use Case**: Used by binary search algorithm to validate that each page contains unique contacts and isn't just a redirect/fallback to page 1.

---

#### Class: `PageFingerprint`

**Constructor:**
```javascript
constructor(logger = console)
```

**Parameters:**
- `logger` (Object): Logger instance (optional, defaults to console)

**Properties:**
- `logger` (Object): Logger instance for debug/info/warn messages
- `page1Fingerprint` (Object|null): Stored fingerprint of page 1 contacts

---

#### `capturePage1(contacts): void`
Captures fingerprint from page 1 contacts. Call once before starting pagination validation.

**Parameters:**
- `contacts` (Array<Object>): Contacts extracted from page 1
  - Each contact should have: `{name, profileUrl}`

**Behavior:**
- Generates triple fingerprint: urlHash, nameHash, boundary markers
- Stores first/last contact names and total count
- Logs fingerprint capture with debug information
- If no contacts, sets fingerprint to null

**Example:**
```javascript
const fingerprint = new PageFingerprint(logger);
const page1Contacts = await extractContactsFromPage(1);
fingerprint.capturePage1(page1Contacts);
```

---

#### `validate(pageNum, contacts): Object`
Validates if a page's contacts are unique (not duplicates of page 1).

**Parameters:**
- `pageNum` (number): Page number being tested
- `contacts` (Array<Object>): Contacts extracted from test page

**Returns:** Object
```javascript
{
  valid: boolean,    // true if page is valid, false if duplicate
  reason: string     // Reason code
}
```

**Reason Codes:**
- `'page_1'` - Page 1 is always valid
- `'empty'` - No contacts found (invalid)
- `'no_fingerprint'` - No fingerprint captured, skipping validation
- `'duplicate_urls'` - Profile URLs match page 1 (duplicate)
- `'duplicate_names'` - Contact names match page 1 (duplicate)
- `'duplicate_boundaries'` - First/last/count match page 1 (duplicate)
- `'unique'` - Page contains unique content (valid)

**Validation Logic:**
1. Page 1 always returns valid
2. Empty pages return invalid
3. Triple-check for duplicates:
   - URL hash comparison (first 5 profile URLs)
   - Name hash comparison (first 5 names)
   - Boundary comparison (first contact + last contact + count)

**Example:**
```javascript
const page5Contacts = await extractContactsFromPage(5);
const result = fingerprint.validate(5, page5Contacts);

if (!result.valid) {
  logger.warn(`Page 5 is invalid: ${result.reason}`);
  // Treat as end of pagination
}
```

---

#### `reset(): void`
Resets fingerprint state. Call when starting a new scrape session.

**Behavior:**
- Clears page1Fingerprint to null
- Logs reset action

**Example:**
```javascript
fingerprint.reset();
// Ready for new scraping session
```

---

#### `_generateUrlHash(contacts): string` (Private)
Generates hash from profile URLs of first 5 contacts.

**Parameters:**
- `contacts` (Array<Object>): Contact array

**Returns:** string - Pipe-delimited hash of URLs/names

**Example Output:** `"/profile/1|/profile/2|/profile/3|/profile/4|/profile/5"`

---

#### `_generateNameHash(contacts): string` (Private)
Generates hash from names of first 5 contacts. Backup method for sites without profile URLs.

**Parameters:**
- `contacts` (Array<Object>): Contact array

**Returns:** string - Pipe-delimited hash of names

**Example Output:** `"John Doe|Jane Smith|Bob Johnson|Alice Brown|Charlie Davis"`

---

#### Module Exports

```javascript
module.exports = { PageFingerprint };
```

**Usage:**
```javascript
const { PageFingerprint } = require('./src/utils/page-fingerprint');
```

---

**[TODO: Document remaining 7 utils files - constants, contact-extractor, domain-extractor, google-sheets-exporter, profile-visitor, prompt-helper, stats-reporter]**

---

## Workflows

**[TODO: Document 1 workflow file - full-pipeline]**

---

## Tests

**[TODO: Document 5 test files - enrichment-test, pagination-priority.test, post-cleaning-test, run-navigation-tests, selenium-infinite-scroll.test]**

---

## Documentation Status

**Completed:** 23 files (26.4%)
**Remaining:** 64 files (73.6%)

**Recently Completed:**
- Enrichment Post-Cleaners Module (7 files): field-cleaner, multi-location-handler, phone-location-correlator, location-normalizer, domain-classifier, confidence-scorer, index
- Export Module (6 files): sheet-exporter, sheet-manager, batch-writer, column-detector, data-formatter, index

**Priority for completion:**
1. Pagination (4 files) - Critical for scraping
2. Scrapers (7 files) - Core logic
3. Extraction (8 files) - Data extraction
4. Enrichment Remaining (9 files) - Cleaners (5), field-comparator, profile-enricher, profile-extractor, report-generator
5. Utils (7 files) - Utilities
6. Tools (20 files) - Development tools
7. Workflows (1 file) - Pipeline
8. Tests (5 files) - Test suites

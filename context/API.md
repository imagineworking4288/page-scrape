# API Documentation

Comprehensive API documentation for all exported functions and classes.

## Core Infrastructure

### BrowserManager (`src/core/browser-manager.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `logger` | `BrowserManager` | Initializes browser manager with logger and stealth configuration |
| `launch` | `headless=true` | `Promise<boolean>` | Launches Puppeteer browser with stealth plugin and CSP bypass enabled |
| `navigate` | `url, timeout=30000` | `Promise<boolean>` | Navigates to URL with CAPTCHA detection and memory recycling |
| `checkMemoryAndRecycle` | none | `Promise<void>` | Recycles browser page after 50 navigations or 1GB memory growth |
| `getPage` | none | `Page` | Returns current Puppeteer page instance throws if not initialized |
| `close` | none | `Promise<void>` | Closes browser instance and logs completion status |
| `detectCaptcha` | `url` | `Promise<void>` | Detects CAPTCHA keywords throws CAPTCHA_DETECTED error if found |
| `setupConsoleFiltering` | `page` | `void` | Filters CSP errors from browser console output |
| `logMemoryUsage` | none | `void` | Logs current heap RSS and navigation count metrics |

### SeleniumManager (`src/core/selenium-manager.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `logger, options={}` | `SeleniumManager` | Initializes Selenium WebDriver manager with Chrome options and stealth mode |
| `launch` | `headless=true` | `Promise<void>` | Launches Chrome WebDriver with stealth user agent and CDP commands |
| `navigate` | `url` | `Promise<void>` | Navigates to URL and waits for page load complete state |
| `scrollToFullyLoad` | `config={}` | `Promise<Object>` | Performs PAGE_DOWN scrolling with Load More button detection returns scroll stats |
| `detectLoadMoreButton` | `click=true` | `Promise<Object|null>` | Detects and optionally clicks Load More buttons using multiple strategies |
| `getDriver` | none | `WebDriver` | Returns Selenium WebDriver instance throws if not initialized |
| `close` | none | `Promise<void>` | Closes Selenium WebDriver and cleans up resources |
| `executeScript` | `script, ...args` | `Promise<any>` | Executes JavaScript in browser context with arguments |

### RateLimiter (`src/core/rate-limiter.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `options={}` | `RateLimiter` | Initializes rate limiter with base delay and exponential backoff settings |
| `wait` | none | `Promise<void>` | Waits before next request using base delay plus jitter |
| `waitBeforeRequest` | none | `Promise<void>` | Alias for wait method maintains consistent API naming |
| `handleError` | `error` | `Promise<void>` | Implements exponential backoff on errors delays up to maxDelay |
| `reset` | none | `void` | Resets error counter and backoff multiplier to initial state |
| `getStats` | none | `Object` | Returns current delay error count and backoff multiplier |

### Logger (`src/core/logger.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createLogger` | none | `Winston.Logger` | Creates Winston logger with file rotation console and JSON formatting |
| `info` | `message` | `void` | Logs info level message to console and file |
| `error` | `message` | `void` | Logs error level message to console and file |
| `warn` | `message` | `void` | Logs warning level message to console and file |
| `debug` | `message` | `void` | Logs debug level message file only no console output |

## Configuration

### ConfigLoader (`src/config/config-loader.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `logger` | `ConfigLoader` | Initializes config loader with paths to website-configs and cache |
| `loadConfig` | `url` | `Object` | Loads site config by domain merges with defaults validates structure |
| `loadConfigByName` | `name` | `Object|null` | Loads config by name supports v2.1 v2.2 v2.3 formats |
| `validateConfig` | `config, domain` | `void` | Validates config structure markers scrollBehavior parsing throws on errors |
| `validateMarker` | `marker, markerName, domain` | `void` | Validates individual marker type and value structure |
| `extractDomain` | `url` | `string` | Extracts domain from URL removes www prefix |
| `getDefaultConfig` | `domain` | `Object` | Returns default config for domain when no site-specific config exists |
| `resolveWithDefaults` | `siteConfig` | `Object` | Deep merges site config with default config template |
| `listConfigs` | none | `Array<string>` | Lists all available website config files from both locations |
| `loadPaginationCache` | none | `Object` | Loads pagination cache from _pagination_cache.json file |
| `savePaginationCache` | none | `void` | Saves pagination cache to disk with current timestamp |
| `getCachedPattern` | `domain` | `Object|null` | Retrieves cached pagination pattern for domain |
| `saveCachedPattern` | `domain, pattern` | `void` | Saves pagination pattern to cache with timestamp |
| `clearCachedPattern` | `domain` | `void` | Clears cached pattern for specific domain |
| `clearAllCachedPatterns` | none | `void` | Clears all cached pagination patterns |

## Scrapers

### BaseScraper (`src/scrapers/base-scraper.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `browserManager, rateLimiter, logger` | `BaseScraper` | Initializes base scraper with browser rate limiter and logger |
| `markEmailProcessed` | `email` | `void` | Adds email to processed set prevents duplicate extraction |
| `isEmailProcessed` | `email` | `boolean` | Checks if email has been processed returns true if duplicate |
| `calculateConfidence` | `name, email, phone` | `number` | Calculates confidence score 0-100 based on field presence |
| `addDomainInfo` | `contact` | `void` | Adds email domain classification business vs personal |
| `normalizePhone` | `phone` | `string` | Formats phone number to +1-XXX-XXX-XXXX standard |
| `validateAndCleanName` | `name` | `string|null` | Validates name length word count removes blacklisted terms |

### BaseConfigScraper (`src/scrapers/config-scrapers/base-config-scraper.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `browserManager, rateLimiter, logger, options={}` | `BaseConfigScraper` | Initializes config scraper with buffer management and field tracking |
| `loadConfig` | `configPath` | `Object` | Loads and validates v2.3 config from file path |
| `validateConfigVersion` | none | `void` | Validates config version supports v2.1 v2.2 v2.3 formats |
| `initializeCardSelector` | none | `void` | Initializes card selector from config validates primarySelector exists |
| `initializeExtractors` | `page` | `Promise<void>` | Initializes extractors based on field methods email phone link label coordinate |
| `findCardElements` | `page` | `Promise<Array>` | Finds card elements tries fallback selectors if primary fails |
| `extractContactFromCard` | `cardElement, cardIndex` | `Promise<Object|null>` | Extracts all fields from card using STRICT userValidatedMethod only |
| `extractFallbackFields` | `cardElement, contact` | `Promise<void>` | Extracts missing fields using generic DOM selectors profileUrl title location |
| `extractField` | `cardElement, fieldName, method, coords` | `Promise<Object>` | Extracts single field using specified method returns value confidence metadata |
| `normalizeFieldValue` | `fieldName, value` | `string` | Normalizes field value based on type email lowercase phone formatted |
| `isDuplicateContact` | `contact` | `boolean` | Checks if contact is duplicate by email or name-profileUrl combination |
| `markContactProcessed` | `contact` | `void` | Marks contact as processed adds to deduplication sets |
| `addContact` | `contact` | `void` | Adds contact to buffer flushes if buffer full |
| `flushContactBuffer` | none | `void` | Writes buffered contacts to file and logs progress |
| `setOutputPath` | `outputDir=null, filename=null` | `void` | Sets output path for results creates directory if needed |
| `writeContactsToFile` | none | `void` | Writes all contacts to JSON file with metadata |
| `reportProgress` | `stage, stats={}` | `void` | Logs progress with contact count rate elapsed time |
| `getResults` | none | `Object` | Returns final results with contacts stats metadata |
| `printTerminalSummary` | none | `void` | Prints detailed terminal summary with field success rates warnings |
| `scrape` | `url, limit=0` | `Promise<Array>` | Abstract method must be implemented by subclasses |

### SinglePageScraper (`src/scrapers/config-scrapers/single-page-scraper.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `browserManager, rateLimiter, logger, options={}` | `SinglePageScraper` | Initializes single page scraper extends BaseConfigScraper |
| `scrape` | `url, limit=0, options={}` | `Promise<Object>` | Scrapes contacts from single page supports skipNavigation option |

### PaginationScraper (`src/scrapers/config-scrapers/pagination-scraper.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `browserManager, rateLimiter, logger, configLoader, options={}` | `PaginationScraper` | Initializes pagination scraper with Paginator instance and page delay |
| `scrape` | `url, limit=0, options={}` | `Promise<Object>` | Scrapes contacts across multiple pages discovers pattern generates URLs |
| `extractFromCurrentPage` | `page, pageNum, limit` | `Promise<void>` | Extracts contacts from current page adds pageNum to contact |
| `scrapeCurrentPage` | `page, url, limit` | `Promise<Object>` | Fallback single page scrape when pagination discovery fails |
| `diagnose` | `page, url` | `Promise<Object>` | Runs pagination diagnosis returns pattern type URLs confidence |

### InfiniteScrollScraper (`src/scrapers/config-scrapers/infinite-scroll-scraper.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `seleniumManager, rateLimiter, logger, options={}` | `InfiniteScrollScraper` | Initializes infinite scroll scraper with Selenium PAGE_DOWN architecture |
| `scrape` | `url, limit=0, keepPdf=false, sourcePage=null, sourceUrl=null` | `Promise<Object>` | Two-phase scrape load with Selenium extract with JavaScript |
| `extractAllCardsFromSelenium` | `limit` | `Promise<Object>` | Extracts all cards from fully-loaded page using JavaScript execution |
| `diagnose` | `url` | `Promise<Object>` | Runs scroll diagnosis with Load More button detection |

### createScraper (`src/scrapers/config-scrapers/index.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `createScraper` | `paginationType, browserManager, rateLimiter, logger, configLoader=null, options={}, seleniumManager=null, config=null` | `BaseConfigScraper` | Factory creates appropriate scraper infinite-scroll pagination or single-page |
| `createScraperFromConfig` | `config, managers, options={}` | `Object` | Creates scraper from config and CLI options returns scraper and isInfiniteScroll |
| `diagnosePagination` | `page, browserManager, rateLimiter, logger, configLoader, config` | `Promise<Object>` | Diagnoses pagination type from page returns recommended scraper type |

## Extraction

### EmailExtractor (`src/extraction/extractors/email-extractor.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `page` | `EmailExtractor` | Initializes email extractor with Puppeteer page instance |
| `extractFromRegion` | `cardElement, fieldCoords` | `Promise<Object>` | Extracts email from rectangle using regex pattern returns value confidence metadata |
| `extractFromMailtoLink` | `cardElement, fieldCoords` | `Promise<Object>` | 4-layer mailto link extraction direct hit text-triggered area-scan |

### PhoneExtractor (`src/extraction/extractors/phone-extractor.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `page` | `PhoneExtractor` | Initializes phone extractor with Puppeteer page instance |
| `extractFromRegion` | `cardElement, fieldCoords` | `Promise<Object>` | Extracts phone from rectangle using multiple regex patterns |
| `extractFromTelLink` | `cardElement, fieldCoords` | `Promise<Object>` | 4-layer tel link extraction with phone number formatting |
| `normalizePhone` | `phone` | `string` | Normalizes phone to +1-XXX-XXX-XXXX format handles international |

### LinkExtractor (`src/extraction/extractors/link-extractor.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `page` | `LinkExtractor` | Initializes link extractor with Puppeteer page instance |
| `extractFromRegion` | `cardElement, fieldCoords` | `Promise<Object>` | Extracts and scores links from rectangle skips mailto tel |
| `scoreLink` | `link` | `number` | Scores link likelihood of being profile URL 0-100 |
| `extractDataAttribute` | `cardElement, fieldCoords` | `Promise<Object>` | Extracts URL from data attributes data-url data-href data-profile-url |

### LabelExtractor (`src/extraction/extractors/label-extractor.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `page` | `LabelExtractor` | Initializes label extractor with field-specific label patterns |
| `extractFromRegion` | `cardElement, fieldCoords, fieldName` | `Promise<Object>` | Finds label and extracts adjacent text value |
| `cleanValue` | `value, fieldName` | `string` | Cleans extracted value based on field type |

### CoordinateExtractor (`src/extraction/extractors/coordinate-extractor.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `page` | `CoordinateExtractor` | Initializes coordinate extractor with Puppeteer page instance |
| `extractFromRegion` | `cardElement, fieldCoords` | `Promise<Object>` | Extracts text from DOM elements at coordinates using TreeWalker |
| `extractLinkFromRegion` | `cardElement, fieldCoords` | `Promise<Object>` | Extracts href link from region specific for profileUrl |
| `extractMailtoFromRegion` | `cardElement, fieldCoords` | `Promise<Object>` | Extracts email from mailto link at coordinates |
| `extractTelFromRegion` | `cardElement, fieldCoords` | `Promise<Object>` | Extracts phone from tel link at coordinates |
| `combineTexts` | `texts` | `string` | Combines text fragments removes duplicates prefers high overlap |
| `calculateConfidence` | `result` | `number` | Calculates confidence based on overlap and fragment count |

### ScreenshotExtractor (`src/extraction/extractors/screenshot-extractor.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `page` | `ScreenshotExtractor` | Initializes screenshot extractor with Tesseract.js OCR engine |
| `initialize` | none | `Promise<void>` | Initializes Tesseract worker with English language data |
| `terminate` | none | `Promise<void>` | Terminates Tesseract worker cleans up resources |
| `extractFromRegion` | `cardElement, fieldCoords` | `Promise<Object>` | Captures screenshot runs OCR extracts text with confidence |
| `captureRegionScreenshot` | `coords` | `Promise<Buffer>` | Captures PNG screenshot of region with padding |
| `runOCR` | `imageBuffer` | `Promise<Object>` | Runs Tesseract OCR on image returns text confidence words |
| `cleanText` | `text` | `string` | Removes OCR artifacts extra whitespace non-printable characters |
| `calculateConfidence` | `ocrResult, cleanedText` | `number` | Calculates extraction confidence penalizes short or noisy results |
| `extractMultipleRegions` | `cardElement, regions` | `Promise<Object>` | Batch extracts text from multiple regions |
| `testFullCardOCR` | `cardElement` | `Promise<Object>` | Debug method runs OCR on entire card |

### SmartFieldExtractor (`src/extraction/smart-field-extractor.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `logger` | `SmartFieldExtractor` | Initializes smart extractor with email-first proximity strategy |
| `getExtractorCode` | none | `string` | Returns browser-side JavaScript extraction code for injection |
| `extractFromSelection` | `page, selectionBox` | `Promise<Object>` | Extracts fields from user selection using proximity matching |
| `extractFromCards` | `page, boxes, limit=100` | `Promise<Array>` | Batch extracts fields from multiple cards |
| `generateExtractionRules` | `previewData` | `Object` | Generates field extraction rules for config |

## Pagination

### Paginator (`src/features/pagination/paginator.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `browserManager, rateLimiter, logger, configLoader` | `Paginator` | Initializes paginator with sub-modules PatternDetector BinarySearcher UrlGenerator |
| `paginate` | `url, options={}` | `Promise<Object>` | Main pagination method discovers pattern finds true max generates URLs |
| `validatePage` | `page` | `Promise<Object>` | Validates page content counts emails contacts generates hash |
| `setStartPage` | `pageNumber` | `void` | Sets starting page number for resume functionality |
| `isDuplicateContent` | `hash` | `boolean` | Checks if content hash has been seen |
| `markContentAsSeen` | `hash` | `void` | Adds content hash to seen set |
| `resetSeenContent` | none | `void` | Clears seen content hashes |

### PatternDetector (`src/features/pagination/pattern-detector.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `logger, configLoader=null` | `PatternDetector` | Initializes pattern detector with logger and config loader |
| `discoverPattern` | `page, currentUrl, siteConfig=null` | `Promise<Object|null>` | Discovers pagination pattern 6-step priority manual cache URL-params visual scroll |
| `detectUrlPaginationParams` | `url` | `Object` | Detects page or offset parameters directly from URL |
| `extractBaseUrl` | `url` | `string` | Removes pagination parameters returns clean base URL |
| `extractDomain` | `url` | `string|null` | Extracts domain without www prefix |
| `detectPaginationControls` | `page` | `Promise<Object>` | Detects visual pagination controls next prev page numbers |
| `detectInfiniteScroll` | `page` | `Promise<Object>` | Detects infinite scroll indicators libraries lazy-load scroll test |
| `calculatePatternConfidence` | `pattern, controls=null` | `number` | Calculates pattern confidence 0-100 based on detection method |

### BinarySearcher (`src/features/pagination/binary-searcher.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `logger, rateLimiter` | `BinarySearcher` | Initializes binary searcher with PageFingerprint for duplicate detection |
| `findTrueMaxPage` | `page, pattern, urlGenerator, visualMax, minContacts, hardCap=500, cardSelector=null` | `Promise<Object>` | Finds true max page using binary search confirms boundary |
| `_testPageValidity` | `page, urlGenerator, pageNum, minContacts=1` | `Promise<Object>` | Tests if page is valid counts contacts checks duplicates |
| `_validatePage` | `page, minContacts=1` | `Promise<Object>` | Validates page using card selector or fallback chain |

### UrlGenerator (`src/features/pagination/url-generator.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `logger` | `UrlGenerator` | Initializes URL generator with logger instance |
| `generatePageUrl` | `pattern, pageNum` | `string` | Generates URL for single page based on pattern type |
| `createGenerator` | `pattern` | `Function` | Creates bound generator function for pattern |
| `generatePageRange` | `pattern, startPage, endPage` | `Array<string>` | Generates URLs for page range |

## Utilities

### DomainExtractor (`src/utils/domain-extractor.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `classifyDomain` | `email` | `string` | Classifies email domain business personal or generic |
| `extractDomain` | `email` | `string` | Extracts domain from email address |

### ContactExtractor (`src/utils/contact-extractor.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `extractEmails` | `text` | `Array<string>` | Extracts all emails from text using regex |
| `extractPhones` | `text` | `Array<string>` | Extracts phone numbers from text multiple formats |
| `extractNames` | `text, emails=[]` | `Array<string>` | Extracts potential names using patterns and proximity |
| `normalizePhone` | `phone` | `string` | Normalizes phone to standard format |

### ProfileVisitor (`src/utils/profile-visitor.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `browserManager, rateLimiter, logger` | `ProfileVisitor` | Initializes profile visitor with browser and rate limiting |
| `visitProfile` | `profileUrl, options={}` | `Promise<Object>` | Visits profile page extracts email phone title location |
| `extractContactInfo` | `page` | `Promise<Object>` | Extracts all contact fields from profile page |

### PageFingerprint (`src/utils/page-fingerprint.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `logger` | `PageFingerprint` | Initializes fingerprint with name and URL matching |
| `capturePage1` | `fingerprintData` | `void` | Captures fingerprint from page 1 for duplicate detection |
| `validate` | `pageNum, fingerprintData` | `Object` | Validates page against page 1 detects duplicates |
| `reset` | none | `void` | Resets fingerprint data for new search |

### RetryHandler (`src/utils/retry.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `options={}` | `RetryHandler` | Initializes retry handler with max retries initial delay backoff settings |
| `calculateDelay` | `attempt` | `number` | Calculates exponential backoff delay with optional jitter |
| `isRetryable` | `error` | `boolean` | Checks if error matches retryable patterns ECONNRESET ETIMEDOUT etc |
| `execute` | `operation, context, options={}` | `Promise<any>` | Executes async operation with automatic retry on retryable errors |
| `executeWithCondition` | `operation, shouldRetry, context` | `Promise<any>` | Executes with custom retry condition function |
| `sleep` | `ms` | `Promise<void>` | Promise-based delay utility |
| `withRetry` (export) | `operation, options={}` | `Promise<any>` | Convenience wrapper for one-off retry operations |

### CircuitBreaker (`src/utils/retry.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `options={}` | `CircuitBreaker` | Initializes circuit breaker with failure and success thresholds |
| `execute` | `operation, context` | `Promise<any>` | Executes operation through circuit breaker throws when OPEN |
| `getState` | none | `string` | Returns current state CLOSED OPEN or HALF-OPEN |
| `reset` | none | `void` | Force resets circuit to CLOSED state |

### DuplicateDetector (`src/utils/duplicate-detector.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `options={}` | `DuplicateDetector` | Initializes detector with primary and secondary keys fuzzy threshold |
| `check` | `contact` | `Object` | Checks if contact is duplicate returns isDuplicate original matchType matchKey |
| `filterUnique` | `contacts` | `Array<Object>` | Filters array returning only unique contacts stores duplicates |
| `normalize` | `value` | `string|null` | Normalizes value for comparison lowercase trim remove special chars |
| `fuzzyMatch` | `a, b` | `boolean` | Checks if strings match above fuzzy threshold using Levenshtein |
| `calculateSimilarity` | `a, b` | `number` | Calculates string similarity 0-1 using Levenshtein distance |
| `getStats` | none | `Object` | Returns statistics total unique duplicates byKey duplicateRate |
| `getDuplicates` | none | `Array<Object>` | Returns all detected duplicates with original and match details |
| `reset` | none | `void` | Clears all state for new detection session |

## Tools

### ConfigBuilder (`src/tools/lib/config-builder.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `buildConfigV23` | `domain, name, cardPattern, fields, pagination, extraction, metadata` | `Object` | Builds v2.3 config with user-validated extraction methods |
| `buildConfigV22` | `domain, name, cardPattern, fieldExtraction, pagination, extraction, metadata` | `Object` | Builds v2.2 config with multi-method field extraction |
| `buildConfigV21` | `domain, name, cardPattern, fields, pagination, extraction, metadata` | `Object` | Builds v2.1 config for legacy compatibility |
| `buildConfigV20` | `domain, name, cardPattern, selectors, pagination, extraction, metadata` | `Object` | Builds v2.0 config with CSS selectors |
| `buildConfigV10` | `domain, name, markers, selectors, scrollBehavior, parsing, pagination` | `Object` | Builds v1.0 config with start end markers |

### CardMatcher (`src/tools/lib/card-matcher.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `page, logger` | `CardMatcher` | Initializes card matcher with page and logger |
| `findMatchingCards` | `referenceBox, options={}` | `Promise<Object>` | Finds all cards matching reference pattern returns boxes and selector |
| `calculateSimilarity` | `box1, box2` | `number` | Calculates similarity 0-1 based on size position and aspect ratio |
| `generateCardSelector` | `referenceBox` | `Promise<string>` | Generates CSS selector for card pattern |

### EnhancedCapture (`src/tools/lib/enhanced-capture.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `capturePageData` | `page, url` | `Promise<Object>` | Captures comprehensive DOM data for config generation |
| `analyzeElements` | `elements` | `Array` | Analyzes element hierarchy generates selectors |
| `detectCardPattern` | `elements` | `Object|null` | Detects repeating card pattern from elements |

### ElementCapture (`src/tools/lib/element-capture.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `processSelection` | `page, selectionBox` | `Promise<Object>` | Processes manual field selection returns extracted data |
| `captureElement` | `page, coords` | `Promise<Object>` | Captures element at coordinates with properties |

### InteractiveSession (`src/tools/lib/interactive-session.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `browserManager, logger` | `InteractiveSession` | Initializes interactive session with browser overlay |
| `start` | `url` | `Promise<void>` | Starts interactive session injects overlay client |
| `waitForReferenceCard` | none | `Promise<Object>` | Waits for user to select reference card |
| `findMatchingCards` | `referenceBox` | `Promise<Object>` | Finds all matching cards generates pattern |
| `waitForFieldSelection` | `fieldName` | `Promise<Object>` | Waits for user to select field region |
| `extractFieldMethods` | `selectionBox, fieldName` | `Promise<Array>` | Tests all extraction methods for field |
| `end` | none | `Promise<void>` | Ends interactive session closes browser |

### ConfigValidator (`src/tools/lib/config-validator.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `logger` | `ConfigValidator` | Initializes config validator with logger instance |
| `validate` | `page, config` | `Promise<Object>` | Validates config against live page returns issues warnings |
| `validateCardSelector` | `page, config` | `Promise<Object>` | Validates card selector matches elements on page |
| `validateFieldSelectors` | `page, config` | `Promise<Object>` | Validates field selectors within card context |
| `testExtraction` | `page, config` | `Promise<Object>` | Tests extraction with config returns sample contacts |
| `analyzeExtractionQuality` | `contacts, config` | `Object` | Analyzes extraction quality returns score and issues |
| `validatePagination` | `page, config` | `Promise<Object>` | Validates pagination configuration type and selectors |
| `generateReport` | `results` | `string` | Generates formatted validation report string |

### PaginationDiagnostic (`src/tools/lib/pagination-diagnostic.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `browserManager, rateLimiter, logger, configLoader` | `PaginationDiagnostic` | Initializes diagnostic with Paginator instance |
| `checkUrlParams` | `url` | `Object` | Checks URL for pagination parameters highest priority |
| `diagnose` | `url, options={}` | `Promise<Object>` | Runs full pagination diagnostic with recommendations |
| `testPage` | `url, pattern, pageNum` | `Promise<Object>` | Tests specific page number returns validation result |
| `generateSampleUrls` | `pattern, count=5` | `Array<Object>` | Generates sample URLs for pattern verification |

### ExtractionTester (`src/tools/lib/extraction-tester.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `page` | `ExtractionTester` | Initializes tester with all specialized extractors |
| `initialize` | none | `Promise<void>` | Initializes OCR and other async extractors |
| `terminate` | none | `Promise<void>` | Cleans up resources terminates Tesseract worker |
| `testFieldWithRetry` | `fieldName, cardElement, fieldCoords` | `Promise<Object>` | Tests field with auto-expand on low confidence |
| `testField` | `fieldName, cardElement, fieldCoords` | `Promise<Object>` | Tests all extraction methods returns top 5 ranked |
| `getMethodsForField` | `fieldName` | `Array<string>` | Returns applicable method IDs for field sorted by priority |
| `runMethod` | `methodId, cardElement, fieldCoords, fieldName` | `Promise<Object>` | Executes single extraction method |
| `applyFieldValidation` | `fieldName, results` | `Array<Object>` | Validates results adjusts confidence per field rules |
| `expandCoordinates` | `coords, factor` | `Object` | Expands coordinates by factor for retry attempts |
| `formatForUI` | `testResults, fieldName` | `Object` | Formats results for display in browser overlay |

### ProfileEnrichment (`src/tools/lib/profile-enrichment.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `constructor` | `logger, options={}` | `ProfileEnrichment` | Initializes with ProfileVisitor and rate limiting options |
| `enrichContacts` | `contacts, page, config` | `Promise<Object>` | Enriches contacts by visiting profile pages returns stats |
| `enrichSingleContact` | `contact, page, config` | `Promise<Object>` | Visits single profile page extracts email phone name |
| `matchProfileUrlsToContacts` | `contacts, profileLinks` | `Array<Object>` | Matches profile URLs to contacts using name matching |
| `findBestProfileMatch` | `name, profileLinks` | `Object|null` | Finds best profile link match for name |
| `parseNameParts` | `name` | `Object` | Parses name into firstName lastName middleName parts |
| `calculateNameMatchScore` | `nameParts, url, linkText` | `Object` | Calculates URL and text match scores for name |
| `getProfilePatterns` | `config` | `Array<string>` | Gets profile URL patterns from config or defaults |
| `classifyProfileLink` | `url, text, contactName` | `Object` | Classifies profile link type and match confidence |

## Utilities (Additional)

### StatsReporter (`src/utils/stats-reporter.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `logScrapingStats` | `contacts, logger, context={}` | `void` | Logs scraping statistics with email phone counts |
| `logDomainStats` | `contacts, domainExtractor, logger` | `Object` | Logs domain analysis with business personal breakdown |
| `logSampleContacts` | `contacts, logger, limit=5` | `void` | Displays sample contacts in formatted table |

### PromptHelper (`src/utils/prompt-helper.js`)

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `confirmYesNo` | `message, defaultValue=true` | `Promise<boolean>` | Asks yes/no confirmation returns boolean |
| `confirmOptions` | `message, options` | `Promise<string>` | Asks multiple choice question returns selected option |
| `waitForEnter` | `message` | `Promise<void>` | Waits for user to press Enter key |
| `displayStageHeader` | `stageName` | `void` | Displays stage header with ASCII box drawing |
| `displayStageSummary` | `stats, title=null` | `void` | Displays statistics summary in formatted table |
| `displayProgressIndicator` | `message, current=null, total=null` | `void` | Displays progress bar or message |
| `displaySuccess` | `message` | `void` | Displays success message with checkmark |
| `displayError` | `message` | `void` | Displays error message with X mark |
| `displayWarning` | `message` | `void` | Displays warning message with triangle |
| `displayInfo` | `message` | `void` | Displays info message with i icon |
| `displayContactsTable` | `contacts, limit=5` | `void` | Displays contacts in formatted table |
| `displayFieldComparison` | `original, enriched, actions` | `void` | Displays field comparison for enrichment |
| `displayCompletionSummary` | `result` | `void` | Displays pipeline completion summary |
| `countdown` | `seconds, message` | `Promise<void>` | Displays countdown timer with message |
| `sleep` | `ms` | `Promise<void>` | Promise-based sleep utility |
| `truncate` | `str, maxLength` | `string` | Truncates string with ellipsis |
| `selectPaginationMode` | `options` | `Promise<string>` | Interactive pagination mode selection |

### Constants (`src/utils/constants.js`)

| Constant | Type | Description |
|----------|------|-------------|
| `DEFAULT_TIMEOUT` | `number` | Default timeout 30000ms |
| `NAVIGATION_TIMEOUT` | `number` | Navigation timeout 60000ms |
| `PDF_RENDER_TIMEOUT` | `number` | PDF render timeout 60000ms |
| `DEFAULT_MAX_PAGES` | `number` | Default max pages 200 |
| `DEFAULT_MIN_CONTACTS` | `number` | Default minimum contacts per page 1 |
| `DEFAULT_SCROLL_DELAY` | `number` | Default scroll delay 500ms |
| `DEFAULT_MAX_SCROLLS` | `number` | Default max scrolls 50 |
| `DEFAULT_MIN_DELAY` | `number` | Rate limiting min delay 2000ms |
| `DEFAULT_MAX_DELAY` | `number` | Rate limiting max delay 5000ms |
| `DEFAULT_MAX_RETRIES` | `number` | Default max retries 3 |
| `MAX_NAVIGATIONS_BEFORE_RECYCLE` | `number` | Memory management 50 navigations |
| `MAX_MEMORY_GROWTH_MB` | `number` | Memory growth limit 1024MB |

## Constants Module

### PaginationPatterns (`src/constants/pagination-patterns.js`)

| Export | Type | Description |
|--------|------|-------------|
| `PAGE_PARAMETER_NAMES` | `Array<string>` | URL parameter names for page pagination page p pg etc |
| `OFFSET_PARAMETER_NAMES` | `Array<string>` | URL parameter names for offset pagination offset skip start |
| `PAGE_SIZE_PARAMETER_NAMES` | `Array<string>` | URL parameter names for page size limit perPage count |
| `PAGINATION_CONTROL_SELECTORS` | `Array<string>` | CSS selectors for pagination controls |
| `KNOWN_DOMAIN_PAGINATION` | `Object` | Domain to pagination type mapping |
| `getPaginationParameterType` | `paramName → string|null` | Returns parameter type page offset size or null |
| `isPageParameter` | `paramName → boolean` | Checks if parameter is page parameter |
| `isOffsetParameter` | `paramName → boolean` | Checks if parameter is offset parameter |
| `detectPaginationFromUrl` | `url → Object` | Detects pagination type from URL returns analysis |

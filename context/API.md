# API Reference — Complete Function Encyclopedia

**Last Updated**: 2025-12-22
**Documentation Version**: 2.0 (Encyclopedia Edition)

---

## How to Read This Document

Each file in this project is documented with the following structure:

**File Header** — Purpose, location, and what requires/imports this file.

**External Functions** — Exported functions that other files can call. These define the file's public interface.

**Internal Functions** — Private helper functions used only within the file. Understanding these is crucial for debugging and modification.

**Data Structures** — Objects, configs, and data shapes that flow through the file.

**Connection Map** — Visual representation of how this file connects to others.

---

# features/pagination/

> Pagination detection, URL generation, and binary search for finding true max pages.

---

## binary-searcher.js

**Location**: `src/features/pagination/binary-searcher.js`
**Purpose**: Find the true maximum page number using binary search algorithm
**Used By**: `paginator.js`
**Requires**: `rate-limiter.js`

### External Functions

---

#### `findTrueMaxPage(page, pattern, urlGenerator, visualMax, minContacts, hardCap, cardSelector): Promise<object>`

Finds the true maximum page using binary search algorithm. Instead of crawling every page (O(n)), this tests ~10 pages to find max of 200 (O(log n)).

**Parameters:**
- `page` (Puppeteer Page, required): Browser page object for navigation
- `pattern` (object, required): Pagination pattern from PatternDetector
- `urlGenerator` (function, required): Function that takes page number, returns URL
- `visualMax` (number, optional): Max page from visual detection (starting hint)
- `minContacts` (number, optional): Minimum contacts to consider page valid. Defaults to `1`
- `hardCap` (number, optional): Maximum pages to search. Defaults to `500`
- `cardSelector` (string, optional): CSS selector for contact cards from config

**Returns:**
```javascript
{
  trueMax: 55,                    // Highest valid page found
  isCapped: false,                // True if hit hardCap
  testedPages: [                  // All pages tested
    { pageNum: 1, valid: true, contacts: 40 },
    { pageNum: 55, valid: true, contacts: 40 },
    ...
  ],
  searchPath: [                   // Human-readable search log
    'Page 1 valid (40 contacts)',
    'Visual max 55 valid, expanding search to 200',
    ...
  ],
  boundaryConfirmed: true         // True if 2 consecutive empty pages found
}
```

**Side Effects:**
- Navigates browser to multiple pages
- Waits for rate limiter between requests

**Example:**
```javascript
const BinarySearcher = require('./binary-searcher');
const searcher = new BinarySearcher(logger, rateLimiter);

const result = await searcher.findTrueMaxPage(
  page,
  pattern,
  (n) => `https://example.com/people?page=${n}`,
  55,           // visualMax
  1,            // minContacts
  200,          // hardCap
  '.person-card' // cardSelector
);

console.log(`True max: ${result.trueMax}`);
```

**Critical Notes:**
- Uses 3-second fixed wait after navigation (not `networkidle`)
- Uses `$$eval` with `.catch(() => 0)` for card counting (not `waitForSelector`)
- Always checks hardCap before recursive calls to prevent infinite loops

---

### Internal Functions

---

#### `_testPageValidity(page, urlGenerator, pageNum, minContacts): Promise<object>`

Tests if a specific page number has valid contacts.

**Called By:** `findTrueMaxPage()`

**Parameters:**
- `page` (Puppeteer Page): Browser page object
- `urlGenerator` (function): URL generator function
- `pageNum` (number): Page number to test
- `minContacts` (number): Minimum contacts for validity

**Returns:**
```javascript
{
  hasContacts: true,
  contactCount: 40,
  isEmpty: false,
  url: 'https://...',
  emailCount: 0
}
```

**Implementation Notes:**
```javascript
// CRITICAL: 3-second wait pattern (proven working)
await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));  // Fixed wait
const validation = await this._validatePage(page, minContacts);
```

---

#### `_validatePage(page, minContacts): Promise<object>`

Validates page content by counting cards using the PROVEN WORKING pattern.

**Called By:** `_testPageValidity()`

**Parameters:**
- `page` (Puppeteer Page): Browser page object
- `minContacts` (number): Minimum contacts to consider valid

**Returns:**
```javascript
{
  hasContacts: true,
  contactCount: 40,
  contactEstimate: 40,
  emailCount: 0,
  method: 'config-card-selector'  // or 'mailto-links', 'profile-links', etc.
}
```

**Implementation Notes:**
```javascript
// CORRECT: Direct $$eval with catch (no waitForSelector)
if (this.cardSelector) {
  const contactCount = await page.$$eval(this.cardSelector, els => els.length).catch(() => 0);
  return { hasContacts: contactCount >= minContacts, contactCount, ... };
}
// Falls back to mailto links, profile links, email regex, tel links
```

---

### Connection Map

```
binary-searcher.js
    │
    ├──► rate-limiter.js (waitBeforeRequest)
    │
    ▲ CALLED BY
    └── paginator.js (findTrueMaxPage during pagination discovery)
```

---

## paginator.js

**Location**: `src/features/pagination/paginator.js`
**Purpose**: Orchestrate pagination discovery and URL generation
**Used By**: `orchestrator.js`
**Requires**: `binary-searcher.js`, `pattern-detector.js`, `url-generator.js`, `browser-manager.js`

### External Functions

---

#### `paginate(url, options): Promise<object>`

Main entry point for pagination discovery. Detects pattern, finds max page, generates URLs.

**Parameters:**
- `url` (string, required): Starting URL
- `options` (object, optional):
  - `maxPages` (number): Hard cap on pages. Defaults to `200`
  - `minContacts` (number): Minimum contacts per page. Defaults to `1`
  - `timeout` (number): Discovery timeout in ms. Defaults to `30000`
  - `discoverOnly` (boolean): Only discover, don't generate URLs. Defaults to `false`
  - `siteConfig` (object): Site config with cardSelector

**Returns:**
```javascript
{
  success: true,
  urls: ['url1', 'url2', ...],        // Generated page URLs
  paginationType: 'pagination',        // 'pagination', 'offset', 'infinite-scroll'
  pattern: { type: 'page', paramName: 'page' },
  confidence: 85,
  trueMax: 55,
  isCapped: false
}
```

**Example:**
```javascript
const Paginator = require('./paginator');
const paginator = new Paginator(browserManager, rateLimiter, logger, configLoader);

const result = await paginator.paginate('https://example.com/people', {
  maxPages: 100,
  minContacts: 1,
  siteConfig: config
});

if (result.success) {
  console.log(`Found ${result.urls.length} pages`);
}
```

---

#### `setStartPage(pageNum): void`

Set starting page for resume functionality.

**Parameters:**
- `pageNum` (number): Page number to start from

---

#### `resetSeenContent(): void`

Reset content hash tracking for duplicate detection.

---

### Connection Map

```
paginator.js
    │
    ├──► pattern-detector.js (detect patterns)
    ├──► binary-searcher.js (find true max)
    ├──► url-generator.js (generate URLs)
    ├──► browser-manager.js (page navigation)
    │
    ▲ CALLED BY
    └── orchestrator.js (during pagination discovery)
```

---

# scrapers/config-scrapers/

> v2.3 config-based scrapers that use site configs for extraction.

---

## index.js (Scraper Factory)

**Location**: `src/scrapers/config-scrapers/index.js`
**Purpose**: Factory function to create appropriate scraper from config
**Used By**: `orchestrator.js`

### External Functions

---

#### `createScraperFromConfig(config, dependencies, options): object`

Factory function that creates the appropriate scraper based on config and options.

**Parameters:**
- `config` (object, required): Site config object
- `dependencies` (object, required):
  - `browserManager` (BrowserManager): Browser manager instance
  - `seleniumManager` (SeleniumManager, optional): For infinite scroll
  - `rateLimiter` (RateLimiter): Rate limiter instance
  - `logger` (Logger): Logger instance
  - `configLoader` (ConfigLoader): Config loader instance
- `options` (object, optional):
  - `scroll` (boolean): Use infinite scroll scraper
  - `forceSelenium` (boolean): Force Selenium for scroll
  - `paginate` (boolean): Use pagination scraper
  - `maxScrolls` (number): Max scroll attempts
  - `scrollDelay` (number): Delay between scrolls

**Returns:**
```javascript
{
  scraper: PaginationScraper | InfiniteScrollScraper | SinglePageScraper,
  type: 'pagination' | 'infinite-scroll' | 'single-page'
}
```

**Example:**
```javascript
const { createScraperFromConfig } = require('./config-scrapers');

const { scraper, type } = createScraperFromConfig(config, {
  browserManager, seleniumManager, rateLimiter, logger, configLoader
}, {
  scroll: true,
  forceSelenium: true
});

const contacts = await scraper.scrapeWithScroll(url, limit);
```

---

## pagination-scraper.js

**Location**: `src/scrapers/config-scrapers/pagination-scraper.js`
**Purpose**: Multi-page scraping with pagination support
**Extends**: `BaseConfigScraper`

### External Functions

---

#### `scrape(url, limit, paginationResult): Promise<array>`

Scrape contacts from paginated pages.

**Parameters:**
- `url` (string, required): Starting URL
- `limit` (number, optional): Maximum contacts to extract
- `paginationResult` (object, optional): Pre-computed pagination result from Paginator

**Returns:** Array of contact objects

---

## infinite-scroll-scraper.js

**Location**: `src/scrapers/config-scrapers/infinite-scroll-scraper.js`
**Purpose**: Selenium-based infinite scroll scraping
**Extends**: `BaseConfigScraper`

### External Functions

---

#### `scrapeWithScroll(url, limit, maxScrolls): Promise<array>`

Scrape contacts from infinite scroll page using Selenium PAGE_DOWN simulation.

**Parameters:**
- `url` (string, required): Target URL
- `limit` (number, optional): Maximum contacts to extract
- `maxScrolls` (number, optional): Maximum scroll attempts. Defaults to `50`

**Returns:** Array of contact objects

**Critical Notes:**
- Uses Selenium (not Puppeteer) for reliable scroll triggering
- PAGE_DOWN key simulation more reliable than wheel events
- Tested: 584 contacts vs 10 with Puppeteer

---

# config/

> Configuration loading and validation.

---

## config-loader.js

**Location**: `src/config/config-loader.js`
**Purpose**: Load site configs from disk
**Used By**: `orchestrator.js`, `paginator.js`, all scrapers

### External Functions

---

#### `loadConfig(url): object | null`

Load config for a URL by extracting domain and finding matching config file.

**Parameters:**
- `url` (string, required): Target URL

**Returns:** Config object or `null` if not found

---

#### `loadConfigByName(name): object | null`

Load config by name directly.

**Parameters:**
- `name` (string, required): Config name (with or without `.json`)

**Returns:** Config object or `null`

---

#### `saveCachedPattern(domain, pattern): void`

Save discovered pagination pattern to cache for future use.

**Parameters:**
- `domain` (string): Domain name
- `pattern` (object): Pagination pattern object

---

# core/

> Infrastructure-level code that all other modules depend on.

---

## browser-manager.js

**Location**: `src/core/browser-manager.js`
**Purpose**: Puppeteer browser lifecycle management
**Used By**: Most modules that need browser access

### External Functions

---

#### `launch(headless): Promise<void>`

Launch browser with stealth configuration.

**Parameters:**
- `headless` (boolean): Run in headless mode

---

#### `getPage(): Promise<Page>`

Get a new page from the browser.

**Returns:** Puppeteer Page object

---

#### `close(): Promise<void>`

Close browser and cleanup.

---

## selenium-manager.js

**Location**: `src/core/selenium-manager.js`
**Purpose**: Selenium WebDriver for infinite scroll
**Used By**: `infinite-scroll-scraper.js`

### External Functions

---

#### `launch(headless): Promise<void>`

Launch Chrome via Selenium WebDriver.

---

#### `getDriver(): WebDriver`

Get the Selenium WebDriver instance.

---

#### `close(): Promise<void>`

Close WebDriver and cleanup.

---

## rate-limiter.js

**Location**: `src/core/rate-limiter.js`
**Purpose**: Request throttling to avoid rate limits
**Used By**: All scrapers, `binary-searcher.js`

### External Functions

---

#### `waitBeforeRequest(): Promise<void>`

Wait random time between configured min/max delay before making request.

---

# Appendix: Cross-File Function Index

| Function | File | Type | Description |
|----------|------|------|-------------|
| `_testPageValidity` | binary-searcher.js | Internal | Test if page has contacts |
| `_validatePage` | binary-searcher.js | Internal | Count contacts on page |
| `close` | browser-manager.js | External | Close browser |
| `close` | selenium-manager.js | External | Close WebDriver |
| `createScraperFromConfig` | config-scrapers/index.js | External | Factory for scrapers |
| `findTrueMaxPage` | binary-searcher.js | External | Binary search for max page |
| `getPage` | browser-manager.js | External | Get new browser page |
| `launch` | browser-manager.js | External | Launch browser |
| `launch` | selenium-manager.js | External | Launch WebDriver |
| `loadConfig` | config-loader.js | External | Load config by URL |
| `loadConfigByName` | config-loader.js | External | Load config by name |
| `paginate` | paginator.js | External | Discover pagination |
| `resetSeenContent` | paginator.js | External | Reset duplicate tracking |
| `scrape` | pagination-scraper.js | External | Scrape paginated pages |
| `scrapeWithScroll` | infinite-scroll-scraper.js | External | Scrape infinite scroll |
| `setStartPage` | paginator.js | External | Set resume page |
| `waitBeforeRequest` | rate-limiter.js | External | Throttle requests |

---

# Appendix: Dependency Graph

```
orchestrator.js
    │
    ├──► config-loader.js
    ├──► browser-manager.js
    ├──► selenium-manager.js
    ├──► rate-limiter.js
    │
    ├──► paginator.js
    │        │
    │        ├──► pattern-detector.js
    │        ├──► url-generator.js
    │        └──► binary-searcher.js
    │                 │
    │                 └──► rate-limiter.js
    │
    └──► config-scrapers/
             │
             ├──► pagination-scraper.js
             ├──► infinite-scroll-scraper.js
             └──► single-page-scraper.js
```

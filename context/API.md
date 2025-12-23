# API Reference

**Last Updated**: December 22, 2025

---

## src/core/

### browser-manager.js

| Function | Signature | Description |
|----------|-----------|-------------|
| `launch` | `(headless?: boolean): Promise<void>` | Launch Puppeteer browser with stealth |
| `getPage` | `(): Page` | Get current browser page |
| `close` | `(): Promise<void>` | Close browser |

### selenium-manager.js

| Function | Signature | Description |
|----------|-----------|-------------|
| `launch` | `(headless?: boolean): Promise<void>` | Launch Selenium WebDriver |
| `getDriver` | `(): WebDriver` | Get WebDriver instance |
| `close` | `(): Promise<void>` | Close WebDriver |

### rate-limiter.js

| Function | Signature | Description |
|----------|-----------|-------------|
| `wait` | `(): Promise<void>` | Wait for rate limit delay |
| `waitBeforeRequest` | `(): Promise<void>` | Wait before making request |

---

## src/scrapers/config-scrapers/

### base-config-scraper.js

| Function | Signature | Description |
|----------|-----------|-------------|
| `findCardElements` | `(page): Promise<ElementHandle[]>` | Find all card elements using cardSelector |
| `extractContactFromCard` | `(cardElement, index): Promise<Object>` | Extract contact data from single card |
| `extractField` | `(card, fieldName, method, coords): Promise<string>` | Extract single field from card |

### pagination-scraper.js

| Function | Signature | Description |
|----------|-----------|-------------|
| `scrape` | `(url, limit?, options?): Promise<Object>` | Scrape contacts across multiple pages |
| `extractFromCurrentPage` | `(page, pageNum, limit): Promise<void>` | Extract contacts from current page |

### infinite-scroll-scraper.js

| Function | Signature | Description |
|----------|-----------|-------------|
| `scrape` | `(url, limit?): Promise<Object>` | Scrape with Selenium PAGE_DOWN scrolling |

---

## src/features/pagination/

### paginator.js

| Function | Signature | Description |
|----------|-----------|-------------|
| `paginate` | `(url, options): Promise<Object>` | Discover pagination and generate page URLs |
| `_findTrueMaxPage` | `(page, pattern, visualMax, minContacts, hardCap): Promise<Object>` | Find true max using binary search |

### binary-searcher.js

| Function | Signature | Description |
|----------|-----------|-------------|
| `findTrueMaxPage` | `(page, pattern, urlGenerator, visualMax, minContacts, hardCap, cardSelector): Promise<Object>` | Binary search for true max page |
| `_testPageValidity` | `(page, urlGenerator, pageNum, minContacts): Promise<Object>` | Test if specific page has contacts |
| `_validatePage` | `(page, minContacts): Promise<Object>` | Validate page content using card selector or fallbacks |

### pattern-detector.js

| Function | Signature | Description |
|----------|-----------|-------------|
| `detect` | `(page, url): Promise<Object>` | Detect pagination pattern from URL and DOM |

### url-generator.js

| Function | Signature | Description |
|----------|-----------|-------------|
| `createGenerator` | `(pattern): Function` | Create function to generate page URLs |

---

## src/features/enrichment/

### profile-enricher.js

| Function | Signature | Description |
|----------|-----------|-------------|
| `enrich` | `(contacts, options): Promise<Object>` | Enrich contacts by visiting profile pages |

---

## src/tools/

### config-generator.js

| Function | Signature | Description |
|----------|-----------|-------------|
| `run` | `(url): Promise<void>` | Launch interactive config generator |

### test-navigation.js

| Function | Signature | Description |
|----------|-----------|-------------|
| `testPagination` | `(url): Promise<Object>` | Test pagination detection |
| `testScroll` | `(url): Promise<Object>` | Test infinite scroll |

---

## src/config/

### config-loader.js

| Function | Signature | Description |
|----------|-----------|-------------|
| `load` | `(configName): Object` | Load config by name from website-configs/ |
| `loadForDomain` | `(domain): Object` | Load config by domain name |

---

## src/constants/pagination-patterns.js

| Constant | Description |
|----------|-------------|
| `PAGE_PARAMETER_NAMES` | Array of recognized page parameter names |
| `OFFSET_PARAMETER_NAMES` | Array of recognized offset parameter names |
| `detectPaginationFromUrl` | `(url): Object` - Analyze URL for pagination hints |

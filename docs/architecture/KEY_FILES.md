# Key Files Reference

Quick reference for the most important files in the codebase.

---

## Entry Points

### orchestrator.js
**Purpose:** Main CLI entry point for scraping operations

**Key Functions:**
- `program.parse()` - CLI argument parsing via Commander
- `runScraping()` - Main orchestration logic
- `runPaginatedScraping()` - Multi-page scraping
- `outputResults()` - Format and save results

**Dependencies:** All scrapers, utilities, pagination
**Related:** package.json scripts

---

### src/tools/config-generator.js
**Purpose:** CLI tool for visual config file creation

**Key Functions:**
- `startConfigGeneration()` - Initialize interactive session
- Exposes overlay UI in browser
- Saves generated config to /configs

**Dependencies:** interactive-session, browser-manager
**Related:** overlay.html, overlay-client.js

---

## Scrapers

### src/scrapers/base-scraper.js
**Purpose:** Abstract base class defining scraper interface

**Key Methods:**
- `initialize()` - Setup browser/page
- `scrape(url)` - Abstract, must implement
- `extractContacts()` - Abstract, must implement
- `cleanup()` - Close browser

**Dependencies:** browser-manager, logger
**Related:** All scraper implementations

---

### src/scrapers/config-scraper.js
**Purpose:** Config-driven extraction for complex sites

**Key Functions:**
- `scrape(url)` - Main entry with config loading
- `findCards()` - Locate card elements
- `extractFieldsFromCard()` - Multi-method extraction
- `handleInfiniteScroll()` - Scroll pagination

**Dependencies:** config-loader, multi-method-extractor, smart-field-extractor
**Related:** /configs/*.json

---

### src/scrapers/simple-scraper.js
**Purpose:** DOM-based contact extraction without config

**Key Functions:**
- `scrape(url)` - Navigate and extract
- `findContactCards()` - Heuristic card detection
- `extractContactData()` - Pattern-based extraction

**Dependencies:** contact-extractor, browser-manager
**Related:** Used as fallback

---

## Config Generator Library

### src/tools/lib/interactive-session.js
**Purpose:** Browser session management for config generation

**Key Methods:**
- `start(url)` - Initialize session
- `injectOverlay()` - Add UI to page
- `exposeBackendFunctions()` - Node-to-browser bridge
- `handleRectangleSelection()` - v2.1 workflow
- `handleConfirmWithSelections()` - v2.2 workflow

**Dependencies:** All generator lib modules
**Related:** overlay-client.js (browser side)

---

### src/tools/lib/element-capture.js
**Purpose:** v2.2 manual field selection capture

**Key Methods:**
- `processManualSelections()` - Process user selections
- `captureFieldElement()` - Capture single field
- `extractFieldFromRectangle()` - Rectangle-based extraction
- `buildExtractionRules()` - Generate config rules
- `validateFieldValue()` - Field-specific validation

**Dependencies:** field-requirements constants
**Related:** interactive-session.js, config-builder.js

---

### src/tools/lib/config-builder.js
**Purpose:** Build and save config files

**Key Methods:**
- `buildConfigV22()` - Build v2.2 config
- `buildConfigV21()` - Build v2.1 config (fallback)
- `buildFieldExtractionV22()` - Field extraction rules
- `saveConfig()` - Write to disk
- `validateConfigV21()` - Validation

**Dependencies:** fs, path
**Related:** interactive-session.js

---

### src/tools/lib/card-matcher.js
**Purpose:** Find similar card elements on page

**Key Methods:**
- `findSimilarCards()` - Match structural patterns
- `analyzeElement()` - Build element signature
- `calculateSimilarity()` - Score matches
- `generateSelector()` - Create CSS selector

**Dependencies:** None (pure logic)
**Related:** interactive-session.js

---

## Utilities

### src/utils/contact-extractor.js
**Purpose:** Email, phone, and name extraction patterns

**Key Exports:**
- `extractEmails(text)` - Find email addresses
- `extractPhones(text)` - Find phone numbers
- `isValidNameCandidate(text)` - Validate names
- `EMAIL_REGEX`, `PHONE_REGEXES` - Patterns
- `NAME_BLACKLIST` - Exclusion list

**Dependencies:** None (pure functions)
**Related:** All scrapers

---

### src/utils/browser-manager.js
**Purpose:** Puppeteer browser lifecycle management

**Key Methods:**
- `initialize()` - Launch browser
- `getPage()` - Get/create page
- `close()` - Cleanup
- Stealth plugin integration

**Dependencies:** puppeteer, puppeteer-extra
**Related:** All scrapers

---

### src/utils/config-loader.js
**Purpose:** Load and cache site configurations

**Key Methods:**
- `loadConfig(domain)` - Load or create config
- `getDefaultConfig()` - Get fallback
- `mergeConfigs()` - Combine configs
- `cacheConfig()` - Store in memory

**Dependencies:** fs, path
**Related:** config-scraper.js

---

### src/utils/logger.js
**Purpose:** Winston logging wrapper

**Key Features:**
- Console + file logging
- Custom helpers: `logMemory()`, `logProgress()`, `logStats()`
- Error/exception handling
- Log rotation

**Dependencies:** winston
**Related:** All modules

---

## Pagination

### src/features/pagination/paginator.js
**Purpose:** Main pagination orchestrator

**Key Methods:**
- `paginate(url, options)` - Run pagination
- `detectPattern()` - Find pagination type
- `generatePages()` - Create page URLs
- `scrapePages()` - Process all pages

**Dependencies:** pattern-detector, url-generator, binary-searcher
**Related:** orchestrator.js

---

### src/features/pagination/pattern-detector.js
**Purpose:** Detect pagination patterns from URL/page

**Key Methods:**
- `detect(url, page)` - Analyze pagination
- `detectUrlPattern()` - URL-based detection
- `detectInfiniteScroll()` - Scroll detection
- Returns: type, pattern, confidence

**Dependencies:** None
**Related:** paginator.js

---

## Overlay UI

### src/tools/assets/overlay-client.js
**Purpose:** Browser-side UI logic for config generator

**Key Functions:**
- `init()` - Initialize overlay
- `handleCardDetectionResult()` - Process card matches
- `finishManualSelection()` - Complete v2.2 flow
- `handleFieldMouseUp()` - Rectangle capture
- State management for selections

**Dependencies:** None (runs in browser)
**Related:** overlay.html, interactive-session.js

---

### src/tools/assets/overlay.html
**Purpose:** HTML template for overlay UI

**Key Elements:**
- `#controlPanel` - Main control interface
- `#manualPanel` - v2.2 field selection
- `#previewPanel` - Extraction preview
- CSS for highlighting, buttons, modals

**Dependencies:** None
**Related:** overlay-client.js

---

## Tests

### tests/scraper-test.js
**Purpose:** Main unit test suite

**Test Categories:**
- Email/phone pattern matching
- Name validation
- Contact deduplication
- Edge cases

**Run:** `npm test`

---

### tests/v22-integration.test.js
**Purpose:** v2.2 integration tests

**Test Categories:**
- Manual selection flow
- Config generation
- Field capture validation

**Run:** Included in test suite

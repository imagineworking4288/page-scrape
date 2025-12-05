# Page Scrape - Claude Context Documentation

This document provides comprehensive context for Claude when editing this project. It covers every file, their purposes, key functions, dependencies, and architectural patterns.

---

## Project Overview

**Page Scrape** is a universal professional directory scraper that extracts contact information (names, emails, phones, profile URLs) from websites. It supports multiple extraction methods, pagination handling, and exports to JSON/CSV.

### Key Features
- **Multi-method extraction**: DOM-based, text selection, and PDF rendering
- **Automatic pagination**: Detects and handles URL-based and offset-based pagination
- **Anti-detection**: Stealth browser configuration with random user agents
- **Domain classification**: Identifies business vs personal email domains
- **Config generation v2.3**: Visual tool with multi-method extraction testing and user validation
- **Multiple output formats**: JSON, CSV, Google Sheets export
- **OCR extraction**: Tesseract.js-based screenshot text extraction

---

## Directory Structure

```
page-scrape/
├── orchestrator.js              # Main entry point - CLI orchestration
├── package.json                 # Project dependencies and scripts
├── configs/                     # Site-specific configuration files
│   ├── _default.json           # Default fallback config
│   ├── _template.json          # Template for new configs
│   ├── _pagination_cache.json  # Cached pagination patterns
│   └── *.json                  # Site-specific configs (domain-named)
├── src/
│   ├── scrapers/               # Core scraping implementations
│   │   ├── index.js            # Scraper exports
│   │   ├── base-scraper.js     # Abstract base class
│   │   ├── simple-scraper.js   # HTML DOM-based scraper
│   │   ├── select-scraper.js   # Text selection scraper
│   │   ├── pdf-scraper.js      # PDF rendering scraper
│   │   ├── config-scraper.js   # Config-driven scraper (main)
│   │   └── visual-scraper.js   # v2.3 visual scraper (coordinate-based)
│   ├── utils/                  # Utility modules
│   │   ├── browser-manager.js  # Puppeteer browser handling
│   │   ├── config-loader.js    # Config file loading/validation
│   │   ├── contact-extractor.js # Shared extraction logic
│   │   ├── domain-extractor.js # Email domain classification
│   │   ├── logger.js           # Winston logging setup
│   │   ├── rate-limiter.js     # Request throttling
│   │   ├── text-parser.js      # Text-to-contact parsing
│   │   ├── profile-visitor.js  # Profile page enrichment
│   │   ├── google-sheets-exporter.js # Google Sheets export
│   │   └── constants.js        # Shared constants
│   ├── features/
│   │   ├── pagination/         # Pagination subsystem
│   │   │   ├── index.js        # Exports
│   │   │   ├── paginator.js    # Main pagination orchestrator
│   │   │   ├── pattern-detector.js # Pattern discovery
│   │   │   ├── binary-searcher.js  # True max page finder
│   │   │   └── url-generator.js    # Page URL generation
│   │   └── workflows/          # High-level workflows
│   │       ├── index.js        # Exports
│   │       ├── scraping-workflow.js # Main scraping flow
│   │       └── export-workflow.js   # Data export flow
│   └── tools/                  # Development/utility tools
│       ├── config-generator.js # Interactive config creator
│       ├── site-tester.js      # Site testing utility
│       ├── assets/             # UI assets for config generator
│       │   ├── overlay.html    # v2.3 overlay UI HTML/CSS
│       │   └── overlay-client.js # v2.3 browser-side UI code
│       └── lib/                # Tool-specific modules
│           ├── interactive-session.js # v2.3 Browser UI session
│           ├── element-capture.js     # Element selection
│           ├── multi-method-extractor.js # Field extraction
│           ├── config-builder.js      # v2.3 Config assembly
│           ├── config-schemas.js      # v2.3 Schema definitions
│           ├── extraction-tester.js   # v2.3 Multi-method testing
│           ├── screenshot-extractor.js # v2.3 OCR extraction
│           ├── coordinate-extractor.js # v2.3 Coordinate-based extraction
│           └── ...                    # Other helpers
├── tests/                      # Test files
│   ├── scraper-test.js         # SimpleScraper tests
│   ├── select-scraper-test.js  # SelectScraper tests
│   ├── pagination-test.js      # Pagination tests
│   └── ...                     # Other tests
├── output/                     # Generated output (gitignored)
│   ├── pdfs/                   # Rendered PDFs
│   └── *.json|csv              # Scraped data
└── logs/                       # Log files (gitignored)
```

---

## Core Files Reference

### orchestrator.js (Entry Point)

**Purpose**: Main CLI entry point that orchestrates the entire scraping process.

**Key Responsibilities**:
- Parse command-line arguments using `commander`
- Initialize browser, rate limiter, and scrapers
- Run the scraping workflow
- Handle pagination
- Export results to files

**CLI Options**:
```bash
node orchestrator.js --url <url>           # Target URL (required)
                     --method <method>     # select|simple|pdf|config (default: config)
                     --limit <n>           # Max contacts
                     --headless <bool>     # Browser mode (default: true)
                     --delay <ms>          # Request delay range (default: 2000-5000)
                     --output <file>       # Output filename
                     --format <format>     # json|csv|both
                     --keep                # Keep PDF files
                     --start-page <n>      # Resume from page
                     --max-pages <n>       # Max pages to scrape
```

**Key Functions**:
- `main()` - Entry point, initializes components and runs workflow
- `runScrapeWorkflow()` - Orchestrates the scraping process
- `handlePagination()` - Coordinates pagination discovery and execution
- `exportResults()` - Saves data to files

**Dependencies**: All scrapers, browser-manager, rate-limiter, logger, paginator

---

### src/scrapers/base-scraper.js

**Purpose**: Abstract base class providing shared functionality for all scrapers.

**Key Properties**:
- `browserManager` - Browser instance controller
- `rateLimiter` - Request throttling
- `logger` - Logging instance
- `domainExtractor` - Domain classification

**Key Methods**:
- `scrape(url, limit, keepPdf, sourcePage, sourceUrl)` - Abstract (must override)
- `postProcessContacts(contacts)` - Deduplication and normalization
- `addDomainInfo(contact)` - Adds domain/domainType fields
- `isValidEmail(email)` - Email validation
- `normalizePhone(phone)` - Phone formatting to +1-XXX-XXX-XXXX

**Shared Patterns**:
- `EMAIL_REGEX` - Email pattern
- `PHONE_REGEXES` - Array of phone patterns
- `NAME_REGEX` - Name validation pattern
- `CARD_SELECTORS` - Array of contact card CSS selectors

---

### src/scrapers/simple-scraper.js

**Purpose**: DOM-based scraper that detects contact cards and extracts data.

**Extends**: BaseScraper

**Key Methods**:
- `scrape(url, limit)` - Main extraction from loaded page
- `detectCardPattern(page)` - Auto-detect contact card containers
- `extractContactsFromCards(page, selector, config)` - Extract from detected cards
- `extractContactFromCard(card)` - Single card extraction

**Algorithm**:
1. Navigate to URL
2. Detect card pattern (tries multiple selectors)
3. For each card: extract email, phone, name, profile URL
4. Post-process and return

---

### src/scrapers/select-scraper.js

**Purpose**: Text selection-based scraper using marker boundaries.

**Extends**: BaseScraper

**Key Methods**:
- `scrape(url, limit, keepPdf, sourcePage, sourceUrl)` - Main entry
- `findMarkerPosition(page, marker, markerName)` - Locate text/coordinate markers
- `extractContactsFromDOM(page, startPos, endPos, config)` - DOM-based extraction
- `scrollPage(page, scrollConfig)` - Handle lazy-loaded content
- `detectContainerPattern(page, startPos, endPos)` - Auto-detect containers

**Algorithm**:
1. Load config for domain
2. Navigate and scroll to load content
3. Find start/end markers (text or coordinate)
4. Try DOM extraction first
5. Fall back to text selection if DOM fails
6. Parse text into contacts

---

### src/scrapers/config-scraper.js

**Purpose**: Main production scraper that uses site-specific configs.

**Extends**: BaseScraper

**Key Methods**:
- `scrape(url, limit, keepPdf, sourcePage, sourceUrl)` - Orchestrated extraction
- `extractWithMultipleMethods(page, config)` - Priority-based extraction
- `extractWithDOMContainers(page, config)` - Container-based extraction
- `extractWithCardPattern(page, config)` - Card pattern extraction
- `extractWithProfile(page, contact, config)` - Profile enrichment

**Extraction Priority**:
1. DOM containers (config selectors)
2. Card pattern detection
3. Text parsing fallback
4. Profile enrichment (optional)

---

### src/scrapers/pdf-scraper.js

**Purpose**: PDF rendering and text extraction scraper.

**Extends**: BaseScraper

**Uses**: `pdf-parse` library

**Key Methods**:
- `scrape(url, limit, keepPdf)` - Render page to PDF and parse
- `parsePdfForContacts(pdfData)` - Extract contacts from PDF text

---

### src/utils/browser-manager.js

**Purpose**: Manages Puppeteer browser lifecycle with stealth configuration.

**Key Features**:
- Stealth plugin (`puppeteer-extra-plugin-stealth`)
- CSP bypass for script injection
- Random user agent rotation
- Memory management with page recycling
- CAPTCHA detection

**Key Methods**:
- `launch(headless)` - Start browser with stealth config
- `navigate(url, timeout)` - Navigate with CAPTCHA detection
- `getPage()` - Get current page instance
- `close()` - Cleanup browser
- `checkMemoryAndRecycle()` - Recycle page after 50 navigations or 1GB memory

**Browser Config**:
```javascript
{
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-web-security',  // CSP bypass
    '--window-size=1920,1080'
  ]
}
```

---

### src/utils/config-loader.js

**Purpose**: Loads and validates site-specific configuration files.

**Key Methods**:
- `loadConfig(url)` - Load config for URL's domain
- `extractDomain(url)` - Get domain from URL
- `validateConfig(config, domain)` - Validate config structure
- `getDefaultConfig(domain)` - Fallback config
- `getCachedPattern(domain)` - Get cached pagination pattern
- `saveCachedPattern(domain, pattern)` - Cache pagination pattern

**Config Loading Order**:
1. Domain-specific (`configs/{domain}.json`)
2. Default (`configs/_default.json`)
3. Hardcoded fallback

---

### src/utils/contact-extractor.js

**Purpose**: Shared extraction logic used across all scrapers.

**Exported Constants**:
- `NAME_BLACKLIST` - Set of invalid name strings (UI elements, etc.)
- `NON_NAME_WORDS` - Words indicating non-personal email prefixes
- `COMMON_FIRST_NAMES` - For concatenated email parsing
- `EMAIL_REGEX`, `PHONE_REGEXES`, `NAME_REGEX`

**Key Functions**:
- `extractEmails(text, filterDomain)` - Find all emails
- `extractPhones(text)` - Find all phone numbers
- `normalizePhone(phone)` - Format to +1-XXX-XXX-XXXX
- `isValidNameCandidate(text)` - Validate name
- `extractNameFromEmail(email)` - Derive name from email prefix
- `findNameInContext(beforeContext, email, emailPos)` - Find name near email
- `calculateConfidence(name, email, phone)` - 'high'/'medium'/'low'
- `getUniversalExtractionCode()` - Browser-injectable extraction code

**Browser Context Functions** (for Puppeteer evaluate):
- `extractEmailsFromElement(element)` - Multi-strategy email extraction
- `extractPhonesFromElement(element)` - Multi-strategy phone extraction
- `extractNameFromElement(element)` - Multi-strategy name extraction
- `extractContactFromCard(card)` - Complete card extraction

---

### src/utils/domain-extractor.js

**Purpose**: Classifies email domains as business or personal.

**Key Methods**:
- `extractDomain(email)` - Get domain from email
- `normalizeDomain(domain)` - Normalize (remove www, lowercase)
- `isBusinessDomain(domain)` - True if not a known personal provider
- `groupByDomain(contacts)` - Group contacts by domain
- `getDomainStats(contacts)` - Statistics about domains

**Personal Domains Include**:
- gmail.com, yahoo.com, hotmail.com, outlook.com
- icloud.com, me.com, aol.com
- Regional providers (comcast.net, verizon.net, etc.)

---

### src/utils/logger.js

**Purpose**: Winston logger configuration with file and console output.

**Log Levels**: error, warn, info, debug

**Outputs**:
- Console (colored)
- `logs/scraper.log` (all logs)
- `logs/error.log` (errors only)
- `logs/exceptions.log` (uncaught exceptions)

**Custom Helpers**:
- `logger.logMemory()` - Log current memory usage
- `logger.logProgress(current, total, context)` - Progress bar
- `logger.logStats(stats)` - Statistics table

---

### src/utils/rate-limiter.js

**Purpose**: Request throttling with exponential backoff.

**Configuration**:
```javascript
{
  minDelay: 2000,    // Minimum delay (ms)
  maxDelay: 5000,    // Maximum delay (ms)
  maxRetries: 3,     // Retry attempts
  backoffMultiplier: 1.5
}
```

**Key Methods**:
- `waitBeforeRequest()` - Wait with random jitter
- `retryWithBackoff(fn, context)` - Retry with exponential backoff
- `randomDelay(baseMs, variance)` - Human-like delay
- `setDelayRange(min, max)` - Update delay range

---

### src/utils/text-parser.js

**Purpose**: Parses raw text into structured contact records.

**Key Methods**:
- `parse(rawText, config)` - Main parsing entry
- `extractEmails(text, filterDomain)` - Find emails in text
- `splitIntoBlocks(text, emails)` - Split text by email anchors
- `parseBlock(block, email, parsingRules)` - Parse single block
- `extractName(block, email, nameBeforeEmail)` - Find name in block
- `extractPhone(block)` - Find phone in block

---

### src/features/pagination/paginator.js

**Purpose**: Main pagination orchestrator that coordinates pattern detection and URL generation.

**Key Methods**:
- `paginate(url, options)` - Main entry point
- `validatePage(page)` - Check page has content (emails, content hash)
- `setStartPage(pageNumber)` - Resume from specific page

**Pagination Options**:
```javascript
{
  maxPages: 200,
  minContacts: 1,
  timeout: 30000,
  discoverOnly: false,
  siteConfig: null,
  preDiscoveredPattern: null
}
```

**Return Value**:
```javascript
{
  success: boolean,
  urls: string[],
  pattern: object,
  totalPages: number,
  paginationType: 'parameter'|'path'|'offset'|'none'|'infinite-scroll',
  confidence: number,
  error: string|null
}
```

**Delegates To**:
- `PatternDetector` - Pattern discovery
- `BinarySearcher` - True max page finding
- `UrlGenerator` - Page URL generation

---

### src/features/pagination/pattern-detector.js

**Purpose**: Discovers pagination patterns using multiple strategies.

**Detection Priority**:
1. Manual config patterns
2. Cached patterns
3. Visual controls + navigation
4. URL analysis (fallback)

**Key Methods**:
- `discoverPattern(page, currentUrl, siteConfig)` - Main discovery
- `detectPaginationControls(page)` - Find visual controls (next/prev buttons, page numbers)
- `detectInfiniteScroll(page)` - Check for infinite scroll
- `calculatePatternConfidence(pattern, controls)` - Score 0-100

**Pattern Types**:
- `parameter` - URL query param (`?page=2`)
- `path` - URL path segment (`/page/2`)
- `offset` - Offset-based (`?start=20`)
- `cursor` - Cursor-based (not fully supported)
- `infinite-scroll` - Infinite scroll detected

---

### src/features/pagination/binary-searcher.js

**Purpose**: Finds true maximum page number using binary search.

**Algorithm**:
1. Start with visual max or hard cap
2. Binary search between known good and potential max
3. Test each page for content
4. Return confirmed maximum

---

### src/features/pagination/url-generator.js

**Purpose**: Generates page URLs from patterns.

**Key Methods**:
- `generatePageUrl(pattern, pageNum)` - Generate single page URL
- `createGenerator(pattern)` - Create reusable generator function

---

### src/tools/config-generator.js

**Purpose**: CLI tool to visually create site-specific configs.

**Usage**:
```bash
node src/tools/config-generator.js --url "https://example.com/directory"
```

**Process**:
1. Opens browser in visible mode
2. User draws rectangle around a contact card
3. System finds similar cards on the page
4. User selects each field (name, email, phone, profileUrl, etc.)
5. v2.3: System tests multiple extraction methods per field
6. v2.3: User validates best extraction method
7. Generates and saves config file

---

## Visual Config Generator v2.3

The v2.3 config generator implements a "foolproof universal scraper" approach with user-validated extraction methods.

### Core Concept

Instead of relying on auto-detection, v2.3:
1. Tests 5+ extraction methods per field
2. Shows user top 5 results ranked by confidence
3. User validates which method works best
4. Config stores user-validated method with coordinates
5. Runtime scraper uses validated method

### Extraction Methods (Priority Order)

| Method | ID | Description | Best For |
|--------|-----|-------------|----------|
| Screenshot OCR | `screenshot-ocr` | Tesseract.js OCR on region screenshot | Complex layouts, images |
| Coordinate Text | `coordinate-text` | TreeWalker DOM lookup at coordinates | Standard text fields |
| CSS Selector | `selector` | Element at center point | Structured HTML |
| Data Attribute | `data-attribute` | data-* attributes | React/Vue apps |
| Text Regex | `text-regex` | Pattern matching on text | Emails, phones |
| Mailto Link | `mailto-link` | Extract from mailto: href | Email fields |
| Tel Link | `tel-link` | Extract from tel: href | Phone fields |
| Href Link | `href-link` | Extract link URL | Profile URLs |

### Key Files

#### src/tools/lib/config-schemas.js

**Purpose**: v2.3 schema definitions and validation.

**Exports**:
- `FIELD_ORDER` - Field processing order: ['name', 'email', 'phone', 'profileUrl', 'title', 'location']
- `REQUIRED_FIELDS` - ['name', 'email', 'profileUrl']
- `FIELD_METADATA` - Labels, prompts, validation hints per field
- `EXTRACTION_METHODS` - Method definitions with priorities
- `createFieldSchema()` - Create empty field schema
- `createConfigV23(options)` - Create new v2.3 config
- `validateConfigV23(config)` - Validate and score config

**v2.3 Field Schema**:
```javascript
{
  required: Boolean,
  skipped: Boolean,
  userValidatedMethod: String,  // e.g., 'coordinate-text', 'screenshot-ocr'
  coordinates: { x, y, width, height },  // Relative to card
  selector: String | null,
  sampleValue: String,
  confidence: Number,  // 0-100
  extractionOptions: Array,  // All tested options
  failedMethods: Array
}
```

---

#### src/tools/lib/screenshot-extractor.js

**Purpose**: OCR-based text extraction using Tesseract.js.

**Dependencies**: `tesseract.js`

**Key Methods**:
- `initialize()` - Create Tesseract worker
- `terminate()` - Cleanup worker
- `extractFromRegion(cardElement, fieldCoords)` - Extract text from region
- `captureRegionScreenshot(coords)` - Screenshot specific area
- `runOCR(imageBuffer)` - Run Tesseract on image
- `cleanText(text)` - Remove OCR artifacts
- `calculateConfidence(ocrResult, cleanedText)` - Score result

**Returns**:
```javascript
{
  value: String,
  confidence: Number,
  metadata: { method: 'screenshot-ocr', ocrConfidence, rawText, ... }
}
```

---

#### src/tools/lib/coordinate-extractor.js

**Purpose**: DOM-based text extraction at specific coordinates.

**Key Methods**:
- `extractFromRegion(cardElement, fieldCoords)` - Find text at coordinates
- `extractLinkFromRegion(cardElement, fieldCoords)` - Extract href
- `extractMailtoFromRegion(cardElement, fieldCoords)` - Extract email from mailto:
- `extractTelFromRegion(cardElement, fieldCoords)` - Extract phone from tel:

**Algorithm**:
1. Calculate absolute coordinates from card + field offset
2. Use TreeWalker to find text nodes in region
3. Check rect overlap with target region
4. Combine overlapping texts
5. Calculate confidence based on overlap quality

---

#### src/tools/lib/extraction-tester.js

**Purpose**: Orchestrates multiple extraction methods and returns ranked results.

**Key Methods**:
- `initialize()` - Setup extractors
- `terminate()` - Cleanup
- `testField(fieldName, cardElement, fieldCoords)` - Test all methods
- `getMethodsForField(fieldName)` - Get applicable methods
- `runMethod(methodId, cardElement, fieldCoords, fieldName)` - Run single method
- `applyFieldValidation(fieldName, results)` - Field-specific validation
- `formatForUI(testResults, fieldName)` - Format for overlay display

**Returns**:
```javascript
{
  results: [
    { method, methodLabel, value, confidence, metadata }
  ],  // Top 5 sorted by confidence
  failedMethods: [{ method, reason }],
  totalMethodsTested: Number
}
```

---

#### src/tools/lib/interactive-session.js (v2.3)

**Purpose**: Manages the interactive config generation session.

**v2.3 State**:
```javascript
this.extractionTester = null;
this.v23Selections = {};  // User-validated extraction methods
```

**v2.3 Exposed Functions**:
- `__configGen_testFieldExtraction(data)` - Test extraction methods
- `__configGen_confirmFieldExtraction(data)` - User confirms selection
- `__configGen_generateV23Config(selections)` - Generate final config

**v2.3 Handler Methods**:
- `getExtractionTester()` - Lazy-load ExtractionTester
- `handleTestFieldExtraction(data)` - Run all methods, send results to UI
- `handleConfirmFieldExtraction(data)` - Store user's validated choice
- `handleGenerateV23Config(selections)` - Build and save v2.3 config

---

#### src/tools/lib/config-builder.js (v2.3)

**Purpose**: Builds site-specific configuration files.

**v2.3 Methods**:
- `buildConfigV23(selections, matchResult, metadata)` - Build v2.3 config
- `buildFieldsV23(selections)` - Build all field configs
- `buildFieldV23(fieldData, fieldName, required)` - Build single field
- `validateConfigV23(config)` - Validate with scoring
- `isV23Config(config)` - Check if config is v2.3 format

---

#### src/tools/assets/overlay-client.js (v2.3)

**Purpose**: Browser-side UI for the config generator overlay.

**v2.3 State**:
```javascript
state.extractionResults = [];    // Results from backend
state.failedMethods = [];        // Failed extraction methods
state.selectedResultIndex = -1;  // User's selection
state.currentFieldCoords = null; // Current field coordinates
```

**v2.3 States**:
- `EXTRACTION_RESULTS` - Showing extraction method results for user validation

**v2.3 Functions**:
- `window.handleExtractionResults(result)` - Receive results from backend
- `buildExtractionResultsPanel(fieldName, result)` - Build UI
- `selectExtractionResult(index)` - User selects a result
- `window.confirmExtractionResult()` - Confirm selection
- `window.retryFieldExtraction()` - Reselect area
- `window.skipFieldFromResults()` - Skip optional field

---

#### src/scrapers/visual-scraper.js

**Purpose**: Runtime scraper that uses v2.3 configs with user-validated methods.

**Key Methods**:
- `initialize(config)` - Setup with v2.3 config
- `scrape(url, options)` - Extract contacts from URL
- `extractContactFromCard(cardElement, index)` - Single card extraction
- `extractField(cardElement, fieldName, fieldConfig)` - Field extraction
- `extractWithOCR(cardElement, coords)` - OCR extraction
- `extractWithCoordinates(cardElement, coords)` - Coordinate extraction
- `cleanup()` - Release resources

**Extraction Flow**:
1. Navigate to URL
2. Find cards using `config.cardPattern.primarySelector`
3. For each card, extract fields using `config.fields[name].userValidatedMethod`
4. Apply method-specific extraction (OCR, coordinates, selector, etc.)
5. Return validated contacts

---

### v2.3 Config Structure

```json
{
  "version": "2.3",
  "selectionMethod": "manual-validated",
  "name": "example-com",
  "domain": "example.com",
  "sourceUrl": "https://example.com/people",
  "createdAt": "2025-01-01T00:00:00.000Z",

  "cardPattern": {
    "primarySelector": ".person-card",
    "sampleDimensions": { "width": 300, "height": 200 },
    "sampleCoordinates": { "x": 100, "y": 150 }
  },

  "fields": {
    "name": {
      "required": true,
      "skipped": false,
      "userValidatedMethod": "coordinate-text",
      "coordinates": { "x": 10, "y": 20, "width": 150, "height": 30 },
      "selector": null,
      "sampleValue": "John Smith",
      "confidence": 92,
      "extractionOptions": [],
      "failedMethods": []
    },
    "email": {
      "required": true,
      "skipped": false,
      "userValidatedMethod": "mailto-link",
      "coordinates": { "x": 10, "y": 60, "width": 200, "height": 25 },
      "selector": null,
      "sampleValue": "john@example.com",
      "confidence": 95,
      "extractionOptions": [],
      "failedMethods": []
    }
    // ... other fields
  },

  "pagination": { ... },
  "extraction": { ... },
  "options": { ... },
  "detectionStats": { ... },
  "notes": [ ... ]
}
```

---

### src/tools/lib/multi-method-extractor.js

**Purpose**: Tries multiple extraction methods for each field.

**Methods Priority**:
1. Direct selectors (a[href^="mailto:"], a[href^="tel:"])
2. Data attributes
3. Text content with regex
4. Obfuscated patterns

---

## Configuration System

### Config File Structure

```json
{
  "domain": "example.com",
  "name": "Site Name",
  "description": "Description",

  "markers": {
    "start": {
      "type": "text|coordinate",
      "value": "TEXT_STRING" or {"x": 0, "y": 0}
    },
    "end": {
      "type": "text|coordinate",
      "value": "TEXT_STRING" or {"x": 0, "y": 0}
    }
  },

  "selectors": {
    "container": ".contact-card",
    "profileLink": "a.profile-link",
    "phone": "a[href^='tel:']",
    "email": "a[href^='mailto:']",
    "name": "h3.name"
  },

  "scrollBehavior": {
    "enabled": true,
    "scrollDelay": 500,
    "maxScrolls": 50
  },

  "parsing": {
    "emailDomain": null,
    "nameBeforeEmail": true,
    "profileUrlPatterns": ["/agents/", "/profile/"]
  },

  "pagination": {
    "enabled": true,
    "type": "auto",
    "patterns": {
      "pageParameterName": "page"
    }
  }
}
```

### Marker Types

1. **Text Markers**: Find element by text content
   ```json
   {"type": "text", "value": "Contact Directory"}
   ```

2. **Coordinate Markers**: Use fixed Y position
   ```json
   {"type": "coordinate", "value": {"x": 0, "y": 500}}
   ```

---

## Test Files

### tests/scraper-test.js

Tests for SimpleScraper including:
- Email/phone regex patterns
- Name validation
- Contact deduplication
- Domain extraction
- Live URL testing (optional)

**Run**: `npm test`

### tests/select-scraper-test.js

Tests for SelectScraper including:
- Text parsing
- Marker detection
- Config loading

### tests/pagination-test.js

Tests for pagination system including:
- Pattern detection
- URL generation
- Binary search

---

## NPM Scripts

```json
{
  "start": "node orchestrator.js",
  "test": "node tests/scraper-test.js",
  "test:pdf": "node tests/pdf-scraper-test.js",
  "test:merger": "node tests/data-merger-test.js",
  "test:all": "node tests/scraper-test.js && node tests/pdf-scraper-test.js && node tests/data-merger-test.js"
}
```

---

## Dependencies

### Production
- `puppeteer` - Browser automation
- `puppeteer-extra` - Plugin system
- `puppeteer-extra-plugin-stealth` - Anti-detection
- `pdf-parse` - PDF text extraction
- `tesseract.js` - OCR text extraction (v2.3)
- `winston` - Logging
- `commander` - CLI argument parsing
- `dotenv` - Environment variables
- `googleapis` - Google Sheets export

---

## Key Patterns & Conventions

### Module Pattern
All modules export classes or objects:
```javascript
class ClassName {
  constructor(dependencies) { ... }
}
module.exports = ClassName;
```

### Dependency Injection
Components receive dependencies via constructor:
```javascript
const scraper = new ConfigScraper(browserManager, rateLimiter, logger, configLoader);
```

### Error Handling
- Try/catch at boundaries
- Logger for all errors
- Graceful degradation (try multiple methods)

### Async/Await
All browser operations use async/await:
```javascript
async scrape(url) {
  const page = this.browserManager.getPage();
  await page.goto(url);
  // ...
}
```

### Extraction Priority
Always try methods in order of reliability:
1. Structured data (href, data attributes)
2. DOM patterns (selectors)
3. Text parsing (regex)
4. Fallbacks (email-derived names)

---

## Common Tasks

### Adding a New Site Config (v2.3)
1. Run `node src/tools/config-generator.js --url "URL"`
2. Draw rectangle around a contact card
3. For each field, draw rectangle around the field content
4. Select the best extraction method from the results
5. Repeat for all fields (name, email, phone, profileUrl, title, location)
6. Config saved to `configs/{domain}.json` with v2.3 format

### Testing a URL
```bash
node tests/scraper-test.js --url "https://example.com/agents"
```

### Scraping with Pagination
```bash
node orchestrator.js --url "URL" --max-pages 50 --format both
```

### Using v2.3 Visual Scraper
```javascript
const VisualScraper = require('./src/scrapers/visual-scraper');
const config = require('./configs/example-com.json');

const scraper = new VisualScraper(browserManager, logger);
await scraper.initialize(config);
const result = await scraper.scrape('https://example.com/people', { limit: 50 });
await scraper.cleanup();
```

### Debugging
Set `LOG_LEVEL=debug` in `.env` for verbose output.

---

## Known Issues & Edge Cases

1. **Infinite scroll**: Not fully supported - falls back to visible content
2. **CAPTCHA**: Detected but not bypassed - requires manual intervention
3. **AJAX pagination**: May not detect if URL doesn't change
4. **CSP restrictions**: Bypassed but may affect some sites
5. **Memory leaks**: Mitigated by page recycling every 50 navigations

---

## Editing Guidelines for Claude

1. **Read files before editing**: Always use the Read tool first
2. **Maintain patterns**: Follow existing module/class patterns
3. **Test after changes**: Run `npm test` to verify
4. **Update configs**: If changing config structure, update `_template.json`
5. **Log appropriately**: Use logger levels correctly (error/warn/info/debug)
6. **Handle errors**: Always wrap async operations in try/catch
7. **Preserve extraction priority**: Don't change method order without reason

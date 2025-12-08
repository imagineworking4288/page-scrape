# Page Scrape - Claude Context Documentation

This document provides comprehensive context for Claude when editing this project. It covers every file, their purposes, key functions, dependencies, and architectural patterns. 

**Last Updated**: December 7, 2025

---

## Project Overview

**Page Scrape** is a universal professional directory scraper that extracts contact information (names, emails, phones, profile URLs) from websites. It supports multiple extraction methods, pagination handling, and exports to JSON/CSV.

### Key Features
- **Multi-method extraction**: DOM-based, text selection, and PDF rendering
- **v2.3 Visual Config Generator**: Interactive tool with 4-layer detection and multi-method extraction testing
- **Automatic pagination**: Detects and handles URL-based and offset-based pagination
- **Anti-detection**: Stealth browser configuration with random user agents
- **Domain classification**: Identifies business vs personal email domains
- **OCR extraction**: Tesseract.js-based screenshot text extraction
- **Multiple output formats**: JSON, CSV, Google Sheets export

---

## Directory Structure

```
page-scrape/
├── orchestrator.js              # Main entry point - CLI orchestration
├── package.json                 # Project dependencies and scripts
├── CLAUDE_CONTEXT.md            # This file - comprehensive project documentation
├── REORGANIZATION_PLAN.md       # Completed reorganization plan (reference only)
├── configs/                     # Configuration files root
│   ├── _default.json           # System: Default fallback config
│   ├── _template.json          # System: Template for new configs
│   ├── _pagination_cache.json  # System: Cached pagination patterns
│   └── website-configs/        # Website-specific configs (domain-named)
│       └── {domain}.json       # e.g., sullcrom-com.json, example-com.json
├── src/
│   ├── index.js                # Main module index (unified imports)
│   │
│   ├── core/                   # Core infrastructure (reorganized Dec 2024)
│   │   ├── index.js            # Core exports
│   │   ├── browser-manager.js  # Puppeteer browser handling
│   │   ├── logger.js           # Winston logging setup
│   │   └── rate-limiter.js     # Request throttling
│   │
│   ├── config/                 # Configuration management (reorganized Dec 2024)
│   │   ├── index.js            # Config exports
│   │   ├── config-loader.js    # Config file loading/validation
│   │   └── schemas.js          # v2.3 schema definitions
│   │
│   ├── extraction/             # Field extraction system (reorganized Dec 2024)
│   │   ├── index.js            # Extraction exports
│   │   ├── multi-method-extractor.js  # Multi-method runtime extractor
│   │   ├── smart-field-extractor.js   # Smart field detection
│   │   └── extractors/         # Individual field extractors
│   │       ├── index.js        # Extractor exports
│   │       ├── email-extractor.js     # 4-layer mailto detection
│   │       ├── phone-extractor.js     # 4-layer tel detection
│   │       ├── link-extractor.js      # href/data-* extraction
│   │       ├── label-extractor.js     # Label detection
│   │       ├── screenshot-extractor.js # OCR extraction
│   │       └── coordinate-extractor.js # Coordinate extraction
│   │
│   ├── scrapers/               # Core scraping implementations
│   │   ├── index.js            # Scraper exports
│   │   ├── base-scraper.js     # Abstract base class
│   │   ├── simple-scraper.js   # HTML DOM-based scraper
│   │   ├── select-scraper.js   # Text selection scraper
│   │   ├── pdf-scraper.js      # PDF rendering scraper
│   │   └── config-scraper.js   # Config-driven scraper (main)
│   │
│   ├── utils/                  # Utilities (legacy + active)
│   │   ├── browser-manager.js  # [Legacy - prefer src/core/]
│   │   ├── config-loader.js    # [Legacy - prefer src/config/]
│   │   ├── logger.js           # [Legacy - prefer src/core/]
│   │   ├── rate-limiter.js     # [Legacy - prefer src/core/]
│   │   ├── contact-extractor.js # Shared extraction logic (active)
│   │   ├── domain-extractor.js # Email domain classification (active)
│   │   ├── text-parser.js      # Text-to-contact parsing (active)
│   │   ├── profile-visitor.js  # Profile page enrichment (active)
│   │   ├── google-sheets-exporter.js # Google Sheets export (active)
│   │   └── constants.js        # Shared constants (active)
│   │
│   ├── features/
│   │   └── pagination/         # Pagination subsystem
│   │       ├── index.js        # Exports
│   │       ├── paginator.js    # Main pagination orchestrator
│   │       ├── pattern-detector.js # Pattern discovery
│   │       ├── binary-searcher.js  # True max page finder
│   │       └── url-generator.js    # Page URL generation
│   │
│   └── tools/                  # Development/utility tools
│       ├── config-generator.js # Interactive config creator (v2.3)
│       ├── test-config.js      # v2.3 Config testing tool
│       ├── site-tester.js      # Site testing utility
│       ├── assets/             # UI assets for config generator
│       │   ├── overlay.html    # v2.3 overlay UI HTML/CSS
│       │   └── overlay-client.js # v2.3 browser-side UI code
│       └── lib/                # Tool-specific modules
│           ├── interactive-session.js # v2.3 Browser UI session
│           ├── element-capture.js     # Element selection
│           ├── config-builder.js      # v2.3 Config assembly
│           ├── extraction-tester.js   # v2.3 Multi-method testing
│           └── ... (other tool modules)
│
├── tests/                      # Test files
│   ├── scraper-test.js         # SimpleScraper tests
│   ├── select-scraper-test.js  # SelectScraper tests
│   ├── pagination-test.js      # Pagination tests
│   ├── pagination-integration-test.js # Integration tests
│   ├── pdf-scraper-test.js     # PDF scraper tests
│   ├── v22-integration.test.js # v2.2 integration tests
│   └── test-utils.js           # Test utilities
│   # Note: refactoring-tests.js was DELETED (deprecated)
├── .cache/                     # Tesseract OCR cache (gitignored)
│   └── tesseract/              # Language data and worker files
├── output/                     # Generated output (gitignored)
│   ├── pdfs/                   # Rendered PDFs
│   └── *.json|csv              # Scraped data
└── logs/                       # Log files (gitignored)
```

### New Module Import System

The reorganized codebase provides unified imports through `src/index.js`:

```javascript
// New recommended imports
const { BrowserManager, logger, RateLimiter } = require('./src/core');
const { ConfigLoader, validateConfigV23 } = require('./src/config');
const { EmailExtractor, MultiMethodExtractor } = require('./src/extraction');

// Or use the unified index
const src = require('./src');
const { BrowserManager, ConfigLoader, EmailExtractor } = src;
```

Legacy imports still work for backward compatibility:
```javascript
// These still work but new code should use src/core, src/config, etc.
const logger = require('./src/utils/logger');
const BrowserManager = require('./src/utils/browser-manager');
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
                     --method <method>     # html|pdf|hybrid|select|config (default: hybrid)
                     --config <name>       # Config file for --method config
                     --limit <n>           # Max contacts
                     --headless <bool>     # Browser mode (default: true)
                     --delay <ms>          # Request delay range (default: 2000-5000)
                     --output <format>     # json|csv|sheets|all
                     --keep                # Keep PDF files
                     --paginate            # Enable pagination
                     --start-page <n>      # Resume from page
                     --max-pages <n>       # Max pages to scrape
                     --scroll              # Enable infinite scroll handling
                     --max-scrolls <n>     # Max scroll attempts (default: 50)
```

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

**Key Properties**:
- `configDir` - Root configs directory (`configs/`)
- `websiteConfigDir` - Website configs subdirectory (`configs/website-configs/`)
- `defaultConfigPath` - Path to `_default.json`
- `paginationCachePath` - Path to `_pagination_cache.json`

**Key Methods**:
- `isSystemConfig(filename)` - Check if filename is system config (prefixed with `_`)
- `loadConfig(url)` - Load config for URL's domain (checks website-configs/ first)
- `extractDomain(url)` - Get domain from URL
- `validateConfig(config, domain)` - Validate config structure
- `getDefaultConfig(domain)` - Fallback config
- `listConfigs()` - List all website configs (from both locations)
- `getCachedPattern(domain)` - Get cached pagination pattern
- `saveCachedPattern(domain, pattern)` - Cache pagination pattern

**Config Loading Order**:
1. Primary: `configs/website-configs/{domain}.json`
2. Legacy fallback: `configs/{domain}.json` (with warning)
3. Default: `configs/_default.json`
4. Hardcoded fallback

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

---

### src/features/pagination/pattern-detector.js

**Purpose**: Discovers pagination patterns using multiple strategies.

**Detection Priority**:
1. Manual config patterns
2. Cached patterns
3. Visual controls + navigation
4. URL analysis (fallback)

**Pattern Types**:
- `parameter` - URL query param (`?page=2`)
- `path` - URL path segment (`/page/2`)
- `offset` - Offset-based (`?start=20`)
- `cursor` - Cursor-based (not fully supported)
- `infinite-scroll` - Infinite scroll detected

---

## Visual Config Generator v2.3

The v2.3 config generator implements a "foolproof universal scraper" approach with user-validated extraction methods.

### Core Concept

Instead of relying on auto-detection, v2.3:
1. User draws rectangle around each field in a contact card
2. System tests **up to 15 extraction methods** depending on field type
3. Shows user top 5 results ranked by confidence
4. User validates which method works best
5. Config stores user-validated method with coordinates for each field
6. Runtime scraper uses validated methods to extract data from all cards

**v2.3 now applies to ALL fields** (name, email, phone, title, location, profileUrl).

### Most Recent Implementation (December 2024)

**Key Changes**:

1. **Pure v2.3 Routing**: `processFieldRectangle()` in overlay-client.js now calls `__configGen_testFieldExtraction` directly, bypassing v2.2 entirely
2. **4-Layer Detection Strategy**: Both email and phone extractors use a sophisticated 4-layer detection:
   - Layer 1: Direct hit - click point is directly on mailto:/tel: link
   - Layer 2: Text-triggered - center text contains keywords, find nearby link
   - Layer 3: Expanded area scan - search broader region for links
   - Layer 4: Failure with diagnostic info

3. **Auto-Retry with Area Expansion**: `testFieldWithRetry()` in extraction-tester.js automatically expands search area on failure:
   - Attempt 1: Original coordinates
   - Attempt 2: 50% expanded area
   - Attempt 3: 100% expanded area

4. **Deprecated v2.2**: `handleFieldRectangleResult()` is now deprecated and logs warnings if called

### Field Validation Requirements
- **Required fields** (name, email, profileUrl): Must be validated before config can be saved
- **Optional fields** (phone, title, location): Can be skipped if not available on the page

### Extraction Methods (15 Methods)

v2.3 supports 15 extraction methods organized by field applicability:

#### Universal Methods
| Method | ID | Description | Best For | Fields |
|--------|-----|-------------|----------|--------|
| Screenshot OCR | `screenshot-ocr` | Tesseract.js OCR on region screenshot | Complex layouts, images | name, email, phone, title, location |
| Coordinate Text | `coordinate-text` | TreeWalker DOM lookup at coordinates | Standard text fields | name, email, phone, title, location |
| CSS Selector | `selector` | Element at center point | Structured HTML | All fields |
| Data Attribute | `data-attribute` | data-* attributes | React/Vue apps | name, email, phone, profileUrl |
| Text Regex | `text-regex` | Pattern matching on text | Structured patterns | email, phone |

#### Email-Specific Methods
| Method | ID | Description | Priority |
|--------|-----|-------------|----------|
| Mailto Link | `mailto-link` | Extract from mailto: href (4-layer detection) | 1 |
| Email RegEx | `regex-email` | Regex pattern matching in region | 2 |
| Email Label | `label-email` | Find "Email:" label and extract adjacent value | 4 |

#### Phone-Specific Methods
| Method | ID | Description | Priority |
|--------|-----|-------------|----------|
| Tel Link | `tel-link` | Extract from tel: href (4-layer detection) | 1 |
| Phone RegEx | `regex-phone` | Regex pattern matching in region | 2 |
| Phone Label | `label-phone` | Find "Phone:" label and extract adjacent value | 4 |

#### Profile URL Methods
| Method | ID | Description | Priority |
|--------|-----|-------------|----------|
| Href Link | `href-link` | Extract URL from <a> href attribute | 1 |
| Data URL | `data-url` | Extract from data-url or similar attributes | 2 |

#### Title/Location Methods
| Method | ID | Description | Priority |
|--------|-----|-------------|----------|
| Title Label | `label-title` | Find "Title:" or "Position:" label | 3 |
| Location Label | `label-location` | Find "Location:" or "Office:" label | 3 |

---

### Key v2.3 Files

#### src/tools/lib/config-schemas.js

**Purpose**: v2.3 schema definitions and validation.

**Exports**:
- `FIELD_ORDER` - Field processing order: ['name', 'email', 'phone', 'profileUrl', 'title', 'location']
- `REQUIRED_FIELDS` - ['name', 'email', 'profileUrl']
- `OPTIONAL_FIELDS` - ['phone', 'title', 'location']
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
  userValidatedMethod: String,  // e.g., 'coordinate-text', 'mailto-link'
  coordinates: { x, y, width, height },  // Relative to card
  selector: String | null,
  sampleValue: String,
  confidence: Number,  // 0-100
  extractionOptions: Array,  // All tested options
  failedMethods: Array
}
```

---

#### src/tools/lib/email-extractor.js

**Purpose**: Specialized email extraction with 4-layer mailto detection.

**Key Methods**:
- `extractFromRegion(cardElement, fieldCoords)` - Extract email using regex patterns
- `extractFromMailtoLink(cardElement, fieldCoords)` - **4-layer mailto detection**

**4-Layer Detection Strategy**:
```javascript
// Layer 1: Direct hit - click point is directly on mailto link
// Layer 2: Text-triggered - center text is "Email" keyword, find nearby mailto
// Layer 3: Expanded area scan - search broader region (±100px) for mailto links
// Layer 4: Failure with diagnostic info (suggestions for user)
```

**Email Regex**: `/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/gi`

**Returns**:
```javascript
{
  value: String,           // Extracted email address
  confidence: Number,      // 0-100 based on detection layer
  metadata: {
    method: 'regex-email' | 'mailto-link',
    layer: 'direct-hit' | 'text-triggered' | 'expanded-area-scan' | 'all-failed',
    linkText: String,      // Text of the link element
    searchRadius: Number   // Pixels searched
  }
}
```

---

#### src/tools/lib/phone-extractor.js

**Purpose**: Specialized phone number extraction with 4-layer tel detection.

**Key Methods**:
- `extractFromRegion(cardElement, fieldCoords)` - Extract phone using regex patterns
- `extractFromTelLink(cardElement, fieldCoords)` - **4-layer tel link detection**

**4-Layer Detection Strategy**:
```javascript
// Layer 1: Direct hit - click point is directly on tel link
// Layer 2: Text-triggered - center text contains phone pattern or keyword
// Layer 3: Expanded area scan - search broader region (±80px) for tel links
// Layer 4: Failure with diagnostic info
```

**Phone Patterns** (tested in order):
1. `+1-212-558-3960` - International with country code
2. `(212) 558-3960` - Standard US format
3. `212-558-3960` - Dashed format
4. `212.558.3960` - Dotted format
5. `2125583960` - Plain 10 digits

**Phone Normalization**:
```javascript
normalizePhone(phone) {
  // Always outputs: +1-XXX-XXX-XXXX format
  // Examples:
  //   "2125583960" → "+1-212-558-3960"
  //   "+12125583960" → "+1-212-558-3960"
  //   "(212) 558-3960" → "+1-212-558-3960"
}
```

---

#### src/tools/lib/extraction-tester.js

**Purpose**: Orchestrates multiple extraction methods and returns ranked results.

**Key Methods**:
- `initialize()` - Setup all extractors, initialize OCR
- `terminate()` - Cleanup all extractors
- `expandCoordinates(coords, factor)` - Expand coordinates for retry
- `testFieldWithRetry(fieldName, cardElement, fieldCoords)` - **Auto-retry with area expansion**
- `testField(fieldName, cardElement, fieldCoords)` - Test all applicable methods
- `getMethodsForField(fieldName)` - Get methods for specific field type
- `runMethod(methodId, cardElement, fieldCoords, fieldName)` - Execute single method
- `formatForUI(testResults, fieldName)` - Format results for overlay display

**Auto-Retry Strategy**:
```javascript
async testFieldWithRetry(fieldName, cardElement, fieldCoords) {
  // Attempt 1: Original coordinates
  let results = await this.testField(fieldName, cardElement, fieldCoords);
  if (bestResult.confidence >= 70) return results;

  // Attempt 2: Expand by 50%
  const expanded50 = this.expandCoordinates(fieldCoords, 0.5);
  const results50 = await this.testField(fieldName, cardElement, expanded50);
  if (bestResult.confidence >= 70) return results50;

  // Attempt 3: Expand by 100%
  const expanded100 = this.expandCoordinates(fieldCoords, 1.0);
  return await this.testField(fieldName, cardElement, expanded100);
}
```

**Returns**:
```javascript
{
  results: [
    { method, methodLabel, value, confidence, metadata }
  ],  // Top 5 sorted by confidence
  failedMethods: [{ method, reason }],
  totalMethodsTested: Number,
  retriesAttempted: Number
}
```

---

#### src/tools/lib/screenshot-extractor.js

**Purpose**: OCR-based text extraction using Tesseract.js.

**Dependencies**: `tesseract.js`

**Cache Configuration**: Uses Tesseract.js default cache location (`node_modules/.cache/`) for better Windows compatibility.

**Key Methods**:
- `initialize()` - Create Tesseract worker with default cache and error handling
- `terminate()` - Cleanup worker gracefully
- `extractFromRegion(cardElement, fieldCoords)` - Extract text from region
- `captureRegionScreenshot(coords)` - Screenshot specific area
- `runOCR(imageBuffer)` - Run Tesseract on image
- `cleanText(text)` - Remove OCR artifacts and non-printable characters
- `calculateConfidence(ocrResult, cleanedText)` - Score result

**Tesseract Worker Config**:
```javascript
// Uses Tesseract.js default cache for cross-platform reliability
this.worker = await Tesseract.createWorker('eng', 1, {
  errorHandler: (err) => {
    console.error('[ScreenshotExtractor] Worker error:', err);
  },
  logger: (m) => {
    // Log important milestones only
    if (m.status === 'loading language traineddata' ||
        m.status === 'initialized api') {
      console.log(`[ScreenshotExtractor] ${m.status}`);
    }
  }
});
```

---

#### src/tools/lib/interactive-session.js

**Purpose**: Manages the interactive config generation session.

**v2.3 State**:
```javascript
this.extractionTester = null;
this.v23Selections = {};  // User-validated extraction methods
```

**v2.3 Exposed Functions**:
- `__configGen_testFieldExtraction(data)` - Test extraction methods (v2.3 main entry)
- `__configGen_confirmFieldExtraction(data)` - User confirms selection
- `__configGen_generateV23Config(selections)` - Generate final config

**v2.3 Handler Methods**:
- `getExtractionTester()` - Lazy-load ExtractionTester
- `handleTestFieldExtraction(data)` - Calls `testFieldWithRetry()`, sends results to UI
- `handleConfirmFieldExtraction(data)` - Store user's validated choice
- `handleGenerateV23Config(selections)` - Build and save v2.3 config

---

#### src/tools/assets/overlay-client.js

**Purpose**: Browser-side UI for the config generator overlay.

**v2.3 State**:
```javascript
state.extractionResults = [];    // Results from backend
state.failedMethods = [];        // Failed extraction methods
state.selectedResultIndex = -1;  // User's selection
state.currentFieldCoords = null; // Current field coordinates
state.fieldProgress = {          // Track completed fields
  name: false,
  email: false,
  phone: false,
  title: false,
  location: false,
  profileUrl: false
};
state.v23RequiredFields = ['name', 'email', 'profileUrl'];
state.v23OptionalFields = ['phone', 'title', 'location'];
```

**Critical v2.3 Function (Most Recent Fix)**:
```javascript
// processFieldRectangle - now calls v2.3 directly
async function processFieldRectangle(box) {
  const fieldName = state.currentField;
  console.log(`[v2.3 Routing] Processing field: ${fieldName.toUpperCase()}`);

  const testData = {
    fieldName: fieldName,
    box: box,  // Absolute viewport coordinates
    cardSelector: state.previewData?.cardSelector
  };

  // Call v2.3 backend directly - skip v2.2 entirely
  if (typeof __configGen_testFieldExtraction === 'function') {
    await __configGen_testFieldExtraction(testData);
    // Backend will call window.handleExtractionResults when done
  } else {
    console.error('[v2.3] CRITICAL: __configGen_testFieldExtraction NOT AVAILABLE');
    showErrorFeedback('v2.3 backend function not available');
  }
}
```

**Deprecated Function**:
```javascript
// handleFieldRectangleResult - DEPRECATED in v2.3
window.handleFieldRectangleResult = function(result) {
  console.warn('[DEPRECATED] handleFieldRectangleResult called - this should not happen in v2.3');
  // Logs warning if called, attempts fallback
};
```

**v2.3 UI Functions**:
- `window.handleExtractionResults(result)` - Receive results from backend
- `buildExtractionResultsPanel(fieldName, result)` - Build UI with method options
- `selectExtractionResult(index)` - User selects a result
- `window.confirmExtractionResult()` - Confirm selection and update progress
- `window.retryFieldExtraction()` - Reselect area
- `window.skipFieldFromResults()` - Skip optional field
- `updateFieldProgressUI()` - Update visual indicators
- `updateFinishButtonStateV23()` - Enable/disable Finish button

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
    },
    "phone": {
      "required": false,
      "skipped": false,
      "userValidatedMethod": "tel-link",
      "coordinates": { "x": 10, "y": 90, "width": 150, "height": 25 },
      "selector": null,
      "sampleValue": "+1-212-558-3960",
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

## Other Tool Library Files

### src/tools/lib/link-extractor.js

**Purpose**: Extracts profile URLs from anchor tags and data attributes.

**Key Methods**:
- `extractFromRegion(cardElement, fieldCoords)` - Extract href from anchor tags
- `extractDataAttribute(cardElement, fieldCoords)` - Extract from data-url attributes
- `scoreLink(link)` - Score link for profile URL likelihood

**Link Scoring**:
- +15 points: URL contains profile-related paths (/profile, /lawyer, /team, /bio)
- +10 points: Link text contains profile-related words
- +15 points: Link text looks like a name
- +5 points: Direct hit at click coordinates
- -30 points: javascript: or # links
- -10 points: Social media links

---

### src/tools/lib/label-extractor.js

**Purpose**: Finds labeled fields (e.g., "Email:", "Phone:") and extracts adjacent values.

**Label Patterns**:
```javascript
{
  email: /\b(email|e-mail|contact|mail)\s*:?/i,
  phone: /\b(phone|tel|telephone|call|fax|mobile|cell)\s*:?/i,
  location: /\b(location|office|address|city|region)\s*:?/i,
  title: /\b(title|position|role|designation)\s*:?/i,
  name: /\b(name|attorney|lawyer|counsel)\s*:?/i
}
```

---

### src/tools/lib/coordinate-extractor.js

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
5. v2.3: System tests multiple extraction methods per field with auto-retry
6. v2.3: User validates best extraction method
7. Generates and saves config file

---

### src/tools/test-config.js

**Purpose**: CLI tool to test v2.3 configs on sample cards from the target site.

**Usage**:
```bash
# By domain name (resolves to configs/website-configs/{domain}.json)
node src/tools/test-config.js sullcrom-com [--limit N] [--verbose] [--show]

# By full path
node src/tools/test-config.js configs/website-configs/example-com.json [--limit N] [--verbose] [--show]
```

**Arguments**:
- `config-path` - Full path to config file
- `domain-name` - Domain name to resolve (e.g., sullcrom-com)

**Options**:
- `--limit N` - Test only N cards (default: 5)
- `--verbose` - Show detailed extraction results per card
- `--show` - Show browser window (not headless)

**Path Resolution** (`resolveConfigPath()`):
1. If input exists as file, use it directly
2. If input ends with `.json`, treat as path
3. Otherwise, resolve as domain name:
   - Primary: `configs/website-configs/{domain}.json`
   - Legacy: `configs/{domain}.json` (with warning)

**What It Tests**:
1. Loads the v2.3 config
2. Navigates to the config's source URL
3. Finds cards using `cardPattern.primarySelector`
4. For each card, extracts each field using `userValidatedMethod`
5. Reports success rate per field

---

## Configuration System

### Config Directory Structure

```
configs/
├── _default.json           # System: Default fallback config
├── _template.json          # System: Template for new configs
├── _pagination_cache.json  # System: Cached pagination patterns
└── website-configs/        # Website-specific configs
    ├── sullcrom-com.json   # Example: Sullivan & Cromwell
    ├── example-com.json    # Example: Example.com
    └── {domain}.json       # Named by domain (dots → dashes)
```

**Naming Convention**:
- System configs: Prefixed with `_` (stay in `configs/` root)
- Website configs: Domain name with dots replaced by dashes (e.g., `sullcrom.com` → `sullcrom-com.json`)

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

---

## Test Files

### tests/scraper-test.js
Tests for SimpleScraper including email/phone regex, name validation, deduplication.

### tests/select-scraper-test.js
Tests for SelectScraper including text parsing, marker detection.

### tests/pagination-test.js
Tests for pagination system including pattern detection, URL generation.

### tests/v22-integration.test.js
Integration tests for v2.2 compatibility.

**Run**: `npm test`

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
- `cheerio` - HTML parsing
- `cli-table3` - CLI table output

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
4. Review the extraction method results (up to 5 options shown)
5. Select the best extraction method from the results
6. **Required fields**: name, email, profileUrl must be validated
7. **Optional fields**: phone, title, location can be skipped
8. Config saved to `configs/website-configs/{domain}.json` with v2.3 format

### Testing a v2.3 Config
```bash
# Test by domain name (recommended)
node src/tools/test-config.js sullcrom-com --limit 5

# Test with more cards and verbose output
node src/tools/test-config.js example-com --limit 10 --verbose

# Test with visible browser
node src/tools/test-config.js example-com --limit 3 --show

# Test by full path (also works)
node src/tools/test-config.js configs/website-configs/example-com.json
```

### Scraping with a v2.3 Config
```bash
node orchestrator.js --url "URL" --method config --config example-com
```

### Scraping with Pagination
```bash
node orchestrator.js --url "URL" --paginate --max-pages 50 --format both
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
8. **v2.3 logging**: Use `[v2.3]` prefix for v2.3-specific logs to distinguish from v2.2
9. **4-layer detection**: When modifying email/phone extractors, maintain the 4-layer strategy
10. **Auto-retry**: When modifying extraction-tester, maintain the 3-attempt retry strategy
11. **Use feature-based imports**: For new code, prefer `src/core`, `src/config`, `src/extraction` imports
12. **Update index.js files**: When adding new modules, update the relevant index.js exports
13. **No dead code**: Do not create files that aren't imported/used by the main orchestrator

---

## Recent Bug Fixes (December 2024)

### v2.3 Routing Bypass Fix
**Problem**: `processFieldRectangle()` was calling `__configGen_handleFieldRectangle` (v2.2) instead of `__configGen_testFieldExtraction` (v2.3), causing EMAIL and PHONE fields to bypass multi-method extraction.

**Solution**: Replaced `processFieldRectangle()` to call v2.3 directly and deprecated `handleFieldRectangleResult()`.

**Verification**: Console should show `[v2.3 Routing]` for all fields, never `[v2.2]`.

### Tesseract Worker Crash Fix
**Problem**: Tesseract worker was crashing silently on Windows due to cache path issues.

**Solution**: Simplified to use Tesseract.js default cache location instead of custom `.cache/tesseract` path.

### Website Configs Subfolder Reorganization (December 6)
**Change**: Reorganized config file storage to separate system configs from website configs.

**Structure**:
```
configs/
├── _default.json           # System config (stays in root)
├── _template.json          # System config (stays in root)
├── _pagination_cache.json  # System config (stays in root)
└── website-configs/        # NEW: Website configs go here
    └── {domain}.json
```

**Files Updated**:
- `src/utils/config-loader.js`:
  - Added `websiteConfigDir` property
  - Added `isSystemConfig()` helper method
  - Updated `loadConfig()` to check `website-configs/` first, then legacy location with warning
  - Updated `listConfigs()` to scan both locations

- `src/tools/lib/config-builder.js`:
  - Added `isSystemConfig()` helper method
  - Updated `saveConfig()` to route website configs to `website-configs/` subdirectory

- `src/tools/test-config.js`:
  - Added `resolveConfigPath()` function for domain name resolution
  - Updated CLI to accept domain names (e.g., `sullcrom-com`) in addition to full paths
  - Maintains backward compatibility with legacy paths

**Backward Compatibility**: Configs in the old location (`configs/{domain}.json`) will still be found and loaded with a warning suggesting migration to the new location.

---

### Codebase Reorganization (December 7)
**Change**: Major reorganization from utility-based to feature-based directory structure.

**Goals Achieved**:
1. ✅ Removed deprecated/unused code (bloat removal)
2. ✅ Reorganized into feature-based structure
3. ✅ Created unified module import system
4. ✅ Maintained backward compatibility

**New Directory Structure**:
```
src/
├── index.js         # Unified module exports
├── core/            # Core infrastructure
│   ├── browser-manager.js
│   ├── logger.js
│   ├── rate-limiter.js
│   └── index.js
├── config/          # Configuration management
│   ├── config-loader.js
│   ├── schemas.js
│   └── index.js
└── extraction/      # Field extraction system
    ├── multi-method-extractor.js
    ├── smart-field-extractor.js
    ├── extractors/
    │   ├── email-extractor.js
    │   ├── phone-extractor.js
    │   ├── link-extractor.js
    │   ├── label-extractor.js
    │   ├── screenshot-extractor.js
    │   ├── coordinate-extractor.js
    │   └── index.js
    └── index.js
```

**Files Deleted (Deprecated)**:
| File | Reason |
|------|--------|
| `src/scrapers/visual-scraper.js` | Unused - never imported by orchestrator |
| `tests/refactoring-tests.js` | Deprecated test file for removed features |
| `src/features/workflows/` directory | Only used by deprecated refactoring-tests.js |

**New Import System**:
```javascript
// Recommended: Feature-based imports
const { BrowserManager, logger, RateLimiter } = require('./src/core');
const { ConfigLoader, validateConfigV23 } = require('./src/config');
const { EmailExtractor, MultiMethodExtractor } = require('./src/extraction');

// Unified single import
const src = require('./src');
const { BrowserManager, ConfigLoader, EmailExtractor } = src;

// Legacy imports still work (backward compatible)
const logger = require('./src/utils/logger');
```

**Module Verification**: All new modules load correctly - verified with `node -e` require tests.

---

### Config Preview Panel Implementation (December 7)
**Change**: Added a Config Preview Panel that displays after field selection but before browser closure, allowing users to review the generated config before final save.

**Problem Solved**: Previously, clicking "Finish Selection" would immediately generate the config, save it, and close the browser - users had no chance to review the config or go back to edit fields.

**New User Flow**:
1. User completes field selection workflow
2. User clicks "Finish Selection"
3. Backend generates config and saves file (but does NOT close browser)
4. **NEW**: Config Preview Panel displays with:
   - All 6 fields showing Found/Missing status
   - Extracted values for each field
   - Extraction method and confidence scores
   - Stats: Cards Found, Fields Detected, Config Score
   - Warnings for missing required fields
5. User can click "Back to Edit" to return to field selection
6. User clicks "Save & Close" to finalize
7. Backend cleans up and closes browser

**Files Modified**:

1. **`src/tools/assets/overlay.html`**:
   - Added `configPreviewPanel` div (lines 1352-1390)
   - Added CSS styles for `.config-preview-panel`, `.config-field-row`, `.field-badges`, `.confidence-badge` (lines 1161-1275)

2. **`src/tools/assets/overlay-client.js`**:
   - Added `CONFIG_PREVIEW` state to `STATES` enum
   - Added `generatedConfigData` to state object for storing config before final save
   - Updated `showPanel()` to include `configPreviewPanel`
   - Modified `handleConfigComplete()` to show preview instead of completing immediately
   - Added `extractFieldsFromSelections()` helper function
   - Added `formatMethodName()` helper function
   - Added `buildConfigPreviewPanel(configData)` - builds the preview UI
   - Updated `saveAndCloseConfig()` to be async and call backend `__configGen_finalSaveAndClose`
   - Added `backToEditConfig()` - returns to manual selection panel

3. **`src/tools/lib/interactive-session.js`**:
   - Added `__configGen_finalSaveAndClose` exposed function (line 362-366)
   - Modified `handleConfirmWithSelections()` to NOT resolve session immediately
   - Modified `handleGenerateV23Config()` to NOT resolve session immediately
   - Added `handleFinalSaveAndClose()` method - finalizes session when user confirms
   - Added `formatMethodName()` helper method
   - Both config generation methods now include additional data for preview:
     - `config` - The actual config object
     - `fields` - Field details with values, methods, confidence
     - `score` - Config validation score

**Key Architecture Change - Deferred Session Resolution**:
```javascript
// BEFORE: Session resolved immediately after config generation
this.sessionComplete = true;
this.sessionResult = { ... };
if (this.resolveSession) {
  this.resolveSession(this.sessionResult);  // Browser closes immediately!
}

// AFTER: Session result stored but NOT resolved
this.sessionResult = { ... };
// Browser stays open for preview panel
// Session resolved only when user clicks "Save & Close":
// handleFinalSaveAndClose() -> this.resolveSession(this.sessionResult)
```

**Config Preview Panel UI Elements**:
```html
<div id="configPreviewPanel" class="panel-content config-preview-panel">
  <h3>Generated Config Preview</h3>
  <div id="configFieldsList"><!-- Dynamic field rows --></div>
  <div class="stats-row">
    <div class="stat-box"><span id="configCardsCount">0</span> Cards Found</div>
    <div class="stat-box"><span id="configFieldsCount">0/6</span> Fields Detected</div>
    <div class="stat-box"><span id="configScoreValue">0</span> Config Score</div>
  </div>
  <div id="configWarningsSection"><!-- Warnings if any --></div>
  <button id="saveConfigBtn" onclick="saveAndCloseConfig()">Save & Close</button>
  <button onclick="backToEditConfig()">Back to Edit</button>
</div>
```

**Backend-Frontend Communication**:
- `handleConfigComplete(result)` - Receives config data, shows preview panel
- `__configGen_finalSaveAndClose()` - Called when user clicks "Save & Close", resolves session

---

### Config-Based Scrapers with Diagnosis Integration (December 7)
**Change**: Implemented specialized config-based scrapers with diagnosis integration for scraping contacts directly from the Config Preview Panel.

**New User Flow** (from Config Preview Panel):
1. User generates config via visual field selection
2. Config Preview Panel displays with "Start Scraping" button
3. User clicks "Start Scraping"
4. **Diagnosis Panel** appears:
   - Shows "Analyzing..." while detecting pagination type
   - Displays detected type badge (Infinite Scroll / Pagination / Single Page)
   - Shows diagnosis details table
   - Allows manual type override
   - Contact limit input (0 = unlimited)
5. User clicks "Scrape All Contacts" or "Scrape First X Contacts"
6. Progress panel shows scraping progress
7. Complete panel shows results with contact count

**Files Created**:

1. **`src/scrapers/config-scrapers/base-config-scraper.js`** (~400 lines)
   - Abstract base class for all config-based scrapers
   - Loads and validates v2.3 configs
   - STRICT extraction using ONLY `userValidatedMethod` from config
   - Initializes extractors dynamically based on config methods
   - `loadConfig()`, `validateConfigVersion()`, `initializeCardSelector()`
   - `initializeExtractors()`, `findCardElements()`, `extractContactFromCard()`
   - `extractField()`, `normalizeFieldValue()`, `isDuplicateContact()`
   - Contact buffer with incremental file writes (every 100 contacts)
   - `reportProgress()` for terminal updates

2. **`src/scrapers/config-scrapers/single-page-scraper.js`** (~100 lines)
   - Extends BaseConfigScraper
   - Scrapes all cards visible on page without pagination
   - Simple: find cards -> extract contacts -> return results

3. **`src/scrapers/config-scrapers/infinite-scroll-scraper.js`** (~200 lines)
   - Extends BaseConfigScraper
   - Handles infinite scroll pages
   - Scroll loop: extract -> scroll -> check for new cards -> repeat
   - Stops when no new cards (3x threshold) or max scrolls reached
   - `getCardIdentifier()` for deduplication

4. **`src/scrapers/config-scrapers/pagination-scraper.js`** (~200 lines)
   - Extends BaseConfigScraper
   - Handles traditional paginated pages
   - Uses Paginator for URL pattern discovery
   - Sequential page navigation with rate limiting
   - Contact deduplication across pages

5. **`src/scrapers/config-scrapers/index.js`** (~200 lines)
   - Module exports
   - `createScraper(paginationType, ...)` - Factory method for scraper selection
   - `diagnosePagination(page, ...)` - Pagination type detection

**Files Modified**:

1. **`src/tools/assets/overlay.html`**
   - Added "Start Scraping" button to Config Preview Panel (line 1499)
   - Added Diagnosis Panel HTML (lines 1511-1570)
   - Added CSS styles for diagnosis panel (lines 1277-1394)

2. **`src/tools/assets/overlay-client.js`**
   - Added `DIAGNOSIS` and `SCRAPING` states to STATES enum
   - Added state variables: `diagnosisResults`, `manualPaginationType`, `scrapingInProgress`, `contactLimit`
   - Updated `showPanel()` to include 'diagnosisPanel'
   - Added diagnosis functions:
     - `startDiagnosis()` - Initiates diagnosis from Config Preview
     - `handleDiagnosisComplete(results)` - Handles backend diagnosis results
     - `formatDiagnosisType()` - Formats type for display
     - `buildDiagnosisDetails()` - Builds diagnosis table
   - Added scraping functions:
     - `startScraping(mode)` - Starts scraping (all mode)
     - `startScrapingWithLimit()` - Starts with user limit
     - `backToConfigPreview()` - Returns to config preview
     - `handleScrapingProgress(progress)` - Updates progress UI
     - `handleScrapingComplete(results)` - Handles completion

3. **`src/tools/lib/interactive-session.js`**
   - Added exposed functions:
     - `__configGen_diagnosePagination` (line 373)
     - `__configGen_startScraping` (line 379)
   - Added handler methods:
     - `handleDiagnosePagination()` - Pagination type detection logic
     - `handleStartScraping(scrapingConfig)` - Scraping orchestration
     - `scrapeSinglePage()` - Single page extraction
     - `scrapeInfiniteScroll()` - Infinite scroll extraction
     - `scrapePagination()` - Paginated extraction

**Diagnosis Algorithm**:
```javascript
// 1. Check for explicit pagination controls
const controls = {
  numeric: ['.pagination', '[class*="pagination"]', '.pager'],
  nextButton: ['a[rel="next"]', '[class*="next"]'],
  loadMore: ['[class*="load-more"]', 'button[class*="more"]'],
  infiniteScroll: ['[data-infinite-scroll]', '[class*="infinite"]']
};

// 2. If pagination controls found -> 'pagination'
// 3. If infinite scroll indicators found -> 'infinite-scroll'
// 4. Otherwise, test scroll behavior:
//    - Scroll down 80% of viewport
//    - Wait 2 seconds
//    - Count cards before/after
//    - If more cards -> 'infinite-scroll'
//    - Else -> 'single-page'
```

**STRICT Extraction Mode**:
```javascript
// Only uses userValidatedMethod from v2.3 config
// NO fallbacks to other methods
const method = fieldConfig.userValidatedMethod || fieldConfig.method;
if (!method) return; // Skip field entirely

// Method mapping:
// 'mailto-link' -> EmailExtractor.extractFromMailtoLink()
// 'regex-email' -> EmailExtractor.extractFromRegion()
// 'tel-link' -> PhoneExtractor or CoordinateExtractor
// 'href-link' -> LinkExtractor or CoordinateExtractor
// 'coordinate-text' -> CoordinateExtractor.extractFromRegion()
```

**Progress Reporting**:
- Single page: "Contacts: X | Cards: Y/Z"
- Infinite scroll: "Contacts: X | Scroll: Y/100 | Cards: Z"
- Pagination: "Contacts: X | Page: Y/Z"

**Output File Structure**:
```json
{
  "metadata": {
    "configName": "sullcrom-lawyers",
    "configVersion": "2.3",
    "scrapeDate": "2024-12-07T...",
    "totalContacts": 150,
    "duration": 45000
  },
  "contacts": [
    {
      "name": "John Smith",
      "email": "jsmith@firm.com",
      "phone": "+1 555-123-4567",
      "profileUrl": "https://...",
      "title": "Partner",
      "location": "New York",
      "_cardIndex": 0,
      "_extractionMethods": {
        "name": { "method": "coordinate-text", "confidence": 85 },
        "email": { "method": "mailto-link", "confidence": 95 }
      },
      "confidence": 0.9
    }
  ]
}
```

---

### Config Loading Fix for Scraping Workflow (December 7)
**Change**: Fixed critical bug where scraping failed with `TypeError: Cannot read properties of undefined (reading 'fields')` because the config wasn't being passed properly from the visual config generator to the scraper.

**Root Cause**: When users clicked "Start Scraping" from the Config Preview Panel, the `scrapingConfig` object didn't include the config name or path, and the backend wasn't properly loading the config before initializing the scraper.

**Files Modified**:

1. **`src/tools/assets/overlay-client.js`**
   - In `handleConfigComplete()`: Extract clean config name from path for scraping
   - In `startScraping()`: Added config validation and pass `configName` + `configPath` to backend
   - In `startScrapingWithLimit()`: Same config validation and passing

2. **`src/tools/lib/interactive-session.js`**
   - In `handleStartScraping()`: Complete rewrite with proper config loading
     - First tries session config from memory (`this.sessionResult?.config`)
     - Falls back to loading from file path
     - Validates config has `fields` and `cardPattern.primarySelector`
     - Detailed logging at each step

3. **`src/scrapers/config-scrapers/index.js`**
   - Enhanced `createScraper()` with logging for scraper type creation

4. **`src/scrapers/config-scrapers/base-config-scraper.js`**
   - `initializeCardSelector()`: Added config existence validation with detailed error messages
   - `initializeExtractors()`: Added config structure validation before accessing fields

**Data Flow (Fixed)**:
```
Frontend (overlay-client.js)
  ↓ state.generatedConfigData.configName = "sullcrom-com"
  ↓ state.generatedConfigData.configPath = "configs/website-configs/sullcrom-com.json"
  ↓ state.generatedConfigData.config = {...actual config object...}
  ↓
startScraping() → scrapingConfig = { configName, configPath, ... }
  ↓
Backend (interactive-session.js)
  ↓ handleStartScraping(scrapingConfig)
  ↓ config = this.sessionResult?.config  // Use session config if available
  ↓ Validate: config.fields exists (v2.3 has fields at top level)
  ↓ Validate: config.cardPattern.primarySelector exists
  ↓
createScraper() → scraper instance
  ↓ scraper.config = config
  ↓ scraper.initializeCardSelector()
  ↓ scraper.initializeExtractors(page)
  ↓
Extraction begins with proper config
```

**Key Validation Points**:
```javascript
// In handleStartScraping:
// v2.3 configs have fields at top level, NOT nested under fieldExtraction
if (!config.fields) {
  throw new Error('Config missing fields');
}
if (!config.cardPattern || !config.cardPattern.primarySelector) {
  throw new Error('Config missing cardPattern.primarySelector');
}

// In base-config-scraper initializeCardSelector:
if (!this.config) {
  throw new Error('Config is not set - call loadConfig() first');
}

// In base-config-scraper initializeExtractors:
// v2.3 configs have fields at top level, NOT nested under fieldExtraction
if (!this.config.fields) {
  throw new Error('Config missing fields object');
}
```

---

### Config Structure Validation Fix (December 7)
**Change**: Fixed critical validation mismatch where code expected `config.fieldExtraction.fields` but v2.3 configs have `config.fields` directly at the top level.

**Root Cause**: The scraping workflow validation code was written assuming the older `fieldExtraction.fields` structure, but v2.3 configs store fields directly at the top level (`config.fields`).

**v2.3 Config Structure**:
```json
{
  "version": "2.3",
  "name": "example-com",
  "cardPattern": {
    "primarySelector": ".card"
  },
  "fields": {           // <-- Fields at TOP LEVEL, not nested
    "name": { ... },
    "email": { ... },
    "phone": { ... }
  }
}
```

**Files Modified**:

1. **`src/tools/lib/interactive-session.js`**
   - Changed `config.fieldExtraction.fields` → `config.fields` in validation
   - Updated log message to correctly reference `config.fields`

2. **`src/scrapers/config-scrapers/base-config-scraper.js`**
   - `validateConfigVersion()`: Changed `this.config.fieldExtraction.fields` → `this.config.fields`
   - `initializeExtractors()`: Changed `this.config.fieldExtraction.fields` → `this.config.fields`
   - `extractContactFromCard()`: Changed `this.config.fieldExtraction.fields` → `this.config.fields`

**Key Changes**:
```javascript
// BEFORE (incorrect):
if (!config.fieldExtraction || !config.fieldExtraction.fields) {
  throw new Error('Config missing fieldExtraction.fields');
}
const fields = this.config.fieldExtraction.fields;

// AFTER (correct):
// v2.3 configs have fields at top level, NOT nested under fieldExtraction
if (!config.fields) {
  throw new Error('Config missing fields');
}
const fields = this.config.fields;
```

**Note**: The `fieldExtraction` structure is still used by older config versions (v2.1/v2.2) and their associated builders in `config-builder.js`. This fix only affects the v2.3 config-based scrapers.

---

### Infinite Scroll Scraper & Terminal Summary Fix (December 7)
**Change**: Fixed infinite scroll loop behavior, added dynamic content wait, fixed output directory, and added comprehensive terminal summary.

**Problems Fixed**:
1. Scroll loop exiting too early (no retry logic)
2. No wait for dynamic content after scrolling
3. Output files written to wrong directory (configs/ instead of output/)
4. No terminal summary showing extraction results

**Files Modified**:

1. **`src/scrapers/config-scrapers/infinite-scroll-scraper.js`**
   - Added `contentWaitTimeout` option (5000ms default)
   - Enhanced scroll loop with comprehensive logging
   - Added retry logic: continues scrolling up to 3 times even with no new cards
   - Added `waitForNewContent()` method for dynamic content wait
   - Added exit reason logging
   - Tracks `requestedLimit` for summary

2. **`src/scrapers/config-scrapers/base-config-scraper.js`**
   - Added `requestedLimit` tracking
   - Added `fieldStats` object for tracking field success rates
   - Added `outputDir` default to `output/`
   - Added `ensureOutputPath()` method
   - Added `printTerminalSummary()` method with:
     - Requested vs extracted contacts
     - Duration
     - Field success rates with warnings
     - First 5 contact names preview
     - Output file path
     - Low success rate warnings

3. **`src/scrapers/config-scrapers/single-page-scraper.js`**
   - Added `requestedLimit` tracking
   - Calls `ensureOutputPath()` at start

4. **`src/scrapers/config-scrapers/pagination-scraper.js`**
   - Added `requestedLimit` tracking
   - Calls `ensureOutputPath()` at start

**Terminal Summary Format**:
```
════════════════════════════════════════════════════════════════
                      SCRAPING COMPLETE
════════════════════════════════════════════════════════════════

  Requested: 40 contacts
  Extracted: 40 contacts (100%)
  Duration:  45s

  Field Success Rates:
    - name        : 40/40 (100%)
    - email       : 35/40 (88%)
    - phone       : 38/40 (95%)
    - profileUrl  : 40/40 (100%)
    - title       : 0/40 (0%) ⚠️
    - location    : 0/40 (0%) ⚠️

  First contacts:
    1. John Smith
    2. Jane Doe
    3. Bob Johnson
    4. Alice Williams
    5. Charlie Brown

  Output: output/scrape-sullcrom-com-1733612345678.json

════════════════════════════════════════════════════════════════
```

**Scroll Loop Logging**:
```
[InfiniteScrollScraper] ═══════════════════════════════════════
[InfiniteScrollScraper] Starting scroll loop
[InfiniteScrollScraper] Target: 40 contacts
[InfiniteScrollScraper] Max scrolls: 100
[InfiniteScrollScraper] Retry threshold: 3
[InfiniteScrollScraper] ═══════════════════════════════════════
[InfiniteScrollScraper] Scroll 1/100: Cards 0 → 10 (+10 new)
[InfiniteScrollScraper] ✓ Extracted 10 contacts this scroll (total: 10)
[InfiniteScrollScraper] Scroll 2/100: Cards 10 → 20 (+10 new)
[InfiniteScrollScraper] ✓ Extracted 10 contacts this scroll (total: 20)
...
[InfiniteScrollScraper] ⚠ No new cards found (retry 1/3), scrolling again...
[InfiniteScrollScraper] ⚠ No new cards found (retry 2/3), scrolling again...
[InfiniteScrollScraper] ═══════════════════════════════════════
[InfiniteScrollScraper] Exit reason: Contact limit reached (40/40)
[InfiniteScrollScraper] ═══════════════════════════════════════
```

**Dynamic Content Wait**:
- After each scroll, waits `scrollDelay` (2000ms default)
- Then waits for card selector with `contentWaitTimeout` (5000ms)
- Adds extra 500ms for card content (links, images) to render

---

### Scraper Delegation Fix (December 7)
**Change**: Removed stub scraping methods from `interactive-session.js` and delegated to the real scrapers which have comprehensive scroll logic, retry handling, and progress reporting.

**Problem**: The `handleStartScraping()` function contained three stub methods (`scrapeSinglePage()`, `scrapeInfiniteScroll()`, `scrapePagination()`) that bypassed the real scrapers. These stubs:
- Lacked retry logic when no new cards found
- Had no dynamic content wait after scrolling
- Used incorrect card identification (timestamp-based instead of content-based)
- Didn't track field statistics for the terminal summary
- Called extractors directly without proper coordinate handling

**Solution**: Replace stub method calls with direct delegation to `scraper.scrape(url, limit)`:

**Before** (lines 1924-1932):
```javascript
if (scrapingConfig.paginationType === 'single-page') {
  result = await this.scrapeSinglePage(scraper, scrapingConfig.limit, updateProgress);
} else if (scrapingConfig.paginationType === 'infinite-scroll') {
  result = await this.scrapeInfiniteScroll(scraper, scrapingConfig.limit, updateProgress);
} else if (scrapingConfig.paginationType === 'pagination') {
  result = await this.scrapePagination(scraper, url, scrapingConfig.limit, ...);
}
```

**After**:
```javascript
// Delegate to real scraper which handles scrolling, waiting, retry, and extraction
const result = await scraper.scrape(url, scrapingConfig.limit || 0);
```

**Files Modified**:
- `src/tools/lib/interactive-session.js`
  - Removed `scrapeSinglePage()` method (~23 lines)
  - Removed `scrapeInfiniteScroll()` method (~50 lines)
  - Removed `scrapePagination()` method (~8 lines)
  - Replaced conditional dispatch with single `scraper.scrape()` call
  - Added comments explaining the delegation

**Benefits of Real Scrapers**:
- Retry logic: Continues scrolling up to 3 times when no new cards found
- Dynamic content wait: Waits for cards to render after each scroll
- Proper card identification: Uses content-based IDs (email, profile links) not timestamps
- Field statistics: Tracks extraction success rates for terminal summary
- Comprehensive logging: Shows scroll progress with `Cards X → Y (+Z new)` format
- Exit reason logging: Explains why scrolling stopped

---

### Absolute Bottom Scroll with Height Detection (December 7)
**Change**: Fixed infinite scroll scraper to scroll to absolute page bottom and detect content loading via page height increase instead of using relative viewport scrolling.

**Problem**: The infinite scroll scraper was using `window.scrollBy(0, window.innerHeight * 0.8)` which scrolls relative to the current viewport position. This approach:
- Never actually reaches the page bottom where infinite scroll triggers live
- Doesn't properly detect when new content has loaded
- Can get stuck in a loop of small scrolls that never trigger content loading

**Solution**: Changed to absolute bottom scrolling with height-based content detection:

**Files Modified**:

1. **`src/scrapers/config-scrapers/infinite-scroll-scraper.js`**

   Updated `scrollDown()` method to scroll to absolute bottom:
   ```javascript
   async scrollDown(page) {
     // Get page height BEFORE scrolling
     const beforeHeight = await page.evaluate(() => document.body.scrollHeight);

     // Scroll to ABSOLUTE BOTTOM of page (not relative viewport scroll)
     // This ensures we reach the infinite scroll trigger zone
     await page.evaluate(() => {
       window.scrollTo(0, document.body.scrollHeight);
     });

     return { beforeHeight };
   }
   ```

   Updated `waitForNewContent()` method to detect height increase:
   ```javascript
   async waitForNewContent(page, beforeHeight) {
     // First, wait the base delay for scroll animation and AJAX to start
     await this.sleep(this.scrollDelay);

     // Wait for new content to load by detecting page height increase
     let newContentLoaded = false;
     let afterHeight = beforeHeight;

     try {
       // Wait for page height to increase (indicates new content loaded)
       await page.waitForFunction(
         (oldHeight) => document.body.scrollHeight > oldHeight,
         { timeout: this.contentWaitTimeout },
         beforeHeight
       );
       newContentLoaded = true;
     } catch (err) {
       // Timeout - page height didn't increase (might be end of content)
       newContentLoaded = false;
     }

     // Get page height AFTER waiting for content
     afterHeight = await page.evaluate(() => document.body.scrollHeight);
     const heightIncrease = afterHeight - beforeHeight;

     // Log height change
     if (newContentLoaded && heightIncrease > 0) {
       this.logger.info(`[InfiniteScrollScraper] ✓ Page height increased: ${beforeHeight}px → ${afterHeight}px (+${heightIncrease}px)`);
     } else {
       this.logger.info(`[InfiniteScrollScraper] ⚠ Page height unchanged at ${beforeHeight}px`);
     }

     // Extra wait for card elements to fully render
     await this.sleep(500);

     // Wait for card selector to be present
     try {
       if (this.cardSelector) {
         await page.waitForSelector(this.cardSelector, {
           timeout: this.contentWaitTimeout
         });
       }
     } catch (e) {
       this.logger.debug(`[InfiniteScrollScraper] Card selector wait timeout`);
     }

     return { newContentLoaded, afterHeight, heightIncrease };
   }
   ```

   Updated scroll loop to pass height between methods:
   ```javascript
   // Scroll to absolute bottom and get height before scroll
   const { beforeHeight } = await this.scrollDown(page);
   scrollCount++;

   // Wait for new content to load (detects via page height increase)
   await this.waitForNewContent(page, beforeHeight);
   ```

**Key Behavior Changes**:

| Aspect | Before | After |
|--------|--------|-------|
| Scroll target | Relative: `scrollBy(0, innerHeight * 0.8)` | Absolute: `scrollTo(0, scrollHeight)` |
| Content detection | Fixed timeout wait | Height increase detection via `waitForFunction` |
| Returns | Nothing | `{ beforeHeight }` for height comparison |
| Height logging | None | Shows `beforeHeight → afterHeight (+increase)` |

**Scroll Loop Logging** (Updated):
```
[InfiniteScrollScraper] Scroll 1/100: Cards 0 → 10 (+10 new)
[InfiniteScrollScraper] ✓ Page height increased: 2000px → 4500px (+2500px)
[InfiniteScrollScraper] ✓ Extracted 10 contacts this scroll (total: 10)
[InfiniteScrollScraper] Scroll 2/100: Cards 10 → 20 (+10 new)
[InfiniteScrollScraper] ✓ Page height increased: 4500px → 7000px (+2500px)
...
[InfiniteScrollScraper] ⚠ Page height unchanged at 15000px
[InfiniteScrollScraper] ⚠ No new cards found (retry 1/3), scrolling again...
```

**Why Absolute Bottom Works**:
1. Infinite scroll triggers are typically at the page bottom (in footer or sentinel elements)
2. `document.body.scrollHeight` always gives the true page bottom position
3. Height increase is a reliable indicator that AJAX content has been inserted
4. Avoids the problem of viewport-relative scrolls never reaching the trigger zone

---

### Two-Phase Infinite Scroll Architecture (December 7)
**Change**: Redesigned infinite scroll scraper to use two-phase architecture: fully load page first, then extract all cards in a single pass.

**Problem**: The incremental extraction approach (extract → scroll → extract → scroll) was exiting prematurely:
- Lazy-loading has unpredictable delays (sometimes loads after 1 scroll, sometimes after 3-4)
- "3 consecutive failures = done" logic exits when content is still available but slow
- Result: Only 30/400+ contacts extracted from Sullivan & Cromwell

**Solution**: Two-phase architecture separates loading from extraction:

**Phase 1 - Load All Content** (NO extraction):
```javascript
while (scrollCount < maxScrolls && noHeightChangeCount < maxNoChangeRetries) {
  // Scroll to absolute bottom
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  // Wait for height to increase
  await page.waitForFunction(
    (oldHeight) => document.body.scrollHeight > oldHeight,
    { timeout: contentWaitTimeout },
    beforeHeight
  );

  // Reset retry counter on success, increment on failure
  // Exit only after 5 consecutive failures (more forgiving than 3)
}
```

**Phase 2 - Extract All Cards** (NO scrolling):
```javascript
// Find ALL cards on fully-loaded page
const allCardElements = await this.findCardElements(page);
const totalCards = allCardElements.length;

// Extract in single pass
for (let i = 0; i < cardsToExtract; i++) {
  const contact = await this.extractContactFromCard(allCardElements[i], i);
  if (contact) this.addContact(contact);
}
```

**Files Modified**:
- `src/scrapers/config-scrapers/infinite-scroll-scraper.js`
  - Complete rewrite of `scrape()` method with two-phase architecture
  - Increased retry threshold from 3 to 5 for more forgiving lazy-load handling
  - Removed incremental extraction logic and card tracking
  - Simplified `scrollDown()` and `waitForNewContent()` (kept for `diagnose()`)
  - Removed `getCardIdentifier()` (no longer needed)

**Architectural Benefits**:

| Aspect | Before (Incremental) | After (Two-Phase) |
|--------|---------------------|-------------------|
| Logic | Extract → Scroll → Check → Extract | Scroll until done → Extract ALL |
| Retry threshold | 3 consecutive failures | 5 consecutive failures |
| Card tracking | Set of processed card IDs | None (each card processed once) |
| Duplicate detection | During extraction | None needed |
| Link rendering | Often incomplete | Complete (all content loaded) |
| Exit condition | No new cards OR limit | Height stable OR limit |

**Terminal Output Format**:
```
[InfiniteScrollScraper] ═══════════════════════════════════════
[InfiniteScrollScraper] PHASE 1: Loading all content via scrolling
[InfiniteScrollScraper] ═══════════════════════════════════════
[InfiniteScrollScraper] Scroll 1/100: Height = 3454px
[InfiniteScrollScraper] ✓ Height increased by 2400px (3454 → 5854)
[InfiniteScrollScraper] Scroll 2/100: Height = 5854px
[InfiniteScrollScraper] ✓ Height increased by 2400px (5854 → 8254)
...
[InfiniteScrollScraper] ⚠ No height change (retry 1/5)
[InfiniteScrollScraper] ⚠ No height change (retry 2/5)
[InfiniteScrollScraper] ⚠ No height change (retry 3/5)
[InfiniteScrollScraper] ⚠ No height change (retry 4/5)
[InfiniteScrollScraper] ⚠ No height change (retry 5/5)
[InfiniteScrollScraper] ✓ Page fully loaded (height stable after 5 retries)
[InfiniteScrollScraper] Final page height: 45000px after 32 scrolls

[InfiniteScrollScraper] ═══════════════════════════════════════
[InfiniteScrollScraper] PHASE 2: Extracting all contacts from loaded page
[InfiniteScrollScraper] ═══════════════════════════════════════
[InfiniteScrollScraper] Found 420 total cards on page
[InfiniteScrollScraper] Extracting 80 contacts (limit: 80)
[InfiniteScrollScraper] Extracted 10/80 contacts
[InfiniteScrollScraper] Extracted 20/80 contacts
...
[InfiniteScrollScraper] Extracted 80/80 contacts
[InfiniteScrollScraper] ✓ Extraction complete: 80 contacts
```

**Expected Improvements**:
| Metric | Before | After |
|--------|--------|-------|
| Contacts extracted | 30/80 (38%) | 80/80 (100%) |
| Exit reason | "No new cards (3 retries)" | "Contact limit reached" |
| profileUrl success | ~23% | 90%+ |
| Total cards found | 30 | 400+ |

---

### Mouse Wheel Simulation Architecture (December 7)
**Change**: Replaced passive scrollbar monitoring with active mouse wheel simulation for reliable infinite scroll triggering.

**Problem**: Passive scrollbar monitoring was failing because:
- Single `scrollTo({ behavior: 'smooth' })` command was blocked/ignored by site JavaScript
- Scrollbar position stuck at 0.0% the entire time
- Page never actually scrolled, only initial 20 cards loaded
- Waited 3 minutes passively monitoring with no progress

**Solution**: Active mouse wheel simulation that:
- Fires rapid WheelEvent + scrollBy commands (20 per second)
- Actively triggers site's infinite scroll JavaScript listeners
- Monitors page height for new content detection
- Stops when height stable for 5 checks AND at page bottom
- Loads pages in 10-30 seconds instead of timing out

**Files Deleted**:
- `src/scrapers/config-scrapers/scrollbar-monitor.js` - Deprecated, not working

**Files Modified**:
- `src/scrapers/config-scrapers/infinite-scroll-scraper.js` - Complete rewrite with mouse wheel simulation
- `src/scrapers/config-scrapers/index.js` - Removed ScrollbarMonitor export

**Key Implementation** - `scrollToFullyLoad()` method:
```javascript
async scrollToFullyLoad(page) {
  while (scrollCount < this.maxScrolls && stableCount < this.stabilityChecks) {
    scrollCount++;

    // Fire BOTH wheel event AND scrollBy for maximum compatibility
    await page.evaluate((amount) => {
      // Fire wheel event (triggers infinite scroll JS listeners)
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: amount,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(wheelEvent);

      // Also do actual scroll (ensures position changes)
      window.scrollBy(0, amount);
    }, this.scrollAmount);

    // Wait between scrolls (50ms = 20 scrolls/second)
    await page.waitForTimeout(this.scrollDelay);

    // Check height every 20 scrolls (once per second)
    if (scrollCount % 20 === 0) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      const scrollY = await page.evaluate(() => window.scrollY);
      const atBottom = scrollY >= (currentHeight - viewportHeight - 100);

      if (currentHeight === lastHeight) {
        stableCount++;
        if (atBottom && stableCount >= this.stabilityChecks) {
          break; // Done!
        }
      } else {
        stableCount = 0; // Reset - new content loaded
        lastHeight = currentHeight;
      }
    }
  }
}
```

**Why This Works**:

| Aspect | Passive Monitoring (Broken) | Active Wheel Simulation (Works) |
|--------|---------------------------|--------------------------------|
| Scroll method | Single `scrollTo({ smooth })` | 20 wheel events + scrollBy per second |
| Site JS triggers | Often blocked/ignored | WheelEvent fires JS listeners |
| Actual scrolling | scrollTo may not work | scrollBy guarantees position change |
| Speed | 3 minute timeout | 10-30 seconds to fully load |
| Reliability | Position stuck at 0% | Position actively advances |

**Configuration Options**:
```javascript
this.maxScrolls = 1000;      // Safety limit (50 seconds max)
this.scrollDelay = 50;       // 50ms between scrolls = 20/second
this.scrollAmount = 300;     // Pixels per scroll event
this.stabilityChecks = 5;    // Height stable for 5 checks = done
```

**Terminal Output Format**:
```
[InfiniteScrollScraper] ═══════════════════════════════════════
[InfiniteScrollScraper] PHASE 1: Rapid scrolling to load all content
[InfiniteScrollScraper] ═══════════════════════════════════════
[InfiniteScrollScraper] Starting rapid scroll (300px every 50ms)
[InfiniteScrollScraper] Scroll 20: Position 6000px/40000px | Height: 12000px | Cards: 40 | 4s
[InfiniteScrollScraper] Scroll 40: Position 12000px/40000px | Height: 24000px | Cards: 80 | 5s
[InfiniteScrollScraper] Scroll 60: Position 18000px/40000px | Height: 36000px | Cards: 150 | 6s
[InfiniteScrollScraper] Scroll 80: Position 24000px/40000px | Height: 45000px | Cards: 280 | 7s
[InfiniteScrollScraper] Scroll 100: Position 36000px/44100px | Height: 45000px | Cards: 420 | 8s
[InfiniteScrollScraper] ⚠ Height stable (1/5)
[InfiniteScrollScraper] Scroll 120: Position 44000px/44100px | Height: 45000px | Cards: 420 | 9s
[InfiniteScrollScraper] ⚠ Height stable (2/5)
...
[InfiniteScrollScraper] ⚠ Height stable (5/5)
[InfiniteScrollScraper] ✓ Page fully loaded: at bottom AND height stable
[InfiniteScrollScraper] ✓ Scrolling complete after 200 scrolls (12s)
[InfiniteScrollScraper] Final page height: 45000px (grew 41546px)

[InfiniteScrollScraper] ═══════════════════════════════════════
[InfiniteScrollScraper] PHASE 2: Extracting all contacts from loaded page
[InfiniteScrollScraper] ═══════════════════════════════════════
[InfiniteScrollScraper] Found 420 total cards on page
[InfiniteScrollScraper] Extracting 80 contacts (limit: 80)
[InfiniteScrollScraper] Extracted 10/80 contacts
...
[InfiniteScrollScraper] ✓ Extraction complete: 80 contacts
```

**Expected Results**:
| Metric | Before (Passive) | After (Active) |
|--------|-----------------|----------------|
| Scroll position | Stuck at 0% | Advances to 100% |
| Page height | Stuck at 3454px | Grows to 45000px |
| Cards found | 10-20 | 400-420 |
| Total time | 180s timeout | 10-30 seconds |
| profileUrl success | ~20% | 90%+ |

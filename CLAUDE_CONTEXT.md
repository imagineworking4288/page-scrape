# Page Scrape - Claude Context Documentation

This document provides comprehensive context for Claude when editing this project. It covers every file, their purposes, key functions, dependencies, and architectural patterns.

**Last Updated**: December 9, 2025

---

## Project Overview

**Page Scrape** is a universal professional directory scraper that extracts contact information (names, emails, phones, profile URLs) from websites. It supports multiple extraction methods, pagination handling, and exports to JSON/CSV.

### Key Features
- **Multi-method extraction**: DOM-based, text selection, and PDF rendering
- **v2.3 Visual Config Generator**: Interactive tool with 4-layer detection and multi-method extraction testing
- **Automatic pagination**: Detects and handles URL-based and offset-based pagination
- **Infinite scroll**: Selenium PAGE_DOWN simulation for sites with lazy-loading
- **Anti-detection**: Stealth browser configuration with random user agents
- **Domain classification**: Identifies business vs personal email domains
- **OCR extraction**: Tesseract.js-based screenshot text extraction
- **Multiple output formats**: JSON, CSV, Google Sheets export

---

## Complete File Reference

### Root Directory Files

| File | Purpose |
|------|---------|
| `orchestrator.js` | Main CLI entry point - orchestrates scraping workflow |
| `package.json` | Project dependencies and npm scripts |
| `package-lock.json` | Locked dependency versions |
| `README.md` | Project documentation for users |
| `CLAUDE_CONTEXT.md` | This file - comprehensive documentation for Claude |
| `PROJECT-CLEANUP-ANALYSIS.md` | December 2025 project cleanup analysis |
| `.env` | Environment variables (API keys, settings) |
| `.env.example` | Template for environment variables |
| `.gitignore` | Git ignore patterns |
| `start.bat` | Windows batch script for quick startup |
| `eng.traineddata` | Tesseract OCR English language data |

### Directory Structure

```
page-scrape/
├── orchestrator.js              # Main entry point - CLI orchestration
├── package.json                 # Project dependencies and scripts
├── CLAUDE_CONTEXT.md            # This file - comprehensive project documentation
├── configs/                     # Configuration files root
│   ├── _default.json           # System: Default fallback config
│   ├── _template.json          # System: Template for new configs
│   ├── _pagination_cache.json  # System: Cached pagination patterns
│   └── website-configs/        # Website-specific configs (domain-named)
│       └── {domain}.json       # e.g., sullcrom-com.json
├── src/
│   ├── index.js                # Main module index (unified imports)
│   │
│   ├── core/                   # Core infrastructure
│   │   ├── index.js            # Core exports
│   │   ├── browser-manager.js  # Puppeteer browser handling
│   │   ├── selenium-manager.js # Selenium WebDriver handling (for infinite scroll)
│   │   ├── logger.js           # Winston logging setup
│   │   └── rate-limiter.js     # Request throttling
│   │
│   ├── config/                 # Configuration management
│   │   ├── index.js            # Config exports
│   │   ├── config-loader.js    # Config file loading/validation
│   │   └── schemas.js          # v2.3 schema definitions
│   │
│   ├── extraction/             # Field extraction system
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
│   │   ├── config-scraper.js   # Config-driven scraper (main)
│   │   └── config-scrapers/    # Specialized config-based scrapers
│   │       ├── index.js        # Factory and exports
│   │       ├── base-config-scraper.js     # Base class for v2.3 configs
│   │       ├── single-page-scraper.js     # Single page extraction
│   │       ├── infinite-scroll-scraper.js # Selenium PAGE_DOWN simulation
│   │       └── pagination-scraper.js      # Traditional pagination
│   │
│   ├── features/
│   │   └── pagination/         # Pagination subsystem
│   │       ├── index.js        # Exports
│   │       ├── paginator.js    # Main pagination orchestrator
│   │       ├── pattern-detector.js # Pattern discovery
│   │       ├── binary-searcher.js  # True max page finder
│   │       └── url-generator.js    # Page URL generation
│   │
│   ├── utils/                  # Active utilities
│   │   ├── contact-extractor.js # Shared extraction logic
│   │   ├── domain-extractor.js # Email domain classification
│   │   ├── text-parser.js      # Text-to-contact parsing
│   │   ├── profile-visitor.js  # Profile page enrichment
│   │   ├── google-sheets-exporter.js # Google Sheets export
│   │   └── constants.js        # Shared constants
│   │
│   └── tools/                  # Development/utility tools
│       ├── config-generator.js # Interactive config creator (v2.3)
│       ├── test-config.js      # v2.3 Config testing tool
│       ├── site-tester.js      # Site testing utility
│       ├── assets/             # UI assets for config generator
│       │   ├── overlay.html    # v2.3 overlay UI HTML/CSS
│       │   └── overlay-client.js # v2.3 browser-side UI code
│       └── lib/                # Tool-specific modules
│           ├── index.js               # Tool lib exports
│           ├── interactive-session.js # v2.3 Browser UI session
│           ├── element-capture.js     # Element selection
│           ├── config-builder.js      # v2.3 Config assembly
│           ├── extraction-tester.js   # v2.3 Multi-method testing
│           ├── config-schemas.js      # v2.3 schema definitions
│           ├── card-matcher.js        # Card similarity matching
│           ├── enhanced-capture.js    # Enhanced element capture
│           ├── profile-enrichment.js  # Profile page enrichment
│           ├── config-validator.js    # Config validation
│           ├── test-orchestrator.js   # Test orchestration
│           ├── test-reporter.js       # Test result reporting
│           ├── constants/             # Field requirement constants
│           │   └── field-requirements.js
│           └── pagination-diagnostic.js # Pagination diagnosis
│
├── tests/                      # Test files
│   ├── scraper-test.js         # SimpleScraper tests
│   ├── select-scraper-test.js  # SelectScraper tests
│   ├── pagination-test.js      # Pagination tests
│   ├── pagination-integration-test.js # Integration tests
│   ├── pdf-scraper-test.js     # PDF scraper tests
│   ├── selenium-infinite-scroll.test.js # Selenium infinite scroll tests
│   └── test-utils.js           # Test utilities
│
├── .cache/                     # Tesseract OCR cache (gitignored)
├── output/                     # Generated output (gitignored)
└── logs/                       # Log files (gitignored)
```

---

## Core Files Detailed Reference

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

### src/index.js (Unified Module Index)

**Purpose**: Provides unified imports for all project modules.

**Usage**:
```javascript
// Recommended: Feature-based imports
const { BrowserManager, logger, RateLimiter } = require('./src/core');
const { ConfigLoader, validateConfigV23 } = require('./src/config');
const { EmailExtractor, MultiMethodExtractor } = require('./src/extraction');

// Or use unified index
const src = require('./src');
const { BrowserManager, ConfigLoader, EmailExtractor } = src;
```

---

### src/core/ (Core Infrastructure)

#### src/core/browser-manager.js

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

#### src/core/logger.js

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

#### src/core/selenium-manager.js

**Purpose**: Selenium WebDriver manager for reliable infinite scroll with PAGE_DOWN key simulation.

**Key Features**:
- PAGE_DOWN key simulation (more reliable than scrollBy)
- Retry counter reset logic (resets on ANY height change)
- Scroll up/down cycle every 5 failed retries
- Cookie banner auto-dismissal
- Memory monitoring and driver recycling
- Random user agent rotation

**Key Methods**:
- `launch(headless)` - Start Chrome WebDriver with stealth config
- `navigate(url, timeout)` - Navigate with timeout
- `scrollToFullyLoad(options)` - Main scroll method with retry logic
- `dismissCookieBanners(verbose)` - Auto-dismiss common cookie banners
- `getPageSource()` - Get HTML after scrolling
- `close()` - Cleanup driver

**Scroll Configuration**:
```javascript
{
  scrollDelay: 400,           // ms between PAGE_DOWN presses
  maxRetries: 25,             // consecutive no-change attempts before stopping
  maxScrolls: 1000,           // safety limit
  initialWait: 5000,          // wait for initial content
  scrollContainer: null,      // CSS selector for scroll container
  verbose: true               // log progress
}
```

**When to Use**: Sites that don't respond to Puppeteer's scrollBy() or wheel events. Sullivan & Cromwell lawyer listing is a known example.

#### src/core/rate-limiter.js

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

### src/config/ (Configuration Management)

#### src/config/config-loader.js

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

#### src/config/schemas.js

**Purpose**: v2.3 schema definitions and validation functions.

---

### src/scrapers/ (Scraping Implementations)

#### src/scrapers/base-scraper.js

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

#### src/scrapers/simple-scraper.js

**Purpose**: DOM-based scraper that detects contact cards and extracts data.

**Extends**: BaseScraper

**Key Methods**:
- `scrape(url, limit)` - Main extraction from loaded page
- `detectCardPattern(page)` - Auto-detect contact card containers
- `extractContactsFromCards(page, selector, config)` - Extract from detected cards
- `extractContactFromCard(card)` - Single card extraction

#### src/scrapers/select-scraper.js

**Purpose**: Text selection-based scraper using marker boundaries.

**Extends**: BaseScraper

**Key Methods**:
- `scrape(url, limit, keepPdf, sourcePage, sourceUrl)` - Main entry
- `findMarkerPosition(page, marker, markerName)` - Locate text/coordinate markers
- `extractContactsFromDOM(page, startPos, endPos, config)` - DOM-based extraction
- `scrollPage(page, scrollConfig)` - Handle lazy-loaded content
- `detectContainerPattern(page, startPos, endPos)` - Auto-detect containers

#### src/scrapers/config-scraper.js

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

#### src/scrapers/pdf-scraper.js

**Purpose**: PDF rendering and text extraction scraper.

**Extends**: BaseScraper

**Uses**: `pdf-parse` library

**Key Methods**:
- `scrape(url, limit, keepPdf)` - Render page to PDF and parse
- `parsePdfForContacts(pdfData)` - Extract contacts from PDF text

---

### src/scrapers/config-scrapers/ (v2.3 Config-Based Scrapers)

#### src/scrapers/config-scrapers/index.js

**Purpose**: Factory and exports for config-based scrapers.

**Exports**:
- `BaseConfigScraper` - Base class
- `InfiniteScrollScraper` - Infinite scroll handling
- `PaginationScraper` - Traditional pagination
- `SinglePageScraper` - Single page extraction
- `createScraper(paginationType, ...)` - Factory method
- `diagnosePagination(page, ...)` - Pagination type detection

#### src/scrapers/config-scrapers/base-config-scraper.js

**Purpose**: Abstract base class for all v2.3 config-based scrapers.

**Key Features**:
- STRICT extraction using ONLY `userValidatedMethod` from config
- Dynamic extractor initialization based on config methods
- Contact buffer with incremental file writes (every 100 contacts)
- Progress reporting for terminal updates
- Field statistics tracking

**Key Methods**:
- `loadConfig()` - Load and validate config
- `validateConfigVersion()` - Ensure v2.3 format
- `initializeCardSelector()` - Set up card selector from config
- `initializeExtractors(page)` - Initialize extractors based on config
- `findCardElements(page)` - Find all cards on page
- `extractContactFromCard(card, index)` - Extract fields from single card
- `extractField(method, card, fieldConfig)` - Extract single field
- `normalizeFieldValue(fieldName, value)` - Normalize field values
- `addContact(contact)` - Add contact with buffering
- `flushContactBuffer()` - Write buffered contacts to file
- `reportProgress(phase, stats)` - Send progress updates
- `printTerminalSummary()` - Print extraction results summary

#### src/scrapers/config-scrapers/infinite-scroll-scraper.js

**Purpose**: Handles infinite scroll pages using Selenium PAGE_DOWN key simulation.

**NOTE**: This is the ONLY infinite scroll implementation. Puppeteer wheel events were found to be unreliable and have been removed.

**Extends**: BaseConfigScraper

**Architecture**: Two-phase Selenium-only approach
1. **Phase 1**: Load with Selenium (PAGE_DOWN key presses, height monitoring)
2. **Phase 2**: Extract with Selenium (JavaScript execution in browser)

**Key Methods**:
- `scrape(url, limit)` - Main entry point
- `extractAllCardsFromSelenium(limit)` - Extract contacts using JavaScript in Selenium
- `diagnose(url)` - Test infinite scroll behavior with Selenium

**Why Selenium PAGE_DOWN**:
- Puppeteer wheel events don't trigger some sites' infinite scroll JavaScript
- Sullivan & Cromwell test: Selenium found 584 lawyers, Puppeteer only 10
- PAGE_DOWN keyboard events properly fire scroll handlers

**Configuration Options**:
```javascript
this.scrollConfig = {
  scrollDelay: 400,       // 400ms between scrolls
  maxRetries: 25,         // Retries before giving up
  maxScrolls: 1000,       // Safety limit
  initialWait: 5000       // Wait for initial content
};
```

**Config Example**:
```json
{
  "pagination": {
    "paginationType": "infinite-scroll",
    "scrollConfig": {
      "maxRetries": 25,
      "scrollDelay": 400,
      "maxScrolls": 1000
    }
  }
}
```

#### src/scrapers/config-scrapers/single-page-scraper.js

**Purpose**: Scrapes all cards visible on page without pagination.

**Extends**: BaseConfigScraper

**Key Methods**:
- `scrape(url, limit)` - Find cards, extract contacts, return results

#### src/scrapers/config-scrapers/pagination-scraper.js

**Purpose**: Handles traditional paginated pages.

**Extends**: BaseConfigScraper

**Key Features**:
- Uses Paginator for URL pattern discovery
- Sequential page navigation with rate limiting
- Contact deduplication across pages

---

### src/extraction/ (Field Extraction System)

#### src/extraction/extractors/email-extractor.js

**Purpose**: Specialized email extraction with 4-layer mailto detection.

**4-Layer Detection Strategy**:
1. Layer 1: Direct hit - click point is directly on mailto link
2. Layer 2: Text-triggered - center text is "Email" keyword, find nearby mailto
3. Layer 3: Expanded area scan - search broader region (±100px) for mailto links
4. Layer 4: Failure with diagnostic info

**Key Methods**:
- `extractFromRegion(cardElement, fieldCoords)` - Extract email using regex
- `extractFromMailtoLink(cardElement, fieldCoords)` - 4-layer mailto detection

#### src/extraction/extractors/phone-extractor.js

**Purpose**: Specialized phone extraction with 4-layer tel detection.

**Phone Patterns** (tested in order):
1. `+1-212-558-3960` - International with country code
2. `(212) 558-3960` - Standard US format
3. `212-558-3960` - Dashed format
4. `212.558.3960` - Dotted format
5. `2125583960` - Plain 10 digits

**Phone Normalization**: Always outputs `+1-XXX-XXX-XXXX` format

#### src/extraction/extractors/link-extractor.js

**Purpose**: Extracts profile URLs from anchor tags and data attributes.

**Link Scoring**:
- +15 points: URL contains profile-related paths (/profile, /lawyer, /team, /bio)
- +10 points: Link text contains profile-related words
- +15 points: Link text looks like a name
- -30 points: javascript: or # links
- -10 points: Social media links

#### src/extraction/extractors/label-extractor.js

**Purpose**: Finds labeled fields and extracts adjacent values.

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

#### src/extraction/extractors/screenshot-extractor.js

**Purpose**: OCR-based text extraction using Tesseract.js.

**Key Methods**:
- `initialize()` - Create Tesseract worker
- `terminate()` - Cleanup worker
- `extractFromRegion(cardElement, fieldCoords)` - Extract text from region
- `captureRegionScreenshot(coords)` - Screenshot specific area
- `runOCR(imageBuffer)` - Run Tesseract on image

#### src/extraction/extractors/coordinate-extractor.js

**Purpose**: DOM-based text extraction at specific coordinates.

**Algorithm**:
1. Calculate absolute coordinates from card + field offset
2. Use TreeWalker to find text nodes in region
3. Check rect overlap with target region
4. Combine overlapping texts
5. Calculate confidence based on overlap quality

---

### src/features/pagination/ (Pagination Subsystem)

#### src/features/pagination/paginator.js

**Purpose**: Main pagination orchestrator.

**Key Methods**:
- `paginate(url, options)` - Main entry point
- `validatePage(page)` - Check page has content
- `setStartPage(pageNumber)` - Resume from specific page

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

#### src/features/pagination/pattern-detector.js

**Purpose**: Discovers pagination patterns.

**Detection Priority**:
1. Manual config patterns
2. Cached patterns
3. Visual controls + navigation
4. URL analysis (fallback)

**Pattern Types**: parameter, path, offset, cursor, infinite-scroll

#### src/features/pagination/binary-searcher.js

**Purpose**: Finds true maximum page number using binary search.

#### src/features/pagination/url-generator.js

**Purpose**: Generates page URLs based on detected pattern.

---

### src/utils/ (Utilities)

#### src/utils/contact-extractor.js

**Purpose**: Shared extraction logic used across all scrapers.

**Exported Constants**:
- `NAME_BLACKLIST` - Set of invalid name strings
- `NON_NAME_WORDS` - Words indicating non-personal email prefixes
- `COMMON_FIRST_NAMES` - For concatenated email parsing
- `EMAIL_REGEX`, `PHONE_REGEXES`, `NAME_REGEX`

**Key Functions**:
- `extractEmails(text, filterDomain)` - Find all emails
- `extractPhones(text)` - Find all phone numbers
- `normalizePhone(phone)` - Format to +1-XXX-XXX-XXXX
- `isValidNameCandidate(text)` - Validate name
- `extractNameFromEmail(email)` - Derive name from email prefix
- `calculateConfidence(name, email, phone)` - 'high'/'medium'/'low'

#### src/utils/domain-extractor.js

**Purpose**: Classifies email domains as business or personal.

**Personal Domains Include**: gmail.com, yahoo.com, hotmail.com, outlook.com, icloud.com, etc.

#### src/utils/text-parser.js

**Purpose**: Parses raw text into structured contact records.

#### src/utils/profile-visitor.js

**Purpose**: Visits profile pages to enrich contact data.

#### src/utils/google-sheets-exporter.js

**Purpose**: Exports contact data to Google Sheets.

#### src/utils/constants.js

**Purpose**: Shared constants across the project.

---

### src/tools/ (Development Tools)

#### src/tools/config-generator.js

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
5. System tests multiple extraction methods per field
6. User validates best extraction method
7. Generates and saves config file

#### src/tools/test-config.js

**Purpose**: CLI tool to test v2.3 configs.

**Usage**:
```bash
# By domain name (recommended)
node src/tools/test-config.js sullcrom-com --limit 5

# With verbose output and visible browser
node src/tools/test-config.js example-com --limit 10 --verbose --show
```

#### src/tools/site-tester.js

**Purpose**: Site testing utility for debugging extraction issues.

#### src/tools/assets/overlay.html

**Purpose**: HTML/CSS for the config generator overlay UI.

**Key UI Elements**:
- Rectangle drawing canvas
- Field selection panel
- Extraction results panel
- Config preview panel
- Diagnosis panel

#### src/tools/assets/overlay-client.js

**Purpose**: Browser-side JavaScript for the config generator UI.

**Key Functions**:
- Rectangle drawing and field selection
- Communication with backend via exposed functions
- Extraction results display and selection
- Config preview and scraping workflow

---

### src/tools/lib/ (Tool Library Modules)

#### src/tools/lib/interactive-session.js

**Purpose**: Manages the interactive config generation session.

**Key Features**:
- SeleniumManager initialization for infinite-scroll scraping
- Automatic cleanup on session end and process signals (SIGINT, SIGTERM)
- Multi-method extraction testing
- Config validation and generation

**Exposed Browser Functions**:
- `__configGen_testFieldExtraction(data)` - Test extraction methods
- `__configGen_confirmFieldExtraction(data)` - User confirms selection
- `__configGen_generateV23Config(selections)` - Generate final config
- `__configGen_diagnosePagination` - Pagination type detection
- `__configGen_startScraping` - Start scraping workflow (initializes SeleniumManager for infinite-scroll)
- `__configGen_finalSaveAndClose` - Finalize session (cleanup SeleniumManager)

**SeleniumManager Integration** (added Dec 2025):
- Import: `const SeleniumManager = require('../../core/selenium-manager');`
- Property: `this.seleniumManager = null;`
- Initialization in `handleStartScraping()` when `paginationType === 'infinite-scroll'`
- Cleanup in `handleFinalSaveAndClose()` and `cleanupResources()`

#### src/tools/lib/extraction-tester.js

**Purpose**: Orchestrates multiple extraction methods and returns ranked results.

**Auto-Retry Strategy**:
```javascript
// Attempt 1: Original coordinates
// Attempt 2: Expand by 50%
// Attempt 3: Expand by 100%
```

#### src/tools/lib/config-builder.js

**Purpose**: Assembles and saves v2.3 config files.

#### src/tools/lib/config-schemas.js

**Purpose**: v2.3 schema definitions.

**v2.3 Field Schema**:
```javascript
{
  required: Boolean,
  skipped: Boolean,
  userValidatedMethod: String,  // e.g., 'coordinate-text', 'mailto-link'
  coordinates: { x, y, width, height },
  selector: String | null,
  sampleValue: String,
  confidence: Number,
  extractionOptions: Array,
  failedMethods: Array
}
```

#### Other Tool Lib Files

| File | Purpose |
|------|---------|
| `element-capture.js` | Element selection and capture |
| `card-matcher.js` | Card similarity matching |
| `enhanced-capture.js` | Enhanced element capture |
| `profile-enrichment.js` | Profile page data enrichment |
| `config-validator.js` | Config validation logic |
| `test-orchestrator.js` | Test orchestration |
| `test-reporter.js` | Test result formatting |
| `pagination-diagnostic.js` | Pagination diagnosis utilities |
| `constants/field-requirements.js` | Field requirement constants |

---

### tests/ (Test Files)

| File | Purpose |
|------|---------|
| `scraper-test.js` | SimpleScraper tests - email/phone regex, name validation |
| `select-scraper-test.js` | SelectScraper tests - text parsing, marker detection |
| `pagination-test.js` | Pagination tests - pattern detection, URL generation |
| `pagination-integration-test.js` | Integration tests for pagination |
| `pdf-scraper-test.js` | PDF scraper tests |
| `selenium-infinite-scroll.test.js` | Selenium infinite scroll tests (Sullivan & Cromwell) |
| `test-utils.js` | Test utilities and helpers |

**Run Tests**:
- `npm test` - Run basic scraper tests
- `node tests/selenium-infinite-scroll.test.js` - Test Selenium infinite scroll

---

### configs/ (Configuration Files)

#### System Configs (in configs/ root)

| File | Purpose |
|------|---------|
| `_default.json` | Default fallback config for unknown sites |
| `_template.json` | Template for creating new configs |
| `_pagination_cache.json` | Cached pagination patterns by domain |

#### Website Configs (in configs/website-configs/)

Named by domain with dots replaced by dashes: `sullcrom.com` → `sullcrom-com.json`

**v2.3 Config Structure**:
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
      "confidence": 92
    },
    "email": { ... },
    "phone": { ... },
    "profileUrl": { ... },
    "title": { ... },
    "location": { ... }
  },

  "pagination": { ... },
  "extraction": { ... },
  "options": { ... }
}
```

---

## NPM Scripts

```json
{
  "start": "node orchestrator.js",
  "test": "node tests/scraper-test.js",
  "test:pdf": "node tests/pdf-scraper-test.js",
  "test:all": "node tests/scraper-test.js && node tests/pdf-scraper-test.js"
}
```

---

## Dependencies

### Production
- `puppeteer` - Browser automation (main browser)
- `puppeteer-extra` - Plugin system
- `puppeteer-extra-plugin-stealth` - Anti-detection
- `selenium-webdriver` - Browser automation (for PAGE_DOWN infinite scroll)
- `pdf-parse` - PDF text extraction
- `tesseract.js` - OCR text extraction
- `winston` - Logging
- `commander` - CLI argument parsing
- `dotenv` - Environment variables
- `googleapis` - Google Sheets export
- `cheerio` - HTML parsing
- `cli-table3` - CLI table output

**Note**: Selenium requires Chrome browser installed. It uses the system Chrome, not a bundled version.

---

## Key Patterns & Conventions

### Module Pattern
```javascript
class ClassName {
  constructor(dependencies) { ... }
}
module.exports = ClassName;
```

### Dependency Injection
```javascript
const scraper = new ConfigScraper(browserManager, rateLimiter, logger, configLoader);
```

### Error Handling
- Try/catch at boundaries
- Logger for all errors
- Graceful degradation (try multiple methods)

### Async/Await
All browser operations use async/await.

### Extraction Priority
1. Structured data (href, data attributes)
2. DOM patterns (selectors)
3. Text parsing (regex)
4. Fallbacks (email-derived names)

---

## Common Tasks

### Adding a New Site Config (v2.3)
1. Run `node src/tools/config-generator.js --url "URL"`
2. Draw rectangle around a contact card
3. For each field, draw rectangle around field content
4. Review and select best extraction method
5. Config saved to `configs/website-configs/{domain}.json`

### Testing a v2.3 Config
```bash
node src/tools/test-config.js sullcrom-com --limit 5 --verbose
```

### Scraping with a v2.3 Config
```bash
node orchestrator.js --url "URL" --method config --config example-com
```

### Scraping with Pagination
```bash
node orchestrator.js --url "URL" --paginate --max-pages 50
```

### Scraping Infinite Scroll with Selenium
```bash
# Use Selenium for sites that don't respond to mouse wheel
node orchestrator.js --url "URL" --method config --config example-com --force-selenium

# Customize scroll parameters
node orchestrator.js --url "URL" --method config --config example-com --force-selenium --scroll-delay 500 --max-retries 30

# Test Selenium infinite scroll directly
node tests/selenium-infinite-scroll.test.js
```

### Creating Config for Infinite Scroll
Add pagination section to your config:
```json
{
  "pagination": {
    "paginationType": "infinite-scroll",
    "scrollConfig": {
      "maxRetries": 25,
      "scrollDelay": 400,
      "maxScrolls": 1000,
      "initialWait": 5000
    }
  }
}
```

**Note**: The `scrollMethod` field is no longer required. All infinite scroll uses Selenium PAGE_DOWN simulation (the only reliable method).

---

## Editing Guidelines for Claude

1. **Read files before editing**: Always use the Read tool first
2. **Maintain patterns**: Follow existing module/class patterns
3. **Test after changes**: Run `npm test` to verify
4. **Update configs**: If changing config structure, update `_template.json`
5. **Log appropriately**: Use logger levels correctly (error/warn/info/debug)
6. **Handle errors**: Always wrap async operations in try/catch
7. **Preserve extraction priority**: Don't change method order without reason
8. **v2.3 logging**: Use `[v2.3]` prefix for v2.3-specific logs
9. **4-layer detection**: Maintain the 4-layer strategy in email/phone extractors
10. **Auto-retry**: Maintain the 3-attempt retry strategy in extraction-tester
11. **Use feature-based imports**: Prefer `src/core`, `src/config`, `src/extraction`
12. **Update index.js files**: When adding new modules, update relevant exports
13. **No dead code**: Do not create files that aren't imported/used
14. **v2.3 config structure**: Fields are at TOP LEVEL (`config.fields`), NOT nested

---

## Known Issues & Edge Cases

1. **CAPTCHA**: Detected but not bypassed - requires manual intervention
2. **AJAX pagination**: May not detect if URL doesn't change
3. **CSP restrictions**: Bypassed but may affect some sites
4. **Memory leaks**: Mitigated by page recycling every 50 navigations

---

## Architecture Notes

### Module Organization (December 2025 Cleanup)

The project uses canonical module paths:

**Core Infrastructure** (`src/core/`):
- `browser-manager.js` - Puppeteer browser management
- `logger.js` - Winston logging
- `rate-limiter.js` - Request throttling
- `selenium-manager.js` - Selenium WebDriver for infinite scroll

**Configuration** (`src/config/`):
- `config-loader.js` - Site config loading/validation
- `schemas.js` - v2.3 schema definitions

**Extraction** (`src/extraction/`):
- `extractors/` - Individual field extractors (email, phone, link, label, screenshot, coordinate)
- `multi-method-extractor.js` - Multi-method runtime extractor
- `smart-field-extractor.js` - Smart field detection

**Active Utilities** (`src/utils/`):
- `contact-extractor.js` - Shared extraction logic (regex patterns, name validation, universal extraction code)
- `text-parser.js` - Text-to-contact parsing
- `domain-extractor.js` - Email domain classification
- `profile-visitor.js` - Profile page enrichment
- `google-sheets-exporter.js` - Google Sheets export
- `constants.js` - Shared constants

**Features** (`src/features/`):
- `pagination/paginator.js` - Main pagination orchestrator
- `pagination/pattern-detector.js` - Pattern discovery
- `pagination/binary-searcher.js` - True max page finder
- `pagination/url-generator.js` - Page URL generation

**Note**: Legacy duplicates in `src/tools/lib/` were removed (email-extractor.js, phone-extractor.js, etc.). These now live in `src/extraction/extractors/`. The files in `src/utils/` are NOT duplicates - they are canonical utilities.

**Import Path Reference**:
| Module | Canonical Import Path |
|--------|----------------------|
| BrowserManager | `src/core/browser-manager` |
| SeleniumManager | `src/core/selenium-manager` |
| logger | `src/core/logger` |
| RateLimiter | `src/core/rate-limiter` |
| ConfigLoader | `src/config/config-loader` |
| EmailExtractor | `src/extraction/extractors/email-extractor` |
| SmartFieldExtractor | `src/extraction/smart-field-extractor` |
| MultiMethodExtractor | `src/extraction/multi-method-extractor` |
| contactExtractor | `src/utils/contact-extractor` |
| TextParser | `src/utils/text-parser` |
| DomainExtractor | `src/utils/domain-extractor` |
| Paginator | `src/features/pagination/paginator` |

### Infinite Scroll Implementation (Selenium PAGE_DOWN Only)

The infinite scroll scraper uses Selenium WebDriver with PAGE_DOWN key simulation. This is the ONLY infinite scroll implementation - Puppeteer wheel events were found to be unreliable and have been removed.

**Why Puppeteer Wheel Events Failed**:
- Puppeteer's `scrollBy()` and `WheelEvent` didn't trigger some sites' infinite scroll JavaScript
- Sullivan & Cromwell test: Puppeteer found only 10 contacts, Selenium found 584
- Mouse wheel simulation is blocked by some site JavaScript

**Why Selenium PAGE_DOWN Works**:
- PAGE_DOWN key simulation fires proper keyboard events
- Keyboard events trigger scroll event handlers more reliably
- Works across all tested infinite scroll sites
- Dual-phase approach: Phase 1 scrolls, Phase 2 extracts via JS

**When Infinite Scroll is Used**:
- Config specifies `pagination.paginationType: 'infinite-scroll'`
- Use `--scroll` or `--force-selenium` CLI flag
- Automatically detected by config generator pagination diagnosis

**Retry Counter Reset Logic**:
```javascript
while (retries < maxRetries) {
  await scrollElement.sendKeys(Key.PAGE_DOWN);
  await driver.sleep(scrollDelay);

  const newHeight = await driver.executeScript('return document.body.scrollHeight');

  if (newHeight > lastHeight) {
    retries = 0;  // RESET - more content loaded
    lastHeight = newHeight;
  } else {
    retries++;
    // Every 5 failed attempts, try scroll up/down cycle
  }
}
```

**Files**:
- `src/core/selenium-manager.js` - Selenium browser manager
- `src/scrapers/config-scrapers/infinite-scroll-scraper.js` - Selenium-based infinite scroll scraper

**CLI Flags**:
```bash
--force-selenium         # Use Selenium for infinite scroll
--scroll-delay <ms>      # Delay between PAGE_DOWN presses (default: 400)
--max-retries <n>        # Max no-change attempts (default: 25)
```

### Two-Phase Selenium Extraction

The infinite scroll scraper uses a Selenium-only two-phase approach:

**Phase 1 - Load All Content with Selenium** (NO extraction):
- Press PAGE_DOWN key via Selenium WebDriver
- Monitor document.body.scrollHeight for changes
- Reset retry counter when height changes (more content loaded)
- Try scroll up/down cycle every 5 failed retries
- Stop when maxRetries (25) consecutive no-change attempts

**Phase 2 - Extract via Selenium JavaScript** (NO scrolling):
- Page is fully loaded with all content in Selenium DOM
- Execute JavaScript in Selenium to find all card elements
- Extract contact data using config field definitions
- Process contacts in batches, flush to file every 100

**Why Selenium-Only Architecture**:
- Single browser instance (no Puppeteer handoff issues)
- Selenium's executeScript() accesses the fully-loaded DOM
- Avoids "Requesting main frame too early" errors
- Proven to extract 584 contacts from Sullivan & Cromwell

**Config Generator Integration**:
- `interactive-session.js` initializes SeleniumManager for infinite-scroll pages
- Cleanup handled on session end and process signals (SIGINT, SIGTERM)

### v2.3 Config Structure

**Important**: v2.3 configs have `fields` at the TOP LEVEL, NOT nested under `fieldExtraction`:

```javascript
// CORRECT (v2.3):
config.fields.email

// WRONG (v2.1/v2.2 style):
config.fieldExtraction.fields.email
```

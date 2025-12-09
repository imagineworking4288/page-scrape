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
- **Profile enrichment**: Post-scrape validation and enrichment using profile pages

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
│   │   ├── index.js            # Features exports
│   │   ├── pagination/         # Pagination subsystem
│   │   │   ├── index.js        # Exports
│   │   │   ├── paginator.js    # Main pagination orchestrator
│   │   │   ├── pattern-detector.js # Pattern discovery
│   │   │   ├── binary-searcher.js  # True max page finder
│   │   │   └── url-generator.js    # Page URL generation
│   │   │
│   │   └── enrichment/         # Profile enrichment system
│   │       ├── index.js        # Exports
│   │       ├── profile-enricher.js  # Main enrichment orchestrator
│   │       ├── profile-extractor.js # Profile page extraction
│   │       ├── field-comparator.js  # Field comparison logic
│   │       ├── report-generator.js  # Enrichment report generation
│   │       └── cleaners/       # Field cleaning modules
│   │           ├── index.js
│   │           ├── name-cleaner.js      # Remove title suffixes from names
│   │           ├── location-cleaner.js  # Remove phones from locations
│   │           ├── title-extractor.js   # Extract/normalize titles
│   │           └── noise-detector.js    # Detect duplicate/leaked data
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

#### src/tools/enrich-contacts.js

**Purpose**: CLI tool to enrich scraped contacts using profile page data.

**Usage**:
```bash
# Basic usage
node src/tools/enrich-contacts.js --input output/scrape.json

# With options
node src/tools/enrich-contacts.js --input output/scrape.json --limit 10 --verbose

# Resume from specific contact
node src/tools/enrich-contacts.js --input output/scrape.json --resume-from 50

# Output manual review queue
node src/tools/enrich-contacts.js --input output/scrape.json --review-output output/review.json
```

**CLI Options**:
- `-i, --input <file>` - Input JSON file (required)
- `-o, --output <file>` - Output file (default: adds `-enriched` suffix)
- `-l, --limit <n>` - Limit contacts to process
- `--delay <ms>` - Delay between profile visits (default: 3000)
- `--headless/--no-headless` - Browser visibility mode
- `--validate-only` - Only validate, don't enrich
- `--resume-from <n>` - Resume from contact index
- `--save-every <n>` - Save progress every N contacts (default: 50)
- `--skip-errors/--no-skip-errors` - Continue on errors
- `--review-output <file>` - Output manual review queue
- `--report <file>` - Generate enrichment report to file
- `--report-format <format>` - Report format: `json` or `text` (default: text)
- `--fields <fields>` - Comma-separated list of fields to enrich (e.g., name,email,phone)
- `--core-fields-only` - Only enrich core fields (name, email, phone, location, title)
- `-v, --verbose` - Verbose logging (also prints report summary)

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
| `enrichment-test.js` | Profile enrichment system tests (68 test cases) |
| `test-utils.js` | Test utilities and helpers |

**Run Tests**:
- `npm test` - Run basic scraper tests
- `node tests/selenium-infinite-scroll.test.js` - Test Selenium infinite scroll
- `node tests/enrichment-test.js` - Test enrichment cleaners and comparators

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

### Enriching Scraped Contacts
```bash
# Enrich all contacts with profile page data
node src/tools/enrich-contacts.js --input output/scrape.json

# Test with limited contacts first
node src/tools/enrich-contacts.js --input output/scrape.json --limit 10 --verbose

# Resume from a specific contact (if interrupted)
node src/tools/enrich-contacts.js --input output/scrape.json --resume-from 100

# Output contacts needing manual review
node src/tools/enrich-contacts.js --input output/scrape.json --review-output output/review.json

# Only enrich core fields (name, email, phone, location, title) - skip bio, education, etc.
node src/tools/enrich-contacts.js --input output/scrape.json --core-fields-only --verbose

# Enrich only specific fields
node src/tools/enrich-contacts.js --input output/scrape.json --fields name,email,phone --limit 10
```

### Testing Enrichment System
```bash
# Run all enrichment tests (68 test cases)
node tests/enrichment-test.js
```

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

### Profile Enrichment System (December 2025)

The enrichment system validates and fills missing data by visiting profile pages after scraping.

**Problem Solved**: Scraped contacts often have:
- Missing emails (listing page doesn't show them)
- Contaminated names (e.g., "Arthur S. AdlerPartner")
- Phone numbers leaked into location fields
- Missing titles

**Solution**: Profile page data is treated as "source of truth" to clean and enrich contacts.

**Module Architecture**:

```
src/features/enrichment/
├── profile-enricher.js      # Main orchestrator
├── profile-extractor.js     # Multi-strategy profile extraction
├── field-comparator.js      # Comparison logic (6 actions)
└── cleaners/
    ├── name-cleaner.js      # Remove title suffixes
    ├── location-cleaner.js  # Remove phones from locations
    ├── title-extractor.js   # Extract/normalize titles
    └── noise-detector.js    # Detect duplicate/leaked data
```

**Field Comparison Actions**:
1. `ENRICHED` - Original missing, profile has data
2. `VALIDATED` - Exact match between original and profile
3. `CLEANED` - Original contaminated, profile has clean version
4. `REPLACED` - Mismatch, profile wins (flagged for review)
5. `UNCHANGED` - Original exists, profile missing
6. `BOTH_MISSING` - Neither has data

**Profile Extraction Strategies** (tried in order):
1. Semantic HTML (`<a href="mailto:...">`, `<a href="tel:...">`)
2. Structured data (JSON-LD, `<script type="application/ld+json">`)
3. Label-based (e.g., "Email: john@example.com")
4. vCard data if present
5. Meta tags (og:email, etc.)

**Domain-Aware Email Extraction** (December 2025):
- Extracts domain from profile URL (e.g., `sullcrom.com` from `https://www.sullcrom.com/...`)
- Generates name variations for matching (e.g., "Arthur S. Adler" → `arthur.adler`, `aadler`, `adlera`)
- Validates extracted emails against expected domain
- Rejects fake/generic emails (`test@`, `example@`, `noreply@`, `info@`)

**Config-Aware Field Extraction**:
- Only extracts fields that were in original scrape config
- Core fields always extracted: `name`, `email`, `phone`, `location`, `profileUrl`, `title`
- Use `--core-fields-only` to skip extra fields like `bio`, `education`, `practiceAreas`
- Use `--fields name,email,phone` to specify exactly which fields to extract

**Name Cleaning Examples**:
```javascript
cleanName('Arthur S. AdlerPartner')
// → { cleaned: 'Arthur S. Adler', extractedTitle: 'Partner', wasContaminated: true }

cleanName('Jane DoeOf Counsel')
// → { cleaned: 'Jane Doe', extractedTitle: 'Of Counsel', wasContaminated: true }
```

**Location Cleaning Examples**:
```javascript
cleanLocation('New York\n +1-212-558-3960', ['+1-212-558-3960'])
// → { cleaned: 'New York', removedNoise: ['+1-212-558-3960'] }

cleanLocation('New York\nFrankfurt')
// → { cleaned: 'New York', isMultiLocation: true, locations: ['New York', 'Frankfurt'] }
```

**Enriched Contact Structure**:
```javascript
{
  name: 'Arthur S. Adler',           // Cleaned
  email: 'aadler@sullcrom.com',      // Enriched from profile
  phone: '+1-212-558-3960',          // Validated
  location: 'New York',              // Cleaned (phone removed)
  title: 'Partner',                  // Enriched from profile
  profileUrl: 'https://...',         // Original
  _original: {                       // Audit trail
    name: 'Arthur S. AdlerPartner',
    location: 'New York\n +1-212-558-3960'
  },
  _enrichment: {
    enrichedAt: '2025-12-09T...',
    actions: { CLEANED: 2, ENRICHED: 2, VALIDATED: 1 },
    confidence: 'high'
  }
}
```

**CLI Usage**:
```bash
node src/tools/enrich-contacts.js --input output/scrape.json --verbose
```

**Import Paths**:
```javascript
const { ProfileEnricher, cleanName, cleanLocation } = require('./src/features/enrichment');
const { compareAndMerge, compareAllFields } = require('./src/features/enrichment/field-comparator');
```

**Bug Fixes Applied (December 2025)**:
1. **Logger Errors Fixed**: Added safe `log(level, message)` helper in ProfileExtractor to prevent "debug is not a function" errors
2. **Report Statistics Fixed**: Report generator now checks both `contact.enrichment` and `contact._enrichment` for compatibility
3. **Confidence Handling Fixed**: Handles confidence as both object `{overall: 'high'}` and string `'high'`
4. **Action Counting Fixed**: Properly counts actions from `{field: action}` object structure
5. **Field-Level Transparency**: Added `fieldDetails` structure to enrichment metadata showing oldValue → removed → newValue for each field
6. **Fallback Cleaning**: When profile extraction fails, name/location fields are still cleaned (removes title suffixes from names, phones from locations)
7. **Enhanced Logging**: Added `logFieldTransformations()` for verbose debug output of ENRICHED/CLEANED/REPLACED actions
8. **RateLimiter Constructor Fixed**: Fixed `enrich-contacts.js` to pass `logger` as first argument to `RateLimiter(logger, options)` - was passing only options causing "this.logger.debug is not a function" errors
9. **BrowserManager Safe Logging**: Added `_log(level, message)` helper method with console fallback for robust async logging in browser event handlers

**Enrichment Metadata Structure**:
```javascript
{
  enrichedAt: '2025-12-09T...',
  profileVisited: true,
  profileUrl: 'https://...',
  actions: {
    name: 'CLEANED',
    email: 'ENRICHED',
    phone: 'VALIDATED',
    title: 'ENRICHED',
    location: 'CLEANED'
  },
  fieldDetails: {
    name: {
      oldValue: 'Arthur S. AdlerPartner',
      removed: ['title: Partner'],
      newValue: 'Arthur S. Adler',
      action: 'CLEANED',
      source: 'profile'
    },
    email: {
      oldValue: null,
      removed: [],
      newValue: 'aadler@sullcrom.com',
      action: 'ENRICHED',
      source: 'profile'
    }
    // ... other fields
  },
  removed: ['title: Partner from name', 'phone: +1-212-558-3960 from location'],
  confidence: {
    overall: 'high',
    fields: { name: 'high', email: 'high', phone: 'high' }
  }
}
```

**Fallback Cleaning** (when profile extraction fails):
```javascript
// Even if profile page fails to load, we still clean:
// 1. Name: Remove embedded title suffixes ("John DoePartner" → "John Doe")
// 2. Location: Remove phone numbers ("New York\n+1-212-558-3960" → "New York")
// 3. Extract title from name if contact has no title

// Metadata includes:
{
  fallbackCleaning: true,
  fallbackActions: { name: 'CLEANED', title: 'ENRICHED', location: 'CLEANED' },
  fieldDetails: { ... }
}
```

---

## Google Sheets Export Feature

**Location**: `src/features/export/`

**Purpose**: Export scraped or enriched contacts to Google Sheets with automatic column detection, batch writing, and formatting.

**Module Architecture**:
```
src/features/export/
├── sheet-manager.js      # Google Sheets API authentication & operations
├── column-detector.js    # Auto-detect columns from contact data
├── data-formatter.js     # Format contact data for sheets
├── batch-writer.js       # Efficient batch write operations
├── sheet-exporter.js     # Main orchestrator
└── index.js              # Feature exports
```

**Key Components**:

1. **SheetManager** - Handles Google Sheets API:
   - `authenticate()` - OAuth2 with service account
   - `createSheet(name)` - Create new sheet tab
   - `writeRows(spreadsheetId, range, values)` - Write data
   - `formatHeaders(sheetId, columnCount)` - Bold, freeze headers
   - `autoResizeColumns(sheetId, columnCount)` - Auto-fit columns

2. **ColumnDetector** - Auto-detect and order columns:
   - `detectColumns(contacts)` - Scan contacts for available fields
   - `filterColumns(fields, options)` - Apply include/exclude filters
   - `getColumnHeaders(columns)` - Get display header names

3. **DataFormatter** - Format data for sheets:
   - `formatContact(contact, columns)` - Convert to row array
   - `formatDate(timestamp)` - "Dec 9, 2025 6:10 PM"
   - `formatPhone(phone)` - "+1-XXX-XXX-XXXX"
   - `formatEnrichmentActions(actions)` - "name:CLEANED, email:ENRICHED"

4. **BatchWriter** - Efficient batch writes:
   - `writeAllRows(spreadsheetId, sheetName, rows, options)` - Write in batches of 100
   - Progress reporting via `onProgress` callback

5. **SheetExporter** - Main orchestrator:
   - `exportToSheet(contactsOrFile, options)` - Main entry point
   - `createNewSheet(name, contacts, options)` - Create and populate
   - `generateSheetName(contacts, metadata)` - Auto-generate from domain

**CLI Tool**: `src/tools/export-to-sheets.js`
```bash
# Basic usage
node src/tools/export-to-sheets.js --input output/scrape-enriched.json

# With options
node src/tools/export-to-sheets.js --input output/scrape.json \
  --name "My Contacts" \
  --include-enrichment \
  --core-only \
  --verbose
```

**Integration with Enrichment**:
```bash
# Export directly after enrichment
node src/tools/enrich-contacts.js --input output/scrape.json --export-sheets "Sheet Name"
```

**Environment Setup** (`.env`):
```
GOOGLE_SHEETS_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id
```

**Import Paths**:
```javascript
const { SheetExporter, SheetManager, ColumnDetector } = require('./src/features/export');
```

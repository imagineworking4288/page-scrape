# Page Scrape - Project Context Documentation

This document provides comprehensive context for editing this project. It covers every file, their purposes, key functions, dependencies, and architectural patterns.

**Last Updated**: December 22, 2025 (Binary search upper bound fix - expands to hardCap when visual max is valid)

---

## Project Overview

**Page Scrape** is a universal professional directory scraper that extracts contact information (names, emails, phones, profile URLs) from websites. It supports multiple extraction methods, pagination handling, and exports to JSON/CSV.

### Key Features
- **Config-driven extraction**: Site-specific configs with validated selectors and coordinate-based extraction
- **v2.3 Visual Config Generator**: Interactive tool with 4-layer detection and multi-method extraction testing
- **Automatic pagination**: Detects and handles URL-based and offset-based pagination
- **Infinite scroll**: Selenium PAGE_DOWN simulation for sites with lazy-loading
- **Anti-detection**: Stealth browser configuration with random user agents
- **Domain classification**: Identifies business vs personal email domains
- **OCR extraction**: Tesseract.js-based screenshot text extraction
- **Multiple output formats**: JSON, CSV, Google Sheets export
- **Profile enrichment**: Post-scrape validation and enrichment using profile pages

### Quick Start - Test Pipeline

The recommended workflow for scraping a new site (also documented in `start.bat`):

**Step 1: Test Navigation** - Verify scroll or pagination works
```bash
# For infinite scroll sites
node src/tools/test-navigation.js --url "URL" --type scroll --verbose

# For paginated sites
node src/tools/test-navigation.js --url "URL" --type pagination --verbose
```

**Step 2: Generate Config** - Visual tool to select elements
```bash
node src/tools/config-generator.js --url "URL"
```

**Step 3: Run Orchestrator** - Scrape with appropriate mode
```bash
# For pagination
node orchestrator.js --paginate --core-only --config domain-com --url "URL"

# For infinite scroll
node orchestrator.js --scroll --core-only --config domain-com --url "URL"

# Full pipeline (config + scrape + enrich + export)
node orchestrator.js --full-pipeline --auto --core-only --url "URL"
```

Run `start.bat` for copy-paste ready commands.

---

## Complete File Reference

### Root Directory Files

| File | Purpose |
|------|---------|
| `orchestrator.js` | Main CLI entry point - orchestrates scraping workflow |
| `package.json` | Project dependencies and npm scripts |
| `package-lock.json` | Locked dependency versions |
| `README.md` | Project documentation for users |
| `ProjectContext.md` | This file - comprehensive project documentation |
| `analyze-dependencies.js` | Dependency analyzer - finds dead code, deprecated patterns, class usage |
| `.env` | Environment variables (API keys, settings) |
| `.env.example` | Template for environment variables |
| `.gitignore` | Git ignore patterns |
| `start.bat` | Windows batch script with test pipeline and copy-paste commands |
| `eng.traineddata` | Tesseract OCR English language data |

### Directory Structure

```
page-scrape/
├── orchestrator.js              # Main entry point - CLI orchestration
├── package.json                 # Project dependencies and scripts
├── ProjectContext.md            # This file - comprehensive project documentation
├── configs/                     # Configuration files root
│   ├── _default.json           # System: Default fallback config
│   ├── _template.json          # System: Template for new configs
│   ├── _pagination_cache.json  # System: Cached pagination patterns
│   └── website-configs/        # Website-specific configs (domain-named)
│       └── {domain}.json       # e.g., sullcrom-com.json
├── src/
│   ├── core/                   # Core infrastructure
│   │   ├── index.js            # Core exports
│   │   ├── browser-manager.js  # Puppeteer browser handling
│   │   ├── selenium-manager.js # Selenium WebDriver handling (for infinite scroll)
│   │   ├── logger.js           # Winston logging setup
│   │   └── rate-limiter.js     # Request throttling
│   │
│   ├── workflows/              # High-level workflow orchestrators
│   │   └── full-pipeline.js    # Full pipeline: config → scrape → enrich → export
│   │
│   ├── constants/              # Centralized constants
│   │   ├── index.js            # Constants exports
│   │   └── pagination-patterns.js # Pagination parameter names (page, offset, etc.)
│   │
│   ├── config/                 # Configuration management
│   │   ├── config-loader.js    # Config file loading/validation
│   │   └── schemas.js          # v2.3 schema definitions
│   │
│   ├── extraction/             # Field extraction system
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
│   │   ├── index.js            # Scraper exports (v2.3 only, ConfigScraper removed)
│   │   ├── base-scraper.js     # Abstract base class
│   │   └── config-scrapers/    # v2.3 Scrapers (PREFERRED)
│   │       ├── index.js        # Factory (createScraper) and exports
│   │       ├── base-config-scraper.js     # Base class for v2.3 configs
│   │       ├── single-page-scraper.js     # Single page extraction
│   │       ├── infinite-scroll-scraper.js # Selenium PAGE_DOWN simulation
│   │       └── pagination-scraper.js      # Traditional pagination
│   │
│   ├── features/
│   │   ├── pagination/         # Pagination subsystem
│   │   │   ├── paginator.js    # Main pagination orchestrator
│   │   │   ├── pattern-detector.js # Pattern discovery
│   │   │   ├── binary-searcher.js  # True max page finder
│   │   │   └── url-generator.js    # Page URL generation
│   │   │
│   │   └── enrichment/         # Profile enrichment system
│   │       ├── profile-enricher.js  # Main enrichment orchestrator
│   │       ├── profile-extractor.js # Profile page extraction
│   │       ├── field-comparator.js  # Field comparison logic
│   │       ├── report-generator.js  # Enrichment report generation
│   │       ├── cleaners/       # Field cleaning modules (pre-enrichment)
│   │       │   ├── index.js
│   │       │   ├── name-cleaner.js      # Remove title suffixes from names
│   │       │   ├── location-cleaner.js  # Remove phones from locations
│   │       │   ├── title-extractor.js   # Extract/normalize titles
│   │       │   └── noise-detector.js    # Detect duplicate/leaked data
│   │       └── post-cleaners/  # Post-enrichment cleaning modules
│   │           ├── index.js
│   │           ├── field-cleaner.js         # Main post-cleaning orchestrator
│   │           ├── location-normalizer.js   # Location string normalization
│   │           ├── multi-location-handler.js # Multi-location parsing
│   │           ├── phone-location-correlator.js # Phone-location validation
│   │           ├── domain-classifier.js     # Email domain classification
│   │           └── confidence-scorer.js     # Data quality confidence scoring
│   │
│   ├── utils/                  # Active utilities
│   │   ├── contact-extractor.js # Shared extraction logic
│   │   ├── domain-extractor.js # Email domain classification
│   │   ├── profile-visitor.js  # Profile page enrichment
│   │   ├── google-sheets-exporter.js # Google Sheets export
│   │   ├── prompt-helper.js    # Terminal prompt utilities (y/n, tables, headers)
│   │   ├── stats-reporter.js   # Scraping stats and table formatting
│   │   └── constants.js        # Shared constants
│   │
│   └── tools/                  # Development/utility tools
│       ├── config-generator.js # Interactive config creator (v2.3)
│       ├── test-config.js      # v2.3 Config testing tool
│       ├── validate-config.js  # Quick config validation with N contacts
│       ├── test-navigation.js  # Ad-hoc navigation testing (scroll/pagination)
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
│           ├── constants/             # Field requirement constants
│           │   └── field-requirements.js
│           └── pagination-diagnostic.js # Pagination diagnosis
│
├── tests/                      # Test files
│   ├── enrichment-test.js      # Enrichment system tests (68 test cases)
│   ├── post-cleaning-test.js   # Post-cleaning tests (41 test cases)
│   ├── pagination-priority.test.js # URL parameter detection tests
│   ├── selenium-infinite-scroll.test.js # Selenium infinite scroll tests
│   ├── run-navigation-tests.js # Unified navigation test runner
│   ├── test-urls.json          # Test URL database
│   └── navigation/             # Navigation test modules
│       ├── navigation-test-utils.js     # Shared test utilities
│       ├── infinite-scroll-navigation.test.js # Scroll tests
│       └── pagination-navigation.test.js # Pagination tests
│
├── .cache/                     # Tesseract OCR cache (gitignored)
├── output/                     # Generated output (gitignored)
└── logs/                       # Log files (gitignored)
```

---

## Core Files Detailed Reference

### start.bat (Windows Quick Start)

**Purpose**: Windows batch script providing copy-paste ready commands for the test pipeline workflow.

**Sections**:
1. **Quick Reference** - Command overview with all orchestrator flags
2. **Basic Commands** - Simple examples for common tasks
3. **Test Pipeline** - Step-by-step workflow with URL placeholder

**Test Pipeline Workflow**:
```
STEP 1: Test Navigation (scroll OR pagination)
STEP 2: Generate Config (visual element selection)
STEP 3: Run Orchestrator (with --core-only for clean export)
```

**Key Commands** (replace "URL" with target):
```bash
# Test navigation
node src/tools/test-navigation.js --type scroll --verbose --url "URL"
node src/tools/test-navigation.js --type pagination --verbose --url "URL"

# Generate config
node src/tools/config-generator.js --url "URL"

# Orchestrator
node orchestrator.js --paginate --core-only --config domain-com --url "URL"
node orchestrator.js --scroll --core-only --config domain-com --url "URL"
node orchestrator.js --full-pipeline --auto --core-only --url "URL"
```

**Usage**: Double-click `start.bat` to see all commands, then copy/paste into terminal.

---

### orchestrator.js (Entry Point)

**Purpose**: Main CLI entry point that orchestrates the entire scraping process.

**Key Responsibilities**:
- Parse command-line arguments using `commander`
- Initialize browser, rate limiter, and scrapers
- Load configs using `ConfigLoader` (supports v2.3 configs in `configs/website-configs/`)
- Route to appropriate scraper based on pagination type
- Run the scraping workflow
- Handle pagination
- Export results to files

**Scraper Routing** (December 2025):
The orchestrator now routes to the v2.3 scraper system exclusively:

1. **Config Loading**: Uses `ConfigLoader.loadConfigByName()` for `--config` flag, which checks:
   - `configs/website-configs/{name}.json` (primary)
   - `configs/website-configs/{name-with-dots}.json` (domain format)
   - `configs/{name}.json` (legacy)

2. **Scraper Selection** based on pagination type:
   - `--scroll` or `infinite-scroll` → `InfiniteScrollScraper` (Selenium)
   - `--paginate` or `pagination`/`parameter` → `PaginationScraper` (Puppeteer)
   - Single page → `SinglePageScraper` (Puppeteer)

3. **PaginationScraper** handles all pages internally - the orchestrator passes pre-discovered pagination results to avoid redundant discovery.

**IMPORTANT**: When setting `scraper.config` directly (not via `loadConfig()`), you MUST call `scraper.initializeCardSelector()` to initialize the card selector.

**CLI Options**:
```bash
node orchestrator.js --url <url>           # Target URL (required)
                     --config <name>       # Config file name (e.g., "sullcrom" or "sullcrom.json")
                     --limit <n>           # Max contacts
                     --headless <bool>     # Browser mode (default: true)
                     --delay <ms>          # Request delay range (default: 2000-5000)
                     --output <format>     # json|sheets (default: json)

# Pagination Mode Selection (choose one, or use interactive prompt)
                     --paginate            # Force pagination mode (URL-based pagination)
                     --scroll              # Force infinite scroll mode (Selenium PAGE_DOWN)
                     --single-page         # Force single-page mode (no pagination)
                     --start-page <n>      # Resume from page
                     --max-pages <n>       # Max pages to scrape
                     --max-scrolls <n>     # Max scroll attempts (default: 50)

# Full Pipeline Workflow Options
                     --full-pipeline       # Run full pipeline: config → scrape → enrich → export
                     --auto                # Skip confirmation prompts AND pagination mode selection
                     --skip-config-gen     # Skip config generation, use existing config
                     --no-enrich           # Skip enrichment stage
                     --no-export           # Skip export stage

# Export Options
                     --core-only           # Export only 6 core fields (Name, Email, Phone, Title, Location, Profile URL)

# Validation Tool Options
                     --validate            # Run validation tool (quick test with first N contacts)
                     -v, --verbose         # Detailed output with field-level information
```

**Pagination Mode Selection** (December 2025):

When no explicit mode flag is provided (`--scroll`, `--paginate`, `--single-page`), the orchestrator displays an interactive prompt:

```
┌─────────────────────────────────────────────────────────┐
│                  PAGINATION MODE SELECTION              │
├─────────────────────────────────────────────────────────┤
│ Detection:                                              │
│   Domain match: compass.com (pagination)                │
│   URL param: page=1                                     │
├─────────────────────────────────────────────────────────┤
│ Suggested mode: pagination                              │
└─────────────────────────────────────────────────────────┘

Select pagination mode:
  1. pagination (Recommended)
  2. infinite-scroll
  3. single-page
Enter choice (1-3 or text):
```

Use `--auto` to skip the prompt and auto-select based on detection.

**Dependencies**: All scrapers, browser-manager, rate-limiter, logger, paginator

---

### Module Imports (Recommended Pattern)

**Use direct imports from canonical paths** (unified index files were removed in v3.0 cleanup):

```javascript
// Core infrastructure
const BrowserManager = require('./src/core/browser-manager');
const logger = require('./src/core/logger');
const RateLimiter = require('./src/core/rate-limiter');
const { SeleniumManager } = require('./src/core');  // core/index.js still exists

// Configuration
const ConfigLoader = require('./src/config/config-loader');

// Scrapers (v2.3)
const { SinglePageScraper, PaginationScraper, InfiniteScrollScraper, createScraperFromConfig } = require('./src/scrapers/config-scrapers');

// Extractors
const EmailExtractor = require('./src/extraction/extractors/email-extractor');
const PhoneExtractor = require('./src/extraction/extractors/phone-extractor');

// Features
const Paginator = require('./src/features/pagination/paginator');
const ProfileEnricher = require('./src/features/enrichment/profile-enricher');
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
  verbose: true,              // log progress
  enableLoadMoreButton: true, // try to detect and click Load More buttons
  maxButtonClicks: 200,       // maximum number of button clicks
  waitAfterButtonClick: 2000  // ms to wait after clicking button
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
- `loadConfigByName(name)` - Load config by name (e.g., "paulweiss-com") - **NEW December 2025**
- `extractDomain(url)` - Get domain from URL
- `validateConfig(config, domain)` - Validate config structure
- `getDefaultConfig(domain)` - Fallback config
- `listConfigs()` - List all website configs (from both locations)
- `getCachedPattern(domain)` - Get cached pagination pattern
- `saveCachedPattern(domain, pattern)` - Cache pagination pattern

**Config Loading Order** (for `loadConfig(url)`):
1. Primary: `configs/website-configs/{domain}.json`
2. Legacy fallback: `configs/{domain}.json` (with warning)
3. Default: `configs/_default.json`
4. Hardcoded fallback

**Config Loading Order** (for `loadConfigByName(name)`):
1. Primary: `configs/website-configs/{name}.json`
2. Domain format: `configs/website-configs/{name-with-dots}.json` (e.g., "paulweiss-com" → "paulweiss.com")
3. Legacy: `configs/{name}.json`
4. Returns `null` if not found (no default fallback)

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
- `extractFallbackFields(card, contact)` - Fallback DOM extraction for unconfigured fields
- `normalizeFieldValue(fieldName, value)` - Normalize field values
- `addContact(contact)` - Add contact with buffering
- `flushContactBuffer()` - Write buffered contacts to file
- `reportProgress(phase, stats)` - Send progress updates
- `printTerminalSummary()` - Print extraction results summary

**Fallback Field Extraction** (December 2025):
When config doesn't specify methods for fields (e.g., title, location), `extractFallbackFields()` uses generic DOM selectors:
- `profileUrl`: First valid `<a href>` link (not mailto/tel)
- `title`: `.title, [class*="title"], .position, [class*="position"]`
- `location`: `.location, [class*="location"], .office, [class*="office"]`
This ensures PaginationScraper extracts the same fields as InfiniteScrollScraper.

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
- `scrape(url, limit, options)` - Find cards, extract contacts, return results
  - `options.skipNavigation` (Boolean, default: false) - If true, extracts from current page DOM without navigating. Used by config generator validation to preserve overlay UI.

#### src/scrapers/config-scrapers/pagination-scraper.js

**Purpose**: Handles traditional paginated pages.

**Extends**: BaseConfigScraper

**Key Methods**:
- `scrape(url, limit, options)` - Scrape across multiple pages
  - `options.skipNavigation` (Boolean, default: false) - If true, extracts from current page only without pagination discovery. Used by config generator validation.
  - `options.diagnosisResults` - Pre-discovered pagination info (backward compatible with legacy third parameter)

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

**Purpose**: Discovers pagination patterns using priority-based detection.

**Detection Priority** (Updated December 2025):
1. **Manual config patterns** (highest) - User-specified in config file
2. **Cached patterns** - From previous successful runs
3. **URL parameters** (HIGHEST AUTOMATIC) - `page=N`, `offset=N`, etc.
   - Confidence: HIGH
   - Why highest: Definitively indicates server-side pagination
   - Examples: `?page=1`, `?offset=20`, `?pageNum=5`, `?pagingNumber=2`
4. **Visual controls** (medium) - Load More buttons, pagination links
   - Confidence: MEDIUM
   - Only checked if no URL parameters found
5. **Scroll behavior** (lowest) - Infinite scroll indicators
   - Confidence: LOW
   - Only checked if no URL params or visual controls

**Priority Principle**: URL parameters are the strongest automatic detection signal because:
- They definitively indicate server-side pagination (page content replaces, not accumulates)
- Visual controls can be misleading (e.g., Load More button that navigates to next page URL)
- Parameter-based pagination is more reliable for scraping

**Key Methods**:
- `detectUrlPaginationParams(url)` - Check URL for pagination parameters (NEW)
- `discoverPattern(page, url, options)` - Main detection with priority logic
- `detectPaginationControls(page)` - Find buttons and pagination controls
- `extractBaseUrl(url)` - Remove pagination params from URL
- `extractDomain(url)` - Get domain from URL

**Pattern Types**: parameter, path, offset, cursor, button-pagination, infinite-scroll, none

#### src/features/pagination/binary-searcher.js

**Purpose**: Finds true maximum page number using binary search.

**Key Parameters**:
- `hardCap` - Maximum pages to search (default: 500)
- `visualMax` - Max page detected from pagination UI (hint for search)
- `minContacts` - Minimum contacts to consider page valid

**Critical Fix (December 2025)**: When visual max page is valid (has contacts), the search now expands `upperBound` to `hardCap` instead of stopping at the visual max. This allows finding the true maximum page beyond what the pagination UI shows.

```javascript
if (visualMaxValid.hasContacts) {
  lowerBound = visualMax;
  lastValidPage = visualMax;
  upperBound = hardCap;  // CRITICAL: Expand bounds to find true max
}
```

#### src/features/pagination/url-generator.js

**Purpose**: Generates page URLs based on detected pattern. Preserves ALL existing query parameters from the original URL.

### Pagination Pattern Constants (December 2025)

**Location**: `src/constants/pagination-patterns.js`

**Purpose**: Centralized list of pagination parameter names for easy extensibility. Add new parameter names to support additional pagination formats.

**Supported Page Parameter Names**:
- `page`, `p`, `pg` - Common formats
- `pageNum`, `pageNumber`, `pagingNumber` - Descriptive formats
- `pageNo`, `currentPage`, `paged`, `pn` - Alternative formats
- `pagenum`, `page_number`, `page_num` - Underscore formats

**Supported Offset Parameter Names**:
- `offset`, `skip`, `start`, `from`
- `startIndex`, `startindex`, `begin`, `first`

**Adding New Pagination Formats**:

To add support for a new pagination parameter (e.g., `pageIdx`):

1. Edit `src/constants/pagination-patterns.js`
2. Add to appropriate array:
```javascript
const PAGE_PARAMETER_NAMES = [
  // ... existing entries
  'pageIdx',  // New format
];
```
3. Pattern automatically recognized by all pagination detectors

**Filter Preservation**:

The URL generator preserves ALL non-pagination URL parameters when generating page URLs. This ensures filter parameters (offices, practices, industries, etc.) remain intact across pages.

```javascript
// Example: URL with filters and pagingNumber parameter
// Original: ?pageId=1492&pageSize=48&pagingNumber=2&offices=New%20York&practices=All
// Page 3:   ?pageId=1492&pageSize=48&pagingNumber=3&offices=New%20York&practices=All
// Only pagingNumber changes; all filters preserved
```

**Helper Functions**:
- `getPaginationParameterType(paramName)` - Returns 'page', 'offset', 'size', or null
- `isPageParameter(paramName)` - Boolean check for page parameters
- `isOffsetParameter(paramName)` - Boolean check for offset parameters
- `detectPaginationFromUrl(url)` - Analyzes URL to suggest pagination type (see below)

**Known Domain Pagination Types** (`KNOWN_DOMAIN_PAGINATION`):
```javascript
// Infinite scroll sites
'sullcrom.com': 'infinite-scroll',
'skadden.com': 'infinite-scroll',
'weil.com': 'infinite-scroll',

// Traditional pagination sites
'paulweiss.com': 'pagination',
'kirkland.com': 'pagination',
'clearygottlieb.com': 'pagination',
'compass.com': 'pagination',
// ... more in source file
```

**URL Detection Function** (`detectPaginationFromUrl`):
```javascript
const { detectPaginationFromUrl } = require('./src/constants/pagination-patterns');

const result = detectPaginationFromUrl('https://example.com/people?page=2');
// Returns:
// {
//   hasPaginationParam: true,
//   paramName: 'page',
//   paramValue: '2',
//   suggestedType: 'pagination',
//   confidence: 'high',
//   domainMatch: null  // or matched domain name
// }
```

**Import Path**:
```javascript
const {
  PAGE_PARAMETER_NAMES,
  OFFSET_PARAMETER_NAMES,
  KNOWN_DOMAIN_PAGINATION,
  getPaginationParameterType,
  isPageParameter,
  detectPaginationFromUrl
} = require('./src/constants/pagination-patterns');
```

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

# For slow-loading sites, increase timeout (default: 30000ms)
node src/tools/config-generator.js --url "URL" --timeout 60000
```

**CLI Options**:
- `-u, --url <url>` - Target URL (required)
- `-o, --output <dir>` - Config output directory (default: configs)
- `-t, --timeout <ms>` - Page load timeout in milliseconds (default: 30000)
- `--no-test` - Skip testing config after generation
- `--delay <ms>` - Delay between requests (default: 2000-5000)
- `--verbose` - Show detailed logs

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

#### src/tools/validate-config.js

**Purpose**: Quick config validation tool that tests scraping and enrichment on first N contacts before running a full scrape.

**Usage**:
```bash
# Basic usage - test 2 contacts
node src/tools/validate-config.js --url "https://example.com/directory"

# Test 5 contacts with verbose output
node src/tools/validate-config.js --url "URL" --limit 5 --verbose

# Skip enrichment testing
node src/tools/validate-config.js --url "URL" --no-enrich

# Show browser (visible mode)
node src/tools/validate-config.js --url "URL" --show
```

**CLI Options**:
- `-u, --url <url>` - Target URL (required)
- `-l, --limit <number>` - Number of contacts to test (default: 2)
- `-c, --config <name>` - Config name (auto-detect from URL if not provided)
- `--no-enrich` - Skip enrichment testing
- `--show` - Show browser (visible mode)
- `--headless <bool>` - Browser mode (default: true)
- `-v, --verbose` - Detailed output with field-level information

**Validation Steps**:
1. **Config Check**: Locates and validates the config file for the URL's domain
2. **Scraping Test**: Tests extraction on first N contacts using appropriate scraper based on config's pagination type
3. **Enrichment Test**: Tests profile enrichment on contacts with profile URLs
4. **Validation Summary**: Reports issues and recommendations

**Scraper Selection** (December 2025):
Both validation and production now use the SAME scraper routing based on `config.pagination.paginationType`:
- `infinite-scroll` → InfiniteScrollScraper (Selenium)
- `pagination` or `parameter` → PaginationScraper (Puppeteer)
- `single-page` or unspecified → SinglePageScraper (Puppeteer)

The orchestrator and validation tool share the same routing logic, ensuring validation results accurately predict production behavior.

**Output Example**:
```
============================================================
                    CONFIG VALIDATION TOOL
============================================================
Target URL: https://www.sullcrom.com/lawyers
Domain: sullcrom.com
Test contacts: 2
Test enrichment: yes

============================================================
                    STEP 1: CONFIG CHECK
============================================================
✓ Found config: sullcrom-com.json

============================================================
                    STEP 2: SCRAPING TEST
============================================================
Pagination type: infinite-scroll (auto-detected)
Using Selenium (PAGE_DOWN)
...
✓ Scraped 2 contacts

============================================================
                    VALIDATION SUMMARY
============================================================
✓ VALIDATION PASSED
Config is working correctly. Ready for full scrape:
  node orchestrator.js --url "URL" --scroll
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

**Navigation Strategy** (Updated December 2025):
Uses `waitUntil: 'domcontentloaded'` instead of `networkidle0` because:
1. Modern sites with analytics, chat widgets, and tracking never reach network idle
2. The config generator is interactive - the user confirms when the page is ready
3. `domcontentloaded` fires when HTML is parsed, which is sufficient for the UI

```javascript
await this.page.goto(url, {
  waitUntil: 'domcontentloaded',  // Not networkidle0
  timeout: this.options.timeout || 30000
});
```

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

**Validation Scraper Selection** (v2.3 Modernization - December 2025):
Uses v2.3 scrapers exclusively for config validation with `skipNavigation: true` to preserve overlay UI:
```javascript
// For single-page validation - skipNavigation prevents page reload
const { SinglePageScraper } = require('../../scrapers/config-scrapers');
const scraper = new SinglePageScraper(this.browserManager, rateLimiter, this.logger, {});
scraper.config = config;
scraper.initializeCardSelector();
const result = await scraper.scrape(url, limit, { skipNavigation: true });
```

**Session Lifecycle** (Fixed December 2025):
The session promise (`resolveSession`) should ONLY be called in two places:
1. `handleFinalSaveAndClose()` - When user clicks "Save & Close" button
2. `handleUserCancelled()` - When user cancels the session

**IMPORTANT**: The following handlers store results but do NOT resolve the session:
- `handleSaveRequested()` - Saves config, browser stays open
- `handleConfirmAndGenerate()` - Generates config, browser stays open
- `handleGenerateV23Config()` - Generates v2.3 config, browser stays open
- `handleStartScraping()` completion - Scraping done, browser stays open

This ensures the browser remains open for user review until explicitly closed.

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
| `config-validator.js` | Config validation (supports v2.3 + legacy formats) |
| `pagination-diagnostic.js` | Pagination diagnosis utilities |
| `constants/field-requirements.js` | Field requirement constants |

**config-validator.js v2.3 Support** (December 2025):
Supports both v2.3 and legacy config formats for backward compatibility:
- Card selector: `config.cardPattern?.primarySelector || config.selectors?.card`
- Field selectors: `config.fields[name].selector || config.selectors?.fields[name]`

---

### tests/ (Test Files)

| File | Purpose |
|------|---------|
| `enrichment-test.js` | Profile enrichment system tests (68 test cases) |
| `post-cleaning-test.js` | Post-enrichment cleaning system tests (41 test cases) |
| `pagination-priority.test.js` | URL pagination parameter detection tests (16 cases) |
| `selenium-infinite-scroll.test.js` | Selenium infinite scroll tests (Sullivan & Cromwell) |
| `run-navigation-tests.js` | Unified CLI test runner for navigation tests |
| `test-urls.json` | Test URL database for navigation tests |
| `navigation/navigation-test-utils.js` | Shared navigation test utilities |
| `navigation/infinite-scroll-navigation.test.js` | Infinite scroll navigation tests |
| `navigation/pagination-navigation.test.js` | Pagination navigation tests |

**Run Tests**:
- `npm test` - Run enrichment and post-cleaning tests
- `npm run test:enrichment` - Run enrichment tests only
- `npm run test:post-clean` - Run post-cleaning tests only
- `npm run test:selenium` - Run Selenium infinite scroll tests
- `npm run test:nav` - Run all navigation tests
- `npm run test:nav:scroll` - Run scroll navigation tests only
- `npm run test:nav:page` - Run pagination navigation tests only
- `npm run test:all` - Run all tests (enrichment, post-clean, selenium, nav)

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
  "test": "node tests/enrichment-test.js && node tests/post-cleaning-test.js",
  "test:enrichment": "node tests/enrichment-test.js",
  "test:post-clean": "node tests/post-cleaning-test.js",
  "test:selenium": "node tests/selenium-infinite-scroll.test.js",
  "test:nav": "node tests/run-navigation-tests.js",
  "test:nav:scroll": "node tests/run-navigation-tests.js --type scroll",
  "test:nav:page": "node tests/run-navigation-tests.js --type pagination",
  "test:nav:quick": "node tests/run-navigation-tests.js --quick",
  "test:nav:verbose": "node tests/run-navigation-tests.js --verbose",
  "test:all": "npm run test && npm run test:selenium && npm run test:nav"
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
// v2.3 pattern (PREFERRED)
const { SinglePageScraper, PaginationScraper } = require('./src/scrapers/config-scrapers');
const scraper = new SinglePageScraper(browserManager, rateLimiter, logger, {});
scraper.config = config;
scraper.initializeCardSelector();
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
node orchestrator.js --url "URL" --config example-com
```

### Scraping with Pagination
```bash
node orchestrator.js --url "URL" --paginate --max-pages 50
```

### Testing Navigation Before Config Generation
```bash
# Test infinite scroll navigation on a URL
node src/tools/test-navigation.js --url "URL" --type infinite-scroll

# Test with visible browser and verbose output
node src/tools/test-navigation.js --url "URL" --type infinite-scroll --headless false --verbose

# Test pagination pattern detection
node src/tools/test-navigation.js --url "URL" --type pagination --verbose

# Custom scroll settings
node src/tools/test-navigation.js --url "URL" --type infinite-scroll --scroll-delay 500 --max-retries 30
```

**Output includes**:
- Scroll count, height changes, button clicks
- Timeline highlights (when content loaded)
- Stop reason and duration
- Next steps for config generation

### Scraping Infinite Scroll with Selenium
```bash
# Use Selenium for infinite scroll sites
node orchestrator.js --url "URL" --config example-com --scroll

# Customize scroll parameters
node orchestrator.js --url "URL" --config example-com --scroll --scroll-delay 500 --max-retries 30

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

### Validating a Config Before Full Scrape
```bash
# Quick validation with 2 contacts (default)
node src/tools/validate-config.js --url "https://example.com/directory"

# Thorough validation with verbose output
node src/tools/validate-config.js --url "URL" --limit 10 --verbose

# Via orchestrator
node orchestrator.js --url "URL" --validate --limit 5
```

### Running Full Pipeline (Config → Scrape → Enrich → Export)
```bash
# Interactive mode with confirmation prompts
node orchestrator.js --url "https://example.com/directory" --full-pipeline

# Auto mode (no prompts) - for automation
node orchestrator.js --url "URL" --full-pipeline --auto

# Use existing config (skip generation)
node orchestrator.js --url "URL" --full-pipeline --skip-config-gen --auto

# Skip enrichment stage
node orchestrator.js --url "URL" --full-pipeline --no-enrich --auto

# With Google Sheets export
node orchestrator.js --url "URL" --full-pipeline --output sheets --auto
```

---

## Editing Guidelines

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
5. **Config not found**: Ensure config is in `configs/website-configs/` directory with hyphenated domain name (e.g., `domain-com.json`)
6. **"Requesting main frame too early" error**: Occurs occasionally (~2% of contacts) during enrichment when page recycling happens mid-navigation. Non-critical - the contact is skipped and enrichment continues. Affects profile page visits, not main scraping.

### December 2025 v2.3 Modernization (COMPLETE)

All code paths now use v2.3 scrapers exclusively:
- `SinglePageScraper` for single-page sites
- `PaginationScraper` for paginated sites
- `InfiniteScrollScraper` for infinite scroll sites

**v3.0 Status**: Legacy `ConfigScraper` has been removed. See "V3.0 Cleanup" in Architecture Notes.

**Files Updated**:
- `src/scrapers/index.js` - v2.3 scrapers only (ConfigScraper removed)
- `src/tools/validate-config.js` - Uses SinglePageScraper/PaginationScraper
- `src/workflows/full-pipeline.js` - Uses SinglePageScraper/PaginationScraper

### December 2025 Config Generator Browser Fix (FIXED)

**Status**: RESOLVED

**Issue**: Browser was closing immediately after config save/validation instead of staying open.

**Fix Applied**: Removed `resolveSession()` calls from handlers. Now only `handleFinalSaveAndClose()` (triggered by "Save & Close" button) resolves the session.

**Expected Flow**:
1. User creates config, clicks "Save"
2. Config saves, validation runs
3. Config Preview Panel shown with results
4. **Browser stays open**
5. User clicks "Save & Close"
6. Browser closes

**File**: `src/tools/lib/interactive-session.js`

### December 2025 Validation Navigation Fix (FIXED)

**Status**: RESOLVED

**Issue**: Clicking "Validate Data" in the config generator overlay caused the page to navigate/reload, destroying the overlay UI.

**Fix Applied**: Added `skipNavigation` option to scrapers to extract from current DOM without navigating:

```javascript
// SinglePageScraper and PaginationScraper now support:
async scrape(url, limit = 0, options = {}) {
  const { skipNavigation = false } = options;
  if (skipNavigation) {
    // Extract from current page DOM without navigating
  } else {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  }
}
```

**Files**:
- `src/scrapers/config-scrapers/single-page-scraper.js`
- `src/scrapers/config-scrapers/pagination-scraper.js`
- `src/tools/lib/interactive-session.js`

### December 2025 Config Generator Close Button Fix (FIXED)

**Status**: RESOLVED

**Issue**: After scraping completes in config generator, clicking the "Close" button didn't close the browser or return control to terminal. The terminal stayed blocked.

**Root Cause**: The `closePanel()` function in overlay-client.js was calling `__configGen_close()` which resolves the session as cancelled. After scraping completes, it should call `__configGen_finalSaveAndClose()` instead to properly cleanup and close browsers.

**Fix Applied**:
1. `src/tools/assets/overlay-client.js` - Updated `closePanel()` to detect if scraping is complete and call the appropriate backend function:
   - If `state.currentState === STATES.COMPLETE`: calls `__configGen_finalSaveAndClose()`
   - Otherwise: calls `__configGen_close()` for cancellation

2. `src/tools/lib/interactive-session.js` - Enhanced `handleFinalSaveAndClose()` with better error handling and fallback session resolution

**Expected Flow (Now Working)**:
```
User clicks Close → closePanel() checks state →
calls __configGen_finalSaveAndClose() →
handleFinalSaveAndClose() runs →
cleanup Selenium/tester → resolveSession() →
config-generator.js gets control → browserManager.close() →
process exits → terminal responsive
```

### December 2025 maxButtonClicks Increase

**Change**: Increased `maxButtonClicks` default from 50 to 200 in `src/core/selenium-manager.js`

**Reason**: 50 button clicks was stopping scraping too early on large directories that use "Load More" button pagination.

**File**: `src/core/selenium-manager.js` line 36

### December 2025 Dependency Analyzer

**Tool**: `analyze-dependencies.js`

Scans the project to identify dead code, deprecated patterns, and class usage for v3.0 cleanup planning.

**Usage**:
```bash
# Text report with verbose output
node analyze-dependencies.js --verbose

# JSON output for programmatic use
node analyze-dependencies.js --json > dependency-analysis.json
```

**Features**:
- Traces imports from all entry points (orchestrator, tools, tests, workflows)
- Identifies dead code (files never imported)
- Detects deprecated patterns
- Tracks class definitions and instantiations
- Finds circular dependencies
- Generates recommendations with severity levels

**Latest Analysis Results** (December 2025 - Post v3.0 Cleanup):
- ConfigScraper has been REMOVED (v3.0 cleanup complete)
- v2.3 scrapers (SinglePageScraper, PaginationScraper, InfiniteScrollScraper) are active
- 8 dead code files removed
- All `networkidle0`/`networkidle2` replaced with `domcontentloaded`

---

## Architecture Notes

### V3.0 Cleanup (December 2025)

**Summary**: Removed 8 dead code files identified by dependency analysis. Replaced all `networkidle0`/`networkidle2` with `domcontentloaded`. All functionality preserved.

**Removed Files (8)**:

| File | Reason |
|------|--------|
| `src/index.js` | Unused barrel export - no importers |
| `src/config/index.js` | Unused barrel export - only imported by src/index.js |
| `src/features/index.js` | Unused barrel export - only imported by src/index.js |
| `src/features/enrichment/index.js` | Unused barrel export - only imported by src/features/index.js |
| `src/features/pagination/index.js` | Unused barrel export - only imported by src/features/index.js |
| `src/extraction/index.js` | Unused barrel export - only imported by deleted files |
| `src/extraction/multi-method-extractor.js` | Only used by deprecated ConfigScraper |
| `src/scrapers/config-scraper.js` | Deprecated v2.2 scraper - replaced by v2.3 scrapers |

**Updated Files**:
- `src/scrapers/index.js` - Removed ConfigScraper require and export
- All navigation files - Replaced `networkidle0`/`networkidle2` with `domcontentloaded` (14 occurrences in 10 files)

**Verified KEEP (not dead code)**:
- `src/core/index.js` - Used by full-pipeline.js, validate-config.js, test-navigation.js
- `src/tools/lib/card-matcher.js` - Used by interactive-session.js (config generator)
- `src/tools/assets/overlay-client.js` - Loaded dynamically via fs.readFileSync
- `tests/run-navigation-tests.js` - Working test runner
- `tests/navigation/*.js` - Working navigation tests

**NOT Touched**:
- `configs/` folder - All configs preserved
- `configs/website-configs/` - All website configs preserved
- `src/config/config-loader.js` - Unchanged, fully functional

**Verification**: All CLI tools, module imports, and test suites pass after cleanup.

### Orchestrator Refactoring (December 2025)

**Summary**: Reduced `orchestrator.js` from 752 lines to 342 lines (55% reduction) by extracting utilities and eliminating code smells.

**Code Smells Eliminated**:
| Problem | Solution |
|---------|----------|
| Dual config variables (`siteConfig` AND `loadedConfig`) | Single `config` variable loaded once |
| Scattered scraper selection logic (~50 lines) | `createScraperFromConfig()` factory in config-scrapers/index.js |
| Confusing `skipPageLoop` variable | Clear `scraperType` switch/case (`pagination`, `infinite-scroll`, `single-page`) |
| 70 lines inline stats/table formatting | Extracted to `src/utils/stats-reporter.js` |
| Duplicate signal handler code | Single `cleanup()` function |

**Files Created**:
- `src/utils/stats-reporter.js` - Exports `logScrapingStats()`, `logDomainStats()`, `logSampleContacts()`

**Files Modified**:
- `src/scrapers/config-scrapers/index.js` - Added `createScraperFromConfig(config, managers, options)`
- `orchestrator.js` - Refactored to use new utilities

**New Factory Function**:
```javascript
const { createScraperFromConfig } = require('./src/scrapers/config-scrapers');

const { scraper, isInfiniteScroll } = createScraperFromConfig(config, {
  browserManager, seleniumManager, rateLimiter, logger, configLoader
}, {
  scroll, forceSelenium, scrollDelay, maxRetries, maxScrolls, paginate, maxPages
});
```

**Verification**: All 109 unit tests pass, CLI tools work correctly.

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
- `smart-field-extractor.js` - Smart field detection

**Active Utilities** (`src/utils/`):
- `contact-extractor.js` - Shared extraction logic (regex patterns, name validation, universal extraction code)
- `domain-extractor.js` - Email domain classification
- `profile-visitor.js` - Profile page enrichment
- `google-sheets-exporter.js` - Google Sheets export
- `prompt-helper.js` - Terminal prompt utilities (y/n, tables, headers)
- `stats-reporter.js` - Scraping stats and domain analysis table formatting
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
| contactExtractor | `src/utils/contact-extractor` |
| DomainExtractor | `src/utils/domain-extractor` |
| Paginator | `src/features/pagination/paginator` |

### Navigation Strategy: domcontentloaded (CRITICAL)

**All page.goto() calls MUST use `waitUntil: 'domcontentloaded'`.**

```javascript
// CORRECT - use this everywhere
await page.goto(url, {
  waitUntil: 'domcontentloaded',
  timeout: 30000
});

// WRONG - causes timeouts on modern sites
await page.goto(url, {
  waitUntil: 'networkidle0',  // DON'T USE
  timeout: 30000
});
```

**Why `networkidle0` and `networkidle2` Cause Timeouts**:
- Modern sites with analytics (Google Analytics, Facebook Pixel, etc.) never reach "network idle"
- Chat widgets, tracking pixels, and real-time features maintain open connections
- Sites with websockets or long-polling connections never idle
- Result: 30+ second timeouts on nearly every site

**Why `domcontentloaded` Works**:
- Fires when HTML is parsed and DOM is ready
- Fast (typically 1-3 seconds)
- Sufficient for scraping - content is in the DOM
- Follow-up `waitForTimeout(3000)` handles dynamic rendering

**Files Using page.goto()** (all verified to use `domcontentloaded`):
- `src/core/browser-manager.js:134`
- `src/tools/lib/interactive-session.js:166`
- `src/features/pagination/paginator.js:60, 486, 1032`
- `src/features/pagination/pattern-detector.js:584`
- `src/features/pagination/binary-searcher.js:247`
- `src/scrapers/config-scrapers/pagination-scraper.js:98, 123, 235`
- `src/scrapers/config-scrapers/single-page-scraper.js:48`
- `src/utils/profile-visitor.js:129`
- `src/tools/test-config.js:120`
- `src/tools/test-navigation.js:262`
- `src/tools/lib/pagination-diagnostic.js:258`

**If You See Timeout Errors**: Check that all `page.goto()` calls use `domcontentloaded`. Search with: `grep -r "networkidle" src/`

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

### Load More Button Support (December 2025)

The Selenium infinite scroll system now includes automatic "Load More" button detection and clicking as a fallback mechanism when scrolling stops producing new content.

**How It Works**:
1. Scroll using PAGE_DOWN key simulation until height stops changing (maxRetries reached)
2. Detect "Load More" button using multiple strategies
3. If found, click button and wait for new content
4. Resume scrolling after content loads
5. Repeat until no button found or maxButtonClicks reached

**Detection Strategies** (tried in order):
1. **Text content patterns** - Case-insensitive matching for: "load more", "show more", "view more", "see more", "more results", "next page", "see all", "view all"
2. **ARIA label patterns** - aria-label attributes containing "load" or "more"
3. **CSS class patterns** - .load-more, .show-more, [class*="load-more"], etc.
4. **Data attribute patterns** - [data-action*="load"], [data-load-more], etc.
5. **Generic fallback** - Any button/link with "more" as a word boundary (excludes names like "Dellamore")

**Configuration Options** (in pagination.scrollConfig):
```javascript
{
  enableLoadMoreButton: true,   // Enable button detection (default: true)
  maxButtonClicks: 200,         // Max clicks before stopping (default: 200)
  waitAfterButtonClick: 2000,   // Wait time after click (default: 2000ms)
  cardSelector: '.card-class'   // CSS selector for counting new elements
}
```

**No Configuration Required**: Works automatically with default settings. The system will:
- Try scrolling first (more efficient for pure infinite scroll)
- Fall back to button clicking when scroll exhausts
- Continue scrolling after each button click loads new content

**Example Test URL**:
```bash
# Site with "Load More" button pagination:
node orchestrator.js --url "https://www.skadden.com/professionals?skip=25&office=74507339-7adf-4528-ba0d-000000000055" --scroll --limit 100
```

**Files**:
- `src/core/selenium-manager.js` - `detectLoadMoreButton()`, `clickLoadMoreButton()`, updated `scrollToFullyLoad()`
- `src/scrapers/config-scrapers/infinite-scroll-scraper.js` - Button config support, diagnosis updates

**Log Messages**:
```
[Selenium] Scroll exhausted (25 retries), looking for Load More button...
[Selenium] Found Load More button via text-content: "Load More Results"
[Selenium] Clicked Load More button (1/200), loaded 25 new elements
[Selenium] No Load More button found, scroll complete
```

### Button-First Mode Optimization (December 2025)

After the first successful Load More button click, the scraper enters "button-first mode" which checks for the button immediately at the start of each loop iteration instead of scrolling 25 times first.

**Performance Impact**:
- Before: ~25 seconds per button click (scroll 25 times first)
- After: ~3 seconds per button click (immediate button check)
- **~10x faster** for button-based pagination sites

**How It Works**:
1. Scroll until height stops changing
2. Detect and click Load More button (enters button-first mode)
3. Immediately check for button again on next iteration
4. Repeat until button exhausted or max clicks reached
5. Exit cleanly without StaleElementReferenceError

**Log Messages**:
```
[Selenium] Entering button-first mode for faster button pagination
[Selenium] [Button-first] Found button: "VIEW MORE" (strategy: text-content)
[Selenium] [Button-first] Clicked (195/200)
[Selenium] Reached max button clicks (200), stopping pagination
[Selenium] Button pagination complete: 200 clicks, exiting cleanly
```

**Clean Exit on Max Clicks**:
The code checks `buttonClicks >= maxButtonClicks` at the START of each loop to prevent StaleElementReferenceError. After many DOM updates, element references become stale - querying DOM after reaching the limit would crash.

**Natural Termination**: The scraper will stop naturally when the "Load More" button disappears from the page (indicating all content has been loaded), even if `maxButtonClicks` limit hasn't been reached.

**Files**:
- `src/core/selenium-manager.js` - `scrollToFullyLoad()` with button-first mode

### Hybrid Pagination Sites (December 2025)

**Issue**: Some sites use BOTH URL parameters AND Load More buttons simultaneously.

**Example**: Sites like Kirkland.com
- URL: `?page=1`
- Also has: "Load More" button
- Clicking button navigates to `?page=2` (content replaces, not accumulates)

**Resolution**: Pattern detector now prioritizes URL parameters over visual controls because:
- URL params definitively indicate server-side pagination
- Content replacement (not accumulation) requires different scraping strategy
- Parameter-based pagination is more reliable

**Impact on Scraping**:
- Detected as: `parameter` type
- Uses: `PaginationScraper` (not InfiniteScrollScraper)
- Strategy: Navigate through pages sequentially, extract from each page
- Result: Successful extraction of all contacts

**Logging**: When both detected, logs show:
```
[PatternDetector] ✓ URL parameter detected: page=1
[PatternDetector] Pattern type: parameter
[PatternDetector] ⚠ CONFLICT DETECTED
[PatternDetector] Both URL params AND visual controls found
[PatternDetector] Resolution: URL parameters take precedence
```

**If You Encounter Issues**:
If a hybrid site doesn't scrape correctly:
1. Check logs for conflict detection
2. Verify URL has pagination parameter
3. Test if clicking button changes URL
4. Report URL for investigation

### Timeline Callbacks for Scroll Testing (December 2025)

The SeleniumManager's `scrollToFullyLoad()` method now supports optional callback hooks for testing and progress tracking:

**Callback Options**:
```javascript
const scrollStats = await seleniumManager.scrollToFullyLoad({
  // ... standard options ...

  // Timeline callbacks (all optional)
  onHeightChange: (data) => {
    // Called when page height increases
    // data: { type, scrollCount, previousHeight, newHeight, delta, timestamp }
  },
  onButtonClick: (data) => {
    // Called when Load More button is clicked
    // data: { type, buttonClicks, scrollCount, buttonText, strategy, newElementCount, timestamp }
  },
  onScrollBatch: (data) => {
    // Called every 10 scrolls
    // data: { type, scrollCount, heightChanges, buttonClicks, currentHeight, retriesAtBatch, timestamp }
  }
});
```

**Return Value Includes Timeline**:
```javascript
{
  scrollCount: 150,
  heightChanges: 12,
  finalHeight: 45000,
  stopReason: 'Scroll complete (no more content)',
  retriesAtEnd: 25,
  buttonClicks: 3,
  timeline: [
    { type: 'height_change', scrollCount: 5, previousHeight: 2000, newHeight: 4500, delta: 2500, timestamp: 2340 },
    { type: 'scroll_batch', scrollCount: 10, heightChanges: 2, currentHeight: 4500, timestamp: 4200 },
    // ... more events
  ],
  duration: 45000  // Total duration in ms
}
```

### Navigation Testing System (December 2025)

A dedicated testing system for verifying navigation functionality (infinite scroll, pagination) independent of data extraction quality.

**Test Files**:
```
tests/
├── test-urls.json                            # Test URL database
├── run-navigation-tests.js                   # Unified CLI test runner
└── navigation/
    ├── navigation-test-utils.js              # Shared utilities
    ├── infinite-scroll-navigation.test.js    # Scroll tests
    └── pagination-navigation.test.js         # Pagination tests
```

**NPM Scripts**:
```bash
npm run test:nav           # Run all navigation tests
npm run test:nav:scroll    # Infinite scroll tests only
npm run test:nav:page      # Pagination tests only
npm run test:nav:quick     # Quick test suite (reduced limits)
npm run test:nav:verbose   # Verbose output
```

**CLI Usage**:
```bash
# Run all navigation tests
node tests/run-navigation-tests.js

# Test specific URL
node tests/run-navigation-tests.js --url "https://example.com/directory"

# Scroll tests only, verbose
node tests/run-navigation-tests.js --type scroll --verbose

# Quick pagination tests
node tests/run-navigation-tests.js --type pagination --quick

# Save results to JSON
node tests/run-navigation-tests.js --save results.json
```

**Test Categories**:

1. **Infinite Scroll Navigation Tests**:
   - Basic scroll navigation (height changes detected)
   - Timeline callback verification
   - Load More button fallback
   - Scroll completion without hitting limits

2. **Pagination Navigation Tests**:
   - Pattern detection (URL parameter, path, offset)
   - Visual control detection
   - Page URL generation
   - Infinite scroll detection

**Test URL Database** (`tests/test-urls.json`):
```json
{
  "infiniteScroll": {
    "reliable": [
      {
        "name": "Sullivan & Cromwell Lawyers",
        "url": "https://www.sullcrom.com/LawyerListing?custom_is_office=27567",
        "expectedBehavior": {
          "minHeightChanges": 5,
          "hasLoadMoreButton": false
        }
      }
    ],
    "hasLoadMoreButton": [...],
    "unreliable": [...]
  },
  "pagination": {
    "urlParameter": [...],
    "pathBased": [...],
    "offset": [...]
  }
}
```

**Adding New Test URLs**:
1. Edit `tests/test-urls.json`
2. Add entry to appropriate category
3. Set `skip: true` for placeholder entries
4. Define `expectedBehavior` for validation

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
   - `createSheet(name, options)` - Create new sheet tab with optional row/column count
   - `writeRows(spreadsheetId, range, values)` - Write data
   - `formatHeaders(sheetId, columnCount)` - Bold, freeze headers
   - `autoResizeColumns(sheetId, columnCount)` - Auto-fit columns

   **Large Dataset Support** (December 2025): `createSheet()` accepts `options.rowCount` to automatically expand sheets beyond the default 1000 rows. SheetExporter passes contact count + header row to ensure sheets can hold 1000+ contacts.

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
# Default columns (Name, Email, Phone, Title, Location, Profile URL)
node src/tools/export-to-sheets.js --input output/enriched.json --name "My Contacts"

# Only core fields
node src/tools/export-to-sheets.js --input output/enriched.json --core-only

# Specific columns
node src/tools/export-to-sheets.js --input output/enriched.json --columns name,email,phone,profileUrl

# All available columns from contact data
node src/tools/export-to-sheets.js --input output/enriched.json --include-all

# Exclude certain columns
node src/tools/export-to-sheets.js --input output/enriched.json --exclude domain,confidence

# Include enrichment metadata columns
node src/tools/export-to-sheets.js --input output/enriched.json --include-enrichment
```

**Column Configuration**:

Location: `src/features/export/column-detector.js` (top of file)

Default columns exported to Google Sheets (in order):
1. Name
2. Email
3. Phone
4. Title
5. Location
6. Profile URL

**To customize default columns**, edit the `DEFAULT_COLUMNS` array:

```javascript
// In src/features/export/column-detector.js (line 40)
const DEFAULT_COLUMNS = [
  'name',
  'email',
  'phone',
  'title',
  'location',
  'profileUrl',
  'domain',      // ADD: include domain
  'confidence'   // ADD: include confidence score
];
```

**Available fields**:
- Core (used by `--core-only`): `name`, `email`, `phone`, `title`, `location`, `profileUrl`
- Extended: `domain`, `domainType`, `confidence`
- Profile: `bio`, `education`, `practiceAreas`, `barAdmissions`
- Source: `sourceUrl`, `sourcePage`
- Enrichment: `enrichedAt`, `actionsSummary`, `fieldsEnrichedCount`, `fieldsCleanedCount`

**--core-only Flag**:
When `--core-only` is specified (via CLI or full-pipeline), exports contain ONLY 6 columns:
1. Name
2. Email
3. Phone
4. Title
5. Location
6. Profile URL

This excludes all enrichment metadata columns (Actions, Confidence, Enriched At, Fields Cleaned, Fields Enriched) even if `--include-enrichment` is also passed. The `--core-only` flag takes full precedence.

**Integration with Enrichment**:
```bash
# Export directly after enrichment
node src/tools/enrich-contacts.js --input output/scrape.json --export-sheets "Sheet Name"
```

**Environment Setup**:

See `.env.example` for detailed setup instructions. Quick reference:

1. Go to https://console.cloud.google.com/
2. Create/select a project and enable Google Sheets API
3. Create a Service Account and download the JSON key
4. Copy `client_email` and `private_key` from JSON to `.env`
5. **CRITICAL**: Share your target spreadsheet with the service account email as Editor

```bash
# .env configuration
GOOGLE_SHEETS_CLIENT_EMAIL=your-service-account@project-id.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id-from-url
```

**Credential Validation**: SheetManager validates credentials on authentication and provides helpful error messages for common issues:
- Missing/invalid service account email
- Missing/malformed private key
- Placeholder spreadsheet IDs
- Permission errors (spreadsheet not shared with service account)

**Import Paths**:
```javascript
const { SheetExporter, SheetManager, ColumnDetector } = require('./src/features/export');
```

---

## Post-Enrichment Field Cleaning System (December 2025)

**Location**: `src/features/enrichment/post-cleaners/`

**Purpose**: Additional field cleaning and validation that runs AFTER profile enrichment completes. Handles multi-location data, phone-location correlation, domain classification, and confidence scoring.

**Module Architecture**:
```
src/features/enrichment/post-cleaners/
├── index.js                    # Module exports
├── field-cleaner.js            # Main orchestrator
├── location-normalizer.js      # Location string normalization
├── multi-location-handler.js   # Multi-location parsing and prioritization
├── phone-location-correlator.js # Phone-location validation
├── domain-classifier.js        # Email domain classification (business/personal)
└── confidence-scorer.js        # Data quality confidence scoring
```

**Key Components**:

1. **FieldCleaner** - Main orchestrator:
   - `cleanContacts(contacts, options)` - Process all contacts
   - `cleanContact(contact, options)` - Process single contact
   - `getStatistics(cleanedContacts)` - Get processing statistics
   - Options: `prioritizeUS`, `strictValidation`

2. **LocationNormalizer** - Normalize location strings:
   - Preserves important patterns (Washington, D.C., St. Louis, City, STATE)
   - Trims whitespace, normalizes separators
   - Returns `{ normalized, wasChanged }`

3. **MultiLocationHandler** - Parse multi-location data:
   - `parse(rawLocation, primaryPhone, prioritizeUS)` - Main entry
   - Detects multi-location strings (newline-separated)
   - Prioritizes US locations when enabled (default)
   - Identifies US locations by state abbreviation, city name, or phone country code
   - Returns: `{ isMultiLocation, primaryLocation, primaryPhone, additionalLocations, allLocations, locationData }`

4. **PhoneLocationCorrelator** - Validate phone-location correlation:
   - `validate(phone, location, locationData)` - Main entry
   - Detects country mismatches (phone country code vs location country)
   - Detects US city mismatches (area code vs location city)
   - Returns: `{ valid, hasMismatch, reason, details }`

5. **DomainClassifier** - Classify email domains:
   - `classify(email)` - Main entry
   - Uses existing DomainExtractor
   - Returns: `{ domain, domainType }` (business/personal/unknown)

6. **ConfidenceScorer** - Calculate data quality scores:
   - `calculate(contact, validationData)` - Main entry
   - Weighted scoring: name (20%), location (20%), email (30%), phone (15%), correlation (15%)
   - Returns: `{ overall: 'high'|'medium'|'low', score: 0-100, breakdown }`

**CLI Integration**:

The `enrich-contacts.js` CLI tool automatically runs post-cleaning after enrichment (unless `--no-post-clean` is specified).

```bash
# Run with post-cleaning (default)
node src/tools/enrich-contacts.js --input output/scrape.json

# Skip post-cleaning phase
node src/tools/enrich-contacts.js --input output/scrape.json --no-post-clean

# Disable US location prioritization
node src/tools/enrich-contacts.js --input output/scrape.json --no-prioritize-us

# Enable strict phone-location validation
node src/tools/enrich-contacts.js --input output/scrape.json --strict-validation
```

**Post-Cleaned Contact Structure**:
```javascript
{
  name: 'John Smith',
  email: 'john@company.com',
  phone: '+1-212-555-1234',
  location: 'New York, NY',        // Primary location (US prioritized)
  title: 'Partner',
  profileUrl: 'https://...',
  _original: { ... },              // Original values before enrichment
  _enrichment: { ... },            // Enrichment metadata
  _postCleaning: {                 // Post-cleaning metadata
    processedAt: '2025-12-10T...',
    locationData: {
      isMultiLocation: true,
      primaryLocation: 'New York, NY',
      additionalLocations: ['Frankfurt'],
      allLocations: ['New York, NY', 'Frankfurt']
    },
    phoneValidation: {
      valid: true,
      hasMismatch: false
    },
    domainType: 'business',
    confidence: {
      overall: 'high',
      score: 95,
      breakdown: { nameClean: 20, locationClean: 20, emailPresent: 30, phoneValid: 15, phoneLocationValid: 15 }
    }
  }
}
```

**Multi-Location Prioritization**:

When `prioritizeUS: true` (default), contacts with multiple locations are reordered to put US locations first:

```javascript
// Input location: "Frankfurt\nNew York, NY"
// Output: location = "New York, NY", additionalLocations = ["Frankfurt"]

// US detection methods:
// 1. State abbreviation: "Austin, TX" → US
// 2. US city name: "New York" → US
// 3. Phone country code: "+1-555-123-4567" → US
// 4. Special patterns: "Washington, D.C." → US
```

**Phone-Location Correlation**:

Validates that phone numbers match their associated locations:

```javascript
// Country-level validation:
// Phone +44-20-7946-0958 with location "New York" → country-mismatch

// City-level validation (US only):
// Phone +1-212-555-1234 with location "Los Angeles" → city-mismatch (area code 212 = New York)
```

**Test File**: `tests/post-cleaning-test.js`

```bash
# Run post-cleaning tests (34 test cases)
node tests/post-cleaning-test.js
```

**Import Paths**:
```javascript
const {
  FieldCleaner,
  MultiLocationHandler,
  PhoneLocationCorrelator,
  LocationNormalizer,
  DomainClassifier,
  ConfidenceScorer
} = require('./src/features/enrichment/post-cleaners');

// Or via main enrichment index:
const { FieldCleaner, postCleaners } = require('./src/features/enrichment');
```

---

## Full Pipeline Workflow (December 2025)

**Location**: `src/workflows/full-pipeline.js`

**Purpose**: End-to-end workflow that chains all stages: config generation → scraping → enrichment → export. Provides a single command to process a new site from start to finish.

**Module Architecture**:
```
src/workflows/
└── full-pipeline.js    # FullPipelineOrchestrator class
```

**Key Features**:
- Automatic config detection or generation
- Interactive confirmation prompts between stages (skippable with `--auto`)
- Graceful error handling with partial result saving
- Progress tracking with stage headers and summaries
- **Smart scrape reuse**: Config generator performs full scrape; pipeline reuses results instead of redundant second scrape
- Scrape results always saved to `output/` directory (not `configs/`)

**Workflow Stages**:
1. **Config Check**: Locate existing config or generate new one (config generator includes full scrape)
2. **Scraping**: Uses config generator results if available, or runs new scrape if `--skip-config-gen`
3. **Enrichment**: Visit profile pages to validate/fill data
4. **Export**: Save to JSON, CSV, or Google Sheets

**Scrape Result Reuse** (December 2025):
- After `runConfigGenerator()` completes, pipeline checks `output/` for recent scrape files
- If a scrape file for the same domain was created in the last 10 minutes, it's used
- Stage 2 displays "USING CONFIG GENERATOR RESULTS" and loads existing contacts
- This eliminates redundant scraping that doubled processing time

**CLI Usage**:
```bash
# Full pipeline with prompts
node orchestrator.js --url "https://example.com/directory" --full-pipeline

# Full pipeline without prompts (auto mode)
node orchestrator.js --url "URL" --full-pipeline --auto

# Skip config generation (use existing)
node orchestrator.js --url "URL" --full-pipeline --skip-config-gen

# Skip enrichment
node orchestrator.js --url "URL" --full-pipeline --no-enrich

# Skip export
node orchestrator.js --url "URL" --full-pipeline --no-export

# Limit contacts and export to Google Sheets
node orchestrator.js --url "URL" --full-pipeline --limit 100 --output sheets

# Export only core fields (exclude enrichment metadata columns)
node orchestrator.js --url "URL" --full-pipeline --core-only --auto
```

**FullPipelineOrchestrator Class**:

```javascript
class FullPipelineOrchestrator {
  constructor(options, logger) {
    // options: url, limit, headless, auto, skipConfigGen, noEnrich, noExport, coreOnly, output
  }

  async run() {
    await this.stageConfigCheck();
    if (!await this.confirmProceedToScraping()) return;
    await this.stageScraping();
    if (!this.options.noEnrich && await this.confirmProceedToEnrichment()) {
      await this.stageEnrichment();
    }
    if (!this.options.noExport && await this.confirmProceedToExport()) {
      await this.stageExport();
    }
    await this.displayCompletion();
  }
}
```

**Key Methods**:
- `stageConfigCheck()` - Check/generate config, display config summary
- `runConfigGenerator()` - Spawn config generator subprocess, capture scrape results
- `findRecentScrapeResults()` - Find scrape files in output/ created in last 10 minutes
- `stageScraping()` - Use config gen results or run appropriate v2.3 scraper
- `stageEnrichment()` - Enrich contacts with profile data
- `stageExport()` - Export to configured format(s)
- `confirmProceedTo*()` - Interactive y/n prompts (skipped in auto mode)
- `displayCompletion()` - Show final summary and next steps

**Scraper Selection** (v2.3 Modernization - December 2025):
```javascript
// full-pipeline.js now uses v2.3 scrapers exclusively
const { SinglePageScraper, PaginationScraper } = require('../scrapers/config-scrapers');

const paginationType = config.pagination?.paginationType || 'single-page';

if (paginationType === 'pagination' || paginationType === 'parameter') {
  scraper = new PaginationScraper(browserManager, rateLimiter, logger, configLoader, {});
} else {
  scraper = new SinglePageScraper(browserManager, rateLimiter, logger, {});
}

scraper.config = config;
scraper.initializeCardSelector();  // CRITICAL: must call this after setting config
```

**Auto Mode** (`--auto`):
- Skips all confirmation prompts
- Runs all stages automatically
- Useful for scheduled jobs or CI/CD pipelines

**Error Handling**:
- Each stage wrapped in try/catch
- Partial results saved on error
- Graceful degradation (continues to next stage if possible)
- Cleanup on process signals (SIGINT, SIGTERM)

**Import Path**:
```javascript
const FullPipelineOrchestrator = require('./src/workflows/full-pipeline');
```

---

## Terminal Prompt Utilities (December 2025)

**Location**: `src/utils/prompt-helper.js`

**Purpose**: Reusable terminal prompt utilities for interactive CLI workflows. Provides consistent UI elements across all tools.

**Exported Functions**:

### Confirmation Prompts

```javascript
// Yes/No confirmation with default value
const proceed = await confirmYesNo('Continue with scraping?', true);
// Output: Continue with scraping? (Y/n):

// Multiple choice options
const choice = await confirmOptions('Select output format:', ['json', 'csv', 'sheets'], 'json');
// Output: Select output format: [1] json, [2] csv, [3] sheets (default: json):

// Wait for Enter key
await waitForEnter('Press Enter to continue...');
```

### Display Utilities

```javascript
// Stage header with decorative borders
displayStageHeader('SCRAPING RESULTS');
// Output:
// ============================================================
//                     SCRAPING RESULTS
// ============================================================

// Summary table with key-value pairs
displayStageSummary({
  'Total contacts': 150,
  'With email': '120 (80%)',
  'Duration': '2m 30s'
}, 'Scraping Summary:');

// Success/Error/Warning/Info messages
displaySuccess('Scraping completed successfully');  // ✓ Scraping completed successfully
displayError('Failed to connect');                  // ✗ Failed to connect
displayWarning('Some contacts missing emails');     // ⚠ Some contacts missing emails
displayInfo('Using Selenium for infinite scroll');  // ℹ Using Selenium for infinite scroll
```

### Contact Display

```javascript
// Display contacts in formatted table
displayContactsTable(contacts, 5);  // Show first 5 contacts
// Output:
// ┌─────────────────────┬─────────────────────┬────────────────┬──────────────┐
// │ Name                │ Email               │ Phone          │ Title        │
// ├─────────────────────┼─────────────────────┼────────────────┼──────────────┤
// │ John Smith          │ jsmith@example.com  │ +1-212-555-... │ Partner      │
// │ Jane Doe            │ jdoe@example.com    │ +1-212-555-... │ Associate    │
// └─────────────────────┴─────────────────────┴────────────────┴──────────────┘

// Field-by-field comparison (for enrichment)
displayFieldComparison(originalContact, enrichedContact, actions);
```

### Progress Utilities

```javascript
// Progress indicator with percentage
displayProgressIndicator(50, 200, 'Enriching contacts');
// Output: [################                ] 50/200 (25%) - Enriching contacts

// Countdown timer
await countdown(5, 'Starting in');
// Output: Starting in 5... 4... 3... 2... 1...

// Completion summary with timing
displayCompletionSummary({
  'Stage': 'Enrichment',
  'Contacts processed': 150,
  'Duration': '5m 23s',
  'Output file': 'output/enriched.json'
});
```

**Function Reference**:

| Function | Description | Returns |
|----------|-------------|---------|
| `confirmYesNo(message, default)` | Y/n prompt with retry on invalid input | `Promise<boolean>` |
| `confirmOptions(message, options, default)` | Multiple choice prompt | `Promise<string>` |
| `waitForEnter(message)` | Wait for Enter key | `Promise<void>` |
| `displayStageHeader(title)` | Decorative section header | `void` |
| `displayStageSummary(data, title)` | Key-value summary table | `void` |
| `displaySuccess(message)` | Green checkmark message | `void` |
| `displayError(message)` | Red X message | `void` |
| `displayWarning(message)` | Yellow warning message | `void` |
| `displayInfo(message)` | Blue info message | `void` |
| `displayContactsTable(contacts, limit)` | Formatted contact table | `void` |
| `displayFieldComparison(original, enriched, actions)` | Side-by-side comparison | `void` |
| `displayProgressIndicator(current, total, label)` | Progress bar | `void` |
| `displayCompletionSummary(stats)` | Final summary | `void` |
| `countdown(seconds, prefix)` | Countdown timer | `Promise<void>` |
| `selectPaginationMode(options)` | Interactive pagination mode selection | `Promise<string>` |

**Import Path**:
```javascript
const {
  confirmYesNo,
  confirmOptions,
  waitForEnter,
  displayStageHeader,
  displayStageSummary,
  displaySuccess,
  displayError,
  displayWarning,
  displayInfo,
  displayContactsTable,
  displayFieldComparison,
  displayProgressIndicator,
  displayCompletionSummary,
  countdown,
  selectPaginationMode
} = require('./src/utils/prompt-helper');
```

---

## Config Validation Tool (December 2025)

**Location**: `src/tools/validate-config.js`

**Purpose**: Quick validation tool to test a site config works correctly before running a full scrape. Tests scraping and enrichment on first N contacts.

**When to Use**:
- After creating a new config with the config generator
- Before running a large scrape job
- Debugging extraction issues
- Verifying config works after site changes

**CLI Usage**:
```bash
# Quick validation (2 contacts)
node src/tools/validate-config.js --url "https://example.com/directory"

# Thorough validation (10 contacts, verbose)
node src/tools/validate-config.js --url "URL" --limit 10 --verbose

# Scrape-only validation (skip enrichment)
node src/tools/validate-config.js --url "URL" --no-enrich

# Visible browser for debugging
node src/tools/validate-config.js --url "URL" --show
```

**Also accessible via orchestrator**:
```bash
node orchestrator.js --url "URL" --validate --limit 5 --verbose
```

**Validation Checks**:

1. **Config Existence**: Verifies config file exists for domain
2. **Config Structure**: Validates required fields and version
3. **Card Selector**: Tests card pattern finds elements
4. **Field Extraction**: Verifies fields extract correctly
5. **Data Quality**: Checks for contaminated data (titles in names, phones in locations)
6. **Enrichment** (optional): Tests profile page extraction works

**Auto-Detection**:

The validation tool auto-detects infinite scroll pages based on config characteristics:

```javascript
// Auto-detected as infinite scroll if:
// - config.version === '2.3' AND no explicit pagination type
// - config.selectionMethod === 'manual-validated'
// - config.selectionMethod === 'manual'

const looksLikeInfiniteScroll = !paginationType && (
  config.version === '2.3' ||
  config.selectionMethod === 'manual-validated' ||
  config.selectionMethod === 'manual'
);
```

**Exit Codes**:
- `0`: Validation passed (or passed with warnings)
- `1`: Validation failed (scraping returned no contacts)

**Integration with Full Pipeline**:

Run validation before starting full pipeline:
```bash
# First validate
node src/tools/validate-config.js --url "URL" --limit 5

# If validation passes, run full pipeline
node orchestrator.js --url "URL" --full-pipeline --auto
```

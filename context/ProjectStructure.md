# Project Structure

**Last Verified**: 2025-12-22

---

## Directory Tree

```
page-scrape/
├── orchestrator.js              # Main CLI entry point — routes to scrapers/workflows
├── package.json                 # Dependencies and npm scripts
├── .env                         # Environment variables (not committed)
├── .env.example                 # Template for .env
├── start.bat                    # Windows interactive launcher
├── README.md                    # Project documentation
│
├── context/                     # Documentation system (you are here)
│   ├── Summary.md               # Navigation hub and overview
│   ├── ProjectContext.md        # Operational guide
│   ├── ProjectStructure.md      # This file — directory map
│   ├── API.md                   # Complete function encyclopedia
│   ├── Algorithms.md            # Complex logic explained
│   ├── Dependencies.md          # Package documentation
│   └── CHANGELOG.md             # Historical record
│
├── configs/                     # Runtime configuration files
│   ├── _default.json            # Fallback config for unknown sites
│   ├── _template.json           # Template for new configs
│   ├── _pagination_cache.json   # Cached pagination patterns
│   └── website-configs/         # Site-specific configs
│       ├── compass-com.json     # Compass.com config
│       ├── sullcrom-com.json    # Sullivan & Cromwell
│       ├── kirkland-com.json    # Kirkland & Ellis
│       ├── davispolk-com.json   # Davis Polk
│       ├── paulweiss-com.json   # Paul Weiss
│       ├── skadden-com.json     # Skadden
│       ├── debevoise-com.json   # Debevoise
│       └── clearygottlieb-com.json
│
├── src/
│   ├── core/                    # Infrastructure layer
│   │   ├── browser-manager.js   # Puppeteer browser lifecycle
│   │   ├── selenium-manager.js  # Selenium for infinite scroll
│   │   ├── rate-limiter.js      # Request throttling
│   │   ├── logger.js            # Winston logging setup
│   │   └── index.js             # Barrel exports
│   │
│   ├── config/                  # Configuration handling
│   │   ├── config-loader.js     # Load site configs from disk
│   │   └── schemas.js           # Config validation schemas
│   │
│   ├── constants/               # Shared constants
│   │   ├── index.js             # Main constants exports
│   │   └── pagination-patterns.js # URL pattern detection
│   │
│   ├── features/                # Feature modules
│   │   ├── pagination/          # Pagination handling
│   │   │   ├── paginator.js     # Main pagination orchestrator
│   │   │   ├── binary-searcher.js # Binary search for true max
│   │   │   ├── pattern-detector.js # Detect pagination patterns
│   │   │   └── url-generator.js # Generate page URLs
│   │   │
│   │   ├── enrichment/          # Profile enrichment system
│   │   │   ├── profile-enricher.js # Main enrichment logic
│   │   │   ├── profile-extractor.js # Extract from profiles
│   │   │   ├── field-comparator.js # Compare/merge fields
│   │   │   ├── report-generator.js # Enrichment reports
│   │   │   ├── cleaners/        # Data cleaning
│   │   │   │   ├── name-cleaner.js
│   │   │   │   ├── location-cleaner.js
│   │   │   │   ├── title-extractor.js
│   │   │   │   ├── noise-detector.js
│   │   │   │   └── index.js
│   │   │   └── post-cleaners/   # Post-enrichment cleaning
│   │   │       ├── confidence-scorer.js
│   │   │       ├── domain-classifier.js
│   │   │       ├── field-cleaner.js
│   │   │       ├── location-normalizer.js
│   │   │       ├── multi-location-handler.js
│   │   │       ├── phone-location-correlator.js
│   │   │       └── index.js
│   │   │
│   │   └── export/              # Data export
│   │       ├── sheet-exporter.js # Google Sheets export
│   │       ├── sheet-manager.js  # Sheets API wrapper
│   │       ├── batch-writer.js   # Batch write operations
│   │       ├── column-detector.js # Auto-detect columns
│   │       ├── data-formatter.js # Format for export
│   │       └── index.js
│   │
│   ├── extraction/              # Field extraction
│   │   ├── smart-field-extractor.js # Multi-method extraction
│   │   └── extractors/          # Individual extractors
│   │       ├── email-extractor.js
│   │       ├── phone-extractor.js
│   │       ├── link-extractor.js
│   │       ├── label-extractor.js
│   │       ├── coordinate-extractor.js
│   │       ├── screenshot-extractor.js
│   │       └── index.js
│   │
│   ├── scrapers/                # Scraping implementations
│   │   ├── base-scraper.js      # Abstract base class
│   │   ├── index.js             # Barrel exports
│   │   └── config-scrapers/     # v2.3 config-based scrapers
│   │       ├── base-config-scraper.js # Config scraper base
│   │       ├── pagination-scraper.js  # Multi-page scraper
│   │       ├── infinite-scroll-scraper.js # Scroll scraper
│   │       ├── single-page-scraper.js # Single page scraper
│   │       └── index.js         # Factory + exports
│   │
│   ├── workflows/               # High-level orchestrators
│   │   └── full-pipeline.js     # Full pipeline workflow
│   │
│   ├── utils/                   # Shared utilities
│   │   ├── contact-extractor.js # Contact parsing
│   │   ├── domain-extractor.js  # Domain analysis
│   │   ├── google-sheets-exporter.js # Legacy sheets export
│   │   ├── profile-visitor.js   # Visit profile pages
│   │   ├── prompt-helper.js     # Terminal UI utilities
│   │   ├── stats-reporter.js    # Scraping statistics
│   │   └── constants.js         # Utility constants
│   │
│   └── tools/                   # CLI tools
│       ├── config-generator.js  # Visual config creation
│       ├── validate-config.js   # Quick config testing
│       ├── test-config.js       # Config extraction test
│       ├── enrich-contacts.js   # Profile enrichment CLI
│       ├── export-to-sheets.js  # Google Sheets export CLI
│       ├── test-navigation.js   # Navigation testing
│       ├── assets/              # Tool assets
│       │   └── overlay-client.js # Browser overlay script
│       └── lib/                 # Tool libraries
│           ├── card-matcher.js
│           ├── config-builder.js
│           ├── config-schemas.js
│           ├── config-validator.js
│           ├── element-capture.js
│           ├── enhanced-capture.js
│           ├── extraction-tester.js
│           ├── interactive-session.js
│           ├── pagination-diagnostic.js
│           ├── profile-enrichment.js
│           ├── index.js
│           └── constants/
│               └── field-requirements.js
│
├── tests/                       # Test suites
│   ├── enrichment-test.js       # Enrichment system tests (68 cases)
│   ├── post-cleaning-test.js    # Post-cleaner tests (41 cases)
│   ├── selenium-infinite-scroll.test.js
│   ├── pagination-priority.test.js
│   ├── run-navigation-tests.js  # Navigation test runner
│   └── navigation/              # Navigation tests
│       ├── navigation-test-utils.js
│       ├── infinite-scroll-navigation.test.js
│       └── pagination-navigation.test.js
│
├── output/                      # Generated output (gitignored)
│   ├── contacts-*.json          # Scraped contacts
│   ├── scrape-*.json            # Raw scrape output
│   ├── enriched-*.json          # Enriched contacts
│   └── diagnostics/             # Diagnostic output
│
└── logs/                        # Log files (gitignored)
    ├── scraper.log
    └── error.log
```

---

## Directory Purposes

### `/src/core/`

**Purpose**: Infrastructure-level code that all other modules depend on.

**Philosophy**: These files should be stable and rarely change. They provide foundational services (browser management, logging, rate limiting) that feature code builds upon.

**Files:**
| File | Single-Line Purpose | Key Exports |
|------|---------------------|-------------|
| `browser-manager.js` | Puppeteer browser lifecycle | `BrowserManager` class |
| `selenium-manager.js` | Selenium for infinite scroll | `SeleniumManager` class |
| `rate-limiter.js` | Request throttling | `RateLimiter` class |
| `logger.js` | Winston logging setup | `logger` instance |

### `/src/features/pagination/`

**Purpose**: Handles pagination detection and page discovery.

**How It Works**: The Paginator orchestrates pattern detection (find ?page=N in URLs), URL generation, and binary search to find the true maximum page efficiently.

**Files:**
| File | Single-Line Purpose | Key Exports |
|------|---------------------|-------------|
| `paginator.js` | Orchestrate pagination discovery | `Paginator` class |
| `binary-searcher.js` | Binary search for max page | `BinarySearcher` class |
| `pattern-detector.js` | Detect pagination patterns | `PatternDetector` class |
| `url-generator.js` | Generate page URLs | `URLGenerator` class |

### `/src/features/enrichment/`

**Purpose**: Validate and fill missing contact data by visiting profile pages.

**How It Works**: For each contact with a profileUrl, visit the page, extract fields, compare with existing data, and merge (ENRICHED, VALIDATED, CLEANED, or REPLACED).

### `/src/scrapers/config-scrapers/`

**Purpose**: v2.3 config-based scrapers that use site configs for extraction.

**Files:**
| File | Single-Line Purpose | Key Exports |
|------|---------------------|-------------|
| `pagination-scraper.js` | Multi-page scraping with pagination | `PaginationScraper` class |
| `infinite-scroll-scraper.js` | Selenium scroll scraping | `InfiniteScrollScraper` class |
| `single-page-scraper.js` | Single page extraction | `SinglePageScraper` class |
| `index.js` | Factory function | `createScraperFromConfig()` |

### `/configs/`

**Purpose**: Runtime configuration files for site-specific scraping.

**Naming Convention**: `{domain-with-dashes}.json` (e.g., `compass-com.json`)

**Structure**: See `ProjectContext.md` → Config File Structure

---

## Quick File Lookup

| I need to... | File | Function |
|--------------|------|----------|
| Run the main CLI | `orchestrator.js` | `main()` |
| Load a site config | `src/config/config-loader.js` | `loadConfig()` |
| Find pagination max page | `src/features/pagination/binary-searcher.js` | `findTrueMaxPage()` |
| Detect pagination pattern | `src/features/pagination/pattern-detector.js` | `detect()` |
| Generate page URLs | `src/features/pagination/url-generator.js` | `generate()` |
| Scrape paginated site | `src/scrapers/config-scrapers/pagination-scraper.js` | `scrape()` |
| Scrape infinite scroll | `src/scrapers/config-scrapers/infinite-scroll-scraper.js` | `scrapeWithScroll()` |
| Enrich contacts | `src/features/enrichment/profile-enricher.js` | `enrich()` |
| Export to Sheets | `src/features/export/sheet-exporter.js` | `export()` |
| Create visual config | `src/tools/config-generator.js` | `main()` |
| Validate a config | `src/tools/validate-config.js` | `main()` |

---

## File Naming Conventions

| Pattern | Meaning | Example |
|---------|---------|---------|
| `{name}.js` | Standard module | `paginator.js` |
| `{name}-{type}.js` | Specialized type | `binary-searcher.js` |
| `{domain}-com.json` | Site config | `compass-com.json` |
| `index.js` | Barrel exports for directory | `src/core/index.js` |
| `*.test.js` | Test file | `enrichment-test.js` |

---

## Adding New Files

### When adding a new file:

1. Follow the naming convention for its directory
2. Add it to `index.js` if the directory has barrel exports
3. Update this file (`ProjectStructure.md`) with its purpose
4. Document its functions in `API.md`
5. If it contains complex logic, add to `Algorithms.md`

### When adding a new directory:

1. Create an `index.js` for exports if it will have multiple files
2. Add directory description to this file
3. Add to the directory tree above

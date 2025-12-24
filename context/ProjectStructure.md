# Project Structure

## Overview

Universal Professional Scraper - A comprehensive web scraping tool with intelligent extraction, pagination detection, profile enrichment, and Google Sheets export capabilities.

**Total Files:** 87 JavaScript files
**Main Entry Point:** `orchestrator.js`
**Package:** universal-scraper v1.0.0

---

## Directory Tree

```
page-scrape/
│
├── orchestrator.js                          # Main CLI entry point and workflow orchestrator
│
├── src/
│   ├── config/
│   │   ├── config-loader.js                # Loads and validates site-specific JSON configs
│   │   └── schemas.js                      # JSON schema validators for config files
│   │
│   ├── constants/
│   │   ├── index.js                        # Central constants export
│   │   └── pagination-patterns.js          # Predefined pagination detection patterns
│   │
│   ├── core/
│   │   ├── browser-manager.js              # Puppeteer browser lifecycle management with stealth
│   │   ├── index.js                        # Core module exports
│   │   ├── logger.js                       # Winston-based logging system
│   │   ├── rate-limiter.js                 # Exponential backoff rate limiting
│   │   └── selenium-manager.js             # Selenium WebDriver management (fallback)
│   │
│   ├── extraction/
│   │   ├── extractors/
│   │   │   ├── coordinate-extractor.js     # GPS/lat-long coordinate extraction
│   │   │   ├── email-extractor.js          # Email address pattern matching
│   │   │   ├── index.js                    # Extractor module exports
│   │   │   ├── label-extractor.js          # Field label detection
│   │   │   ├── link-extractor.js           # Hyperlink and URL extraction
│   │   │   ├── phone-extractor.js          # International phone number extraction
│   │   │   └── screenshot-extractor.js     # Visual element screenshot capture
│   │   └── smart-field-extractor.js        # Intelligent field extraction orchestrator
│   │
│   ├── features/
│   │   ├── enrichment/
│   │   │   ├── cleaners/
│   │   │   │   ├── index.js                # Cleaner module exports
│   │   │   │   ├── location-cleaner.js     # Remove phone/email noise from locations
│   │   │   │   ├── name-cleaner.js         # Extract embedded titles from names
│   │   │   │   ├── noise-detector.js       # Generic noise pattern detection
│   │   │   │   └── title-extractor.js      # Professional title extraction
│   │   │   │
│   │   │   ├── post-cleaners/
│   │   │   │   ├── confidence-scorer.js    # Assign confidence scores to fields
│   │   │   │   ├── domain-classifier.js    # Email domain classification (personal/work)
│   │   │   │   ├── field-cleaner.js        # Post-enrichment field cleaning
│   │   │   │   ├── index.js                # Post-cleaner module exports
│   │   │   │   ├── location-normalizer.js  # Normalize location formats
│   │   │   │   ├── multi-location-handler.js # Handle multiple location values
│   │   │   │   └── phone-location-correlator.js # Cross-reference phone area codes with locations
│   │   │   │
│   │   │   ├── field-comparator.js         # Compare list vs profile field values
│   │   │   ├── profile-enricher.js         # Visit profile pages to enrich data
│   │   │   ├── profile-extractor.js        # Extract data from individual profiles
│   │   │   └── report-generator.js         # Generate enrichment summary reports
│   │   │
│   │   ├── export/
│   │   │   ├── batch-writer.js             # Batch writing to Google Sheets
│   │   │   ├── column-detector.js          # Detect existing column structure
│   │   │   ├── data-formatter.js           # Format data for Sheets export
│   │   │   ├── index.js                    # Export module exports
│   │   │   ├── sheet-exporter.js           # Main Google Sheets export orchestrator
│   │   │   └── sheet-manager.js            # Sheet creation and management
│   │   │
│   │   └── pagination/
│   │       ├── binary-searcher.js          # Binary search for max page discovery
│   │       ├── paginator.js                # Main pagination orchestrator
│   │       ├── pattern-detector.js         # Detect pagination patterns (URL/visual/nav)
│   │       └── url-generator.js            # Generate pagination URLs from patterns
│   │
│   ├── scrapers/
│   │   ├── base-scraper.js                 # Abstract base scraper class
│   │   ├── index.js                        # Scraper module exports
│   │   │
│   │   └── config-scrapers/
│   │       ├── base-config-scraper.js      # Config-driven scraper base class
│   │       ├── index.js                    # Config scraper exports
│   │       ├── infinite-scroll-scraper.js  # Infinite scroll page handling
│   │       ├── pagination-scraper.js       # Paginated list scraping
│   │       └── single-page-scraper.js      # Single page scraping
│   │
│   ├── tools/
│   │   ├── assets/
│   │   │   └── overlay-client.js           # Browser-injected overlay UI for config generation
│   │   │
│   │   ├── lib/
│   │   │   ├── card-matcher.js             # Match DOM elements to contact cards
│   │   │   ├── config-builder.js           # Interactive config file builder
│   │   │   ├── config-schemas.js           # Config validation schemas
│   │   │   ├── config-validator.js         # Validate config file structure
│   │   │   ├── constants/
│   │   │   │   └── field-requirements.js   # Required/optional field definitions
│   │   │   ├── element-capture.js          # Capture element selectors
│   │   │   ├── enhanced-capture.js         # Enhanced element capture with context
│   │   │   ├── extraction-tester.js        # Test extraction selectors live
│   │   │   ├── index.js                    # Tools lib exports
│   │   │   ├── interactive-session.js      # Interactive CLI session manager
│   │   │   ├── pagination-diagnostic.js    # Diagnose pagination issues
│   │   │   └── profile-enrichment.js       # Profile enrichment configuration
│   │   │
│   │   ├── config-generator.js             # Main config generation CLI tool
│   │   ├── enrich-contacts.js              # Standalone enrichment CLI tool
│   │   ├── export-to-sheets.js             # Standalone Sheets export CLI tool
│   │   ├── test-config.js                  # Test config file validity
│   │   ├── test-navigation.js              # Test navigation strategies
│   │   └── validate-config.js              # Validate config against schema
│   │
│   ├── utils/
│   │   ├── constants.js                    # Utility constants
│   │   ├── contact-extractor.js            # Extract contact cards from DOM
│   │   ├── domain-extractor.js             # Extract domain from URL
│   │   ├── google-sheets-exporter.js       # Google Sheets API wrapper
│   │   ├── page-fingerprint.js             # Page duplicate detection for pagination
│   │   ├── profile-visitor.js              # Visit and extract from profile pages
│   │   ├── prompt-helper.js                # CLI prompting utilities
│   │   └── stats-reporter.js               # Progress and statistics reporting
│   │
│   └── workflows/
│       └── full-pipeline.js                # Complete scraping workflow
│
└── tests/
    ├── enrichment-test.js                  # Test enrichment functionality
    ├── pagination-priority.test.js         # Test pagination pattern priority
    ├── post-cleaning-test.js               # Test post-cleaning operations
    ├── run-navigation-tests.js             # Navigation strategy test runner
    └── selenium-infinite-scroll.test.js    # Test Selenium infinite scroll
```

---

## File Count by Category

| Category | Count | Purpose |
|----------|-------|---------|
| **Core** | 5 | Browser management, logging, rate limiting |
| **Config** | 2 | Config loading and validation |
| **Constants** | 2 | Shared constants and patterns |
| **Extraction** | 8 | Field extractors and smart extraction |
| **Enrichment** | 15 | Profile enrichment, cleaning, scoring |
| **Export** | 6 | Google Sheets export functionality |
| **Pagination** | 4 | Pagination detection and navigation |
| **Scrapers** | 6 | Base and specialized scraper classes |
| **Tools** | 17 | CLI tools for config generation and testing |
| **Utils** | 8 | Shared utilities |
| **Workflows** | 1 | Complete pipeline orchestration |
| **Tests** | 5 | Test suites |
| **Entry Point** | 1 | orchestrator.js |
| **Total** | **87** | |

---

## Key Entry Points

| File | Purpose | When to Use |
|------|---------|-------------|
| `orchestrator.js` | Main CLI scraper | Run full scraping workflow |
| `src/tools/config-generator.js` | Config creation tool | Create new site config |
| `src/tools/enrich-contacts.js` | Standalone enrichment | Enrich existing CSV data |
| `src/tools/export-to-sheets.js` | Standalone export | Export CSV to Google Sheets |
| `src/tools/test-config.js` | Config validator | Test config before scraping |
| `src/tools/test-navigation.js` | Navigation tester | Debug pagination issues |

---

## Configuration Files Location

Config files are stored in `configs/website-configs/` (not shown in tree above, as they're user-generated):

```
configs/
├── website-configs/
│   ├── example.com.json
│   ├── anotherdomain.com.json
│   └── ...
└── _pagination_cache.json
```

Each config defines selectors and strategies for a specific website domain.

---

## Technology Stack

- **Browser Automation**: Puppeteer (primary), Selenium WebDriver (fallback)
- **Stealth**: puppeteer-extra-plugin-stealth
- **Parsing**: Cheerio
- **Export**: Google Sheets API (googleapis)
- **OCR**: Tesseract.js (for PDF/image text)
- **PDF**: pdf-parse
- **CLI**: Commander.js
- **Logging**: Winston
- **Testing**: Custom test runners (no framework)

---

## Notes

- All source files are in ES6 module syntax (`import`/`export`)
- Config files use JSON format
- Logs output to `logs/` directory
- Scraped data saves to `output/` directory
- Screenshots save to `screenshots/` directory

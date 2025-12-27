# Universal Scraper

## Purpose
Automated web scraping system for extracting contact information from directory-style websites. Supports multiple extraction strategies including config-driven scraping, interactive visual selection, and intelligent pattern detection with pagination and enrichment pipelines.

## Tech Stack
- Node.js runtime environment
- Puppeteer/Puppeteer-Extra with Stealth Plugin for browser automation
- Selenium WebDriver for infinite scroll handling
- Winston for structured logging
- Google Sheets API for export
- pdf-parse for PDF text extraction
- cli-table3 for terminal display
- readline for interactive CLI prompts

## Architecture
```
┌─────────────┐
│  CLI Tools  │ (config-generator, test-config, validate-config)
└──────┬──────┘
       │
┌──────▼─────────────────────────────────────────────────────────┐
│              Workflows (full-pipeline)                         │
└──────┬─────────────────────────────────────────────────────────┘
       │
┌──────▼──────────┬──────────────┬────────────────┬──────────────┐
│   Scrapers      │  Extraction  │   Pagination   │   Enrichment │
│ (config/select) │  (field extr)│  (binary/url)  │  (profiles)  │
└────────┬────────┴──────┬───────┴────────┬───────┴──────┬───────┘
         │               │                │              │
┌────────▼───────────────▼────────────────▼──────────────▼───────┐
│              Core Infrastructure                               │
│   BrowserManager │ SeleniumManager │ RateLimiter │ Logger     │
└────────────────────────────────────────────────────────────────┘
```

## Module Map
| Module | Path | Purpose |
|--------|------|---------|
| BrowserManager | src/core/browser-manager.js | Puppeteer browser lifecycle with stealth and memory management |
| SeleniumManager | src/core/selenium-manager.js | Selenium WebDriver for infinite scroll and button pagination |
| RateLimiter | src/core/rate-limiter.js | Request throttling with exponential backoff retry logic |
| Logger | src/core/logger.js | Winston-based structured logging with file rotation |
| ConfigLoader | src/config/config-loader.js | Loads site-specific configs with validation and defaults |
| BaseScraper | src/scrapers/base-scraper.js | Base class with shared extraction utilities |
| SinglePageScraper | src/scrapers/config-scrapers/single-page-scraper.js | Single page scraping implementation |
| PaginationScraper | src/scrapers/config-scrapers/pagination-scraper.js | Traditional URL-based pagination scraper |
| InfiniteScrollScraper | src/scrapers/config-scrapers/infinite-scroll-scraper.js | Infinite scroll with Selenium integration |
| SmartFieldExtractor | src/extraction/smart-field-extractor.js | Multi-strategy field extraction with fallbacks |
| Paginator | src/features/pagination/paginator.js | Pagination orchestrator with binary search |
| PatternDetector | src/features/pagination/pattern-detector.js | URL pattern detection for pagination |
| BinarySearcher | src/features/pagination/binary-searcher.js | Binary search for max page discovery |
| ProfileEnricher | src/features/enrichment/profile-enricher.js | Contact data enrichment pipeline |
| ProfileVisitor | src/utils/profile-visitor.js | Profile page visiting for email extraction |
| DomainExtractor | src/utils/domain-extractor.js | Email domain classification business vs personal |
| ContactExtractor | src/utils/contact-extractor.js | Shared email phone name extraction patterns |
| CardMatcher | src/tools/lib/card-matcher.js | Visual card pattern matching engine |
| EnhancedCapture | src/tools/lib/enhanced-capture.js | Comprehensive DOM data capture for config generation |
| ElementCapture | src/tools/lib/element-capture.js | Manual field selection processing |
| ConfigBuilder | src/tools/lib/config-builder.js | Config generation for v1.0 v2.0 v2.1 v2.2 v2.3 |
| InteractiveSession | src/tools/lib/interactive-session.js | Browser overlay for visual card selection |
| SheetExporter | src/features/export/sheet-exporter.js | Google Sheets export with formatting |
| PageFingerprint | src/utils/page-fingerprint.js | Duplicate page detection for binary search |

## File Tree
```
src/
├── core/
│   ├── index.js                      # Core infrastructure exports
│   ├── browser-manager.js            # Puppeteer browser lifecycle manager
│   ├── selenium-manager.js           # Selenium infinite scroll handler
│   ├── rate-limiter.js               # Request throttling and retry logic
│   └── logger.js                     # Winston structured logging
├── config/
│   ├── config-loader.js              # Site config loading with validation
│   └── schemas.js                    # Config schema definitions v2.3
├── constants/
│   ├── index.js                      # Central constants export
│   └── pagination-patterns.js        # Known pagination URL patterns
├── scrapers/
│   ├── index.js                      # Scraper factory exports
│   ├── base-scraper.js               # Base scraper with shared utilities
│   └── config-scrapers/
│       ├── index.js                  # Config scraper exports
│       ├── base-config-scraper.js    # Base config-driven scraper
│       ├── single-page-scraper.js    # Single page extraction
│       ├── pagination-scraper.js     # URL pagination handler
│       └── infinite-scroll-scraper.js # Selenium scroll integration
├── extraction/
│   ├── smart-field-extractor.js      # Multi-strategy field extraction
│   └── extractors/
│       ├── index.js                  # Extractor exports
│       ├── email-extractor.js        # Email extraction strategies
│       ├── phone-extractor.js        # Phone extraction strategies
│       ├── link-extractor.js         # Link extraction utilities
│       ├── label-extractor.js        # Label-based field extraction
│       ├── screenshot-extractor.js   # OCR-based extraction
│       └── coordinate-extractor.js   # Coordinate-based extraction
├── features/
│   ├── pagination/
│   │   ├── paginator.js              # Pagination orchestration
│   │   ├── pattern-detector.js       # URL pattern detection
│   │   ├── binary-searcher.js        # Binary search max page
│   │   └── url-generator.js          # Pagination URL generation
│   ├── enrichment/
│   │   ├── profile-enricher.js       # Enrichment pipeline orchestrator
│   │   ├── profile-extractor.js      # Profile data extraction
│   │   ├── field-comparator.js       # Field comparison logic
│   │   ├── report-generator.js       # Enrichment report generation
│   │   ├── cleaners/
│   │   │   ├── index.js              # Cleaner exports
│   │   │   ├── name-cleaner.js       # Name normalization
│   │   │   ├── title-extractor.js    # Title extraction
│   │   │   ├── location-cleaner.js   # Location normalization
│   │   │   └── noise-detector.js     # Noise detection
│   │   └── post-cleaners/
│   │       ├── index.js              # Post-cleaner exports
│   │       ├── confidence-scorer.js  # Confidence scoring
│   │       ├── domain-classifier.js  # Domain classification
│   │       ├── field-cleaner.js      # Final field cleanup
│   │       ├── location-normalizer.js # Location standardization
│   │       ├── multi-location-handler.js # Multi-location resolution
│   │       └── phone-location-correlator.js # Phone location correlation
│   └── export/
│       ├── index.js                  # Export module exports
│       ├── sheet-exporter.js         # Google Sheets exporter
│       ├── sheet-manager.js          # Sheet CRUD operations
│       ├── batch-writer.js           # Batch write optimization
│       ├── column-detector.js        # Dynamic column detection
│       └── data-formatter.js         # Data formatting utilities
├── utils/
│   ├── domain-extractor.js           # Email domain classification
│   ├── contact-extractor.js          # Shared extraction patterns
│   ├── profile-visitor.js            # Profile page enrichment
│   ├── google-sheets-exporter.js     # Legacy Sheets export
│   ├── stats-reporter.js             # Statistics display
│   ├── prompt-helper.js              # CLI prompt utilities
│   ├── page-fingerprint.js           # Page duplicate detection
│   └── constants.js                  # Shared constants
├── tools/
│   ├── config-generator.js           # Interactive config generation
│   ├── test-config.js                # Config testing tool
│   ├── validate-config.js            # Config validation tool
│   ├── test-navigation.js            # Navigation testing
│   ├── enrich-contacts.js            # Contact enrichment CLI
│   ├── export-to-sheets.js           # Sheets export CLI
│   ├── assets/
│   │   └── overlay-client.js         # Browser overlay HTML/JS
│   └── lib/
│       ├── index.js                  # Tool library exports
│       ├── card-matcher.js           # Visual card matching
│       ├── enhanced-capture.js       # DOM capture for config
│       ├── element-capture.js        # Manual field selection
│       ├── profile-enrichment.js     # Profile enrichment logic
│       ├── config-builder.js         # Multi-version config builder
│       ├── config-validator.js       # Config validation logic
│       ├── config-schemas.js         # v2.3 schema definitions
│       ├── extraction-tester.js      # Extraction method testing
│       ├── pagination-diagnostic.js  # Pagination debugging
│       ├── interactive-session.js    # Visual selection session
│       └── constants/
│           └── field-requirements.js # Field metadata constants
└── workflows/
    └── full-pipeline.js              # Complete scrape-enrich-export workflow
```

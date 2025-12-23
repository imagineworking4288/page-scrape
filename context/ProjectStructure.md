# Project Structure

**Last Verified**: December 22, 2025

---

## Directory Tree

```
page-scrape/
├── orchestrator.js                 # Main CLI entry point
├── package.json                    # Dependencies and scripts
├── ProjectContext.md               # Quick reference (root level)
├── .env                            # Environment variables
│
├── configs/
│   ├── _default.json               # Fallback config
│   ├── _template.json              # Template for new configs
│   ├── _pagination_cache.json      # Cached pagination patterns
│   └── website-configs/            # Site-specific configs
│       ├── compass-com.json
│       ├── sullcrom-com.json
│       └── {domain}.json
│
├── context/                        # Documentation system
│   ├── Summary.md
│   ├── ProjectContext.md
│   ├── ProjectStructure.md
│   ├── API.md
│   ├── Dependencies.md
│   └── CHANGELOG.md
│
├── src/
│   ├── core/                       # Infrastructure
│   │   ├── browser-manager.js      # Puppeteer browser handling
│   │   ├── selenium-manager.js     # Selenium WebDriver
│   │   ├── logger.js               # Winston logging
│   │   ├── rate-limiter.js         # Request throttling
│   │   └── index.js
│   │
│   ├── config/
│   │   ├── config-loader.js        # Load and validate configs
│   │   └── schemas.js              # Config schemas
│   │
│   ├── constants/
│   │   ├── pagination-patterns.js  # Page/offset parameter names
│   │   └── index.js
│   │
│   ├── scrapers/
│   │   ├── base-scraper.js         # Abstract base
│   │   ├── index.js
│   │   └── config-scrapers/
│   │       ├── base-config-scraper.js      # findCardElements()
│   │       ├── pagination-scraper.js       # Multi-page
│   │       ├── infinite-scroll-scraper.js  # Selenium scroll
│   │       ├── single-page-scraper.js
│   │       └── index.js                    # Factory
│   │
│   ├── features/
│   │   ├── pagination/
│   │   │   ├── paginator.js        # Orchestrator
│   │   │   ├── binary-searcher.js  # Find true max page
│   │   │   ├── pattern-detector.js # Detect pagination type
│   │   │   └── url-generator.js    # Generate page URLs
│   │   │
│   │   ├── enrichment/
│   │   │   ├── profile-enricher.js
│   │   │   ├── profile-extractor.js
│   │   │   ├── field-comparator.js
│   │   │   ├── report-generator.js
│   │   │   ├── cleaners/
│   │   │   └── post-cleaners/
│   │   │
│   │   └── export/
│   │       ├── sheet-exporter.js
│   │       ├── sheet-manager.js
│   │       └── batch-writer.js
│   │
│   ├── extraction/
│   │   ├── smart-field-extractor.js
│   │   └── extractors/
│   │       ├── email-extractor.js
│   │       ├── phone-extractor.js
│   │       ├── link-extractor.js
│   │       ├── coordinate-extractor.js
│   │       └── ...
│   │
│   ├── tools/
│   │   ├── config-generator.js     # Visual config creator
│   │   ├── test-navigation.js      # Test pagination/scroll
│   │   ├── enrich-contacts.js
│   │   ├── export-to-sheets.js
│   │   └── lib/
│   │
│   ├── utils/
│   │   ├── domain-extractor.js
│   │   ├── google-sheets-exporter.js
│   │   ├── profile-visitor.js
│   │   └── stats-reporter.js
│   │
│   └── workflows/
│       └── full-pipeline.js
│
├── tests/
│   ├── enrichment-test.js
│   ├── post-cleaning-test.js
│   └── navigation/
│
└── output/                         # Scraped data
```

---

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `src/scrapers/config-scrapers/` | Main scraping - pagination, scroll, single-page |
| `src/features/pagination/` | Pagination detection and binary search |
| `src/features/enrichment/` | Profile page visiting and data enhancement |
| `src/tools/` | CLI tools for config generation and testing |
| `configs/website-configs/` | Site-specific extraction configurations |

---

## Quick File Lookup

| Functionality | File |
|---------------|------|
| Main CLI | `orchestrator.js` |
| Card detection | `src/scrapers/config-scrapers/base-config-scraper.js` |
| Page validation | `src/features/pagination/binary-searcher.js` |
| Pagination orchestration | `src/features/pagination/paginator.js` |
| Config generation | `src/tools/config-generator.js` |
| Profile enrichment | `src/features/enrichment/profile-enricher.js` |

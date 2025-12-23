# Universal Professional Scraper - Project Summary

## Overview

The Universal Professional Scraper is an enterprise-grade web scraping platform designed to extract contact information from professional directories. It features visual configuration generation, intelligent pagination handling, profile enrichment, and seamless Google Sheets export.

**Version:** 2.0.0
**License:** MIT
**Node.js:** 18+ (recommended: 20+)

---

## Key Features

### Core Capabilities
- **Visual Config Generator (v2.3)**: Interactive 4-layer detection with click-to-select field mapping
- **Multi-Method Extraction**: DOM-based, coordinate-based, mailto/tel link detection, OCR fallback
- **Smart Pagination**: Auto-detection of pagination patterns (URL-based, offset, infinite scroll)
- **Infinite Scroll Support**: Selenium PAGE_DOWN simulation for dynamic loading sites
- **Profile Enrichment**: Automated profile page visits to validate and fill missing data
- **Google Sheets Export**: Direct export with configurable columns and auto-formatting
- **Full Pipeline Workflow**: End-to-end automation from config generation to export
- **Anti-Detection**: Stealth browser configuration with random user agents

### Pagination Types Supported
1. **Single Page**: Extract from a single static page
2. **Traditional Pagination**: Multi-page extraction with URL patterns (page numbers, offsets)
3. **Infinite Scroll**: Dynamic loading sites using Selenium PAGE_DOWN key simulation

### Data Enrichment
- **Field Validation**: Cross-check scraped data against profile pages
- **Missing Data Fill**: Extract additional fields from profile pages
- **Data Cleaning**: Remove contamination (e.g., "John DoePartner" → "John Doe")
- **Confidence Scoring**: High/medium/low confidence ratings
- **Domain Classification**: Classify emails as business/personal/generic

### Export Capabilities
- **JSON Output**: Structured data with metadata
- **Google Sheets**: Direct export with auto-formatting
- **Configurable Columns**: Choose which fields to export
- **Core-Only Mode**: Exclude enrichment metadata for cleaner exports

---

## Architecture Overview

### High-Level System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      ORCHESTRATOR (CLI)                         │
│                    orchestrator.js                              │
│  - Command-line interface (Commander)                           │
│  - Workflow coordination                                        │
│  - Resource management (browser, selenium)                      │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     WORKFLOW STAGES                             │
└─────────────────────────────────────────────────────────────────┘

Stage 1: CONFIG GENERATION/VALIDATION
┌──────────────────────────────────────┐
│   Visual Config Generator            │
│   - Interactive browser session      │
│   - User draws selection rectangles  │
│   - Click-to-select field mapping    │
│   - Multi-method extraction testing  │
│   - Config saved to JSON             │
└──────────────┬───────────────────────┘
               │
               ▼
Stage 2: SCRAPING
┌──────────────────────────────────────┐
│   Scraper Selection (Config-Based)  │
│   ┌────────────────────────────────┐ │
│   │ SinglePageScraper (Puppeteer)  │ │
│   │ - Static pages                 │ │
│   └────────────────────────────────┘ │
│   ┌────────────────────────────────┐ │
│   │ PaginationScraper (Puppeteer)  │ │
│   │ - Multi-page extraction        │ │
│   │ - URL pattern detection        │ │
│   └────────────────────────────────┘ │
│   ┌────────────────────────────────┐ │
│   │ InfiniteScrollScraper (Sel.)   │ │
│   │ - PAGE_DOWN simulation         │ │
│   │ - Dynamic loading detection    │ │
│   └────────────────────────────────┘ │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│   Field Extraction Engine            │
│   - Email extractor (mailto, regex)  │
│   - Phone extractor (tel, regex)     │
│   - Link extractor (profile URLs)    │
│   - Coordinate-based extraction      │
│   - Screenshot + OCR fallback        │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│   Raw Contacts (JSON)                │
│   - Scraped data                     │
│   - Source URLs                      │
│   - Extraction metadata              │
└──────────────┬───────────────────────┘
               │
               ▼
Stage 3: ENRICHMENT
┌──────────────────────────────────────┐
│   Profile Enricher                   │
│   - Visit profile pages              │
│   - Extract missing fields           │
│   - Validate existing data           │
│   - Confidence scoring               │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│   Post-Cleaning Pipeline             │
│   - Name cleaning                    │
│   - Location normalization           │
│   - Phone-location correlation       │
│   - Domain classification            │
│   - Multi-location handling          │
│   - Field cleaning & validation      │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│   Enriched Contacts (JSON)           │
│   - Validated data                   │
│   - Enrichment actions log           │
│   - Confidence scores                │
└──────────────┬───────────────────────┘
               │
               ▼
Stage 4: EXPORT
┌──────────────────────────────────────┐
│   Sheet Exporter                     │
│   - Column detection                 │
│   - Data formatting                  │
│   - Batch writing (100 rows/batch)   │
│   - Auto-formatting (headers, widths)│
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│   Google Sheets                      │
│   - Formatted spreadsheet            │
│   - Shareable link                   │
└──────────────────────────────────────┘
```

### Data Flow Diagram

```
INPUT: URL
    │
    ▼
[Config Loader] → Load site-specific config (v2.3)
    │
    ├─→ cardPattern (CSS selector or coordinates)
    ├─→ fields (name, email, phone, title, location, profileUrl)
    └─→ pagination config (type, patterns)
    │
    ▼
[Browser Manager] → Launch Puppeteer with stealth
    │                (or Selenium for infinite scroll)
    ▼
[Scraper Factory] → Select scraper based on pagination type
    │
    ├─→ Single Page → Extract cards → Extract fields → Return contacts
    │
    ├─→ Pagination → Discover pages → Extract from each → Dedupe → Return
    │
    └─→ Infinite Scroll → PAGE_DOWN loop → Extract cards → Return
    │
    ▼
[Raw Contacts] → Array of contact objects
    │                {name, email, phone, title, location, profileUrl}
    ▼
[Profile Enricher] → Visit profile URLs (if available)
    │
    ├─→ Extract additional fields
    ├─→ Validate existing data
    └─→ Log enrichment actions
    │
    ▼
[Post-Cleaners] → Sequential cleaning pipeline
    │
    ├─→ NameCleaner: Remove contamination
    ├─→ LocationNormalizer: Standardize format
    ├─→ PhoneLocationCorrelator: Match phone area codes
    ├─→ DomainClassifier: business/personal/generic
    ├─→ MultiLocationHandler: Resolve conflicts
    └─→ ConfidenceScorer: Calculate quality score
    │
    ▼
[Enriched Contacts] → Enhanced contact objects
    │                   + confidence, domainType, _enrichment metadata
    ▼
[Sheet Exporter] → Export to Google Sheets
    │
    ├─→ ColumnDetector: Auto-detect or use specified columns
    ├─→ DataFormatter: Convert to 2D array + headers
    └─→ BatchWriter: Write in batches, apply formatting
    │
    ▼
OUTPUT: Google Sheets + JSON files
```

---

## Technology Stack

### Core Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| **Node.js** | 18+ | Runtime environment |
| **puppeteer** | ^21.11.0 | Browser automation (Chromium) |
| **puppeteer-extra** | ^3.3.6 | Plugin system for Puppeteer |
| **puppeteer-extra-plugin-stealth** | ^2.11.2 | Anti-detection measures |
| **selenium-webdriver** | ^4.39.0 | Infinite scroll (PAGE_DOWN) |
| **googleapis** | ^128.0.0 | Google Sheets API client |

### Data Processing
| Package | Purpose |
|---------|---------|
| **cheerio** | *(Not currently used - legacy)* |
| **pdf-parse** | PDF text extraction (fallback) |
| **tesseract.js** | OCR for screenshot extraction |

### Utilities
| Package | Purpose |
|---------|---------|
| **winston** | Logging system |
| **commander** | CLI argument parsing |
| **cli-table3** | Terminal table formatting |
| **dotenv** | Environment variable management |

---

## Quick Start Commands

### 1. Validate Existing Config
```bash
node orchestrator.js --validate --url "https://example.com/directory" --limit 2
```

### 2. Full Pipeline (Recommended)
```bash
# Interactive mode (prompts at each stage)
node orchestrator.js --full-pipeline --url "https://example.com/directory"

# Auto mode (no prompts)
node orchestrator.js --full-pipeline --url "https://example.com/directory" --auto
```

### 3. Generate New Config
```bash
node src/tools/config-generator.js --url "https://example.com/directory"
```

### 4. Scrape with Existing Config
```bash
# Single page
node orchestrator.js --url "https://example.com/directory"

# With pagination
node orchestrator.js --url "https://example.com/directory" --paginate --max-pages 10

# Infinite scroll
node orchestrator.js --url "https://example.com/directory" --scroll
```

### 5. Enrich Scraped Data
```bash
node src/tools/enrich-contacts.js --input output/scrape.json
```

### 6. Export to Google Sheets
```bash
node src/tools/export-to-sheets.js --input output/enriched.json --name "My Contacts"
```

---

## Project Structure

```
page-scrape/
├── orchestrator.js              # Main CLI entry point
├── package.json                 # Dependencies and scripts
├── .env.example                 # Environment variables template
├── configs/
│   ├── _default.json           # Default fallback config
│   └── website-configs/        # Site-specific configs (v2.3)
├── src/
│   ├── core/                   # Core infrastructure
│   │   ├── browser-manager.js  # Puppeteer browser lifecycle
│   │   ├── selenium-manager.js # Selenium for infinite scroll
│   │   ├── rate-limiter.js     # Request throttling
│   │   └── logger.js           # Winston logging setup
│   │
│   ├── workflows/              # High-level orchestrators
│   │   └── full-pipeline.js    # Full pipeline workflow
│   │
│   ├── scrapers/               # Scraping implementations
│   │   └── config-scrapers/    # v2.3 config-based scrapers
│   │       ├── single-page-scraper.js
│   │       ├── pagination-scraper.js
│   │       └── infinite-scroll-scraper.js
│   │
│   ├── extraction/             # Field extraction
│   │   ├── smart-field-extractor.js
│   │   └── extractors/
│   │       ├── email-extractor.js
│   │       ├── phone-extractor.js
│   │       ├── link-extractor.js
│   │       └── screenshot-extractor.js (OCR)
│   │
│   ├── features/
│   │   ├── enrichment/         # Profile enrichment system
│   │   │   ├── profile-enricher.js
│   │   │   ├── cleaners/       # Pre-enrichment cleaning
│   │   │   └── post-cleaners/  # Post-enrichment cleaning
│   │   ├── pagination/         # Pagination handling
│   │   │   ├── paginator.js
│   │   │   ├── pattern-detector.js
│   │   │   └── binary-searcher.js
│   │   └── export/             # Google Sheets export
│   │       ├── sheet-exporter.js
│   │       ├── sheet-manager.js
│   │       ├── column-detector.js
│   │       └── batch-writer.js
│   │
│   ├── config/                 # Configuration management
│   │   ├── config-loader.js
│   │   └── schemas.js
│   │
│   ├── utils/                  # Utilities
│   │   ├── prompt-helper.js    # Terminal UI utilities
│   │   ├── domain-extractor.js
│   │   └── stats-reporter.js
│   │
│   └── tools/                  # CLI tools
│       ├── config-generator.js # Visual config creation
│       ├── validate-config.js  # Config testing
│       ├── enrich-contacts.js  # Standalone enrichment
│       └── export-to-sheets.js # Standalone export
│
├── output/                     # Scraped data output
├── logs/                       # Log files
└── tests/                      # Test suites
```

---

## Output Format

### Contact JSON Structure
```json
{
  "name": "John Smith",
  "email": "jsmith@company.com",
  "phone": "+1-212-555-1234",
  "title": "Partner",
  "location": "New York, NY",
  "profileUrl": "https://company.com/people/john-smith",
  "domain": "company.com",
  "domainType": "business",
  "confidence": "high",
  "_enrichment": {
    "enrichedAt": "2025-12-10T12:00:00.000Z",
    "actions": {
      "name": "CLEANED",
      "email": "ENRICHED",
      "phone": "VALIDATED",
      "title": "ENRICHED"
    },
    "changes": {
      "name": {
        "before": "John SmithPartner",
        "after": "John Smith",
        "reason": "Removed contamination: Partner"
      }
    }
  }
}
```

### Enrichment Actions
- **ENRICHED**: Field was missing, added from profile
- **VALIDATED**: Exact match confirmed
- **CLEANED**: Contamination removed
- **REPLACED**: Mismatch detected and replaced
- **FAILED**: Enrichment attempt failed

---

## Key Capabilities Summary

### 1. Extraction Methods (4-Layer Detection)
1. **Direct Hit**: Click point on mailto/tel link
2. **Text-Triggered**: Keyword triggers nearby link search
3. **Expanded Area**: ±100px region search
4. **Fallback**: Regex extraction or OCR

### 2. Pagination Detection
- **URL-based**: page=1, p=2, offset=20 patterns
- **Offset-based**: start=0, skip=20 patterns
- **Infinite Scroll**: Selenium PAGE_DOWN simulation
- **Load More Button**: Auto-detection and clicking

### 3. Data Cleaning Pipeline
- Name cleaning (contamination removal)
- Location normalization (standardize formats)
- Phone-location correlation (area code matching)
- Domain classification (business/personal/generic)
- Multi-location handling (resolve conflicts)
- Confidence scoring (data quality assessment)

### 4. Export Options
- **Core Fields**: Name, Email, Phone, Title, Location, Profile URL
- **Extended Fields**: Bio, Education, Bar Admissions, Practice Areas
- **Enrichment Metadata**: Actions, Changes, Confidence
- **Configurable**: Choose specific columns or exclude metadata

---

## Performance & Reliability

### Anti-Detection Features
- Puppeteer Stealth Plugin
- Random user agent rotation
- CSP bypass for script injection
- Natural delays between requests
- Rate limiting (configurable)

### Memory Management
- Browser page recycling (every 50 pages)
- Memory usage monitoring
- Graceful resource cleanup
- Error recovery and partial results saving

### Logging
- Winston multi-transport logging
- Console output with colors
- File logs (scraper.log, error.log)
- Exception/rejection handling
- Progress tracking and statistics

---

## Testing

The project includes comprehensive test suites:

```bash
# All tests
npm test

# Enrichment tests (68 cases)
npm run test:enrichment

# Post-cleaning tests (41 cases)
npm run test:post-clean

# Selenium infinite scroll
npm run test:selenium

# Navigation tests (pagination & scroll)
npm run test:nav
```

---

## Support & Troubleshooting

### Common Issues
- **Config not found**: Run config generator first
- **No contacts extracted**: Validate config with visible browser
- **Infinite scroll not loading**: Check Chrome installation, increase delays
- **Google Sheets export fails**: Verify .env credentials and API access

### Log Files
- `logs/scraper.log` - Main log
- `logs/error.log` - Errors only
- `logs/exceptions.log` - Uncaught exceptions
- `logs/rejections.log` - Unhandled promise rejections

### Verbose Mode
Add `--verbose` flag to any command for detailed logging.

---

**Last Updated:** 2025-12-23

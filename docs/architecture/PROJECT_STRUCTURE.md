# Project Structure

**Universal Scraper** - Professional directory contact extraction tool

---

## Directory Overview

```
/page-scrape
│
├── orchestrator.js          # Main CLI entry point
├── package.json             # NPM dependencies and scripts
├── start.bat               # Windows launcher
├── README.md               # Project overview
│
├── /configs                 # Site-specific configurations
│   ├── _default.json       # Universal fallback config
│   ├── _pagination_cache.json  # Cached pagination patterns
│   ├── _template.json      # Template for new configs
│   └── *.json              # Site-specific configs (v2.0-v2.2)
│
├── /docs                    # Documentation
│   ├── /architecture       # System design documents
│   ├── /guides             # How-to guides
│   ├── /reports            # Generated exploration reports (gitignored)
│   ├── /workflows          # Development workflows
│   └── /archive            # Historical documents
│
├── /src                     # Source code
│   ├── /features           # Feature modules
│   │   ├── /pagination     # Pagination subsystem
│   │   └── /workflows      # Workflow orchestration
│   │
│   ├── /scrapers           # Scraper implementations
│   │   ├── base-scraper.js     # Abstract base class
│   │   ├── simple-scraper.js   # DOM extraction
│   │   ├── pdf-scraper.js      # PDF parsing
│   │   ├── select-scraper.js   # User selection
│   │   └── config-scraper.js   # Config-based extraction
│   │
│   ├── /tools              # Development tools
│   │   ├── config-generator.js  # Visual config creator CLI
│   │   ├── site-tester.js       # Site diagnostics
│   │   ├── /assets              # Overlay UI files
│   │   └── /lib                 # Generator library
│   │
│   └── /utils              # Shared utilities
│       ├── browser-manager.js   # Puppeteer lifecycle
│       ├── config-loader.js     # Config loading/caching
│       ├── contact-extractor.js # Email/phone extraction
│       ├── domain-extractor.js  # Domain info
│       ├── logger.js            # Winston wrapper
│       ├── profile-visitor.js   # Profile page visiting
│       ├── rate-limiter.js      # Request throttling
│       └── text-parser.js       # Text utilities
│
├── /tests                   # Test files
│   ├── scraper-test.js     # Main test suite
│   ├── pagination-test.js  # Pagination tests
│   ├── v22-integration.test.js  # v2.2 integration tests
│   └── *.js                # Other test files
│
├── /logs                    # Runtime logs (gitignored)
│   └── *.log               # Winston log files
│
├── /output                  # Scraped data (gitignored)
│   ├── /diagnostics        # Site diagnostic reports
│   └── /pdfs               # Downloaded PDFs
│
└── /temp                    # Temporary files (gitignored)
```

---

## Key Files

### Entry Points
| File | Purpose |
|------|---------|
| `orchestrator.js` | Main CLI, routes to scrapers based on --method |
| `src/tools/config-generator.js` | Visual config creation tool |
| `src/tools/site-tester.js` | Site diagnostic utility |

### Configuration
| File | Purpose |
|------|---------|
| `configs/_default.json` | Fallback for all sites |
| `configs/_template.json` | Template for new configs |
| `src/utils/config-loader.js` | Loads and caches configs |

### Core Scrapers
| File | Purpose |
|------|---------|
| `src/scrapers/simple-scraper.js` | DOM-based extraction |
| `src/scrapers/config-scraper.js` | Config-driven extraction |
| `src/scrapers/pdf-scraper.js` | PDF download and parse |

### Extraction Utilities
| File | Purpose |
|------|---------|
| `src/utils/contact-extractor.js` | Email/phone/name patterns |
| `src/tools/lib/multi-method-extractor.js` | Priority-based extraction |
| `src/tools/lib/element-capture.js` | v2.2 manual field capture |

---

## NPM Scripts

```bash
npm start           # Run orchestrator.js
npm test            # Run main test suite
npm run test:pdf    # Run PDF scraper tests
npm run test:all    # Run all tests
```

---

## Configuration Versions

| Version | Selection Method | Status |
|---------|-----------------|--------|
| v1.0 | Click-based | **DEPRECATED** |
| v2.0 | Rectangle selection | Fallback |
| v2.1 | Rectangle + auto-detect | Fallback |
| v2.2 | Manual field selection | **CURRENT** |

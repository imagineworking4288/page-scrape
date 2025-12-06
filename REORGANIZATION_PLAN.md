# Page Scrape Reorganization Plan

**Created**: December 6, 2024
**Status**: Ready for Implementation

---

## Executive Summary

This document outlines the plan to reorganize the Page Scrape project from a utility-based structure to a feature-based structure while removing deprecated code. The goal is to reduce bloat by ~30-40% and improve maintainability.

---

## Phase 1: Discovery Summary

### Current File Inventory

**Active Files (KEEP):**

| Category | Files | Notes |
|----------|-------|-------|
| Entry Points | `orchestrator.js`, `src/tools/config-generator.js`, `src/tools/test-config.js` | CLI entry points |
| Core Infrastructure | `src/utils/browser-manager.js`, `src/utils/rate-limiter.js`, `src/utils/logger.js` | Shared by all scrapers |
| Config Management | `src/utils/config-loader.js`, `src/tools/lib/config-schemas.js`, `src/tools/lib/config-builder.js` | Config load/save/validate |
| Scrapers (Active) | `src/scrapers/simple-scraper.js`, `src/scrapers/pdf-scraper.js`, `src/scrapers/select-scraper.js`, `src/scrapers/config-scraper.js`, `src/scrapers/base-scraper.js` | Used in orchestrator.js |
| v2.3 Extractors | `screenshot-extractor.js`, `coordinate-extractor.js`, `email-extractor.js`, `phone-extractor.js`, `link-extractor.js`, `label-extractor.js` | All 6 extractors active |
| Config Generator | `interactive-session.js`, `extraction-tester.js`, `element-capture.js`, `enhanced-capture.js`, `card-matcher.js`, `smart-field-extractor.js` | Config generation workflow |
| UI Assets | `overlay.html`, `overlay-client.js` | Browser UI |
| Pagination | `paginator.js`, `pattern-detector.js`, `binary-searcher.js`, `url-generator.js` | All active |
| Export | `google-sheets-exporter.js` | Used in orchestrator.js |
| Utilities | `contact-extractor.js`, `domain-extractor.js`, `text-parser.js`, `profile-visitor.js` | Shared utilities |

**Deprecated/Unused Files (REMOVE):**

| File | Reason | Evidence |
|------|--------|----------|
| `src/scrapers/visual-scraper.js` | Not imported anywhere | Grep shows only CLAUDE_CONTEXT.md reference |
| `src/scrapers/index.js` | Not used in orchestrator | Redundant exports |
| `src/features/workflows/` (entire directory) | Only used in one test file | `refactoring-tests.js` only reference |
| `src/utils/constants.js` | Only used in one test file | `refactoring-tests.js` only reference |
| `src/tools/lib/index.js` | Only re-exports, not used directly | Redundant |
| `src/tools/lib/pagination-diagnostic.js` | Only used in `lib/index.js` | Dead code |
| `src/tools/lib/profile-enrichment.js` | Only used in v22 integration test | Dead code |
| `tests/scraper-test.js` | Tests deprecated scrapers | Keep if refactoring scrapers |
| `tests/select-scraper-test.js` | Tests select scraper | Keep if keeping select scraper |
| `tests/pdf-scraper-test.js` | Tests PDF scraper | Keep if keeping PDF scraper |
| `tests/v22-integration.test.js` | Tests v2.2 workflow | v2.2 is deprecated |
| `tests/refactoring-tests.js` | Tests deprecated workflows | Only tests dead code |

### Scrapers Analysis

All 4 scrapers in orchestrator.js are actively used:
- `SimpleScraper` → `--method html` and `--method hybrid`
- `PdfScraper` → `--method pdf`
- `SelectScraper` → `--method select`
- `ConfigScraper` → `--method config` (v2.0-v2.3 support)

**Decision**: Keep all scrapers but move `visual-scraper.js` to deleted since it's not integrated.

---

## Phase 2: Target Architecture

### New Directory Structure

```
page-scrape/
├── orchestrator.js              # CLI entry point (unchanged)
├── package.json
├── CLAUDE_CONTEXT.md
│
├── configs/                     # No change
│   ├── _default.json
│   ├── _template.json
│   ├── _pagination_cache.json
│   └── website-configs/
│
├── src/
│   ├── core/                    # Core infrastructure
│   │   ├── index.js
│   │   ├── browser-manager.js
│   │   ├── rate-limiter.js
│   │   └── logger.js
│   │
│   ├── config/                  # Configuration management
│   │   ├── index.js
│   │   ├── config-loader.js
│   │   └── schemas.js           # Renamed from config-schemas.js
│   │
│   ├── scrapers/                # All scrapers (keep structure)
│   │   ├── index.js             # New exports
│   │   ├── base-scraper.js
│   │   ├── simple-scraper.js
│   │   ├── pdf-scraper.js
│   │   ├── select-scraper.js
│   │   └── config-scraper.js
│   │
│   ├── extraction/              # v2.3 extraction system
│   │   ├── index.js
│   │   ├── extractors/
│   │   │   ├── index.js
│   │   │   ├── screenshot-extractor.js
│   │   │   ├── coordinate-extractor.js
│   │   │   ├── email-extractor.js
│   │   │   ├── phone-extractor.js
│   │   │   ├── link-extractor.js
│   │   │   └── label-extractor.js
│   │   └── utils/
│   │       ├── contact-extractor.js
│   │       ├── domain-extractor.js
│   │       └── text-parser.js
│   │
│   ├── config-generator/        # Config generation workflow
│   │   ├── index.js             # CLI entry
│   │   ├── generator.js
│   │   ├── interactive-session.js
│   │   ├── extraction-tester.js
│   │   ├── config-builder.js
│   │   ├── card-matcher.js
│   │   ├── smart-field-extractor.js
│   │   ├── element-capture.js
│   │   ├── enhanced-capture.js
│   │   ├── multi-method-extractor.js
│   │   ├── ui/
│   │   │   ├── overlay.html
│   │   │   └── overlay-client.js
│   │   └── validators/
│   │       └── field-requirements.js
│   │
│   ├── pagination/              # Keep existing structure
│   │   ├── index.js
│   │   ├── paginator.js
│   │   ├── pattern-detector.js
│   │   ├── binary-searcher.js
│   │   └── url-generator.js
│   │
│   ├── export/                  # Export functionality
│   │   ├── index.js
│   │   └── google-sheets-exporter.js
│   │
│   └── testing/                 # Testing utilities
│       ├── index.js
│       ├── test-config.js
│       └── site-tester.js
│
├── tests/                       # Keep but reorganize
│   ├── pagination-test.js
│   ├── pagination-integration-test.js
│   └── test-utils.js
│
└── output/                      # Generated files (gitignored)
```

---

## Phase 3: Implementation Steps

### Step 1: Create New Directories
```bash
mkdir -p src/core
mkdir -p src/config
mkdir -p src/extraction/extractors
mkdir -p src/extraction/utils
mkdir -p src/config-generator/ui
mkdir -p src/config-generator/validators
mkdir -p src/export
mkdir -p src/testing
```

### Step 2: Move Core Infrastructure
| Source | Destination |
|--------|-------------|
| `src/utils/browser-manager.js` | `src/core/browser-manager.js` |
| `src/utils/rate-limiter.js` | `src/core/rate-limiter.js` |
| `src/utils/logger.js` | `src/core/logger.js` |

### Step 3: Move Config Management
| Source | Destination |
|--------|-------------|
| `src/utils/config-loader.js` | `src/config/config-loader.js` |
| `src/tools/lib/config-schemas.js` | `src/config/schemas.js` |

### Step 4: Move Extraction System
| Source | Destination |
|--------|-------------|
| `src/tools/lib/screenshot-extractor.js` | `src/extraction/extractors/screenshot-extractor.js` |
| `src/tools/lib/coordinate-extractor.js` | `src/extraction/extractors/coordinate-extractor.js` |
| `src/tools/lib/email-extractor.js` | `src/extraction/extractors/email-extractor.js` |
| `src/tools/lib/phone-extractor.js` | `src/extraction/extractors/phone-extractor.js` |
| `src/tools/lib/link-extractor.js` | `src/extraction/extractors/link-extractor.js` |
| `src/tools/lib/label-extractor.js` | `src/extraction/extractors/label-extractor.js` |
| `src/utils/contact-extractor.js` | `src/extraction/utils/contact-extractor.js` |
| `src/utils/domain-extractor.js` | `src/extraction/utils/domain-extractor.js` |
| `src/utils/text-parser.js` | `src/extraction/utils/text-parser.js` |

### Step 5: Move Config Generator
| Source | Destination |
|--------|-------------|
| `src/tools/config-generator.js` | `src/config-generator/generator.js` |
| `src/tools/lib/interactive-session.js` | `src/config-generator/interactive-session.js` |
| `src/tools/lib/extraction-tester.js` | `src/config-generator/extraction-tester.js` |
| `src/tools/lib/config-builder.js` | `src/config-generator/config-builder.js` |
| `src/tools/lib/card-matcher.js` | `src/config-generator/card-matcher.js` |
| `src/tools/lib/smart-field-extractor.js` | `src/config-generator/smart-field-extractor.js` |
| `src/tools/lib/element-capture.js` | `src/config-generator/element-capture.js` |
| `src/tools/lib/enhanced-capture.js` | `src/config-generator/enhanced-capture.js` |
| `src/tools/lib/multi-method-extractor.js` | `src/config-generator/multi-method-extractor.js` |
| `src/tools/assets/overlay.html` | `src/config-generator/ui/overlay.html` |
| `src/tools/assets/overlay-client.js` | `src/config-generator/ui/overlay-client.js` |
| `src/tools/lib/constants/field-requirements.js` | `src/config-generator/validators/field-requirements.js` |

### Step 6: Move Export
| Source | Destination |
|--------|-------------|
| `src/utils/google-sheets-exporter.js` | `src/export/google-sheets-exporter.js` |

### Step 7: Move Testing Utilities
| Source | Destination |
|--------|-------------|
| `src/tools/test-config.js` | `src/testing/test-config.js` |
| `src/tools/site-tester.js` | `src/testing/site-tester.js` |
| `src/tools/lib/test-orchestrator.js` | `src/testing/test-orchestrator.js` |
| `src/tools/lib/test-reporter.js` | `src/testing/test-reporter.js` |

### Step 8: Delete Deprecated Files
```bash
# Unused scrapers
rm src/scrapers/visual-scraper.js

# Unused workflows
rm -rf src/features/workflows/

# Unused utilities
rm src/utils/constants.js
rm src/tools/lib/index.js
rm src/tools/lib/pagination-diagnostic.js
rm src/tools/lib/profile-enrichment.js

# Empty directories (after moving)
rm -rf src/tools/
rm -rf src/utils/  # If all files moved

# Deprecated tests
rm tests/v22-integration.test.js
rm tests/refactoring-tests.js
```

### Step 9: Keep profile-visitor.js
Move `src/utils/profile-visitor.js` to `src/scrapers/profile-visitor.js` since it's used by base-scraper.

---

## Phase 4: Import Updates Required

### orchestrator.js Changes
```javascript
// OLD
const logger = require('./src/utils/logger');
const BrowserManager = require('./src/utils/browser-manager');
const RateLimiter = require('./src/utils/rate-limiter');
const DomainExtractor = require('./src/utils/domain-extractor');
const ConfigLoader = require('./src/utils/config-loader');
const GoogleSheetsExporter = require('./src/utils/google-sheets-exporter');

// NEW
const { Logger: logger } = require('./src/core');
const { BrowserManager, RateLimiter } = require('./src/core');
const { DomainExtractor } = require('./src/extraction/utils');
const { ConfigLoader } = require('./src/config');
const { GoogleSheetsExporter } = require('./src/export');
```

### Scraper Import Changes
Each scraper needs updated imports to point to new paths.

### Config Generator Import Changes
All files in config-generator need relative path updates.

---

## Phase 5: Index.js Files to Create

### src/core/index.js
```javascript
module.exports = {
  BrowserManager: require('./browser-manager'),
  RateLimiter: require('./rate-limiter'),
  Logger: require('./logger')
};
```

### src/config/index.js
```javascript
module.exports = {
  ConfigLoader: require('./config-loader'),
  Schemas: require('./schemas')
};
```

### src/extraction/index.js
```javascript
module.exports = {
  extractors: require('./extractors'),
  utils: require('./utils')
};
```

### src/extraction/extractors/index.js
```javascript
module.exports = {
  ScreenshotExtractor: require('./screenshot-extractor'),
  CoordinateExtractor: require('./coordinate-extractor'),
  EmailExtractor: require('./email-extractor'),
  PhoneExtractor: require('./phone-extractor'),
  LinkExtractor: require('./link-extractor'),
  LabelExtractor: require('./label-extractor')
};
```

### src/extraction/utils/index.js
```javascript
module.exports = {
  ContactExtractor: require('./contact-extractor'),
  DomainExtractor: require('./domain-extractor'),
  TextParser: require('./text-parser')
};
```

### src/config-generator/index.js
```javascript
#!/usr/bin/env node
require('./generator');
```

### src/export/index.js
```javascript
module.exports = {
  GoogleSheetsExporter: require('./google-sheets-exporter')
};
```

### src/testing/index.js
```javascript
module.exports = {
  testConfig: require('./test-config'),
  siteTester: require('./site-tester')
};
```

---

## Phase 6: package.json Updates

```json
{
  "scripts": {
    "start": "node orchestrator.js",
    "generate-config": "node src/config-generator",
    "test-config": "node src/testing/test-config.js",
    "test": "node tests/pagination-test.js",
    "test:pagination": "node tests/pagination-integration-test.js"
  }
}
```

---

## Phase 7: Verification Checklist

After reorganization:

- [ ] `npm start -- --url "URL" --method config --config example-com` works
- [ ] `npm run generate-config -- --url "URL"` works
- [ ] `npm run test-config sullcrom-com` works
- [ ] `npm test` passes
- [ ] All imports resolve: `node -e "require('./src/core')"`
- [ ] No circular dependencies

---

## Metrics

**Before Reorganization:**
- Total JS files in src/: ~45
- Directories: 5 (scrapers, utils, tools, features, ?)

**After Reorganization:**
- Total JS files in src/: ~38 (estimated -15%)
- Directories: 7 (core, config, scrapers, extraction, config-generator, pagination, export, testing)
- Clear feature boundaries

**Files Removed:**
- `visual-scraper.js` (unused)
- `src/features/workflows/` (3 files - unused)
- `src/utils/constants.js` (1 file - only test usage)
- `src/tools/lib/index.js` (1 file - redundant)
- `src/tools/lib/pagination-diagnostic.js` (1 file - unused)
- `src/tools/lib/profile-enrichment.js` (1 file - only test usage)
- `tests/v22-integration.test.js` (1 file - tests deprecated code)
- `tests/refactoring-tests.js` (1 file - tests dead code)

**Total: 10+ files removed**

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Import path errors | Create all index.js files before updating imports |
| Breaking config generation | Test thoroughly after each step |
| Breaking runtime scraping | Keep scrapers directory structure similar |
| Test failures | Update test imports before running tests |

---

## Rollback Plan

If reorganization fails:
1. Git stash/reset to pre-reorganization state
2. All original files are unchanged until explicit deletion
3. Create files in new locations before deleting old ones


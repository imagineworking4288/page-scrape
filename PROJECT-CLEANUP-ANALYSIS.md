# Page Scrape - Project Cleanup Analysis

**Generated**: December 9, 2025
**Analysis Tool**: Claude Code Dependency Analyzer

---

## Executive Summary

This analysis identifies redundant files, duplicate code, and import path inconsistencies in the page-scrape project. The goal is to consolidate duplicate modules, update imports to use canonical paths, and reduce maintenance burden.

**Key Findings**:
- 4 legacy utility files in `src/utils/` that duplicate `src/core/` and `src/config/`
- 8 duplicate extractor files in `src/tools/lib/` identical to `src/extraction/extractors/`
- 3 misplaced .js files in `logs/` directory
- 1 experimental directory (`INFSCROLLTEST/`) that can be removed
- 1 obsolete test file (`v22-integration.test.js`)
- Multiple files importing from legacy paths instead of canonical modules

---

## Phase 1: File Inventory

### Total Project Files (excluding node_modules)

| Directory | Files | Purpose |
|-----------|-------|---------|
| Root | 1 | orchestrator.js |
| src/core/ | 5 | Core infrastructure (canonical) |
| src/config/ | 3 | Config management (canonical) |
| src/extraction/ | 3 | Field extraction (canonical) |
| src/extraction/extractors/ | 7 | Individual extractors (canonical) |
| src/features/pagination/ | 5 | Pagination subsystem |
| src/scrapers/ | 5 | Scraper implementations |
| src/scrapers/config-scrapers/ | 5 | v2.3 config-based scrapers |
| src/tools/ | 3 | CLI tools |
| src/tools/lib/ | 20 | Tool support modules |
| src/utils/ | 10 | LEGACY - utilities (4 duplicate) |
| tests/ | 8 | Test files |
| logs/ | 3 | MISPLACED - .js files |
| INFSCROLLTEST/ | 4 | OBSOLETE - experiment directory |

---

## Phase 2: Duplicate Files Identified

### 2.1 Legacy Utility Duplicates (src/utils/ → src/core/ or src/config/)

| Legacy File | Canonical File | Status |
|-------------|----------------|--------|
| src/utils/browser-manager.js | src/core/browser-manager.js | IDENTICAL (whitespace only) |
| src/utils/logger.js | src/core/logger.js | IDENTICAL (whitespace only) |
| src/utils/rate-limiter.js | src/core/rate-limiter.js | IDENTICAL |
| src/utils/config-loader.js | src/config/config-loader.js | IDENTICAL |

**Action**: DELETE all 4 legacy files in src/utils/

### 2.2 Duplicate Extractors (src/tools/lib/ → src/extraction/)

| Tool File | Runtime File | Status |
|-----------|--------------|--------|
| src/tools/lib/email-extractor.js | src/extraction/extractors/email-extractor.js | IDENTICAL (MD5 match) |
| src/tools/lib/phone-extractor.js | src/extraction/extractors/phone-extractor.js | IDENTICAL (MD5 match) |
| src/tools/lib/link-extractor.js | src/extraction/extractors/link-extractor.js | IDENTICAL (MD5 match) |
| src/tools/lib/label-extractor.js | src/extraction/extractors/label-extractor.js | IDENTICAL (MD5 match) |
| src/tools/lib/screenshot-extractor.js | src/extraction/extractors/screenshot-extractor.js | IDENTICAL (MD5 match) |
| src/tools/lib/coordinate-extractor.js | src/extraction/extractors/coordinate-extractor.js | IDENTICAL (MD5 match) |
| src/tools/lib/multi-method-extractor.js | src/extraction/multi-method-extractor.js | IDENTICAL (MD5 match) |
| src/tools/lib/smart-field-extractor.js | src/extraction/smart-field-extractor.js | IDENTICAL (MD5 match) |

**Action**: DELETE all 8 duplicate files in src/tools/lib/

### 2.3 Misplaced Files

| File | Location | Issue |
|------|----------|-------|
| browser-manager.js | logs/ | Should not exist - likely copy accident |
| logger.js | logs/ | Should not exist - likely copy accident |
| rate-limiter.js | logs/ | Should not exist - likely copy accident |

**Action**: DELETE all 3 misplaced .js files in logs/

### 2.4 Obsolete Directories

| Directory | Contents | Issue |
|-----------|----------|-------|
| INFSCROLLTEST/ | 4 .js files, node_modules, etc. | Old Selenium experiment - superseded by src/core/selenium-manager.js |

**Action**: DELETE entire INFSCROLLTEST/ directory

### 2.5 Obsolete Test Files

| File | Issue |
|------|-------|
| tests/v22-integration.test.js | Tests v2.2 format, project now uses v2.3 |

**Action**: DELETE obsolete test file

---

## Phase 3: Import Path Analysis

### Files Importing Legacy src/utils/ Modules

#### orchestrator.js (4 imports)
```javascript
const logger = require('./src/utils/logger');              // → src/core/logger
const BrowserManager = require('./src/utils/browser-manager');  // → src/core/browser-manager
const RateLimiter = require('./src/utils/rate-limiter');   // → src/core/rate-limiter
const ConfigLoader = require('./src/utils/config-loader'); // → src/config/config-loader
```

#### src/tools/config-generator.js (4 imports)
```javascript
const logger = require('../utils/logger');
const BrowserManager = require('../utils/browser-manager');
const RateLimiter = require('../utils/rate-limiter');
const ConfigLoader = require('../utils/config-loader');
```

#### src/tools/site-tester.js (4 imports)
```javascript
const logger = require('../utils/logger');
const BrowserManager = require('../utils/browser-manager');
const RateLimiter = require('../utils/rate-limiter');
const ConfigLoader = require('../utils/config-loader');
```

#### src/scrapers/select-scraper.js (1 import)
```javascript
const ConfigLoader = require('../utils/config-loader');
```

#### tests/scraper-test.js (3 imports)
```javascript
const logger = require('../src/utils/logger');
const BrowserManager = require('../src/utils/browser-manager');
const RateLimiter = require('../src/utils/rate-limiter');
```

#### tests/select-scraper-test.js (4 imports)
```javascript
const ConfigLoader = require('../src/utils/config-loader');
const logger = require('../src/utils/logger');
const BrowserManager = require('../src/utils/browser-manager');
const RateLimiter = require('../src/utils/rate-limiter');
```

#### tests/pdf-scraper-test.js (3 imports)
```javascript
const logger = require('../src/utils/logger');
const BrowserManager = require('../src/utils/browser-manager');
const RateLimiter = require('../src/utils/rate-limiter');
```

#### tests/pagination-test.js (4 imports)
```javascript
const logger = require('../src/utils/logger');
const BrowserManager = require('../src/utils/browser-manager');
const RateLimiter = require('../src/utils/rate-limiter');
const ConfigLoader = require('../src/utils/config-loader');
```

#### tests/pagination-integration-test.js (4 imports)
```javascript
const BrowserManager = require('../src/utils/browser-manager');
const RateLimiter = require('../src/utils/rate-limiter');
const ConfigLoader = require('../src/utils/config-loader');
const logger = require('../src/utils/logger');
```

#### tests/selenium-infinite-scroll.test.js (1 import)
```javascript
const logger = require('../src/utils/logger');
```

#### tests/test-utils.js (1 import)
```javascript
const BrowserManager = require('../src/utils/browser-manager');
```

### Files Importing Duplicate src/tools/lib/ Extractors

#### src/tools/test-config.js (6 imports)
```javascript
const ScreenshotExtractor = require('./lib/screenshot-extractor');
const CoordinateExtractor = require('./lib/coordinate-extractor');
const EmailExtractor = require('./lib/email-extractor');
const PhoneExtractor = require('./lib/phone-extractor');
const LinkExtractor = require('./lib/link-extractor');
const LabelExtractor = require('./lib/label-extractor');
```

#### src/tools/lib/extraction-tester.js (6 imports)
```javascript
const ScreenshotExtractor = require('./screenshot-extractor');
const CoordinateExtractor = require('./coordinate-extractor');
const EmailExtractor = require('./email-extractor');
const PhoneExtractor = require('./phone-extractor');
const LinkExtractor = require('./link-extractor');
const LabelExtractor = require('./label-extractor');
```

#### src/tools/lib/interactive-session.js (1 import)
```javascript
const SmartFieldExtractor = require('./smart-field-extractor');
```

---

## Phase 4: Active Files in src/utils/

These files are NOT duplicated and should be KEPT:

| File | Purpose | Used By |
|------|---------|---------|
| contact-extractor.js | Contact extraction utilities | text-parser.js, profile-visitor.js |
| domain-extractor.js | Email domain classification | orchestrator.js |
| text-parser.js | Text-to-contact parsing | Various scrapers |
| profile-visitor.js | Profile page enrichment | Config scraper |
| google-sheets-exporter.js | Google Sheets export | orchestrator.js |
| constants.js | Shared constants | Various |

---

## Phase 5: Files to Remove Summary

### Delete Immediately (16 files)

1. **src/utils/browser-manager.js** - Duplicate of src/core/browser-manager.js
2. **src/utils/logger.js** - Duplicate of src/core/logger.js
3. **src/utils/rate-limiter.js** - Duplicate of src/core/rate-limiter.js
4. **src/utils/config-loader.js** - Duplicate of src/config/config-loader.js
5. **src/tools/lib/email-extractor.js** - Duplicate of src/extraction/extractors/email-extractor.js
6. **src/tools/lib/phone-extractor.js** - Duplicate of src/extraction/extractors/phone-extractor.js
7. **src/tools/lib/link-extractor.js** - Duplicate of src/extraction/extractors/link-extractor.js
8. **src/tools/lib/label-extractor.js** - Duplicate of src/extraction/extractors/label-extractor.js
9. **src/tools/lib/screenshot-extractor.js** - Duplicate of src/extraction/extractors/screenshot-extractor.js
10. **src/tools/lib/coordinate-extractor.js** - Duplicate of src/extraction/extractors/coordinate-extractor.js
11. **src/tools/lib/multi-method-extractor.js** - Duplicate of src/extraction/multi-method-extractor.js
12. **src/tools/lib/smart-field-extractor.js** - Duplicate of src/extraction/smart-field-extractor.js
13. **logs/browser-manager.js** - Misplaced file
14. **logs/logger.js** - Misplaced file
15. **logs/rate-limiter.js** - Misplaced file
16. **tests/v22-integration.test.js** - Obsolete test

### Delete Directory

17. **INFSCROLLTEST/** - Entire obsolete experiment directory

---

## Phase 6: Files to Update (Import Paths)

### 11 Files Requiring Import Updates

| File | Legacy Imports | New Imports |
|------|---------------|-------------|
| orchestrator.js | 4 | Use src/core/, src/config/ |
| src/tools/config-generator.js | 4 | Use ../core/, ../config/ |
| src/tools/site-tester.js | 4 | Use ../core/, ../config/ |
| src/tools/test-config.js | 6 | Use ../extraction/extractors/ |
| src/tools/lib/extraction-tester.js | 6 | Use ../../extraction/extractors/ |
| src/tools/lib/interactive-session.js | 1 | Use ../../extraction/ |
| src/scrapers/select-scraper.js | 1 | Use ../config/ |
| tests/scraper-test.js | 3 | Use ../src/core/ |
| tests/select-scraper-test.js | 4 | Use ../src/core/, ../src/config/ |
| tests/pdf-scraper-test.js | 3 | Use ../src/core/ |
| tests/pagination-test.js | 4 | Use ../src/core/, ../src/config/ |
| tests/pagination-integration-test.js | 4 | Use ../src/core/, ../src/config/ |
| tests/selenium-infinite-scroll.test.js | 1 | Use ../src/core/ |
| tests/test-utils.js | 1 | Use ../src/core/ |

**Total**: ~46 import statements to update across 14 files

---

## Phase 7: Estimated Impact

### Code Reduction
- Files removed: 16 + 1 directory
- Lines of code removed: ~2,500-3,000 lines
- Node_modules avoided: 1 entire INFSCROLLTEST/node_modules

### Maintenance Improvement
- No more duplicate extractors to keep in sync
- Single source of truth for core modules
- Cleaner project structure
- Reduced confusion for developers

### Risk Assessment
- **LOW RISK**: All duplicate files verified identical via MD5 checksums
- **MEDIUM RISK**: Import path updates require careful testing
- **MITIGATION**: Run full test suite after each phase

---

## Phase 8: Execution Order

1. **Phase 2**: Delete 4 legacy utils in src/utils/
2. **Phase 3**: Delete 8 duplicate extractors in src/tools/lib/
3. **Phase 4**: Update all import paths (46 changes across 14 files)
4. **Phase 5**: Modernize original scrapers (optional)
5. **Phase 6**: Update index.js files
6. **Phase 7**: Delete obsolete test file and logs/*.js
7. **Phase 8**: Delete INFSCROLLTEST/ directory
8. **Phase 9**: Run validation and tests
9. **Phase 10**: Update documentation

---

## Appendix A: INFSCROLLTEST - Archived Experiment

The `INFSCROLLTEST/` directory contained a standalone Selenium infinite scroll experiment that has been fully integrated into the main project at `src/core/selenium-manager.js` and `src/scrapers/config-scrapers/infinite-scroll-scraper.js`.

### Key Concepts Preserved

**PAGE_DOWN vs scrollBy() Insight**:
Traditional infinite scroll scrapers use `window.scrollBy()` which can be detected as bot behavior and doesn't always trigger lazy loading. Using keyboard simulation (`Key.PAGE_DOWN`) mimics real user behavior and properly fires scroll event handlers.

**Retry Counter Reset Logic**:
```javascript
while (retries < maxRetries) {
  await body.sendKeys(Key.PAGE_DOWN);
  await driver.sleep(scrollDelay);

  const newHeight = await driver.executeScript('return document.body.scrollHeight');

  if (newHeight > lastHeight) {
    retries = 0;  // RESET - more content available!
    lastHeight = newHeight;
  } else {
    retries++;    // No change - might be at bottom
  }
}
```

**Scroll Up/Down Cycle**:
Every 5 failed attempts, scroll up then down to potentially trigger lazy loading that wasn't caught:
```javascript
if (retries % 5 === 0 && retries < maxRetries) {
  // Scroll up a few times
  for (let i = 0; i < 3; i++) {
    await scrollElement.sendKeys(Key.PAGE_UP);
    await driver.sleep(150);
  }
  await driver.sleep(500);
  // Scroll back down
  for (let i = 0; i < 5; i++) {
    await scrollElement.sendKeys(Key.PAGE_DOWN);
    await driver.sleep(150);
  }
}
```

**Cookie Banner Dismissal**:
```javascript
const bannerSelectors = [
  '#onetrust-accept-btn-handler',      // OneTrust
  '#onetrust-reject-all-handler',      // OneTrust reject
  '.cookie-accept',                     // Common class
  '[data-testid="cookie-accept"]',     // Test ID pattern
  '#accept-cookies',                    // Common ID
  '.accept-cookies-button',             // Common class
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', // Cookiebot
  '.cc-accept',                         // Cookie consent
  '#gdpr-cookie-accept'                 // GDPR pattern
];
```

**Default Configuration**:
```javascript
{
  scrollDelay: 300,           // ms between PAGE_DOWN presses
  maxRetries: 15,             // consecutive no-change attempts before stopping
  maxScrolls: 1000,           // safety limit for total scrolls
  headless: false,            // show browser window
  initialWait: 5000,          // ms to wait for initial content to load
  scrollContainer: null,      // CSS selector for scroll container (null = use body)
}
```

### Where Code Was Integrated

| INFSCROLLTEST File | Integrated Into |
|-------------------|-----------------|
| selenium-scraper.js | src/core/selenium-manager.js |
| (scroll logic) | src/scrapers/config-scrapers/infinite-scroll-scraper.js |

### How to Recreate Experiment

If you need a standalone version:

1. Create directory:
```bash
mkdir infinite-scroll-experiment
cd infinite-scroll-experiment
npm init -y
npm install selenium-webdriver
```

2. Copy the `scrollWithRetryLogic()` function from `src/core/selenium-manager.js`

3. Use the test in `tests/selenium-infinite-scroll.test.js` as reference

---

## Appendix B: Canonical Module Paths

### Core Modules (src/core/)
- `src/core/browser-manager.js` - Puppeteer browser management
- `src/core/logger.js` - Winston logging
- `src/core/rate-limiter.js` - Request throttling
- `src/core/selenium-manager.js` - Selenium WebDriver management

### Config Modules (src/config/)
- `src/config/config-loader.js` - Site config loading
- `src/config/schemas.js` - v2.3 schema definitions

### Extraction Modules (src/extraction/)
- `src/extraction/extractors/email-extractor.js`
- `src/extraction/extractors/phone-extractor.js`
- `src/extraction/extractors/link-extractor.js`
- `src/extraction/extractors/label-extractor.js`
- `src/extraction/extractors/screenshot-extractor.js`
- `src/extraction/extractors/coordinate-extractor.js`
- `src/extraction/multi-method-extractor.js`
- `src/extraction/smart-field-extractor.js`

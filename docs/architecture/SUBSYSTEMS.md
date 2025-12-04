# Subsystems Reference

Quick reference for each major subsystem in the codebase.

---

## Pagination System

**Location:** `src/features/pagination/`

**Purpose:** Handle multi-page scraping with URL patterns and infinite scroll

### Files
| File | Purpose |
|------|---------|
| `paginator.js` | Main orchestrator |
| `pattern-detector.js` | Detect pagination type |
| `url-generator.js` | Generate page URLs |
| `binary-searcher.js` | Find max page number |
| `index.js` | Module exports |

### Key Functions
- `Paginator.paginate(url, options)` - Main entry
- `PatternDetector.detect(url, page)` - Pattern detection
- `UrlGenerator.generate(pattern, pageNum)` - URL generation
- `BinarySearcher.findTrueMaxPage()` - Efficient max page search

### Pagination Types
- `parameter` - ?page=N
- `path` - /page/N
- `offset` - ?offset=N
- `cursor` - ?cursor=xxx
- `infinite-scroll` - Scroll-based loading

### Configuration
```json
{
  "pagination": {
    "type": "parameter",
    "enabled": true,
    "patterns": {
      "pageParameterName": "page"
    }
  }
}
```

### Known Issues
- Infinite scroll detection can be unreliable on some sites
- Binary search requires minimum contacts per page

---

## Contact Extraction System

**Location:** `src/utils/contact-extractor.js`, `src/tools/lib/multi-method-extractor.js`

**Purpose:** Extract email, phone, and name from page content

### Files
| File | Purpose |
|------|---------|
| `contact-extractor.js` | Core patterns and regex |
| `multi-method-extractor.js` | Priority-based extraction |
| `element-capture.js` | v2.2 manual capture |
| `smart-field-extractor.js` | Smart field detection |

### Extraction Strategies (Priority Order)
1. **userSelected** - User-clicked element (v2.2)
2. **coordinates** - Position-based
3. **mailto/tel** - Link href
4. **selector** - CSS selector
5. **proximity** - Near known field
6. **textPattern** - Regex match

### Key Functions
- `extractEmails(text)` - Find email addresses
- `extractPhones(text)` - Find phone numbers
- `isValidNameCandidate(text)` - Validate names
- `MultiMethodExtractor.extract()` - Priority extraction

### Validation
- Email: Standard regex pattern
- Phone: Multiple format patterns, 7-15 digits
- Name: Blacklist filtering, character validation

### Known Issues
- Some obfuscated emails not detected
- International phone formats may need adjustment

---

## Config Generator System

**Location:** `src/tools/`

**Purpose:** Visual tool for creating site configurations

### Files
| File | Purpose |
|------|---------|
| `config-generator.js` | CLI entry point |
| `lib/interactive-session.js` | Browser session |
| `lib/card-matcher.js` | Card detection |
| `lib/element-capture.js` | Field capture (v2.2) |
| `lib/config-builder.js` | Config generation |
| `assets/overlay.html` | UI template |
| `assets/overlay-client.js` | UI logic |

### Config Versions
| Version | Selection Method | Status |
|---------|-----------------|--------|
| v1.0 | Click-based | DEPRECATED |
| v2.0 | Rectangle | Fallback |
| v2.1 | Rectangle + auto | Fallback |
| v2.2 | Manual field | CURRENT |

### Key Functions
- `InteractiveSession.start(url)` - Start session
- `CardMatcher.findSimilarCards()` - Match patterns
- `ElementCapture.processManualSelections()` - v2.2 capture
- `ConfigBuilder.buildConfigV22()` - Generate config

### Browser-Node Communication
- Uses `page.exposeFunction()` for callbacks
- Functions prefixed with `__configGen_`

### Known Issues
- Overlay may not work on CSP-strict sites
- Some dynamic content may not be captured

---

## Scraper Implementations

**Location:** `src/scrapers/`

**Purpose:** Different methods for extracting contacts

### Files
| File | Purpose |
|------|---------|
| `base-scraper.js` | Abstract base class |
| `simple-scraper.js` | DOM extraction |
| `pdf-scraper.js` | PDF parsing |
| `select-scraper.js` | User selection |
| `config-scraper.js` | Config-driven |

### Scraper Selection (--method flag)
| Method | Scraper | Use Case |
|--------|---------|----------|
| `html` | Simple | Basic pages |
| `pdf` | PDF | PDF-based sites |
| `hybrid` | Both | Fallback chain |
| `select` | Select | Manual selection |
| `config` | Config | Complex sites |

### Key Methods
- `initialize()` - Setup browser
- `scrape(url)` - Main extraction
- `cleanup()` - Close resources

### Configuration
- Config scraper uses JSON config files
- Other scrapers use heuristics

---

## Browser Management

**Location:** `src/utils/browser-manager.js`, `src/utils/rate-limiter.js`

**Purpose:** Puppeteer lifecycle and request throttling

### Files
| File | Purpose |
|------|---------|
| `browser-manager.js` | Browser lifecycle |
| `rate-limiter.js` | Request throttling |

### Features
- Puppeteer-extra with stealth plugin
- Configurable headless mode
- Page pooling
- Random delays

### Key Methods
- `BrowserManager.initialize()` - Launch browser
- `BrowserManager.getPage()` - Get/create page
- `RateLimiter.wait()` - Apply delay
- `RateLimiter.randomDelay()` - Random wait

### Configuration
```javascript
{
  headless: true,
  timeout: 30000,
  minDelay: 2000,
  maxDelay: 5000
}
```

---

## Configuration System

**Location:** `src/utils/config-loader.js`, `configs/`

**Purpose:** Load and manage site configurations

### Files
| File | Purpose |
|------|---------|
| `config-loader.js` | Load/cache configs |
| `configs/_default.json` | Fallback config |
| `configs/_template.json` | Template |
| `configs/*.json` | Site configs |

### Config Loading Priority
1. Site-specific: `configs/{domain}.json`
2. Default: `configs/_default.json`
3. Hardcoded fallbacks

### Key Methods
- `ConfigLoader.loadConfig(domain)` - Load config
- `ConfigLoader.mergeConfigs()` - Merge with defaults
- `ConfigLoader.cacheConfig()` - Store in memory

### Caching
- Configs cached by domain
- Pagination patterns cached separately
- Cache persists across scraping runs

---

## Testing

**Location:** `tests/`

**Purpose:** Unit and integration tests

### Files
| File | Purpose |
|------|---------|
| `scraper-test.js` | Main unit tests |
| `pagination-test.js` | Pagination tests |
| `v22-integration.test.js` | v2.2 tests |

### Running Tests
```bash
npm test              # Main suite
npm run test:pdf      # PDF tests
npm run test:all      # All tests
```

### Test Output
- ✓ for passed
- ✗ for failed
- Summary at end

---

## Logging

**Location:** `src/utils/logger.js`

**Purpose:** Winston-based logging

### Features
- Console + file output
- Log rotation
- Error separation
- Custom helpers

### Log Levels
- `error` - Errors only
- `warn` - Warnings
- `info` - Normal output
- `debug` - Detailed debugging

### Custom Helpers
```javascript
logger.logProgress(current, total, 'contacts');
logger.logMemory();
logger.logStats({ contacts: 50 });
```

### Log Files
- `logs/scraper.log` - All logs
- `logs/error.log` - Errors only
- `logs/exceptions.log` - Uncaught exceptions

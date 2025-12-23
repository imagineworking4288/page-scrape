# Project Context

> **Claude Code**: Read this at session start. This is your operational guide.

**Project**: Page Scrape — Universal Professional Directory Scraper
**Updated**: 2025-12-22

---

## What This Project Does

Page Scrape is an enterprise-grade web scraping platform for extracting contact information from professional directories. It targets law firm websites, real estate agencies, and corporate directories—sites that list professionals with names, emails, phones, and profile links.

The system uses visual config generation (click-to-select fields), intelligent pagination detection with binary search, profile enrichment to validate/fill missing data, and exports to JSON or Google Sheets.

---

## Tech Stack

**Runtime**: Node.js 18+
**Primary Framework**: CLI-based (Commander.js)
**Key Libraries**:
- `puppeteer` / `puppeteer-extra` — Browser automation, stealth mode
- `selenium-webdriver` — Infinite scroll (PAGE_DOWN simulation)
- `cheerio` — HTML parsing
- `winston` — Logging
- `googleapis` — Google Sheets export
- `commander` — CLI argument parsing
- `dotenv` — Environment variables

---

## Entry Points

```bash
# Primary usage — Full pipeline (config → scrape → enrich → export)
node orchestrator.js --full-pipeline --url "URL" --auto

# Validate existing config
node orchestrator.js --validate --url "URL" --limit 2

# Generate new config (interactive visual tool)
node src/tools/config-generator.js --url "URL"

# Scrape with pagination
node orchestrator.js --url "URL" --paginate --max-pages 50

# Scrape infinite scroll sites
node orchestrator.js --url "URL" --scroll

# Enrich contacts with profile data
node src/tools/enrich-contacts.js --input output/scrape.json

# Export to Google Sheets
node src/tools/export-to-sheets.js --input output/file.json

# Run tests
npm test                           # Enrichment + post-cleaning tests
npm run test:nav                   # Navigation tests (scroll + pagination)
npm run test:selenium              # Selenium infinite scroll test
```

---

## Architecture Summary

```
orchestrator.js (CLI)
    │
    ├──► --full-pipeline → FullPipelineOrchestrator
    │                           │
    │                           ├── Config Generator
    │                           ├── Scraping
    │                           ├── Enrichment
    │                           └── Export
    │
    ├──► --paginate → Paginator
    │                     │
    │                     ├── PatternDetector (finds pagination pattern)
    │                     ├── URLGenerator (generates page URLs)
    │                     └── BinarySearcher (finds true max page)
    │
    └──► --scroll → InfiniteScrollScraper
                         │
                         └── SeleniumManager (PAGE_DOWN simulation)
```

**Key Architectural Decisions:**

1. **Binary Search for Pagination**: Instead of crawling every page to find the max, we use binary search. This tests ~10 pages to find max of 200 instead of 200+ requests.

2. **Selenium for Infinite Scroll**: Puppeteer's wheel events don't reliably trigger lazy loading. Selenium's PAGE_DOWN key simulation works consistently (584 contacts vs 10).

3. **Visual Config Generation**: Rather than writing selectors manually, users click on fields in a visual overlay. The system tests multiple extraction methods and validates results.

4. **Profile Enrichment**: Listing pages often have incomplete data. Enrichment visits each profile URL to validate and fill missing fields.

---

## Critical Patterns

> Code patterns that MUST be followed for the project to work correctly.

### Card Detection Timing (Binary Searcher)

**Where**: `src/features/pagination/binary-searcher.js` → `_testPageValidity()`
**Rule**: Always wait 3 seconds after navigation before counting cards.

```javascript
// CORRECT way
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));  // Fixed 3 second wait
const count = await page.$$eval(selector, els => els.length).catch(() => 0);

// WRONG way (cards may not be loaded yet)
await page.goto(url, { waitUntil: 'networkidle0' });  // May never settle
await page.waitForSelector(selector, { timeout: 5000 });  // May timeout early
```

### Card Counting Method

**Where**: `binary-searcher.js` → `_validatePage()`
**Rule**: Use `$$eval` with `.catch(() => 0)`, never `waitForSelector`.

```javascript
// CORRECT
const count = await page.$$eval(selector, els => els.length).catch(() => 0);

// WRONG (throws if selector not found)
await page.waitForSelector(selector);
const cards = await page.$$(selector);
```

### HardCap Enforcement

**Where**: `binary-searcher.js` → `findTrueMaxPage()`
**Rule**: Always check against hardCap before recursive calls to prevent infinite loops.

```javascript
// CORRECT
if (lastValidPage >= hardCap) {
  return { trueMax: hardCap, isCapped: true };
}

// WRONG (can loop forever)
return this.findTrueMaxPage(page, pattern, urlGenerator, lastValidPage + 1);
```

---

## Configuration

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GOOGLE_SHEETS_CLIENT_EMAIL` | No | Service account email | `sa@project.iam.gserviceaccount.com` |
| `GOOGLE_SHEETS_PRIVATE_KEY` | No | Service account private key | `-----BEGIN...` |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | No | Target spreadsheet ID | `1BxiM...` |
| `PAGINATION_ENABLED` | No | Enable pagination by default | `true` |
| `PAGINATION_MAX_PAGES` | No | Default max pages | `200` |

### Config File Structure

**Location**: `configs/website-configs/{domain}.json`

```json
{
  "version": "2.3",
  "name": "compass-com",
  "domain": "compass.com",
  "sourceUrl": "https://www.compass.com/agents/",
  "cardPattern": {
    "primarySelector": ".agent-card",     // CSS selector for contact cards
    "sampleDimensions": { "width": 300, "height": 200 }
  },
  "fields": {
    "name": {
      "required": true,
      "userValidatedMethod": "coordinate-text",
      "selector": ".agent-name"
    },
    "email": {
      "userValidatedMethod": "mailto-link"
    }
  },
  "pagination": {
    "paginationType": "pagination",       // or "infinite-scroll", "single-page"
    "urlPattern": "page={n}"
  }
}
```

---

## Active Warnings

| Warning | Details | Workaround |
|---------|---------|------------|
| Selenium Chrome | Uses system Chrome, not bundled | Ensure Chrome is installed |
| Rate Limiting | Some sites block rapid requests | Default delay 2-5 seconds between pages |

---

## Diagnostic Table

| Symptom | Check First | Likely Fix |
|---------|-------------|------------|
| 0 contacts extracted | Card selector in config | Re-run config generator |
| Binary search returns 0 | `_validatePage()` method | Ensure 3s wait, check selector |
| Infinite scroll stops early | Selenium scroll delay | Increase `--scroll-delay 600` |
| Google Sheets export fails | `.env` credentials | Check service account email/key |
| Config not found | `configs/website-configs/` | Run config generator first |

---

## Data Flow

### Main Scraping Flow

```
1. CLI Parse (orchestrator.js)
   Input: URL, options (--paginate, --scroll, etc.)
   Process: Commander.js parses arguments
   Output: Options object
   File: orchestrator.js → main()

2. Config Loading
   Input: URL domain
   Process: Load from configs/website-configs/{domain}.json
   Output: Site config object
   File: src/config/config-loader.js → loadConfig()

3. Pagination Discovery (if enabled)
   Input: URL, config
   Process: Detect pattern, binary search for max page
   Output: Array of page URLs
   File: src/features/pagination/paginator.js → paginate()

4. Scraping
   Input: Page URLs, config
   Process: Extract contacts using config selectors
   Output: Raw contacts array
   File: src/scrapers/config-scrapers/pagination-scraper.js

5. Deduplication
   Input: Raw contacts
   Process: Merge by email/name+phone key
   Output: Unique contacts
   File: orchestrator.js → main()

6. Output
   Input: Unique contacts
   Process: Save to JSON, optionally export to Sheets
   Output: output/contacts-{timestamp}.json
   File: orchestrator.js → main()
```

### Key Data Structures

#### Contact Object

Created by: scrapers → `scrape()`
Consumed by: enrichment, export

```javascript
{
  name: 'string',           // Required
  email: 'string',          // Primary identifier
  phone: 'string',
  title: 'string',
  location: 'string',
  profileUrl: 'string',     // For enrichment
  domain: 'string',         // Email domain
  domainType: 'business|personal',
  confidence: 'high|medium|low'
}
```

#### Pagination Result

Created by: `Paginator.paginate()`
Consumed by: `orchestrator.js`

```javascript
{
  success: true,
  urls: ['url1', 'url2', ...],
  paginationType: 'pagination|offset|infinite-scroll',
  pattern: { type: 'page', paramName: 'page' },
  confidence: 85,
  trueMax: 55,
  isCapped: false
}
```

---

## Recent Changes

| Date | Change | Files | Notes |
|------|--------|-------|-------|
| 2025-12-22 | Fixed binary searcher card detection | `binary-searcher.js` | 3s wait, direct $$eval |
| 2025-12-22 | Context system initialized | `context/*.md` | Full documentation |

---

## Handoff Notes

**Current Focus**: Binary searcher now working correctly for Compass.com
**Blocked By**: None
**Next Steps**: Consider extending enrichment system for new field types
**Last Session**: Fixed binary searcher timing (1s → 3s) and method (`waitForSelector` → `$$eval`)

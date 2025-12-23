# Dependencies

**Last Updated**: 2025-12-22
**Package Manager**: npm
**Node Version**: 18+ (recommended: 20+)

---

## How to Read This Document

Each dependency is documented with:

**Purpose** — What problem does this package solve?
**Why This Package** — Why was this chosen over alternatives?
**Usage In Project** — Where and how it's used
**Key APIs** — Most important functions/methods we use
**Gotchas** — Known issues or things to watch out for

---

# Production Dependencies

## Browser Automation

> Packages for controlling browsers and extracting content from web pages.

---

### puppeteer

**Version**: `^21.11.0`
**Purpose**: Headless Chrome browser automation for scraping
**Why This Package**: Industry standard, excellent API, maintained by Google

**Usage In Project:**
- `src/core/browser-manager.js`: Launches and manages browser lifecycle
- `src/scrapers/`: All scrapers use Puppeteer for page navigation and extraction
- `src/features/pagination/binary-searcher.js`: Page navigation and card counting

**Key APIs We Use:**
```javascript
const puppeteer = require('puppeteer');

// Launch browser
const browser = await puppeteer.launch({ headless: true });

// Navigate and wait
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

// Element counting (PROVEN PATTERN)
const count = await page.$$eval('.card', els => els.length).catch(() => 0);

// Evaluate in browser context
const data = await page.evaluate(() => document.body.innerText);
```

**Gotchas:**
- `networkidle0` may never resolve on some sites (use `domcontentloaded` + fixed wait)
- `waitForSelector` can timeout before content loads (use direct `$$eval` instead)
- Bundled Chromium is large (~400MB)

**Documentation**: https://pptr.dev/

---

### puppeteer-extra

**Version**: `^3.3.6`
**Purpose**: Plugin system for Puppeteer
**Why This Package**: Allows adding stealth and other anti-detection measures

**Usage In Project:**
- `src/core/browser-manager.js`: Wraps Puppeteer with stealth plugin

**Key APIs We Use:**
```javascript
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());
const browser = await puppeteer.launch();
```

---

### puppeteer-extra-plugin-stealth

**Version**: `^2.11.2`
**Purpose**: Evade bot detection by patching browser fingerprints
**Why This Package**: Most comprehensive stealth plugin available

**Usage In Project:**
- `src/core/browser-manager.js`: Applied automatically via puppeteer-extra

**Gotchas:**
- Some detection methods may still catch us (rare)
- Updates occasionally needed when sites update detection

---

### selenium-webdriver

**Version**: `^4.39.0`
**Purpose**: Selenium WebDriver for infinite scroll
**Why This Package**: PAGE_DOWN key simulation more reliable than Puppeteer wheel events

**Usage In Project:**
- `src/core/selenium-manager.js`: Manages WebDriver lifecycle
- `src/scrapers/config-scrapers/infinite-scroll-scraper.js`: Scroll simulation

**Key APIs We Use:**
```javascript
const { Builder, Key } = require('selenium-webdriver');

// Launch Chrome
const driver = await new Builder().forBrowser('chrome').build();

// Navigate
await driver.get(url);

// Scroll with PAGE_DOWN (proven working)
const body = await driver.findElement({ css: 'body' });
await body.sendKeys(Key.PAGE_DOWN);
```

**Gotchas:**
- Uses system Chrome, not bundled (must be installed)
- Slower startup than Puppeteer
- Tested: 584 contacts with Selenium vs 10 with Puppeteer wheel events

**Documentation**: https://www.selenium.dev/documentation/

---

### cheerio

**Version**: `^1.1.2`
**Purpose**: Server-side jQuery for HTML parsing
**Why This Package**: Fast, familiar API, doesn't need browser

**Usage In Project:**
- `src/extraction/`: Parse HTML strings for extraction
- `src/utils/contact-extractor.js`: Extract contacts from HTML

**Key APIs We Use:**
```javascript
const cheerio = require('cheerio');
const $ = cheerio.load(html);

// jQuery-like selectors
const name = $('.person-name').text();
const emails = $('a[href^="mailto:"]').map((i, el) => $(el).attr('href')).get();
```

**Documentation**: https://cheerio.js.org/

---

## CLI & Configuration

> Packages for command-line interface and environment management.

---

### commander

**Version**: `^11.1.0`
**Purpose**: Command-line argument parsing
**Why This Package**: Most popular CLI framework, excellent documentation

**Usage In Project:**
- `orchestrator.js`: All CLI options and commands

**Key APIs We Use:**
```javascript
const { Command } = require('commander');
const program = new Command();

program
  .name('universal-scraper')
  .requiredOption('-u, --url <url>', 'Target URL')
  .option('--paginate', 'Enable pagination')
  .parse(process.argv);

const options = program.opts();
```

**Documentation**: https://github.com/tj/commander.js

---

### dotenv

**Version**: `^16.3.1`
**Purpose**: Load environment variables from .env file
**Why This Package**: De facto standard for env management

**Usage In Project:**
- `orchestrator.js`: Load Google Sheets credentials, pagination defaults

**Key APIs We Use:**
```javascript
require('dotenv').config();
const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
```

**Documentation**: https://github.com/motdotla/dotenv

---

## Logging & Display

> Packages for logging and terminal display.

---

### winston

**Version**: `^3.18.3`
**Purpose**: Structured logging with multiple transports
**Why This Package**: Most popular Node.js logging library, highly configurable

**Usage In Project:**
- `src/core/logger.js`: Centralized logging setup
- All modules use logger for output

**Key APIs We Use:**
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/scraper.log' })
  ]
});

logger.info('Message');
logger.error('Error:', error);
logger.warn('Warning');
```

**Documentation**: https://github.com/winstonjs/winston

---

### cli-table3

**Version**: `^0.6.3`
**Purpose**: Pretty-print tables in terminal
**Why This Package**: Simple API, good formatting options

**Usage In Project:**
- `src/utils/stats-reporter.js`: Display scraping statistics
- Various tools for formatted output

**Key APIs We Use:**
```javascript
const Table = require('cli-table3');

const table = new Table({
  head: ['Name', 'Email', 'Phone']
});
table.push(['John', 'john@example.com', '555-1234']);
console.log(table.toString());
```

---

## External Services

> Packages for integrating with external APIs.

---

### googleapis

**Version**: `^128.0.0`
**Purpose**: Google Sheets API for data export
**Why This Package**: Official Google client library

**Usage In Project:**
- `src/utils/google-sheets-exporter.js`: Export contacts to Sheets
- `src/features/export/sheet-manager.js`: Sheets API wrapper

**Key APIs We Use:**
```javascript
const { google } = require('googleapis');

const sheets = google.sheets({ version: 'v4', auth });
await sheets.spreadsheets.values.append({
  spreadsheetId,
  range: 'Sheet1!A:Z',
  valueInputOption: 'USER_ENTERED',
  resource: { values: rows }
});
```

**Configuration:**
```javascript
// .env
GOOGLE_SHEETS_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id
```

**Gotchas:**
- Private key must include `\n` for line breaks
- Spreadsheet must be shared with service account email
- API must be enabled in Google Cloud Console

**Documentation**: https://developers.google.com/sheets/api

---

## Data Processing

> Packages for processing and extracting data.

---

### pdf-parse

**Version**: `^1.1.4`
**Purpose**: Extract text from PDF files
**Why This Package**: Simple API, no external dependencies

**Usage In Project:**
- `src/extraction/`: PDF text extraction for OCR fallback

**Key APIs We Use:**
```javascript
const pdf = require('pdf-parse');
const dataBuffer = fs.readFileSync('document.pdf');
const data = await pdf(dataBuffer);
console.log(data.text);
```

---

### tesseract.js

**Version**: `^6.0.1`
**Purpose**: OCR (Optical Character Recognition) for images
**Why This Package**: Pure JavaScript implementation, works in Node.js

**Usage In Project:**
- `src/extraction/extractors/screenshot-extractor.js`: OCR fallback for text extraction

**Key APIs We Use:**
```javascript
const Tesseract = require('tesseract.js');

const { data: { text } } = await Tesseract.recognize(
  imagePath,
  'eng',
  { logger: m => console.log(m) }
);
```

**Gotchas:**
- First run downloads language data (~10MB for English)
- `eng.traineddata` file included in project root
- Slower than direct text extraction

**Documentation**: https://tesseract.projectnaptha.com/

---

# Dev Dependencies

None currently specified in package.json. Tests run with Node.js directly.

---

# Package Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `start` | `node orchestrator.js` | Run main CLI |
| `test` | `node tests/enrichment-test.js && node tests/post-cleaning-test.js` | Run main tests |
| `test:enrichment` | `node tests/enrichment-test.js` | Run enrichment tests (68 cases) |
| `test:post-clean` | `node tests/post-cleaning-test.js` | Run post-cleaner tests (41 cases) |
| `test:selenium` | `node tests/selenium-infinite-scroll.test.js` | Test Selenium scroll |
| `test:nav` | `node tests/run-navigation-tests.js` | Run navigation tests |
| `test:nav:scroll` | `node tests/run-navigation-tests.js --type scroll` | Scroll navigation only |
| `test:nav:page` | `node tests/run-navigation-tests.js --type pagination` | Pagination navigation only |
| `test:all` | `npm run test && npm run test:selenium && npm run test:nav` | Run all tests |

---

# Updating Dependencies

## Safe to Update

These packages can typically be updated without breaking changes:
- `dotenv`: Minimal API surface
- `cli-table3`: Output formatting only
- `cheerio`: Stable jQuery-like API

## Update With Caution

These packages have had breaking changes in the past:
- `puppeteer`: Major versions may change API
- `selenium-webdriver`: WebDriver protocol updates
- `googleapis`: API versioning changes

## Pinned Versions

No packages are currently pinned to exact versions.

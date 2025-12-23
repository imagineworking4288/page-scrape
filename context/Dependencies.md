# Universal Professional Scraper - Dependencies Documentation

## Overview

This document provides comprehensive details on all 11 npm packages used in the Universal Professional Scraper project. Each package is documented with its purpose, usage within the project, configuration details, and file locations.

---

## Table of Contents

1. [Browser Automation](#browser-automation)
   - puppeteer
   - puppeteer-extra
   - puppeteer-extra-plugin-stealth
   - selenium-webdriver
2. [Google Services](#google-services)
   - googleapis
3. [Data Processing](#data-processing)
   - cheerio (legacy)
   - pdf-parse
   - tesseract.js
4. [Logging & CLI](#logging--cli)
   - winston
   - commander
   - cli-table3
5. [Configuration](#configuration)
   - dotenv

---

## Browser Automation

### 1. puppeteer

**Version:** ^21.11.0
**NPM:** https://www.npmjs.com/package/puppeteer
**Docs:** https://pptr.dev/

#### What It Does
Puppeteer is a Node.js library that provides a high-level API to control headless Chrome or Chromium browsers. It can automate UI testing, web scraping, screenshot generation, and more.

#### Why It's Used in This Project
Puppeteer is the primary browser automation engine for:
- **Single-page scraping**: Navigating to target URLs and extracting content
- **Multi-page pagination**: Handling traditional paginated directories
- **Profile enrichment**: Visiting individual profile pages to extract additional data
- **Dynamic content**: Waiting for JavaScript-rendered content to load

Puppeteer is preferred for most operations because:
- Fast and lightweight
- Excellent API for page manipulation
- Good for traditional pagination and single-page scraping

#### Where It's Used

**Primary Files:**
- `src/core/browser-manager.js` - Core browser lifecycle management
  ```javascript
  const puppeteer = require('puppeteer-extra');
  this.browser = await puppeteer.launch({ headless: true, args: [...] });
  ```

**Scrapers:**
- `src/scrapers/config-scrapers/single-page-scraper.js` - Single page extraction
- `src/scrapers/config-scrapers/pagination-scraper.js` - Multi-page scraping
- `src/features/enrichment/profile-enricher.js` - Profile page visits

**Tools:**
- `src/tools/config-generator.js` - Visual config generation
- `src/tools/validate-config.js` - Config validation
- `src/utils/profile-visitor.js` - Profile page visiting logic

#### Key Configuration

**Browser Launch Options:**
```javascript
{
  headless: 'new',  // or false for visible mode
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1920,1080',
    '--disable-blink-features=AutomationControlled',
    '--disable-web-security',  // For script injection on restricted sites
    '--disable-features=IsolateOrigins,site-per-process'
  ]
}
```

**Page Settings:**
```javascript
await page.setBypassCSP(true);  // Bypass Content Security Policy
await page.setUserAgent(randomUserAgent);  // Random UA rotation
await page.setViewport({ width: 1920, height: 1080 });
```

#### Notes
- Bundled with Chromium (~170-280MB download on first install)
- Memory usage can be high; browser pages are recycled every 50 pages
- Works on all platforms (Windows, macOS, Linux)

---

### 2. puppeteer-extra

**Version:** ^3.3.6
**NPM:** https://www.npmjs.com/package/puppeteer-extra
**GitHub:** https://github.com/berstend/puppeteer-extra

#### What It Does
Puppeteer-extra is a modular plugin framework for Puppeteer. It allows you to extend Puppeteer's functionality through plugins without modifying core code.

#### Why It's Used in This Project
Puppeteer-extra serves as the foundation for adding anti-detection capabilities through the stealth plugin. It wraps standard Puppeteer with plugin support.

#### Where It's Used

**Primary File:**
- `src/core/browser-manager.js`
  ```javascript
  const puppeteer = require('puppeteer-extra');
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());
  ```

#### Key Configuration
```javascript
// Apply stealth plugin before launching
puppeteer.use(StealthPlugin());

// Then launch browser as normal
const browser = await puppeteer.launch({ ... });
```

#### Notes
- Acts as a drop-in replacement for standard Puppeteer
- Plugin architecture allows easy extension
- Currently only used with the stealth plugin

---

### 3. puppeteer-extra-plugin-stealth

**Version:** ^2.11.2
**NPM:** https://www.npmjs.com/package/puppeteer-extra-plugin-stealth
**GitHub:** https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth

#### What It Does
A plugin for puppeteer-extra that applies various evasion techniques to make Puppeteer undetectable. It modifies browser fingerprints and behaviors to avoid bot detection systems.

#### Why It's Used in This Project
Professional directory websites often employ bot detection systems. The stealth plugin helps bypass these systems by:
- Removing `navigator.webdriver` flag
- Masking automation indicators
- Spoofing browser fingerprints
- Mimicking human-like behavior

This is critical for:
- Avoiding CAPTCHAs
- Preventing IP blocking
- Maintaining access to target sites
- Increasing scraping success rates

#### Where It's Used

**Primary File:**
- `src/core/browser-manager.js`
  ```javascript
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());
  ```

#### Key Features
The plugin automatically applies these evasions:
- `chrome.app` - Fake Chrome app mode
- `chrome.csi` - Chrome Site Isolation API spoofing
- `chrome.loadTimes` - Chrome load times API
- `chrome.runtime` - Chrome runtime spoofing
- `iframe.contentWindow` - Iframe detection evasion
- `media.codecs` - Media codec fingerprinting
- `navigator.hardwareConcurrency` - CPU core spoofing
- `navigator.languages` - Language fingerprinting
- `navigator.permissions` - Permission API spoofing
- `navigator.plugins` - Plugin fingerprinting
- `navigator.vendor` - Vendor string masking
- `navigator.webdriver` - Automation flag removal
- `user-agent-override` - User agent consistency
- `webgl.vendor` - WebGL fingerprinting
- `window.outerdimensions` - Window size consistency

#### Configuration
No additional configuration required - works automatically when plugin is applied.

#### Notes
- Essential for enterprise-grade scraping
- Significantly reduces detection rates
- Combined with random user agents and delays for best results

---

### 4. selenium-webdriver

**Version:** ^4.39.0
**NPM:** https://www.npmjs.com/package/selenium-webdriver
**Docs:** https://www.selenium.dev/documentation/webdriver/

#### What It Does
Selenium WebDriver is a browser automation framework that provides a programming interface for controlling web browsers. It supports multiple browsers (Chrome, Firefox, Safari, Edge) through standardized WebDriver protocol.

#### Why It's Used in This Project
Selenium is used **exclusively for infinite scroll handling** because:
- **PAGE_DOWN key simulation**: Selenium can simulate physical keyboard presses, which triggers scroll events more reliably than Puppeteer's programmatic scrolling
- **Better compatibility**: Many infinite scroll implementations only respond to actual keyboard events
- **Proven reliability**: Testing showed 584 contacts extracted with Selenium vs. 10 with Puppeteer on the same site

**When Selenium is Used:**
- Sites with `paginationType: "infinite-scroll"` in config
- CLI flag `--scroll` is provided
- User selects infinite scroll mode in pagination prompt

#### Where It's Used

**Primary File:**
- `src/core/selenium-manager.js` - Selenium lifecycle management
  ```javascript
  const { Builder, By, Key, until } = require('selenium-webdriver');
  const chrome = require('selenium-webdriver/chrome');

  this.driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();
  ```

**Scrapers:**
- `src/scrapers/config-scrapers/infinite-scroll-scraper.js` - Infinite scroll implementation
  ```javascript
  // PAGE_DOWN key simulation
  await this.seleniumManager.sendKeys(Key.PAGE_DOWN);
  await this.delay(this.scrollDelay);
  ```

**Orchestration:**
- `orchestrator.js` - Selenium initialization for infinite scroll mode
- `src/workflows/full-pipeline.js` - Full pipeline infinite scroll handling

#### Key Configuration

**Chrome Options:**
```javascript
const options = new chrome.Options();
options.addArguments('--headless=new');  // Headless mode
options.addArguments('--disable-gpu');
options.addArguments('--no-sandbox');
options.addArguments('--disable-dev-shm-usage');
options.addArguments('--window-size=1920,1080');
options.addArguments('--disable-blink-features=AutomationControlled');
options.addArguments('--disable-web-security');
```

**Scroll Configuration:**
```javascript
{
  scrollDelay: 400,           // ms between PAGE_DOWN presses
  maxRetries: 25,             // consecutive no-change attempts before stopping
  maxScrolls: 1000,           // safety limit for total scrolls
  initialWait: 5000,          // ms to wait for initial content
  enableLoadMoreButton: true, // auto-click "Load More" buttons
  maxButtonClicks: 200        // max button clicks
}
```

**Scroll Algorithm:**
1. Send PAGE_DOWN key press
2. Wait for `scrollDelay` ms
3. Check if page height or card count changed
4. If changed: reset retry counter, continue scrolling
5. If unchanged: increment retry counter
6. Every 5 failed retries: scroll up then down (trigger lazy loading)
7. Stop when: retry counter reaches `maxRetries` or `maxScrolls` reached

#### CLI Options
```bash
--scroll                     # Enable infinite scroll
--scroll-delay <ms>          # Delay between scrolls (default: 400)
--max-retries <number>       # Max no-change attempts (default: 25)
--max-scrolls <number>       # Safety limit (default: 50)
```

#### Requirements
- **System Chrome must be installed** (not just Chromium bundled with Puppeteer)
- Chrome must be in system PATH or default installation location
- Works on Windows, macOS, Linux

**Installation Locations:**
- **Windows:** `C:\Program Files\Google\Chrome\Application\chrome.exe`
- **macOS:** `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- **Linux:** `/usr/bin/google-chrome` or `/usr/bin/chromium-browser`

#### Notes
- Only used when Puppeteer's scrolling proves insufficient
- More resource-intensive than Puppeteer
- Closed immediately after scrolling; Puppeteer used for extraction
- PAGE_DOWN simulation is more reliable than wheel events or scrollBy()

---

## Google Services

### 5. googleapis

**Version:** ^128.0.0
**NPM:** https://www.npmjs.com/package/googleapis
**Docs:** https://github.com/googleapis/google-api-nodejs-client

#### What It Does
The official Node.js client library for Google APIs. Provides access to Google Sheets, Drive, Calendar, Gmail, and 200+ other Google services.

#### Why It's Used in This Project
Used exclusively for **Google Sheets API** integration to:
- Export scraped contacts directly to Google Sheets
- Create new sheets programmatically
- Format data (headers, column widths, colors)
- Authenticate using service account credentials
- Batch write operations for performance

This enables seamless workflow:
```
Scrape → Enrich → Export to Sheets → Share link
```

#### Where It's Used

**Primary Files:**
- `src/features/export/sheet-manager.js` - Google Sheets API authentication and low-level operations
  ```javascript
  const { google } = require('googleapis');

  // Authenticate with service account
  this.auth = new google.auth.JWT(
    this.clientEmail,
    null,
    this.privateKey,
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  // Get Sheets API client
  this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  ```

**Export System:**
- `src/features/export/sheet-exporter.js` - High-level export orchestration
- `src/features/export/batch-writer.js` - Batch writing (100 rows at a time)
- `src/features/export/column-detector.js` - Column detection from data
- `src/features/export/data-formatter.js` - Format data for Sheets

**Legacy:**
- `src/utils/google-sheets-exporter.js` - Original exporter (still used by orchestrator)

**Tools:**
- `src/tools/export-to-sheets.js` - Standalone export CLI tool

#### Key Configuration

**Environment Variables (.env):**
```bash
GOOGLE_SHEETS_CLIENT_EMAIL=your-service-account@project-id.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id-here
```

**Service Account Setup:**
1. Create Google Cloud project
2. Enable Google Sheets API
3. Create service account
4. Generate JSON key
5. Share target spreadsheet with service account email

**API Operations Used:**

**Create Sheet:**
```javascript
await sheets.spreadsheets.batchUpdate({
  spreadsheetId,
  requestBody: {
    requests: [{
      addSheet: {
        properties: { title: sheetName }
      }
    }]
  }
});
```

**Write Data (Batch):**
```javascript
await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId,
  requestBody: {
    valueInputOption: 'RAW',
    data: [{
      range: `${sheetName}!A1`,
      values: rows  // 2D array
    }]
  }
});
```

**Apply Formatting:**
```javascript
await sheets.spreadsheets.batchUpdate({
  spreadsheetId,
  requestBody: {
    requests: [
      // Bold headers
      { repeatCell: { ... } },
      // Freeze header row
      { updateSheetProperties: { ... } },
      // Auto-resize columns
      { autoResizeDimensions: { ... } }
    ]
  }
});
```

#### Export Options

**Core Fields Only:**
```bash
--core-only
```
Exports: Name, Email, Phone, Title, Location, Profile URL

**With Enrichment Metadata:**
```bash
--include-enrichment
```
Adds: Confidence, Domain Type, Enrichment Actions, Changes

**Custom Columns:**
```bash
--columns name,email,phone,title
```

**Exclude Columns:**
```bash
--exclude _enrichment,domain
```

#### Performance
- **Batch Writing**: Writes 100 rows per API call for efficiency
- **Rate Limiting**: Respects Google Sheets API quotas
- **Error Handling**: Retries on transient failures

#### Notes
- Requires Google Cloud project with Sheets API enabled
- Service account authentication (not OAuth)
- Spreadsheet must be shared with service account email
- API quotas: 100 requests per 100 seconds per user

---

## Data Processing

### 6. cheerio

**Version:** ^1.1.2
**NPM:** https://www.npmjs.com/package/cheerio
**Docs:** https://cheerio.js.org/

#### What It Does
Cheerio is a fast, flexible implementation of core jQuery designed for server-side use. It parses HTML/XML and provides a jQuery-like API for DOM manipulation and traversal.

#### Why It's Used in This Project
**Currently NOT actively used** in the main scraping workflow. It was part of earlier versions but has been replaced by Puppeteer's native DOM querying capabilities.

Cheerio is still listed as a dependency but is **legacy code**.

#### Where It Would Be Used
In a traditional scraping setup, Cheerio would be used for:
- Parsing static HTML responses
- Extracting data without a browser
- Lightweight DOM manipulation

**Why Puppeteer is Used Instead:**
- Cheerio cannot handle JavaScript-rendered content
- Most modern professional directories use React/Vue/Angular (client-side rendering)
- Puppeteer provides full browser environment with JavaScript execution

#### Migration Path
If you need to use Cheerio for static HTML scraping:
```javascript
const cheerio = require('cheerio');
const $ = cheerio.load(htmlString);
const name = $('.person-name').text();
```

#### Notes
- Kept as dependency for potential future use
- May be used in custom extraction scripts
- Very lightweight (~1MB) so no harm keeping it

---

### 7. pdf-parse

**Version:** ^1.1.4
**NPM:** https://www.npmjs.com/package/pdf-parse
**Docs:** https://www.npmjs.com/package/pdf-parse

#### What It Does
Pure JavaScript PDF parsing library that extracts text content from PDF files without external dependencies. Uses PDF.js from Mozilla.

#### Why It's Used in This Project
Used as a **fallback extraction method** when contact information is embedded in PDF files on professional directory pages. Some law firms, medical directories, and consulting firms publish contact lists as downloadable PDFs.

#### Where It's Used

**Primary File:**
- `src/utils/contact-extractor.js` - Contact extraction utilities
  ```javascript
  let pdfParse;
  try {
    pdfParse = require('pdf-parse');
  } catch (e) {
    throw new Error('pdf-parse is required. Install with: npm install pdf-parse');
  }

  const pdfBuffer = await fetchPDFBuffer(url);
  const pdfData = await pdfParse(pdfBuffer);
  const text = pdfData.text;

  // Extract emails and phones from text
  const emails = extractEmailsFromText(text);
  const phones = extractPhonesFromText(text);
  ```

#### Use Cases
1. **PDF Contact Lists**: Some sites provide downloadable PDF directories
2. **PDF Profiles**: Individual profile pages as PDF resumes
3. **Fallback Method**: When HTML extraction fails

#### Extraction Process
```javascript
// 1. Detect PDF link
const pdfLink = await page.$('a[href$=".pdf"]');

// 2. Download PDF
const pdfBuffer = await downloadPDF(pdfUrl);

// 3. Parse PDF
const pdfData = await pdfParse(pdfBuffer);

// 4. Extract text
const text = pdfData.text;

// 5. Apply regex patterns
const emails = text.match(/[\w.-]+@[\w.-]+\.\w+/g);
const phones = text.match(/\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g);
```

#### Limitations
- Text-based PDFs only (not scanned images)
- Layout/formatting may be lost
- Performance depends on PDF complexity
- For scanned PDFs, use Tesseract.js instead

#### Notes
- Dynamically loaded (not imported by default)
- Only required when PDF extraction is needed
- Lightweight and fast for text PDFs

---

### 8. tesseract.js

**Version:** ^6.0.1
**NPM:** https://www.npmjs.com/package/tesseract.js
**Docs:** https://tesseract.projectnaptha.com/

#### What It Does
Tesseract.js is a JavaScript port of the Tesseract OCR (Optical Character Recognition) engine. It extracts text from images using machine learning models.

#### Why It's Used in This Project
Used as a **last-resort fallback extraction method** when:
- Contact information is rendered as images (to prevent scraping)
- Text extraction from HTML/coordinates fails
- Anti-scraping measures hide text in canvas/image elements

This is particularly useful for:
- Sites that render emails as images
- CAPTCHA-protected contact information (if manually solved)
- Canvas-rendered text

#### Where It's Used

**Primary File:**
- `src/extraction/extractors/screenshot-extractor.js` - OCR extraction
  ```javascript
  const Tesseract = require('tesseract.js');

  class ScreenshotExtractor {
    async extractFromScreenshot(page, selector) {
      // 1. Take screenshot of element
      const element = await page.$(selector);
      const screenshot = await element.screenshot();

      // 2. Run OCR
      const { data: { text } } = await Tesseract.recognize(
        screenshot,
        'eng',  // English language
        {
          logger: m => console.log(m)  // Progress logging
        }
      );

      // 3. Clean and return text
      return text.trim();
    }
  }
  ```

**Integration:**
- `src/extraction/smart-field-extractor.js` - Fallback in extraction pipeline
- Used when other methods (coordinate-text, mailto-link, tel-link) fail

#### Extraction Process
```javascript
// 1. Identify element containing text
const element = await page.$(selector);

// 2. Screenshot the element
const screenshotBuffer = await element.screenshot({ encoding: 'base64' });

// 3. OCR the screenshot
const result = await Tesseract.recognize(screenshotBuffer, 'eng');

// 4. Extract text
const text = result.data.text;

// 5. Apply regex to find email/phone
const email = text.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0];
```

#### Supported Languages
Default: English (`'eng'`)

Other languages available:
```javascript
await Tesseract.recognize(image, 'fra');  // French
await Tesseract.recognize(image, 'deu');  // German
await Tesseract.recognize(image, 'spa');  // Spanish
```

#### Performance Considerations
- **Slow**: OCR is computationally expensive (1-5 seconds per image)
- **Accuracy**: 70-95% depending on image quality
- **Download**: Language models downloaded on first use (~50MB for English)
- **Best for**: Clear, high-contrast text on simple backgrounds

#### When OCR is Triggered
OCR is only used as a fallback when:
1. Coordinate-based extraction fails
2. Selector-based extraction fails
3. Link-based extraction (mailto/tel) fails
4. Config specifies `userValidatedMethod: "screenshot-ocr"`

#### Notes
- Resource-intensive, use sparingly
- Best results with high-DPI screenshots
- Consider increasing page viewport for better OCR accuracy
- Progress logging can be disabled for cleaner output

---

## Logging & CLI

### 9. winston

**Version:** ^3.18.3
**NPM:** https://www.npmjs.com/package/winston
**Docs:** https://github.com/winstonjs/winston

#### What It Does
Winston is a universal logging library with support for multiple transports (console, file, database, etc.). It provides structured logging with different log levels and formats.

#### Why It's Used in This Project
Winston is the **centralized logging system** for the entire application. It provides:
- **Multi-transport logging**: Console + file simultaneously
- **Log levels**: debug, info, warn, error
- **Structured output**: Timestamps, log levels, stack traces
- **File rotation**: Automatic log file management (5MB max per file)
- **Separate error logs**: Dedicated error.log file
- **Exception handling**: Uncaught exception and rejection logging

This is critical for:
- Debugging scraping issues
- Monitoring long-running scrapes
- Auditing data extraction
- Performance analysis

#### Where It's Used

**Core Logger:**
- `src/core/logger.js` - Winston configuration and setup
  ```javascript
  const winston = require('winston');

  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, stack }) => {
        if (stack) {
          return `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`;
        }
        return `${timestamp} [${level.toUpperCase()}]: ${message}`;
      })
    ),
    transports: [
      new winston.transports.Console({ format: winston.format.colorize() }),
      new winston.transports.File({ filename: 'logs/scraper.log' }),
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' })
    ]
  });
  ```

**Used Throughout:**
- All scrapers (`src/scrapers/**/*.js`)
- All extractors (`src/extraction/**/*.js`)
- All enrichers (`src/features/enrichment/**/*.js`)
- All exporters (`src/features/export/**/*.js`)
- Browser manager, Selenium manager
- Orchestrator and pipeline

#### Log Levels

```javascript
logger.debug('Detailed debug information');  // Development only
logger.info('General information');          // Default level
logger.warn('Warning messages');             // Potential issues
logger.error('Error messages');              // Errors that need attention
```

**Environment Control:**
```bash
# .env file
LOG_LEVEL=debug  # Show all logs
LOG_LEVEL=info   # Default (recommended)
LOG_LEVEL=warn   # Only warnings and errors
LOG_LEVEL=error  # Only errors
```

#### Transports Configuration

**Console Transport:**
```javascript
new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),  // Colored output
    logFormat
  )
})
```

**File Transport (Main Log):**
```javascript
new winston.transports.File({
  filename: 'logs/scraper.log',
  maxsize: 5242880,  // 5MB
  maxFiles: 3,       // Keep 3 rotated files
  format: logFormat
})
```

**File Transport (Errors Only):**
```javascript
new winston.transports.File({
  filename: 'logs/error.log',
  level: 'error',    // Only errors
  maxsize: 5242880,
  maxFiles: 3
})
```

#### Custom Log Methods

**Memory Usage:**
```javascript
logger.logMemory();
// Output: "Memory Usage - Heap: 150.23/200.45MB, RSS: 180.12MB, External: 5.67MB"
```

**Progress Tracking:**
```javascript
logger.logProgress(50, 100, 'contacts');
// Output: "Progress: 50/100 contacts (50.0%)"
```

**Statistics:**
```javascript
logger.logStats({
  'Total Contacts': 150,
  'With Email': 120,
  'With Phone': 100
});
// Output:
// === Scraping Statistics ===
//   Total Contacts: 150
//   With Email: 120
//   With Phone: 100
// ==========================
```

#### Exception Handling

**Uncaught Exceptions:**
```javascript
logger.exceptions.handle(
  new winston.transports.File({
    filename: 'logs/exceptions.log'
  })
);
```

**Unhandled Promise Rejections:**
```javascript
logger.rejections.handle(
  new winston.transports.File({
    filename: 'logs/rejections.log'
  })
);
```

#### Log Files

**Directory Structure:**
```
logs/
├── scraper.log        # All logs (info, warn, error)
├── scraper.log.1      # Rotated log (previous)
├── scraper.log.2      # Rotated log (older)
├── error.log          # Errors only
├── exceptions.log     # Uncaught exceptions
└── rejections.log     # Unhandled rejections
```

#### Usage Example
```javascript
const logger = require('./src/core/logger');

// Basic logging
logger.info('Starting scrape...');
logger.warn('Rate limit approaching');
logger.error('Failed to extract email', { url: profileUrl });

// With metadata
logger.info('Contact extracted', {
  name: 'John Smith',
  email: 'jsmith@example.com'
});

// Progress tracking
logger.logProgress(currentPage, totalPages, 'pages');

// Memory monitoring
logger.logMemory();
```

#### Notes
- Log files auto-rotate at 5MB
- Keep last 3 rotated files
- Console output is colorized for readability
- All timestamps in local time zone
- Stack traces included for errors

---

### 10. commander

**Version:** ^11.1.0
**NPM:** https://www.npmjs.com/package/commander
**Docs:** https://github.com/tj/commander.js

#### What It Does
Commander is a complete solution for building command-line interfaces (CLIs) in Node.js. It provides argument parsing, option handling, help generation, and command organization.

#### Why It's Used in This Project
Commander powers the **CLI interface for `orchestrator.js`**, providing:
- Argument parsing (`--url`, `--limit`, etc.)
- Option validation and type conversion
- Auto-generated help text (`--help`)
- Version display (`--version`)
- Required vs. optional arguments
- Default values

This enables the user-friendly CLI:
```bash
node orchestrator.js --url "..." --limit 100 --paginate --max-pages 10
```

#### Where It's Used

**Primary File:**
- `orchestrator.js` - Main CLI entry point
  ```javascript
  const { Command } = require('commander');

  const program = new Command();
  program
    .name('universal-scraper')
    .description('Universal professional directory scraper')
    .version('2.0.0')
    .requiredOption('-u, --url <url>', 'Target URL to scrape')
    .option('-l, --limit <number>', 'Limit number of contacts', parseInt)
    .option('-c, --config <name>', 'Config file name')
    .option('-o, --output <format>', 'Output format: json|sheets', 'json')
    .option('--headless [value]', 'Run in headless mode', 'true')
    .option('--paginate', 'Enable pagination')
    .option('--scroll', 'Enable infinite scroll')
    .option('--full-pipeline', 'Run complete workflow')
    .option('--auto', 'Skip confirmation prompts')
    .option('-v, --verbose', 'Verbose logging')
    .parse(process.argv);

  const options = program.opts();
  ```

**Also Used In:**
- `src/tools/config-generator.js` - Config generator CLI
- `src/tools/validate-config.js` - Validation tool CLI
- `src/tools/enrich-contacts.js` - Enrichment CLI
- `src/tools/export-to-sheets.js` - Export CLI

#### Option Types

**Required Options:**
```javascript
.requiredOption('-u, --url <url>', 'Target URL to scrape')
// User MUST provide --url
```

**Optional Options:**
```javascript
.option('-l, --limit <number>', 'Limit contacts', parseInt)
// User can optionally provide --limit
```

**Boolean Flags:**
```javascript
.option('--paginate', 'Enable pagination')
// --paginate sets to true, omit for false
```

**Options with Defaults:**
```javascript
.option('-o, --output <format>', 'Output format', 'json')
// Defaults to 'json' if not provided
```

**Type Conversion:**
```javascript
.option('-l, --limit <number>', 'Limit', parseInt)
// Converts string to number automatically
```

#### Auto-Generated Help

Running `node orchestrator.js --help` displays:
```
Usage: universal-scraper [options]

Universal professional directory scraper

Options:
  -V, --version              output the version number
  -u, --url <url>            Target URL to scrape
  -l, --limit <number>       Limit number of contacts to scrape
  -c, --config <name>        Config file name
  -o, --output <format>      Output format: json|sheets (default: "json")
  --headless [value]         Run browser in headless mode (default: "true")
  --paginate                 Enable pagination
  --scroll                   Enable infinite scroll
  --full-pipeline            Run complete workflow
  --auto                     Skip confirmation prompts
  -v, --verbose              Verbose logging
  -h, --help                 display help for command
```

#### Accessing Parsed Options

```javascript
const options = program.opts();

console.log(options.url);        // Required URL
console.log(options.limit);      // Number or undefined
console.log(options.paginate);   // true or undefined
console.log(options.verbose);    // true or undefined
```

#### Validation Example

```javascript
if (!validateUrl(options.url)) {
  logger.error(`Invalid URL: ${options.url}`);
  process.exit(1);
}
```

#### Notes
- Help text auto-generated from option definitions
- Version from package.json
- Supports environment variable defaults
- Can parse process.argv or custom arrays

---

### 11. cli-table3

**Version:** ^0.6.3
**NPM:** https://www.npmjs.com/package/cli-table3
**Docs:** https://github.com/cli-table/cli-table3

#### What It Does
Cli-table3 is a utility for rendering Unicode-based tables in the terminal. It supports colors, column alignment, cell spanning, and various border styles.

#### Why It's Used in This Project
Used for **formatting terminal output** to display:
- Contact data tables (sample contacts)
- Statistics summaries
- Validation results
- Progress reports

This improves readability and user experience:
```
┌─────────────────┬─────────────────────────┬──────────────────┐
│ Name            │ Email                   │ Phone            │
├─────────────────┼─────────────────────────┼──────────────────┤
│ John Smith      │ jsmith@example.com      │ +1-212-555-1234  │
│ Jane Doe        │ jdoe@example.com        │ +1-212-555-5678  │
└─────────────────┴─────────────────────────┴──────────────────┘
```

#### Where It's Used

**Primary File:**
- `src/utils/prompt-helper.js` - Terminal UI utilities
  ```javascript
  const Table = require('cli-table3');

  function displayContactsTable(contacts, limit = 5) {
    const table = new Table({
      head: ['Name', 'Email', 'Phone', 'Title', 'Location'],
      colWidths: [20, 30, 18, 25, 25],
      style: {
        head: ['cyan', 'bold'],
        border: ['grey']
      }
    });

    const sample = contacts.slice(0, limit);
    sample.forEach(contact => {
      table.push([
        contact.name || '',
        contact.email || '',
        contact.phone || '',
        contact.title || '',
        contact.location || ''
      ]);
    });

    console.log(table.toString());
  }
  ```

**Used For:**
- `displayContactsTable()` - Show sample contacts
- `displayStageSummary()` - Show stage statistics
- Validation result tables
- Export preview tables

#### Table Styles

**Basic Table:**
```javascript
const table = new Table({
  head: ['Column 1', 'Column 2'],
  colWidths: [20, 30]
});

table.push(['Row 1 Cell 1', 'Row 1 Cell 2']);
table.push(['Row 2 Cell 1', 'Row 2 Cell 2']);

console.log(table.toString());
```

**Styled Headers:**
```javascript
const table = new Table({
  head: ['Name', 'Email'],
  style: {
    head: ['cyan', 'bold'],  // Cyan + bold headers
    border: ['grey']          // Grey borders
  }
});
```

**Compact Style:**
```javascript
const table = new Table({
  head: ['Key', 'Value'],
  style: { compact: true }  // Remove padding
});
```

**Key-Value Style:**
```javascript
const table = new Table();

table.push(
  { 'Total Contacts': 150 },
  { 'With Email': 120 },
  { 'With Phone': 100 }
);
```

#### Real Usage Examples

**Contact Display:**
```javascript
function displayContactsTable(contacts, limit = 5) {
  console.log(`\nSample Contacts (showing ${Math.min(limit, contacts.length)} of ${contacts.length}):\n`);

  const table = new Table({
    head: ['Name', 'Email', 'Phone', 'Title', 'Location'],
    colWidths: [20, 30, 18, 25, 25],
    style: { head: ['cyan', 'bold'], border: ['grey'] }
  });

  contacts.slice(0, limit).forEach(c => {
    table.push([
      truncate(c.name, 18),
      truncate(c.email, 28),
      truncate(c.phone, 16),
      truncate(c.title, 23),
      truncate(c.location, 23)
    ]);
  });

  console.log(table.toString());
}
```

**Statistics Display:**
```javascript
function displayStageSummary(stats, title = 'Summary:') {
  console.log(`\n${title}\n`);

  const table = new Table();

  Object.entries(stats).forEach(([key, value]) => {
    table.push({ [key]: value });
  });

  console.log(table.toString());
}
```

#### Notes
- Unicode box-drawing characters for clean borders
- Auto-wraps long text if column width specified
- Supports ANSI colors (works in all modern terminals)
- Lightweight and fast

---

## Configuration

### 12. dotenv

**Version:** ^16.3.1
**NPM:** https://www.npmjs.com/package/dotenv
**Docs:** https://github.com/motdotla/dotenv

#### What It Does
Dotenv loads environment variables from a `.env` file into `process.env`. It allows you to separate configuration from code, following the [12-factor app](https://12factor.net/config) methodology.

#### Why It's Used in This Project
Dotenv manages **sensitive configuration** and **environment-specific settings**:
- **Google Sheets API credentials** (private keys, service account emails)
- **Logging levels** (debug, info, warn, error)
- **Pagination settings** (max pages, timeouts)
- **Feature flags** (enable/disable pagination globally)

This provides:
- **Security**: Credentials never committed to Git
- **Flexibility**: Different settings per environment (dev, prod)
- **Convenience**: Easy configuration without code changes

#### Where It's Used

**Primary File:**
- `orchestrator.js` - Loaded at the very top
  ```javascript
  #!/usr/bin/env node

  require('dotenv').config();  // MUST be first import

  // Now all process.env values are available
  const logger = require('./src/core/logger');
  ```

**Configuration Loading:**
Dotenv loads `.env` file from project root and makes variables available via `process.env`:

```javascript
// .env file
LOG_LEVEL=debug
GOOGLE_SHEETS_CLIENT_EMAIL=example@project.iam.gserviceaccount.com

// In code
console.log(process.env.LOG_LEVEL);  // "debug"
console.log(process.env.GOOGLE_SHEETS_CLIENT_EMAIL);  // "example@..."
```

#### Environment Variables Used

**Google Sheets (Required for Export):**
```bash
GOOGLE_SHEETS_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id
```

**Logging:**
```bash
LOG_LEVEL=info  # debug | info | warn | error
```

**Pagination:**
```bash
PAGINATION_ENABLED=true           # Global pagination enable/disable
PAGINATION_MAX_PAGES=200          # Max pages to scrape per URL
PAGINATION_MIN_CONTACTS=1         # Min contacts per page to continue
PAGINATION_DISCOVERY_TIMEOUT=30000  # Timeout in ms for pagination discovery
```

#### .env File Structure

```bash
# Comments are supported
LOG_LEVEL=info

# Multi-line values (private keys)
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nLine1\nLine2\n-----END PRIVATE KEY-----\n"

# No quotes needed for simple values
PAGINATION_MAX_PAGES=200

# Boolean values (as strings)
PAGINATION_ENABLED=true
```

#### Security Best Practices

**1. Never Commit .env to Git:**
```bash
# .gitignore
.env
.env.local
.env.*.local
```

**2. Provide Template:**
```bash
# Include .env.example in Git
cp .env.example .env
# User fills in their own values
```

**3. Validate Required Variables:**
```javascript
if (!process.env.GOOGLE_SHEETS_CLIENT_EMAIL) {
  console.error('GOOGLE_SHEETS_CLIENT_EMAIL not set in .env');
  process.exit(1);
}
```

#### Usage Examples

**Reading Values:**
```javascript
require('dotenv').config();

const logLevel = process.env.LOG_LEVEL || 'info';
const maxPages = parseInt(process.env.PAGINATION_MAX_PAGES) || 200;
const paginationEnabled = process.env.PAGINATION_ENABLED === 'true';
```

**Winston Logger:**
```javascript
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',  // From .env
  // ...
});
```

**Google Sheets:**
```javascript
const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');
const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
```

#### Configuration Precedence

1. **Environment variables** (highest priority)
   ```bash
   LOG_LEVEL=debug node orchestrator.js
   ```

2. **.env file**
   ```bash
   LOG_LEVEL=info
   ```

3. **Code defaults** (lowest priority)
   ```javascript
   const logLevel = process.env.LOG_LEVEL || 'info';
   ```

#### Notes
- `.env` file must be in project root (same directory as orchestrator.js)
- Variables are strings - convert types as needed (parseInt, parseFloat, === 'true')
- Comments supported with `#`
- No quotes needed for simple values
- Use quotes for values with spaces or special characters

---

## Dependency Summary Table

| Package | Version | Category | Active Use | Critical |
|---------|---------|----------|------------|----------|
| puppeteer | ^21.11.0 | Browser | Yes | High |
| puppeteer-extra | ^3.3.6 | Browser | Yes | High |
| puppeteer-extra-plugin-stealth | ^2.11.2 | Browser | Yes | High |
| selenium-webdriver | ^4.39.0 | Browser | Yes (infinite scroll) | Medium |
| googleapis | ^128.0.0 | Export | Yes | Medium |
| cheerio | ^1.1.2 | Parsing | No (legacy) | Low |
| pdf-parse | ^1.1.4 | Extraction | Rare (fallback) | Low |
| tesseract.js | ^6.0.1 | Extraction | Rare (fallback) | Low |
| winston | ^3.18.3 | Logging | Yes | High |
| commander | ^11.1.0 | CLI | Yes | High |
| cli-table3 | ^0.6.3 | CLI | Yes | Low |
| dotenv | ^16.3.1 | Config | Yes | High |

---

## Installation & Updates

### Install All Dependencies
```bash
npm install
```

### Update Dependencies
```bash
# Check for updates
npm outdated

# Update all to latest within semver ranges
npm update

# Update specific package
npm install puppeteer@latest
```

### Audit Security
```bash
npm audit
npm audit fix
```

---

**Last Updated:** 2025-12-23

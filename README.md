# Universal Professional Directory Scraper

A modular, pattern-based web scraping system for extracting professional contact data (name, email, phone) from directory-style websites using a progressive enhancement approach.

## 📋 Project Overview

This scraper uses three progressive levels to handle different website structures:

1. **Simple Scraper** - Basic DOM text extraction for visible contact information
2. **Click Handler Scraper** - Handles "reveal" buttons for hidden contacts
3. **Profile Resolver Scraper** - Navigates to individual profile pages when needed

### Key Features

- **Pattern-Based Pagination** - Detects 6 different pagination formats plus infinite scroll
- **Template Adapters** - Site-specific configurations for optimal extraction
- **Memory Management** - Automatic page recycling to prevent memory leaks
- **Rate Limiting** - Exponential backoff with human-like delays
- **CAPTCHA Detection** - Graceful exit when bot challenges are detected
- **Multiple Export Formats** - SQLite, Google Sheets, and CSV support
- **Deduplication** - Prevents duplicate contacts by name+email+phone combination

## 🎯 Success Metrics

- 80%+ extraction rate with adapters
- 60%+ universal extraction without adapters
- Less than 5% duplicate records
- 50-100 contacts/minute scraping speed

## 🚀 Getting Started

### Prerequisites

- Node.js 16.0.0 or higher
- npm (comes with Node.js)
- Google Sheets API credentials (optional, for Sheets export)

### Installation

1. **Clone or create the project directory**
   ```bash
   mkdir universal-scraper
   cd universal-scraper
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your Google Sheets API credentials (optional)
   ```

4. **Create logs directory**
   ```bash
   mkdir logs
   ```

### Google Sheets Configuration (Optional)

To enable Google Sheets export:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the Google Sheets API
4. Create a service account and download the JSON credentials
5. Extract these values from the JSON file:
   - `client_email` → `GOOGLE_SHEETS_CLIENT_EMAIL`
   - `private_key` → `GOOGLE_SHEETS_PRIVATE_KEY`
6. Create a Google Sheet and get its ID from the URL
7. Share the sheet with the service account email (give Editor access)
8. Add all values to your `.env` file

## 📖 Usage

### Basic Usage

```bash
node orchestrator.js --url https://example.com/directory --limit 100
```

### Command Line Options

```
Options:
  -u, --url <url>           Target directory URL to scrape (required)
  -l, --limit <number>      Maximum number of contacts to extract (default: 100)
  -o, --output <format>     Output format: sqlite|csv|sheets|all (default: all)
  --headless <boolean>      Run browser in headless mode (default: true)
  --delay <ms>              Delay between requests in ms (default: 2000-5000)
  -h, --help                Display help information
  -V, --version             Display version number
```

### Examples

```bash
# Scrape with default settings
node orchestrator.js --url https://directory.example.com

# Scrape 500 contacts and export to CSV only
node orchestrator.js -u https://directory.example.com -l 500 -o csv

# Scrape with custom rate limiting
node orchestrator.js -u https://directory.example.com --delay 3000-7000
```

## 📁 Project Structure

```
universal-scraper/
├── scrapers/               # Progressive scraper levels
│   ├── simple-scraper.js
│   ├── click-handler-scraper.js
│   └── profile-resolver-scraper.js
├── pagination/             # Pagination detection and navigation
│   ├── detector.js
│   ├── navigator.js
│   └── infinite-scroll.js
├── adapters/               # Site-specific configurations
│   ├── registry.json
│   ├── loader.js
│   └── template-adapter.json
├── io/                     # Data processing and export
│   ├── normalizer.js
│   ├── deduplicator.js
│   ├── sqlite-handler.js
│   ├── sheets-handler.js
│   └── csv-handler.js
├── tests/                  # Test suites
│   ├── pagination-test.js
│   ├── scraper-test.js
│   └── full-run-test.js
├── utils/                  # Core utilities
│   ├── browser-manager.js
│   ├── rate-limiter.js
│   └── logger.js
├── orchestrator.js         # Main CLI entrypoint
└── logs/                   # Log files (auto-created)
```

## 🔧 Current Status: Week 1 Foundation

### ✅ Completed Features

- Project structure and dependencies
- Browser manager with Puppeteer + Stealth plugin
- Memory management (auto-recycle at 50 pages or 1GB)
- CAPTCHA detection and graceful exit
- Rate limiter with exponential backoff
- Structured logging (console + file)
- Basic CLI orchestrator
- Environment configuration

### 🚧 Coming in Week 2

- Simple Scraper implementation
- Pattern recognition for contact extraction
- Email/phone/name regex patterns
- Card detection logic
- First end-to-end test

### 📅 Future Weeks

- Week 3: Click Handler Scraper
- Week 4: Profile Resolver Scraper
- Week 5: Pagination Detection
- Week 6: Template Adapters
- Week 7: Data Export (SQLite, CSV)
- Week 8: Google Sheets Integration
- Week 9: Deduplication & Normalization
- Week 10: Testing & Documentation

## 🧪 Testing

### Week 1 Foundation Test

```bash
node orchestrator.js --url https://example.com
```

Expected output:
- Browser launches successfully
- Page navigates without errors
- Logs appear in console and `logs/scraper.log`
- Memory usage is tracked
- Browser closes cleanly

### Running Tests (Coming in Week 2+)

```bash
npm test
```

## 📊 Logging

Logs are written to:
- **Console** - Color-coded, real-time feedback
- **logs/scraper.log** - All logs (max 5MB × 3 files)
- **logs/error.log** - Error logs only
- **logs/exceptions.log** - Uncaught exceptions
- **logs/rejections.log** - Unhandled promise rejections

Log levels: `error`, `warn`, `info`, `debug`

Set log level in `.env`:
```
LOG_LEVEL=debug
```

## 🛡️ Error Handling

The scraper handles:
- **CAPTCHA Detection** - Exits gracefully with clear message
- **Navigation Timeouts** - Retries with exponential backoff
- **Memory Leaks** - Automatic page recycling
- **Network Errors** - Rate limiting and retries
- **Invalid URLs** - Validation before scraping

## 🔒 Rate Limiting

Default settings:
- **Delay Range**: 2-5 seconds between requests
- **Backoff Multiplier**: 1.5x on retries
- **Max Retries**: 3 attempts
- **Random Jitter**: ±20% variance for human-like behavior

## 🤝 Contributing

This is a school project. For suggestions or issues:
1. Document the issue with screenshots/logs
2. Include the URL and scraping parameters
3. Provide the relevant section of `logs/scraper.log`

## 📄 License

MIT License - See LICENSE file for details

## 🙏 Acknowledgments

Built with:
- [Puppeteer](https://pptr.dev/) - Headless browser automation
- [Puppeteer Extra](https://github.com/berstend/puppeteer-extra) - Plugin framework
- [Winston](https://github.com/winstonjs/winston) - Logging library
- [Commander.js](https://github.com/tj/commander.js) - CLI framework
- [Google Sheets API](https://developers.google.com/sheets/api) - Export integration

---

**Version**: 1.0.0 (Week 1 Foundation)  
**Status**: In Development  
**Last Updated**: 2025

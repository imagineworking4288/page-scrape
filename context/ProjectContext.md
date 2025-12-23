# Universal Professional Scraper - Operational Guide

## Table of Contents
1. [How to Run the Project](#how-to-run-the-project)
2. [Environment Variables](#environment-variables)
3. [Common Usage Scenarios](#common-usage-scenarios)
4. [Troubleshooting](#troubleshooting)
5. [Output Files](#output-files)
6. [Config File Structure](#config-file-structure)

---

## How to Run the Project

### Prerequisites
1. **Node.js 18+** installed (recommended: 20+)
2. **Chrome browser** installed (for Selenium infinite scroll)
3. **Google Sheets API credentials** (optional, for export)

### Installation
```bash
# Clone and navigate to project
cd page-scrape

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials (optional)
nano .env
```

---

## CLI Commands Reference

### Main Entry Point: `orchestrator.js`

The orchestrator is the primary CLI tool for running scraping operations.

#### Basic Syntax
```bash
node orchestrator.js [options]
```

#### Required Options
```bash
-u, --url <url>              Target URL to scrape
```

#### Core Options
```bash
-l, --limit <number>         Limit number of contacts to scrape
-c, --config <name>          Config file name (auto-detected from URL if omitted)
-o, --output <format>        Output format: json|sheets (default: json)
--headless [value]           Run browser in headless mode (true/false, default: true)
--delay <ms>                 Delay between requests in ms (default: 2000-5000)
-v, --verbose                Verbose logging
```

#### Pagination Options
```bash
--paginate                   Enable multi-page pagination
--max-pages <number>         Maximum number of pages to scrape (default: 200)
--start-page <number>        Start from specific page (for resume, default: 1)
--min-contacts <number>      Minimum contacts per page to continue
--discover-only              Discover pagination pattern without scraping
```

#### Infinite Scroll Options
```bash
--scroll                     Enable infinite scroll handling (Selenium)
--max-scrolls <number>       Maximum scroll attempts (default: 50)
--scroll-delay <ms>          Delay between scrolls in ms (default: 400)
--max-retries <number>       Max consecutive no-change attempts (default: 25)
--force-selenium             Force Selenium browser for infinite scroll
```

#### Mode Selection
```bash
--single-page                Force single-page mode (no pagination/scrolling)
```

#### Full Pipeline Options
```bash
--full-pipeline              Run complete workflow: config → scrape → enrich → export
--auto                       Skip confirmation prompts (auto mode)
--skip-config-gen            Use existing config, don't generate new one
--no-enrich                  Skip enrichment stage
--no-export                  Skip export stage
--core-only                  Export only core fields (exclude enrichment metadata)
```

#### Validation Options
```bash
--validate                   Run validation tool (quick config test)
```

---

## Common Usage Scenarios

### Scenario 1: First-Time Setup - Generate Config

When scraping a new website, start by generating a configuration file.

```bash
# Launch visual config generator
node src/tools/config-generator.js --url "https://example.com/directory"

# Debug mode (visible browser)
node src/tools/config-generator.js --url "https://example.com/directory" --verbose
```

**Interactive Steps:**
1. Browser opens showing the target page
2. Draw a rectangle around one contact card
3. System finds similar cards
4. Click on each field (name, email, phone, title, location, profile URL)
5. System tests multiple extraction methods
6. Validate the best method for each field
7. Config saved to `configs/website-configs/{domain}.json`

---

### Scenario 2: Validate Config Before Full Scrape

Test a config with a small sample before running a full scrape.

```bash
# Quick validation (2 contacts)
node orchestrator.js --validate --url "https://example.com/directory" --limit 2

# Thorough validation (10 contacts)
node orchestrator.js --validate --url "https://example.com/directory" --limit 10 --verbose

# Visible browser for debugging
node orchestrator.js --validate --url "https://example.com/directory" --limit 5 --headless false
```

**What it checks:**
- Config exists and is valid
- Card selector finds cards
- Field extraction works correctly
- Data quality (contamination detection)
- Profile enrichment (if enabled)

---

### Scenario 3: Single Page Scrape

Extract contacts from a single static page.

```bash
# Basic single page scrape
node orchestrator.js --url "https://example.com/directory" --single-page

# With contact limit
node orchestrator.js --url "https://example.com/directory" --single-page --limit 50

# Visible browser (debugging)
node orchestrator.js --url "https://example.com/directory" --single-page --headless false --verbose
```

---

### Scenario 4: Multi-Page Pagination

Scrape across multiple pages with traditional pagination.

```bash
# Auto-detect pagination and scrape all pages
node orchestrator.js --url "https://example.com/directory" --paginate

# Limit to 10 pages
node orchestrator.js --url "https://example.com/directory" --paginate --max-pages 10

# Start from page 5 (resume after interruption)
node orchestrator.js --url "https://example.com/directory" --paginate --start-page 5

# Discover pagination pattern only (no scraping)
node orchestrator.js --url "https://example.com/directory" --paginate --discover-only
```

---

### Scenario 5: Infinite Scroll Sites

Scrape sites that load content dynamically as you scroll.

```bash
# Basic infinite scroll
node orchestrator.js --url "https://example.com/directory" --scroll

# With custom scroll settings
node orchestrator.js --url "https://example.com/directory" --scroll \
  --scroll-delay 600 \
  --max-retries 30 \
  --max-scrolls 100

# Limit contacts (stops after reaching limit)
node orchestrator.js --url "https://example.com/directory" --scroll --limit 200

# Visible browser (watch the scrolling)
node orchestrator.js --url "https://example.com/directory" --scroll --headless false
```

**Note:** Infinite scroll always uses Selenium with PAGE_DOWN key simulation for reliability.

---

### Scenario 6: Full Pipeline (Recommended)

Run the complete workflow from config generation to Google Sheets export.

```bash
# Interactive mode (prompts at each stage)
node orchestrator.js --full-pipeline --url "https://example.com/directory"

# Auto mode (no prompts, uses defaults)
node orchestrator.js --full-pipeline --url "https://example.com/directory" --auto

# With existing config (skip generation)
node orchestrator.js --full-pipeline --url "https://example.com/directory" --skip-config-gen --auto

# Skip enrichment
node orchestrator.js --full-pipeline --url "https://example.com/directory" --no-enrich --auto

# Limit contacts and export core fields only
node orchestrator.js --full-pipeline --url "https://example.com/directory" \
  --limit 100 \
  --core-only \
  --auto
```

**Pipeline Stages:**
1. **Config Check**: Verify config exists or run generator
2. **Scraping**: Extract contacts using appropriate scraper
3. **Enrichment**: Visit profile pages to validate/enhance data
4. **Export**: Save to Google Sheets

---

### Scenario 7: Standalone Enrichment

Enrich previously scraped data.

```bash
# Basic enrichment
node src/tools/enrich-contacts.js --input output/scrape.json

# With options
node src/tools/enrich-contacts.js \
  --input output/scrape.json \
  --verbose \
  --limit 50 \
  --core-fields-only

# Resume from specific contact index
node src/tools/enrich-contacts.js \
  --input output/scrape.json \
  --resume-from 50
```

**Options:**
- `--input <file>`: Input JSON file (required)
- `--output <file>`: Output file (default: input with -enriched suffix)
- `--limit <n>`: Limit contacts to enrich
- `--resume-from <n>`: Resume from contact index
- `--core-fields-only`: Only extract core fields
- `--verbose`: Detailed logging

---

### Scenario 8: Standalone Google Sheets Export

Export JSON data to Google Sheets.

```bash
# Default columns
node src/tools/export-to-sheets.js --input output/enriched.json --name "My Contacts"

# Core fields only (exclude enrichment metadata)
node src/tools/export-to-sheets.js --input output/enriched.json --core-only

# Specific columns
node src/tools/export-to-sheets.js \
  --input output/enriched.json \
  --columns name,email,phone,title,location \
  --name "Contact List"

# Include enrichment metadata
node src/tools/export-to-sheets.js \
  --input output/enriched.json \
  --include-enrichment
```

**Options:**
- `--input <file>`: Input JSON file (required)
- `--name <name>`: Sheet name (default: auto-generated)
- `--core-only`: Only include 6 core fields
- `--columns <list>`: Comma-separated column list
- `--include-enrichment`: Include enrichment metadata columns
- `--exclude <list>`: Comma-separated columns to exclude

---

## Environment Variables

### .env File Structure

Create a `.env` file in the project root:

```bash
# ============================================================================
# GOOGLE SHEETS API CREDENTIALS
# ============================================================================
# Authentication Method: Service Account (recommended for automation)
#
# SETUP STEPS:
# 1. Go to https://console.cloud.google.com/
# 2. Create/select a project
# 3. Enable Google Sheets API: APIs & Services → Library → "Google Sheets API" → Enable
# 4. Create Service Account: APIs & Services → Credentials → Create Credentials → Service Account
# 5. Generate JSON key: Click service account → Keys tab → Add Key → Create new key → JSON
# 6. Copy client_email and private_key from the downloaded JSON to the values below
#
# IMPORTANT: Share your spreadsheet with the service account email as Editor!

# Service account email (from credentials JSON: "client_email")
GOOGLE_SHEETS_CLIENT_EMAIL=your-service-account@project-id.iam.gserviceaccount.com

# Private key (from credentials JSON: "private_key")
# CRITICAL: Keep the quotes and \n characters exactly as shown
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourPrivateKeyHere\n-----END PRIVATE KEY-----\n"

# Target spreadsheet ID
# Find this in the URL: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id-here

# ============================================================================

# Optional: Logging level (debug, info, warn, error)
LOG_LEVEL=info

# Pagination Configuration
# Maximum number of pages to scrape per URL (prevents infinite loops)
PAGINATION_MAX_PAGES=200

# Minimum number of contacts required per page to continue pagination
PAGINATION_MIN_CONTACTS=1

# Timeout in milliseconds for pagination pattern discovery
PAGINATION_DISCOVERY_TIMEOUT=30000

# Enable/disable pagination globally (can be overridden per site config)
PAGINATION_ENABLED=true
```

### Google Sheets Setup Guide

1. **Create a Google Cloud Project**
   - Go to https://console.cloud.google.com/
   - Click "Select a project" → "New Project"
   - Enter project name → "Create"

2. **Enable Google Sheets API**
   - In your project, go to "APIs & Services" → "Library"
   - Search for "Google Sheets API"
   - Click on it → "Enable"

3. **Create Service Account**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "Service Account"
   - Enter service account name → "Create and Continue"
   - Skip optional steps → "Done"

4. **Generate JSON Key**
   - Click on the created service account
   - Go to "Keys" tab
   - Click "Add Key" → "Create new key"
   - Choose "JSON" → "Create"
   - JSON file downloads automatically

5. **Extract Credentials**
   - Open the downloaded JSON file
   - Copy `client_email` to `GOOGLE_SHEETS_CLIENT_EMAIL`
   - Copy `private_key` to `GOOGLE_SHEETS_PRIVATE_KEY` (keep the \n characters)

6. **Create Target Spreadsheet**
   - Go to https://sheets.google.com/
   - Create a new blank spreadsheet
   - Copy the spreadsheet ID from the URL
   - Paste into `GOOGLE_SHEETS_SPREADSHEET_ID`

7. **Share Spreadsheet**
   - Click "Share" button in the spreadsheet
   - Enter the service account email (from step 5)
   - Grant "Editor" access
   - Uncheck "Notify people"
   - Click "Share"

---

## Troubleshooting

### Issue: Config Not Found

**Error:** `No config found for: example.com`

**Solutions:**
```bash
# Generate a new config
node src/tools/config-generator.js --url "https://example.com/directory"

# Or specify a config explicitly
node orchestrator.js --url "https://example.com/directory" --config example-com
```

---

### Issue: No Contacts Extracted

**Error:** `Scraped 0 contacts`

**Solutions:**
```bash
# Validate config with visible browser
node orchestrator.js --validate --url "https://example.com/directory" --headless false --verbose

# Check if card selector is working
node src/tools/validate-config.js --url "https://example.com/directory" --show --verbose

# Regenerate config
node src/tools/config-generator.js --url "https://example.com/directory"
```

**Common Causes:**
- Website structure changed since config generation
- Incorrect card selector in config
- Site requires authentication
- CAPTCHA or bot detection

---

### Issue: Infinite Scroll Not Loading

**Error:** `Only extracted 10 contacts from infinite scroll site`

**Solutions:**
```bash
# Increase scroll delay
node orchestrator.js --url "https://example.com/directory" --scroll --scroll-delay 800

# Increase max retries
node orchestrator.js --url "https://example.com/directory" --scroll --max-retries 40

# Watch in visible mode
node orchestrator.js --url "https://example.com/directory" --scroll --headless false
```

**Requirements:**
- System Chrome must be installed (not just Chromium in Puppeteer)
- Check Chrome path: `which google-chrome` (Linux) or `where chrome` (Windows)

---

### Issue: Google Sheets Export Fails

**Error:** `Google Sheets export failed: 401 Unauthorized`

**Solutions:**
1. **Verify .env credentials**
   ```bash
   # Check that values are not still placeholders
   grep GOOGLE_SHEETS .env
   ```

2. **Check spreadsheet sharing**
   - Open the target spreadsheet
   - Verify service account email has Editor access

3. **Verify API is enabled**
   - Go to https://console.cloud.google.com/
   - Check "APIs & Services" → "Enabled APIs"
   - "Google Sheets API" should be listed

4. **Test authentication**
   ```bash
   # Try a small export
   node src/tools/export-to-sheets.js --input output/scrape.json --verbose
   ```

---

### Issue: Memory Issues

**Error:** `JavaScript heap out of memory`

**Solutions:**
```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" node orchestrator.js --url "..."

# Process in smaller batches
node orchestrator.js --url "..." --limit 500

# For pagination, limit pages
node orchestrator.js --url "..." --paginate --max-pages 10
```

---

### Issue: Rate Limiting / IP Blocking

**Error:** `429 Too Many Requests` or repeated failures

**Solutions:**
```bash
# Increase delay between requests
node orchestrator.js --url "..." --delay 5000-10000

# Use visible browser (appears more human-like)
node orchestrator.js --url "..." --headless false

# Process fewer contacts
node orchestrator.js --url "..." --limit 100
```

**Notes:**
- Stealth mode is enabled by default (puppeteer-extra-plugin-stealth)
- Random user agents are used
- Consider using a proxy or VPN for large scrapes

---

### Issue: Enrichment Fails

**Error:** `Profile enrichment failed for 50% of contacts`

**Solutions:**
```bash
# Resume from where it failed
node src/tools/enrich-contacts.js --input output/scrape.json --resume-from 50

# Skip errors and continue
# (This is the default behavior)

# Check for profileUrl field
# Enrichment requires contacts to have profileUrl
```

**Common Causes:**
- Profile pages require authentication
- Profile URLs are invalid or changed
- Network issues or timeouts

---

## Output Files

### Directory Structure
```
output/
├── scrape-example-com-1703260800000.json          # Raw scraped data
├── scrape-example-com-1703260800000-enriched.json # Enriched data
└── contacts-2025-12-23T12-00-00-000Z.json         # Legacy format
```

### Raw Scrape Output

**File:** `output/scrape-{domain}-{timestamp}.json`

```json
{
  "metadata": {
    "url": "https://example.com/directory",
    "domain": "example.com",
    "scrapedAt": "2025-12-23T12:00:00.000Z",
    "totalContacts": 150
  },
  "contacts": [
    {
      "name": "John Smith",
      "email": "jsmith@example.com",
      "phone": "+1-212-555-1234",
      "title": "Partner",
      "location": "New York, NY",
      "profileUrl": "https://example.com/people/john-smith"
    }
  ]
}
```

### Enriched Output

**File:** `output/scrape-{domain}-{timestamp}-enriched.json`

```json
{
  "metadata": {
    "url": "https://example.com/directory",
    "domain": "example.com",
    "scrapedAt": "2025-12-23T12:00:00.000Z",
    "enrichedAt": "2025-12-23T12:30:00.000Z",
    "totalContacts": 150
  },
  "contacts": [
    {
      "name": "John Smith",
      "email": "jsmith@example.com",
      "phone": "+1-212-555-1234",
      "title": "Partner",
      "location": "New York, NY",
      "profileUrl": "https://example.com/people/john-smith",
      "domain": "example.com",
      "domainType": "business",
      "confidence": "high",
      "_enrichment": {
        "enrichedAt": "2025-12-23T12:30:00.000Z",
        "actions": {
          "name": "VALIDATED",
          "email": "ENRICHED",
          "phone": "VALIDATED",
          "title": "CLEANED"
        },
        "changes": {
          "title": {
            "before": "PartnerNew York",
            "after": "Partner",
            "reason": "Removed contamination: New York"
          }
        }
      }
    }
  ]
}
```

### Log Files

**Directory:** `logs/`

```
logs/
├── scraper.log      # All logs (info, warn, error)
├── error.log        # Errors only
├── exceptions.log   # Uncaught exceptions
└── rejections.log   # Unhandled promise rejections
```

**Log Format:**
```
2025-12-23 12:00:00 [INFO]: Browser launched successfully
2025-12-23 12:00:05 [INFO]: Loaded config: example-com (v2.3)
2025-12-23 12:00:10 [INFO]: Extracted 150 contacts
2025-12-23 12:00:15 [ERROR]: Failed to enrich contact: Network timeout
```

---

## Config File Structure

### Location
```
configs/website-configs/{domain}.json
```

Example: `configs/website-configs/example-com.json`

### Config Schema (v2.3)

```json
{
  "version": "2.3",
  "selectionMethod": "manual-validated",
  "name": "example-com",
  "domain": "example.com",
  "sourceUrl": "https://example.com/directory",
  "generatedAt": "2025-12-23T12:00:00.000Z",

  "cardPattern": {
    "primarySelector": ".person-card",
    "sampleDimensions": {
      "width": 300,
      "height": 200
    },
    "fallbackSelectors": [
      ".contact-card",
      ".profile-item"
    ]
  },

  "fields": {
    "name": {
      "required": true,
      "userValidatedMethod": "coordinate-text",
      "coordinates": {
        "x": 10,
        "y": 20,
        "width": 150,
        "height": 30
      },
      "selector": ".person-name",
      "sampleValue": "John Smith"
    },
    "email": {
      "required": false,
      "userValidatedMethod": "mailto-link",
      "coordinates": {
        "x": 10,
        "y": 60,
        "width": 200,
        "height": 20
      },
      "selector": "a[href^='mailto:']",
      "sampleValue": "jsmith@example.com"
    },
    "phone": {
      "required": false,
      "userValidatedMethod": "tel-link",
      "coordinates": {
        "x": 10,
        "y": 90,
        "width": 150,
        "height": 20
      },
      "selector": "a[href^='tel:']",
      "sampleValue": "+1-212-555-1234"
    },
    "title": {
      "required": false,
      "userValidatedMethod": "coordinate-text",
      "coordinates": {
        "x": 10,
        "y": 120,
        "width": 150,
        "height": 20
      },
      "selector": ".title",
      "sampleValue": "Partner"
    },
    "location": {
      "required": false,
      "userValidatedMethod": "coordinate-text",
      "coordinates": {
        "x": 10,
        "y": 150,
        "width": 150,
        "height": 20
      },
      "selector": ".location",
      "sampleValue": "New York, NY"
    },
    "profileUrl": {
      "required": false,
      "userValidatedMethod": "parent-href",
      "coordinates": {
        "x": 10,
        "y": 20,
        "width": 150,
        "height": 30
      },
      "selector": "a.profile-link",
      "sampleValue": "https://example.com/people/john-smith"
    }
  },

  "pagination": {
    "paginationType": "infinite-scroll",
    "enabled": true,
    "notes": "Uses Selenium PAGE_DOWN simulation"
  }
}
```

### Field Extraction Methods

| Method | Description | Use Case |
|--------|-------------|----------|
| `coordinate-text` | Extract text from specific coordinates | Name, title, location |
| `mailto-link` | Extract from mailto: link | Email |
| `tel-link` | Extract from tel: link | Phone |
| `parent-href` | Extract href from parent anchor | Profile URL |
| `selector-text` | Extract text using CSS selector | Fallback for text fields |
| `selector-href` | Extract href using CSS selector | Fallback for links |

### Pagination Types

| Type | Description | Scraper |
|------|-------------|---------|
| `single-page` | No pagination | SinglePageScraper |
| `pagination` | Traditional multi-page | PaginationScraper |
| `infinite-scroll` | Dynamic loading | InfiniteScrollScraper (Selenium) |

---

## NPM Scripts

```bash
# Start orchestrator
npm start

# Run all tests
npm test

# Enrichment tests only (68 test cases)
npm run test:enrichment

# Post-cleaning tests only (41 test cases)
npm run test:post-clean

# Selenium infinite scroll test
npm run test:selenium

# Navigation tests (pagination & scroll)
npm run test:nav
npm run test:nav:scroll       # Scroll tests only
npm run test:nav:page         # Pagination tests only
npm run test:nav:quick        # Quick test suite
npm run test:nav:verbose      # Detailed output
```

---

## Best Practices

### 1. Always Validate First
```bash
# Before running a full scrape, validate the config
node orchestrator.js --validate --url "..." --limit 5
```

### 2. Use Limits During Testing
```bash
# Test with small limits first
node orchestrator.js --url "..." --limit 10
```

### 3. Monitor Logs
```bash
# Watch logs in real-time
tail -f logs/scraper.log
```

### 4. Use Visible Mode for Debugging
```bash
# See what's happening
node orchestrator.js --url "..." --headless false --verbose
```

### 5. Save Partial Results
The system automatically saves partial results if interrupted. Resume using:
```bash
# For pagination
node orchestrator.js --url "..." --paginate --start-page 5

# For enrichment
node src/tools/enrich-contacts.js --input output/scrape.json --resume-from 50
```

---

**Last Updated:** 2025-12-23

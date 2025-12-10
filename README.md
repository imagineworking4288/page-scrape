# Page Scrape - Universal Professional Directory Scraper

A powerful, enterprise-grade web scraping platform for extracting contact information from professional directories. Features visual config generation, intelligent pagination handling, profile enrichment, and Google Sheets export.

## Key Features

- **Visual Config Generator (v2.3)**: Interactive 4-layer detection with click-to-select field mapping
- **Infinite Scroll Support**: Selenium PAGE_DOWN simulation for dynamic loading sites
- **Profile Enrichment**: Automated profile page visits to validate and fill missing data
- **Multi-Method Extraction**: DOM-based, coordinate-based, mailto/tel link detection, OCR fallback
- **Smart Pagination**: Auto-detection of pagination patterns (URL-based, offset, infinite scroll)
- **Google Sheets Export**: Direct export with configurable columns and auto-formatting
- **Full Pipeline Workflow**: End-to-end automation from config generation to export
- **Anti-Detection**: Stealth browser configuration with random user agents

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Installation](#installation)
3. [Workflows](#workflows)
   - [Full Pipeline (Recommended)](#full-pipeline-recommended)
   - [Config Validation](#config-validation)
   - [Config Generation](#config-generation)
   - [Scraping](#scraping)
   - [Enrichment](#enrichment)
   - [Export](#export)
4. [CLI Reference](#cli-reference)
5. [Configuration](#configuration)
6. [Architecture](#architecture)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### 1. Validate an Existing Config (Recommended First Step)

Test that a site config works before running a full scrape:

```bash
node orchestrator.js --validate --url "https://www.sullcrom.com/lawyers" --limit 2
```

### 2. Run Full Pipeline (Complete Workflow)

Process a site from start to finish with a single command:

```bash
# Interactive mode (prompts at each stage)
node orchestrator.js --full-pipeline --url "https://example.com/directory"

# Auto mode (no prompts)
node orchestrator.js --full-pipeline --url "https://example.com/directory" --auto
```

### 3. Generate a New Config

Create a site-specific config using the visual generator:

```bash
node src/tools/config-generator.js --url "https://example.com/directory"
```

### 4. Scrape with an Existing Config

```bash
# Single page
node orchestrator.js --url "https://example.com/directory" --method config

# With pagination
node orchestrator.js --url "https://example.com/directory" --method config --paginate --max-pages 10

# Infinite scroll sites
node orchestrator.js --url "https://example.com/directory" --method config --scroll
```

---

## Installation

### Prerequisites

- **Node.js** 18+ (recommended: 20+)
- **Chrome** browser (for Selenium infinite scroll)
- **Google Sheets API credentials** (optional, for export)

### Setup

```bash
# Clone the repository
git clone <repository-url>
cd page-scrape

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your settings (optional)
# - Google Sheets credentials for export
# - Other API keys if needed
```

### Verify Installation

```bash
# Run the help command
node orchestrator.js --help

# Or use the interactive start script (Windows)
start.bat
```

---

## Workflows

### Full Pipeline (Recommended)

The full pipeline chains all stages: **Config Check → Scraping → Enrichment → Export**

```bash
# Interactive mode - prompts at each stage
node orchestrator.js --full-pipeline --url "https://example.com/directory"

# Auto mode - runs all stages without prompts
node orchestrator.js --full-pipeline --url "URL" --auto

# Skip config generation (use existing config)
node orchestrator.js --full-pipeline --url "URL" --skip-config-gen --auto

# Skip enrichment
node orchestrator.js --full-pipeline --url "URL" --no-enrich --auto

# Limit contacts and export to Google Sheets
node orchestrator.js --full-pipeline --url "URL" --limit 100 --output sheets --auto
```

**Workflow Stages:**

1. **Config Check**: Verifies config exists or runs config generator
2. **Scraping**: Extracts contacts using the appropriate method (auto-detects infinite scroll)
3. **Enrichment**: Visits profile pages to validate/fill missing data
4. **Export**: Saves to JSON, CSV, or Google Sheets

### Config Validation

Quick test to verify a config works before running a full scrape:

```bash
# Quick validation (2 contacts)
node src/tools/validate-config.js --url "https://example.com/directory"

# Thorough validation
node src/tools/validate-config.js --url "URL" --limit 10 --verbose

# Skip enrichment testing
node src/tools/validate-config.js --url "URL" --no-enrich

# Via orchestrator
node orchestrator.js --validate --url "URL" --limit 5
```

**Validation Checks:**
- Config existence and structure
- Card selector functionality
- Field extraction accuracy
- Data quality (contamination detection)
- Profile enrichment (optional)

### Config Generation

Create site-specific configs using the visual generator:

```bash
# Basic usage
node src/tools/config-generator.js --url "https://example.com/directory"

# Debug mode (visible browser)
node src/tools/config-generator.js --url "URL" --verbose
```

**Process:**
1. Opens browser in visible mode
2. User draws rectangle around a contact card
3. System finds similar cards on the page
4. User clicks on each field (name, email, phone, etc.)
5. System tests multiple extraction methods
6. User validates best extraction method for each field
7. Config saved to `configs/website-configs/{domain}.json`

### Scraping

Extract contacts using a saved config:

```bash
# Single page extraction
node orchestrator.js --url "URL" --method config

# With traditional pagination
node orchestrator.js --url "URL" --method config --paginate --max-pages 20

# Infinite scroll sites (Selenium PAGE_DOWN)
node orchestrator.js --url "URL" --method config --scroll

# With contact limit
node orchestrator.js --url "URL" --method config --limit 100

# Visible browser (for debugging)
node orchestrator.js --url "URL" --method config --headless false
```

### Enrichment

Validate and fill missing data by visiting profile pages:

```bash
# Basic enrichment
node src/tools/enrich-contacts.js --input output/scrape.json

# With verbose output
node src/tools/enrich-contacts.js --input output/scrape.json --verbose

# Limit contacts (for testing)
node src/tools/enrich-contacts.js --input output/scrape.json --limit 10

# Resume from specific contact
node src/tools/enrich-contacts.js --input output/scrape.json --resume-from 50

# Only core fields (skip bio, education, etc.)
node src/tools/enrich-contacts.js --input output/scrape.json --core-fields-only
```

**Enrichment Actions:**
- `ENRICHED`: Original missing, profile has data
- `VALIDATED`: Exact match confirmed
- `CLEANED`: Contaminated data fixed (e.g., "John DoePartner" → "John Doe")
- `REPLACED`: Mismatch resolved (flagged for review)

### Export

Export contacts to Google Sheets:

```bash
# Default columns (Name, Email, Phone, Title, Location, Profile URL)
node src/tools/export-to-sheets.js --input output/enriched.json --name "My Contacts"

# Only core fields
node src/tools/export-to-sheets.js --input output/enriched.json --core-only

# Specific columns
node src/tools/export-to-sheets.js --input output/enriched.json --columns name,email,phone

# Include enrichment metadata
node src/tools/export-to-sheets.js --input output/enriched.json --include-enrichment
```

---

## CLI Reference

### orchestrator.js (Main Entry Point)

```bash
node orchestrator.js [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-u, --url <url>` | Target URL (required) | - |
| `-m, --method <type>` | Extraction method: `html\|pdf\|hybrid\|select\|config` | `hybrid` |
| `-c, --config <name>` | Config name for `--method config` | auto-detect |
| `-l, --limit <n>` | Maximum contacts to extract | unlimited |
| `--headless <bool>` | Browser visibility | `true` |
| `--paginate` | Enable pagination handling | `false` |
| `--max-pages <n>` | Maximum pages to scrape | unlimited |
| `--scroll` | Enable infinite scroll handling | `false` |
| `--output <format>` | Output format: `json\|csv\|sheets\|all` | `json` |

**Full Pipeline Options:**

| Option | Description |
|--------|-------------|
| `--full-pipeline` | Run complete workflow: config → scrape → enrich → export |
| `--auto` | Skip confirmation prompts |
| `--skip-config-gen` | Use existing config, don't generate |
| `--no-enrich` | Skip enrichment stage |
| `--no-export` | Skip export stage |

**Validation Options:**

| Option | Description |
|--------|-------------|
| `--validate` | Run validation tool |
| `-v, --verbose` | Detailed output |

### Tools

| Tool | Purpose | Usage |
|------|---------|-------|
| `config-generator.js` | Visual config creation | `node src/tools/config-generator.js --url "URL"` |
| `validate-config.js` | Quick config testing | `node src/tools/validate-config.js --url "URL"` |
| `test-config.js` | Config extraction test | `node src/tools/test-config.js domain-name --limit 5` |
| `enrich-contacts.js` | Profile enrichment | `node src/tools/enrich-contacts.js --input file.json` |
| `export-to-sheets.js` | Google Sheets export | `node src/tools/export-to-sheets.js --input file.json` |

---

## Configuration

### Environment Variables (.env)

```bash
# Google Sheets API (optional)
GOOGLE_SHEETS_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id
```

### Site Configs (v2.3)

Configs are stored in `configs/website-configs/{domain}.json`:

```json
{
  "version": "2.3",
  "selectionMethod": "manual-validated",
  "name": "example-com",
  "domain": "example.com",
  "sourceUrl": "https://example.com/directory",

  "cardPattern": {
    "primarySelector": ".person-card",
    "sampleDimensions": { "width": 300, "height": 200 }
  },

  "fields": {
    "name": {
      "required": true,
      "userValidatedMethod": "coordinate-text",
      "coordinates": { "x": 10, "y": 20, "width": 150, "height": 30 },
      "sampleValue": "John Smith"
    },
    "email": {
      "userValidatedMethod": "mailto-link",
      "coordinates": { "x": 10, "y": 60, "width": 200, "height": 20 }
    }
  },

  "pagination": {
    "paginationType": "infinite-scroll"
  }
}
```

---

## Architecture

### Project Structure

```
page-scrape/
├── orchestrator.js              # Main CLI entry point
├── configs/
│   ├── _default.json           # Default fallback config
│   └── website-configs/        # Site-specific configs
├── src/
│   ├── core/                   # Core infrastructure
│   │   ├── browser-manager.js  # Puppeteer browser
│   │   ├── selenium-manager.js # Selenium for infinite scroll
│   │   ├── rate-limiter.js     # Request throttling
│   │   └── logger.js           # Winston logging
│   │
│   ├── workflows/              # High-level orchestrators
│   │   └── full-pipeline.js    # Full pipeline workflow
│   │
│   ├── scrapers/               # Scraping implementations
│   │   ├── config-scraper.js   # Main config-based scraper
│   │   └── config-scrapers/    # Specialized scrapers
│   │       ├── infinite-scroll-scraper.js
│   │       ├── pagination-scraper.js
│   │       └── single-page-scraper.js
│   │
│   ├── features/
│   │   ├── enrichment/         # Profile enrichment system
│   │   ├── pagination/         # Pagination handling
│   │   └── export/             # Google Sheets export
│   │
│   ├── extraction/             # Field extraction
│   │   └── extractors/         # Email, phone, link extractors
│   │
│   ├── utils/                  # Utilities
│   │   └── prompt-helper.js    # Terminal UI utilities
│   │
│   └── tools/                  # CLI tools
│       ├── config-generator.js
│       ├── validate-config.js
│       ├── enrich-contacts.js
│       └── export-to-sheets.js
│
├── output/                     # Scraped data output
└── logs/                       # Log files
```

### Extraction Methods

The system uses a 4-layer detection strategy:

1. **Direct Hit**: Click point directly on mailto/tel link
2. **Text-Triggered**: "Email" keyword triggers nearby mailto search
3. **Expanded Area**: Search ±100px region for links
4. **Fallback**: Regex extraction or OCR

### Infinite Scroll

All infinite scroll uses **Selenium PAGE_DOWN key simulation**:
- More reliable than Puppeteer wheel events
- Tested: 584 contacts extracted vs 10 with Puppeteer
- Auto-detected from config version and selectionMethod

---

## Output Format

### Contact JSON

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
    "enrichedAt": "2025-12-10T...",
    "actions": {
      "name": "CLEANED",
      "email": "ENRICHED",
      "phone": "VALIDATED"
    }
  }
}
```

---

## Troubleshooting

### Common Issues

**Config not found:**
```bash
# Generate a new config
node src/tools/config-generator.js --url "https://example.com/directory"
```

**No contacts extracted:**
```bash
# Run validation with visible browser
node src/tools/validate-config.js --url "URL" --show --verbose
```

**Infinite scroll not loading:**
- Ensure Chrome is installed (system Chrome, not bundled)
- Try increasing scroll delay: `--scroll-delay 600`
- Check max retries: `--max-retries 30`

**Google Sheets export fails:**
1. Verify `.env` credentials are correct
2. Ensure spreadsheet is shared with service account email
3. Check that Google Sheets API is enabled in GCP console

### Logs

- Main log: `logs/scraper.log`
- Error log: `logs/error.log`
- Verbose logging: Add `--verbose` flag

---

## Testing

```bash
# Run basic tests
npm test

# Test enrichment system (68 test cases)
node tests/enrichment-test.js

# Test post-cleaning (41 test cases)
node tests/post-cleaning-test.js

# Test Selenium infinite scroll
node tests/selenium-infinite-scroll.test.js
```

---

## License

MIT License

---

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review logs in `logs/` directory
3. Run with `--verbose` for detailed output
4. Open an issue on GitHub with log output

# Universal Professional Directory Scraper

A powerful web scraping tool for extracting contact information from professional directories with high accuracy.

## Features

- **Dual Extraction Methods**: Choose between Node.js (fast) or Python (accurate)
- **Coordinate-Based PDF Extraction**: Python scraper prevents cross-contamination using spatial search
- **HTML-First Approach**: Intelligent fallback from HTML → PDF when needed
- **Domain Classification**: Automatic business vs personal email detection
- **Anti-Detection**: Stealth browser settings to avoid blocking
- **Multiple Output Formats**: JSON and CSV support

## Quick Start

### Node.js Scraper (Fast)

```bash
npm install
node orchestrator.js --url "https://www.compass.com/agents/locations/manhattan-ny/21425/" --limit 20
```

### Python Scraper (Recommended for Accuracy)

```bash
# Install Python dependencies
pip install -r python_scraper/requirements.txt
playwright install chromium

# Run scraper
python -m python_scraper.cli --url "https://www.compass.com/agents/locations/manhattan-ny/21425/" --limit 20
```

Or via orchestrator:

```bash
node orchestrator.js --url "https://www.compass.com/agents/locations/manhattan-ny/21425/" --use-python --limit 20
```

## Python PDF Scraper (Recommended)

The Python scraper uses coordinate-based extraction for better accuracy. It solves the cross-contamination problem where names from different contacts get mixed up.

### Why Python Scraper?

**Node.js PDF Scraper (Linear):**
- Extracts text line-by-line without spatial awareness
- ~60% name extraction accuracy
- Cross-contamination issues (wrong name paired with wrong email)

**Python PDF Scraper (Coordinate-Based):**
- Extracts text with X/Y coordinates
- >85% name extraction accuracy
- No cross-contamination (bounded spatial search)

### Installation

```bash
pip install -r python_scraper/requirements.txt
playwright install chromium
```

### Usage

```bash
python -m python_scraper.cli --url "URL" --limit 20
```

**Options:**
```
--url, -u           Target URL (required)
--limit, -l         Limit contacts (optional)
--output, -o        Format: json|csv (default: json)
--headless          Browser mode: true|false (default: true)
--keep              Keep PDF files
--log-level         Logging: DEBUG|INFO|WARN|ERROR
```

### Testing

```bash
python -m python_scraper.test_scraper \
  --urls "https://www.compass.com/agents/locations/manhattan-ny/21425/" \
  --limit 20
```

See [python_scraper/README.md](python_scraper/README.md) for detailed documentation.

## Pagination Testing

Test pagination patterns before scraping multiple pages:

```bash
# Comprehensive pagination analysis
node tests/pagination-test.js --url "https://site.com/agents/" --save-cache

# Quick validation (5 pages)
node tests/pagination-test.js --url "URL" --validate-sample 5

# Export results for analysis
node tests/pagination-test.js --url "URL" --output results.json
```

See [tests/README.md](tests/README.md) for detailed documentation.

### Using Pagination

After validating pagination patterns:

```bash
# Scrape multiple pages
node orchestrator.js --url "URL" --method select --paginate --max-pages 10

# Start from specific page (resume)
node orchestrator.js --url "URL" --method select --paginate --start-page 5

# Discover pattern only (no scraping)
node orchestrator.js --url "URL" --method select --paginate --discover-only
```

## Node.js Scraper

Fast HTML-first extraction with PDF fallback.

### Installation

```bash
npm install
```

### Usage

```bash
node orchestrator.js --url "URL" [options]
```

**Options:**
```
-u, --url <url>              Target URL (required)
-l, --limit <number>         Limit contacts
-m, --method <type>          Method: html|pdf|hybrid (default: hybrid)
-o, --output <format>        Format: json|csv (default: json)
--headless <true|false>      Browser mode (default: true)
--keep                       Keep PDF files
--use-python                 Use Python scraper (recommended)
```

**Examples:**

```bash
# Basic scrape
node orchestrator.js --url "https://example.com/agents" --limit 20

# Use Python scraper for better accuracy
node orchestrator.js --url "https://example.com/agents" --use-python --limit 20

# Visible browser
node orchestrator.js --url "https://example.com/agents" --headless false --limit 10
```

## Project Structure

```
page-scrape/
├── orchestrator.js           # Main Node.js CLI
├── scrapers/
│   ├── simple-scraper.js    # HTML-first scraper
│   └── pdf-scraper.js       # PDF-only scraper
├── python_scraper/          # ⭐ Python coordinate-based scraper
│   ├── cli.py              # Python CLI entry point
│   ├── pdf_extract.py      # Core extraction logic
│   ├── browser.py          # Playwright browser
│   ├── models.py           # Data structures
│   └── test_scraper.py     # Test script
├── utils/
│   ├── logger.js
│   ├── browser-manager.js
│   └── domain-extractor.js
├── output/                  # Output files
│   ├── contacts-*.json     # Contact data
│   └── pdfs/               # PDF files (if --keep)
└── logs/                    # Log files
```

## Output Format

Both scrapers produce consistent JSON output:

```json
{
  "metadata": {
    "scrapedAt": "2025-11-21T20:30:00.000Z",
    "url": "https://example.com/agents",
    "totalContacts": 20,
    "domainStats": {
      "businessEmailCount": 20,
      "topDomains": [...]
    }
  },
  "contacts": [
    {
      "name": "Brandon Abelard",
      "email": "brandon.abelard@compass.com",
      "phone": "+1-929-543-8528",
      "domain": "compass.com",
      "domainType": "business",
      "source": "pdf",
      "confidence": "high"
    }
  ]
}
```

## Performance Comparison

| Metric | Node.js Scraper | Python Scraper |
|--------|----------------|----------------|
| Speed | ~10-15 sec | ~15-30 sec |
| Name Accuracy | ~60% | >85% |
| Cross-Contamination | Yes | No |
| Memory | Lower | Higher |
| **Best For** | **Speed** | **Accuracy** |

## How Python Scraper Works

1. **PDF Rendering**: Renders webpage as PDF with Playwright
2. **Coordinate Extraction**: PDFPlumber extracts text with X/Y coordinates
3. **Email Detection**: Finds all emails using regex
4. **Spatial Search**: For each email:
   - Searches 60 pixels above for names
   - Searches 40 pixels below for phones
   - Within ±100 pixels horizontally
5. **Validation**: Filters UI elements using comprehensive blacklist
6. **Domain Classification**: Categorizes business vs personal emails

## Accuracy Features

### UI Element Blacklist

Filters out:
- Authentication (Sign In, Log In, Register)
- Actions (Contact Us, View Profile, Learn More)
- Form Labels (Name, Email, Phone)
- Locations (Manhattan, Brooklyn, NYC)
- Company Names (Compass, Compass One)
- Generic Terms (Agent, Broker, Team)

### Name Validation

- Must be 2-50 characters
- Must start with capital letter
- Must match pattern: `^[A-Z][a-zA-Z'\-\.\s]{1,48}[a-zA-Z]$`
- No UI words (find, agent, register)

### Phone Normalization

Formats: `+1-XXX-XXX-XXXX`

## Troubleshooting

### Python: Module not found

```bash
pip install -r python_scraper/requirements.txt
```

### Python: Playwright browser issues

```bash
playwright install --with-deps chromium
```

On Windows, run as Administrator.

### Node.js: Puppeteer issues

```bash
npm install
npx puppeteer browsers install chrome
```

### No contacts extracted

- Try `--headless false` to see the page
- Use `--keep` to inspect PDFs manually
- Check `logs/` for detailed error messages

## Development

### Running Tests

**Python tests:**
```bash
python -m python_scraper.test_scraper --urls "URL1" "URL2" --limit 20
```

**Node.js tests:**
```bash
node test-zone-extraction.js  # (if available)
```

### Logging

- Node.js logs: `logs/scraper.log`
- Python logs: `logs/python_scraper.log`

## License

MIT License

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with both scrapers
5. Submit a pull request

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review logs in `logs/` directory
3. Try with `--headless false` to debug visually
4. Open an issue with log output
# Site Configuration Files

Site-specific configuration files for the select scraping method. Each config defines extraction boundaries and parsing rules for a specific website.

## Config File Format

Each config file should be named `domain.json` (e.g., `compass.com.json`) and placed in this directory.

### Structure

```json
{
  "domain": "example.com",
  "name": "Human-Readable Site Name",
  "description": "Description of what this site contains",
  "markers": {
    "start": { /* Start boundary marker */ },
    "end": { /* End boundary marker */ }
  },
  "scrollBehavior": { /* Page scrolling settings */ },
  "parsing": { /* Text parsing rules */ }
}
```

## Marker Types

Markers define the extraction boundaries on the page. Two types are supported:

### Text Markers

Find visible text in the DOM and use its position as the boundary.

```json
{
  "type": "text",
  "value": "Agents Found"
}
```

**How it works:**
- Searches the page for the exact text string
- Uses the bounding rectangle of that text node
- Useful for headings, labels, or consistent UI elements

**Finding text markers:**
1. Open the page in your browser
2. Right-click and select "Inspect Element"
3. Use Ctrl+F (Cmd+F on Mac) in DevTools to search for text
4. Verify the text appears consistently on all pages

### Coordinate Markers

Use pixel coordinates (x, y) relative to the page to define the boundary.

```json
{
  "type": "coordinate",
  "value": {"x": 100, "y": 200}
}
```

**How it works:**
- Uses the exact pixel position on the page
- Coordinates are relative to the top-left corner (0, 0)
- Useful when text markers aren't reliable

**Finding coordinates:**
1. Open DevTools (F12)
2. Go to Console tab
3. Run this JavaScript:
```javascript
document.addEventListener('click', (e) => {
  console.log(`Clicked at x: ${e.pageX}, y: ${e.pageY}`);
});
```
4. Click on the page where you want the boundary
5. Note the coordinates from the console

### Mixed Markers

You can mix marker types - e.g., text start with coordinate end:

```json
{
  "markers": {
    "start": {
      "type": "text",
      "value": "Contact List"
    },
    "end": {
      "type": "coordinate",
      "value": {"x": 0, "y": 5000}
    }
  }
}
```

## Scroll Behavior

Controls page scrolling to load lazy-loaded content (infinite scroll, dynamic lists).

```json
{
  "scrollBehavior": {
    "enabled": true,        // Enable/disable scrolling
    "scrollDelay": 500,     // Wait time (ms) between scrolls
    "maxScrolls": 50        // Maximum scroll attempts
  }
}
```

**Settings:**
- `enabled`: Set to `false` for pages with no lazy loading
- `scrollDelay`: Increase for slower-loading pages (1000-2000ms)
- `maxScrolls`: Increase for very long lists (100+)

## Parsing Rules

Controls how text is parsed into contact records.

```json
{
  "parsing": {
    "emailDomain": "compass.com",  // Filter to specific domain (or null for all)
    "nameBeforeEmail": true        // Look for name above (true) or below (false) email
  }
}
```

**Settings:**
- `emailDomain`:
  - Set to specific domain (e.g., `"compass.com"`) to filter emails
  - Set to `null` to accept all email domains
- `nameBeforeEmail`:
  - `true`: Name appears above email in layout (most common)
  - `false`: Name appears below email

## Example Configs

### Example 1: Real Estate Directory

```json
{
  "domain": "remax.com",
  "name": "RE/MAX Agent Directory",
  "markers": {
    "start": {
      "type": "text",
      "value": "Find an Agent"
    },
    "end": {
      "type": "text",
      "value": "Load More Agents"
    }
  },
  "scrollBehavior": {
    "enabled": true,
    "scrollDelay": 1000,
    "maxScrolls": 30
  },
  "parsing": {
    "emailDomain": null,
    "nameBeforeEmail": true
  }
}
```

### Example 2: Corporate Directory (Fixed Layout)

```json
{
  "domain": "company.com",
  "name": "Company Employee Directory",
  "markers": {
    "start": {
      "type": "coordinate",
      "value": {"x": 0, "y": 300}
    },
    "end": {
      "type": "coordinate",
      "value": {"x": 0, "y": 3000}
    }
  },
  "scrollBehavior": {
    "enabled": false
  },
  "parsing": {
    "emailDomain": "company.com",
    "nameBeforeEmail": true
  }
}
```

## Creating a New Config

1. **Identify the domain**: Use the base domain (e.g., `example.com`)
2. **Find start marker**: Locate consistent text/position before the contact list
3. **Find end marker**: Locate consistent text/position after the contact list
4. **Test scroll behavior**: Check if the page uses lazy loading
5. **Verify email domain**: Check if all contacts use the same email domain
6. **Create the file**: Name it `domain.json` and place it in `configs/`
7. **Test**: Run the scraper with `--method select` to verify

## Troubleshooting

### Marker not found
- **Text markers**: Text might be dynamic or in an iframe
- **Solution**: Try coordinate markers or adjust the text string

### Wrong content extracted
- **Issue**: Markers are too broad or too narrow
- **Solution**: Adjust marker positions, use more specific text

### Missing contacts
- **Issue**: Content loaded dynamically after markers found
- **Solution**: Increase `scrollDelay` or `maxScrolls`

### Too much content extracted
- **Issue**: End marker is too far down the page
- **Solution**: Find a marker closer to the contact list end

## Testing Your Config

```bash
# Test with the select method
node orchestrator.js --url "https://www.compass.com/agents/locations/manhattan-ny/" --method select --limit 10

# Keep PDF for debugging
node orchestrator.js --url "https://example.com/directory" --method select --keep --limit 5
```

## Best Practices

1. **Use text markers when possible** - More reliable across page changes
2. **Test on multiple pages** - Verify markers work for different queries
3. **Start narrow** - Begin with tight boundaries, expand if needed
4. **Document your choices** - Add descriptive `description` field
5. **Version control** - Commit config files to track changes

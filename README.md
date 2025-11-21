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

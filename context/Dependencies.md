# Dependencies

**Last Updated**: December 22, 2025
**Package Manager**: npm

---

## Production Dependencies

### Browser Automation

| Package | Version | Purpose |
|---------|---------|---------|
| `puppeteer` | `^21.11.0` | Headless Chrome browser automation |
| `puppeteer-extra` | `^3.3.6` | Plugin support for Puppeteer |
| `puppeteer-extra-plugin-stealth` | `^2.11.2` | Avoid bot detection |
| `selenium-webdriver` | `^4.39.0` | WebDriver for infinite scroll (PAGE_DOWN) |

### Data Processing

| Package | Version | Purpose |
|---------|---------|---------|
| `cheerio` | `^1.1.2` | HTML parsing (jQuery-like) |
| `pdf-parse` | `^1.1.4` | PDF text extraction |
| `tesseract.js` | `^6.0.1` | OCR for screenshot-based extraction |

### External Services

| Package | Version | Purpose |
|---------|---------|---------|
| `googleapis` | `^128.0.0` | Google Sheets API for export |

### Utilities

| Package | Version | Purpose |
|---------|---------|---------|
| `commander` | `^11.1.0` | CLI argument parsing |
| `dotenv` | `^16.3.1` | Environment variable loading |
| `winston` | `^3.18.3` | Logging with file and console output |
| `cli-table3` | `^0.6.3` | CLI table formatting |

---

## Dev Dependencies

None currently.

---

## Key Package Notes

### puppeteer vs selenium-webdriver
- **Puppeteer**: Primary browser for most scraping (faster, easier API)
- **Selenium**: Used only for infinite scroll sites that need PAGE_DOWN simulation

### puppeteer-extra-plugin-stealth
Required to avoid detection on sites with bot protection. Automatically patches various browser fingerprinting techniques.

### tesseract.js
Used for OCR-based extraction when text is rendered as images. Requires `eng.traineddata` file in project root.

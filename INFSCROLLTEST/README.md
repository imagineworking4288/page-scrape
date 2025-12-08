# Selenium PAGE_DOWN Infinite Scroll Scraper

A reliable infinite scroll scraper using Selenium WebDriver with PAGE_DOWN key simulation.

## Why PAGE_DOWN Instead of scrollBy()?

Traditional infinite scroll scrapers use `window.scrollBy()` which:
- Can be detected as bot behavior
- Doesn't always trigger lazy loading mechanisms
- May not fire scroll event handlers properly

This scraper uses **keyboard simulation** (`Key.PAGE_DOWN`) which:
- Mimics real user behavior
- Properly triggers all scroll event handlers
- Works reliably with lazy-loading content

## The Retry Logic (Key Innovation)

The core insight is simple: **page height only stops changing at the absolute bottom**.

```javascript
while (retries < maxRetries) {
  // Press PAGE_DOWN
  await body.sendKeys(Key.PAGE_DOWN);
  await driver.sleep(scrollDelay);

  // Check height
  const newHeight = await driver.executeScript('return document.body.scrollHeight');

  if (newHeight > lastHeight) {
    retries = 0;  // RESET - more content available!
    lastHeight = newHeight;
  } else {
    retries++;    // No change - might be at bottom
  }
}
```

By resetting the retry counter on ANY height change, we ensure we keep scrolling until we truly reach the bottom, even if there are temporary pauses in content loading.

## Installation

```bash
cd INFSCROLLTEST
npm install
```

This will install `selenium-webdriver`. You also need Chrome installed on your system.

## Usage

### As a Module

```javascript
const { scrapeWithScroll, extractLinks } = require('./selenium-scraper');

const result = await scrapeWithScroll('https://example.com/infinite-list', {
  headless: false,    // Watch the browser
  scrollDelay: 300,   // ms between PAGE_DOWN presses
  maxRetries: 15,     // Stop after 15 consecutive no-height-change
  maxScrolls: 1000,   // Safety limit
  outputFile: 'output.html'
});

if (result.success) {
  const links = extractLinks(result.html, '/items/');
  console.log(`Found ${links.length} items`);
}
```

### Run Tests

```bash
# Main test - scrapes Sullivan & Cromwell lawyer listing
npm test

# Verify Python-equivalent behavior
npm run test:python

# Compare different configurations
npm run compare
```

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `scrollDelay` | 300 | Milliseconds between PAGE_DOWN presses |
| `maxRetries` | 15 | Stop after N consecutive no-height-change attempts |
| `maxScrolls` | 1000 | Maximum total scroll attempts (safety limit) |
| `headless` | false | Run browser in headless mode |
| `outputFile` | null | Save final HTML to file |
| `verbose` | true | Log progress to console |

## API Reference

### scrapeWithScroll(url, options)

Main entry point. Navigates to URL, scrolls to load all content, returns HTML.

**Returns:**
```javascript
{
  success: boolean,
  html: string,        // Full page HTML after scrolling
  stats: {
    scrollCount: number,
    heightChanges: number,
    finalHeight: number,
    stopReason: string,
    retriesAtEnd: number
  }
}
```

### extractLinks(html, pattern)

Extract unique links matching a pattern from HTML.

```javascript
const lawyerLinks = extractLinks(html, '/lawyers/');
// Returns: ['/lawyers/john-doe', '/lawyers/jane-smith', ...]
```

### countElements(html, tagOrClass)

Count elements by tag name or class in HTML.

```javascript
const count = countElements(html, 'lawyer-card');
```

## Test Files

| File | Purpose |
|------|---------|
| `test-retry-logic.js` | Main test against Sullivan & Cromwell (expects 500+ lawyers) |
| `test-python-equivalent.js` | Verifies behavior matches Python reference implementation |
| `test-compare-methods.js` | Compares different scroll configurations |

## Project Structure

```
INFSCROLLTEST/
├── selenium-scraper.js      # Core scraper module
├── test-retry-logic.js      # Main test
├── test-python-equivalent.js # Behavior verification
├── test-compare-methods.js  # Configuration comparison
├── package.json
└── README.md
```

## Troubleshooting

### Chrome not found
Make sure Chrome is installed on your system. Selenium uses your installed Chrome browser.

### Scroll stops too early
- Increase `maxRetries` (e.g., 20 or 25)
- Increase `scrollDelay` (e.g., 500ms) if content loads slowly

### Taking too long
- Decrease `scrollDelay` (e.g., 200ms)
- Use `headless: true` for faster execution

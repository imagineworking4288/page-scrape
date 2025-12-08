# Infinite Scroll Loader

A Node.js module for loading infinite scroll websites using Puppeteer.

## Installation

```bash
cd INFSCROLLTEST
npm install
```

## Quick Start - Simple Approach (Recommended)

The simplest way to scrape infinite scroll pages:

```bash
node test-simple.js
```

### Simple Scraper Usage

```javascript
const { scrapeInfiniteScroll, extractLinks } = require('./simple-scraper');

const result = await scrapeInfiniteScroll('https://example.com', {
  headless: false,       // Watch the browser
  scrollDelay: 300,      // ms between scrolls
  scrollStep: 500,       // pixels per scroll
  outputFile: 'output.html'
});

// Extract links from result
const links = extractLinks(result.html, '/lawyers/');
console.log(`Found ${links.length} lawyer links`);
```

### Simple Scraper Options

| Option | Default | Description |
|--------|---------|-------------|
| `headless` | true | Run browser without window |
| `scrollDelay` | 500 | Milliseconds between scroll steps |
| `scrollStep` | 500 | Pixels to scroll each step |
| `outputFile` | null | Save HTML to file |
| `viewport` | {width: 1920, height: 1080} | Browser viewport |
| `timeout` | 300000 | Max runtime (5 minutes) |

## Advanced Approach

For more control, use the full orchestrator in `src/`:

```javascript
const { InfiniteScrollOrchestrator } = require('./src/index');

const orchestrator = new InfiniteScrollOrchestrator();
const result = await orchestrator.loadWithOptions('https://example.com', {
  itemSelector: '.item',
  detectionMethod: 'itemCount',
  maxScrollAttempts: 100
});
```

See `test-sullcrom.js` for a full example.

## Test Files

| File | Description |
|------|-------------|
| `test-simple.js` | Simple scraper test (recommended) |
| `test-sullcrom.js` | Advanced orchestrator test |
| `test-sullcrom-debug.js` | Debug test (20 scrolls only) |

## Project Structure

```
INFSCROLLTEST/
├── simple-scraper.js     # Simple approach (recommended)
├── test-simple.js        # Test simple scraper
├── test-sullcrom.js      # Test advanced scraper
├── src/                  # Advanced implementation
│   ├── index.js
│   ├── cli.js
│   ├── config/
│   ├── adapters/
│   ├── engine/
│   ├── orchestrator/
│   └── utils/
├── test/
└── examples/
```

## Troubleshooting

### Browser doesn't launch
```bash
npm install puppeteer
```

### Scroll stops too early
- Increase `scrollDelay` to wait longer for content
- Check if page uses a custom scroll container

### Not finding all items
- Some sites load content via AJAX after scroll
- Try increasing wait times

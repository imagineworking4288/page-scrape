# Infinite Scroll Loader

A standalone Node.js module for loading infinite scroll websites using Puppeteer. Designed to handle dynamic content loading patterns including infinite scroll and "load more" buttons.

## Installation

```bash
cd INFSCROLLTEST
npm install
```

## Quick Start

### CLI Usage

```bash
# Basic usage
node src/cli.js https://example.com -s ".item-selector"

# With config file
node src/cli.js https://example.com -c ./examples/infinite-scroll.yaml -o output.html

# With CLI options
node src/cli.js https://example.com \
  --selector ".list-item" \
  --max-scrolls 50 \
  --timeout 120 \
  --headless true \
  --output results.html
```

### Programmatic Usage

```javascript
const { InfiniteScrollOrchestrator, loadInfiniteScroll } = require('./src/index');

// Simple one-liner
const result = await loadInfiniteScroll('https://example.com', {
  itemSelector: '.list-item',
  maxScrollAttempts: 50,
  maxDurationSeconds: 120
});

console.log(`Loaded ${result.stats.finalItemCount} items`);
console.log(result.html);

// Or with full control
const orchestrator = new InfiniteScrollOrchestrator();
const result = await orchestrator.loadPage('https://example.com', './config.yaml');
```

## Configuration

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `itemSelector` | string | null | **Required**. CSS selector for content items |
| `scrollContainer` | string | 'window' | Scroll container ('window' or CSS selector) |
| `maxScrollAttempts` | number | 100 | Maximum scroll iterations |
| `maxDurationSeconds` | number | 300 | Maximum run time in seconds |
| `scrollAmount` | object | {min: 300, max: 800} | Random scroll distance range |
| `progressTimeout` | number | 3 | Seconds without progress before stopping |
| `detectionMethod` | string | 'itemCount' | 'itemCount', 'scrollHeight', or 'sentinel' |
| `sentinelSelector` | string | null | End-of-content element selector |
| `loadMoreSelectors` | array | [] | Array of "load more" button selectors |
| `loadMoreClickDelay` | object | {min: 1000, max: 2000} | Delay range before clicking |
| `maxLoadMoreClicks` | number | 50 | Maximum button clicks |
| `waitAfterScroll` | object | {min: 500, max: 1500} | Wait time after each scroll |
| `waitForContent` | number | 2000 | Wait for content to load (ms) |
| `headless` | boolean | true | Run browser in headless mode |
| `viewport` | object | {width: 1920, height: 1080} | Browser viewport size |
| `userAgent` | string | null | Custom user agent |
| `logLevel` | string | 'info' | Logging level |

### Example Config Files

**YAML** (examples/infinite-scroll.yaml):
```yaml
itemSelector: ".lawyer-card"
scrollContainer: window
maxScrollAttempts: 100
maxDurationSeconds: 300
detectionMethod: itemCount
progressTimeout: 5
waitAfterScroll:
  min: 500
  max: 1500
headless: true
```

**JSON** (examples/load-more.json):
```json
{
  "itemSelector": ".result-item",
  "loadMoreSelectors": [".load-more-btn", "button.show-more"],
  "maxLoadMoreClicks": 30,
  "detectionMethod": "itemCount"
}
```

## CLI Options

```
Usage: infinite-scroll-loader [options] <url>

Load infinite scroll websites to completion

Arguments:
  url                          URL to load

Options:
  -c, --config <path>          Path to config file (YAML or JSON)
  -o, --output <path>          Save HTML to file
  -s, --selector <selector>    CSS selector for items to count
  --headless <boolean>         Run browser in headless mode (default: "true")
  --max-scrolls <number>       Maximum scroll attempts (default: "100")
  --timeout <seconds>          Maximum duration in seconds (default: "300")
  --progress-timeout <seconds> Stop after N seconds without progress (default: "3")
  --detection <method>         Detection method: itemCount, scrollHeight, sentinel
  --load-more <selectors>      Comma-separated load more button selectors
  -v, --verbose                Enable verbose logging
  -q, --quiet                  Suppress all output except errors
  -h, --help                   Display help
  -V, --version                Display version
```

## Detection Methods

### 1. Item Count (default)
Counts elements matching `itemSelector`. Stops when count stops increasing.

```javascript
{
  itemSelector: '.product-card',
  detectionMethod: 'itemCount'
}
```

### 2. Scroll Height
Monitors page scroll height. Stops when height stops increasing.

```javascript
{
  detectionMethod: 'scrollHeight'
}
```

### 3. Sentinel
Looks for an "end of content" element.

```javascript
{
  detectionMethod: 'sentinel',
  sentinelSelector: '.no-more-results'
}
```

## Testing

```bash
# Run unit tests
npm run test:unit

# Run integration tests (requires internet)
npm test
```

## Project Structure

```
INFSCROLLTEST/
├── src/
│   ├── index.js              # Main exports
│   ├── cli.js                # CLI entry point
│   ├── config/
│   │   ├── default-config.js # Default configuration
│   │   └── config-loader.js  # Config loading & validation
│   ├── adapters/
│   │   ├── browser-adapter.js    # Abstract interface
│   │   └── puppeteer-adapter.js  # Puppeteer implementation
│   ├── engine/
│   │   ├── scroll-engine.js      # Main scrolling logic
│   │   ├── progress-detector.js  # Detect new content
│   │   ├── load-more-handler.js  # Handle load more buttons
│   │   └── human-behavior.js     # Anti-detection randomization
│   ├── orchestrator/
│   │   └── orchestrator.js   # High-level API
│   └── utils/
│       ├── logger.js         # Winston logger
│       └── helpers.js        # Utility functions
├── test/
│   ├── test-scroll-engine.js
│   └── test-integration.js
├── examples/
│   └── (config files)
└── logs/
    └── (log files)
```

## API Reference

### InfiniteScrollOrchestrator

```javascript
const orchestrator = new InfiniteScrollOrchestrator();

// Load with config file
const result = await orchestrator.loadPage(url, configPath);

// Load with options object
const result = await orchestrator.loadWithOptions(url, options);

// Stop current operation
orchestrator.stop();

// Cleanup
await orchestrator.close();
```

### Result Object

```javascript
{
  success: boolean,     // Whether operation completed successfully
  html: string,         // Final page HTML
  stats: {
    scrollAttempts: number,
    durationSeconds: number,
    finalItemCount: number,
    loadMoreClicks: number,
    detectionMethod: string
  },
  errors: string[]      // Any errors encountered
}
```

## Troubleshooting

### Browser doesn't launch
- Ensure Puppeteer is installed: `npm install puppeteer`
- Try with `headless: false` to see what's happening

### Items not detected
- Verify the `itemSelector` matches elements on the page
- Use browser dev tools to test selectors
- Try `detectionMethod: 'scrollHeight'` as an alternative

### Scroll stops too early
- Increase `progressTimeout` value
- Check if the page uses a custom scroll container

### Scroll never stops
- Decrease `maxScrollAttempts` or `maxDurationSeconds`
- Use `sentinel` detection if there's an end marker

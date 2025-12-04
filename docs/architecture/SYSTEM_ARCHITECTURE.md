# System Architecture

**Universal Scraper** - Modular contact extraction system

---

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         ORCHESTRATOR                             │
│                       (orchestrator.js)                          │
│  CLI parsing, routing, output formatting                         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
│  SimpleScraper  │ │ PdfScraper  │ │  ConfigScraper  │
│  (DOM-based)    │ │ (PDF parse) │ │  (Config-driven)│
└────────┬────────┘ └──────┬──────┘ └────────┬────────┘
         │                 │                  │
         └────────────────┬┘                  │
                          ▼                   ▼
              ┌───────────────────┐ ┌───────────────────┐
              │ ContactExtractor  │ │ MultiMethodExtract│
              │ (patterns/regex)  │ │ (priority-based)  │
              └─────────┬─────────┘ └─────────┬─────────┘
                        │                     │
                        └──────────┬──────────┘
                                   ▼
                          ┌───────────────┐
                          │    OUTPUT     │
                          │ JSON/Sheets   │
                          └───────────────┘
```

---

## Data Flow

### 1. Scraping Flow

```
URL Input
    │
    ▼
┌─────────────────────┐
│   BrowserManager    │ ◄── Puppeteer + Stealth
│   - Launch browser  │
│   - Create page     │
│   - Navigate        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    RateLimiter      │ ◄── Delay between requests
│    - Random delays  │
│    - Throttling     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   ConfigLoader      │ ◄── Site-specific config
│   - Load config     │
│   - Merge defaults  │
│   - Cache patterns  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│      Scraper        │ ◄── Method-specific logic
│   - Extract DOM     │
│   - Find cards      │
│   - Extract fields  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  ContactExtractor   │ ◄── Pattern matching
│   - Email regex     │
│   - Phone patterns  │
│   - Name validation │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Deduplication     │
│   - By email        │
│   - By name+domain  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│      Output         │
│   - JSON file       │
│   - Google Sheets   │
└─────────────────────┘
```

### 2. Config Generation Flow

```
URL Input
    │
    ▼
┌─────────────────────┐
│  InteractiveSession │
│   - Launch browser  │
│   - Inject overlay  │
│   - Expose functions│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    Overlay UI       │ ◄── Browser-side
│   - Card selection  │
│   - Field selection │
│   - Visual feedback │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    CardMatcher      │
│   - Find similar    │
│   - Structural sig  │
│   - Visual props    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   ElementCapture    │ ◄── v2.2 manual selection
│   - Capture fields  │
│   - Build methods   │
│   - Validate        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   ConfigBuilder     │
│   - Build config    │
│   - Save JSON       │
│   - Validate        │
└─────────────────────┘
```

---

## Component Details

### Scrapers

| Scraper | Use Case | Extraction Method |
|---------|----------|-------------------|
| **SimpleScraper** | Basic HTML pages | DOM traversal, regex |
| **PdfScraper** | PDF-based directories | Download + pdf-parse |
| **SelectScraper** | User text selection | Clipboard parsing |
| **ConfigScraper** | Complex sites | Multi-method with priority |

### Extraction Strategies (v2.2)

```
Priority Order:
1. userSelected  - User-clicked selector (confidence: 1.0)
2. coordinates   - Element position (confidence: 0.85)
3. mailto/tel    - Link href (confidence: 1.0)
4. selector      - CSS selector (confidence: 0.7-0.9)
5. proximity     - Near anchor field (confidence: 0.6)
6. textPattern   - Regex match (confidence: 0.5-0.7)
```

### Pagination System

```
Paginator
    │
    ├── PatternDetector
    │   └── Detects: parameter, path, offset, cursor, infinite-scroll
    │
    ├── UrlGenerator
    │   └── Generates URLs for each page
    │
    └── BinarySearcher
        └── Efficiently finds max page number
```

---

## Configuration System

### Config Loading Priority

```
1. Site-specific config (configs/{domain}.json)
2. Default config (configs/_default.json)
3. Hardcoded fallbacks
```

### Config Structure (v2.2)

```json
{
  "name": "site-name",
  "version": "2.2",
  "selectionMethod": "manual",

  "cardPattern": {
    "primarySelector": "...",
    "fallbackSelectors": [...],
    "structural": { /* DOM signature */ },
    "visual": { /* Size/position */ }
  },

  "fieldExtraction": {
    "version": "2.2",
    "strategy": "multi-method",
    "fields": {
      "name": { "methods": [...], "required": true },
      "email": { "methods": [...], "required": true },
      "phone": { "methods": [...], "required": false }
    }
  },

  "pagination": {
    "type": "parameter|path|infinite-scroll|none",
    "enabled": true/false
  }
}
```

---

## Dependencies

```
puppeteer + stealth     # Browser automation
cheerio                 # HTML parsing (backup)
winston                 # Logging
commander               # CLI parsing
pdf-parse               # PDF extraction
googleapis              # Google Sheets export
```

---

## Error Handling Strategy

1. **Scraper Level**: Try/catch with logging, fallback methods
2. **Extraction Level**: Validation, confidence thresholds
3. **Output Level**: Deduplication, completeness checks
4. **Browser Level**: Timeouts, retry logic

---

## Key Design Decisions

1. **Multi-method extraction**: Prioritized fallback strategies
2. **Config-driven**: Site-specific rules in JSON
3. **Visual selection**: Interactive config generation
4. **Modular scrapers**: Pluggable extraction methods
5. **Rate limiting**: Built-in request throttling

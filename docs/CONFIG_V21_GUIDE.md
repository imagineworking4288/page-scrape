# Config Generator v2.1 Guide

## Overview

Config Generator v2.1 introduces **multi-method extraction strategies** with automatic fallbacks. This creates intelligent, self-teaching configurations that are more resilient to page changes.

## What's New in v2.1

### 1. Multi-Method Field Extraction

Instead of generic extraction rules, v2.1 configs store the **exact methods that successfully extracted data** during config generation:

```json
{
  "fieldExtraction": {
    "version": "2.1",
    "strategy": "multi-method",
    "fields": {
      "email": {
        "methods": [
          { "priority": 1, "type": "mailto", "selector": "a[href^='mailto:']", "confidence": 1.0 },
          { "priority": 2, "type": "linkText", "selector": "a", "confidence": 0.9 },
          { "priority": 3, "type": "textPattern", "confidence": 0.7 }
        ]
      }
    }
  }
}
```

### 2. Fallback Card Selectors

v2.1 configs store multiple selector strategies for finding cards:

```json
{
  "cardPattern": {
    "primarySelector": "div.BioListingCard_card__Mkk7U",
    "fallbackSelectors": [
      "div.BioListingCard_card__Mkk7U.row",
      ".biolistingcard_card__mkk7u"
    ]
  }
}
```

### 3. Site Characteristics

Automatically detected site characteristics guide runtime behavior:

```json
{
  "siteCharacteristics": {
    "isSPA": false,
    "framework": "next",
    "dynamicLoading": "lazy",
    "hasInfiniteScroll": false
  }
}
```

### 4. Spatial Relationships

Records how fields relate to each other spatially:

```json
{
  "relationships": {
    "nameAboveEmail": true,
    "nameToEmail": { "above": true, "distance": 45 }
  }
}
```

## Extraction Method Types

| Type | Description | Priority |
|------|-------------|----------|
| `mailto` | Extract from `mailto:` links | 1 (highest) |
| `tel` | Extract from `tel:` links | 1 |
| `selector` | CSS selector + attribute | 1-2 |
| `linkText` | Link text matching pattern | 2 |
| `urlPattern` | URL pattern matching | 1-2 |
| `proximity` | Near anchor field (e.g., name near email) | 2-3 |
| `keyword` | Text containing keywords | 2-3 |
| `textPattern` | Regex on text content | 3 |
| `firstText` | First valid text block | 4 (lowest) |

## Runtime Behavior

### Extraction Priority

At runtime, methods are tried **in priority order**:

1. Try priority 1 methods first
2. If all fail, try priority 2
3. Continue until a method succeeds or all fail
4. Validation applied to each result

### Fallback Selectors

If the primary card selector finds no elements:

1. Try each fallback selector in order
2. Use first selector that finds cards
3. Log which selector succeeded

### Confidence Scoring

Each extracted field has a confidence score based on:

- Method type (mailto = 1.0, textPattern = 0.7)
- Validation result
- Original capture confidence

## Migrating from v2.0

### Automatic Migration

```javascript
const ConfigBuilder = require('./src/tools/lib/config-builder');
const builder = new ConfigBuilder(logger);

// Check version
if (!builder.isV21Config(oldConfig)) {
  const newConfig = builder.migrateToV21(oldConfig);
  // Save newConfig
}
```

### Manual Regeneration (Recommended)

For best results, regenerate configs using the updated config generator:

```bash
node src/tools/config-generator.js --url "https://example.com/directory"
```

This captures site-specific extraction methods rather than using defaults.

## File Structure

```
src/tools/lib/
  ├── enhanced-capture.js      # Browser-side comprehensive capture
  ├── multi-method-extractor.js # Runtime multi-method extraction
  ├── config-builder.js        # v2.1 config generation (updated)
  ├── interactive-session.js   # Workflow orchestration (updated)
  └── ...

src/scrapers/
  └── config-scraper.js        # v2.1-aware scraper (updated)
```

## Example v2.1 Config

```json
{
  "name": "example-directory",
  "version": "2.1",
  "createdAt": "2025-12-02T08:00:00.000Z",
  "sourceUrl": "https://example.com/directory",
  "domain": "example.com",

  "cardPattern": {
    "primarySelector": "div.person-card",
    "fallbackSelectors": ["article.person", ".person-card"],
    "structural": {
      "tagName": "div",
      "classes": ["person-card", "row"],
      "hasLinks": true,
      "hasImages": true
    },
    "visual": {
      "width": 1200,
      "height": 180
    }
  },

  "fieldExtraction": {
    "version": "2.1",
    "strategy": "multi-method",
    "fields": {
      "name": {
        "required": true,
        "capturedValue": "John Smith",
        "methods": [
          { "priority": 1, "type": "selector", "selector": "h3.name a", "attribute": "textContent", "confidence": 0.95 },
          { "priority": 2, "type": "proximity", "anchorField": "email", "direction": "above", "maxDistance": 200, "confidence": 0.8 }
        ],
        "validation": "name"
      },
      "email": {
        "required": true,
        "capturedValue": "john.smith@example.com",
        "methods": [
          { "priority": 1, "type": "mailto", "selector": "a.email-link", "attribute": "href", "confidence": 1.0 }
        ],
        "validation": "email"
      },
      "phone": {
        "required": false,
        "methods": [
          { "priority": 1, "type": "tel", "selector": "a[href^='tel:']", "attribute": "href", "confidence": 1.0 },
          { "priority": 2, "type": "textPattern", "confidence": 0.6 }
        ],
        "validation": "phone"
      }
    }
  },

  "siteCharacteristics": {
    "isSPA": false,
    "framework": "unknown",
    "dynamicLoading": "lazy"
  },

  "relationships": {
    "nameAboveEmail": true
  },

  "detectionStats": {
    "totalCardsFound": 25,
    "avgConfidence": 94,
    "fieldsDetected": {
      "name": true,
      "email": true,
      "phone": true
    }
  }
}
```

## Troubleshooting

### No Cards Found

1. Check if page uses dynamic loading (wait for content)
2. Try different selectors from fallbackSelectors
3. Regenerate config if page structure changed

### Email Not Extracted

1. Check if site uses mailto: links (highest priority)
2. Look for obfuscated emails (JavaScript rendering)
3. May need profile page visiting for hidden emails

### Low Confidence Scores

1. Regenerate config for site-specific methods
2. Check that captured selectors still match
3. Consider manual selector refinement

## API Reference

### EnhancedCapture

```javascript
const EnhancedCapture = require('./src/tools/lib/enhanced-capture');
const capture = new EnhancedCapture(logger);

const result = await capture.capture(page, {
  x: 100, y: 200, width: 400, height: 150
});

// result.fields.email.methods = [...]
// result.siteCharacteristics = {...}
```

### MultiMethodExtractor

```javascript
const MultiMethodExtractor = require('./src/tools/lib/multi-method-extractor');
const extractor = new MultiMethodExtractor(logger);

const contacts = await extractor.extractFromCards(
  page,
  cardBoxes,
  config.fieldExtraction.fields,
  limit
);
```

### ConfigBuilder.buildConfigV21()

```javascript
const builder = new ConfigBuilder(logger);
const config = builder.buildConfigV21(captureData, matchResult, metadata);
const validation = builder.validateConfigV21(config);
```

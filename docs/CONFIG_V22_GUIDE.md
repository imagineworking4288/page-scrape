# Config Generator v2.2 - Manual Field Selection Guide

## Overview

Config Generator v2.2 introduces **Manual Field Selection** - a click-to-capture workflow that lets you precisely select which elements to extract for each field. This creates highly accurate, site-specific configurations with automatic fallbacks.

## What's New in v2.2

### 1. Manual Field Selection Mode

Instead of relying solely on auto-detection, v2.2 lets you click on specific elements:

```
┌─────────────────────────────────────────────┐
│  Auto-Detection Preview                     │
│  ─────────────────────────────────────────  │
│  Name:     John Smith         [Found]       │
│  Email:    john@example.com   [Found]       │
│  Phone:    (not detected)     [Missing]     │
│  Profile:  /people/john       [Found]       │
│                                             │
│  [Accept Auto-Detection]  [Manual Selection]│
└─────────────────────────────────────────────┘
```

### 2. User-Selected Extraction Methods

v2.2 configs store user-selected selectors with highest priority:

```json
{
  "fieldExtraction": {
    "version": "2.2",
    "strategy": "multi-method",
    "selectionMethod": "manual",
    "fields": {
      "email": {
        "methods": [
          { "priority": 1, "type": "userSelected", "selector": "a.email-link", "confidence": 1.0 },
          { "priority": 2, "type": "coordinates", "coordinates": { "relativeX": 150, "relativeY": 80 } },
          { "priority": 3, "type": "mailto", "selector": "a[href^='mailto:']" }
        ]
      }
    }
  }
}
```

### 3. Coordinate Fallback Extraction

If CSS selectors fail (due to page changes), v2.2 falls back to coordinate-based extraction:

- Captures element position relative to card
- Uses `document.elementFromPoint()` at runtime
- Handles minor layout shifts with proximity tolerance

### 4. Profile Link Disambiguation

When multiple links exist in a card, v2.2 helps identify the correct profile link:

```
┌─────────────────────────────────────────────┐
│  Multiple Links Found                       │
│  Select the profile link:                   │
│  ─────────────────────────────────────────  │
│  ○ /people/john-smith      [Profile][Match] │
│  ○ mailto:john@example.com [Action]         │
│  ○ linkedin.com/in/john    [Social]         │
│                                             │
│  [Cancel]              [Use Selected Link]  │
└─────────────────────────────────────────────┘
```

## Workflow

### Step 1: Draw Rectangle Selection

1. Navigate to the listing page
2. Draw a rectangle around ONE contact card
3. v2.2 auto-detects cards and fields

### Step 2: Review Auto-Detection

The Preview Panel shows:
- Detected field values
- Confidence indicators
- Missing required fields warning

### Step 3: Accept or Manually Select

**Option A: Accept Auto-Detection**
- Use if all required fields are correctly detected
- Proceeds to config generation

**Option B: Manual Selection**
- Click through each field
- Click on the exact element you want to extract
- Skip optional fields if not needed

### Step 4: Field-by-Field Selection

For each field:
1. Read the prompt (e.g., "Click on the EMAIL address")
2. Hover over elements to see highlight
3. Click to select
4. Confirm or re-click to change
5. Move to next field

### Step 5: Generate Config

After all fields are selected:
- Config is generated with v2.2 format
- Includes user-selected selectors at priority 1
- Includes coordinate fallbacks at priority 2
- Includes standard fallbacks at priority 3+

## Extraction Method Types

| Type | Description | Priority | Use Case |
|------|-------------|----------|----------|
| `userSelected` | CSS selector from manual click | 1 (highest) | Exact element targeting |
| `coordinates` | Position-based fallback | 2 | Backup when selectors fail |
| `mailto` | Extract from `mailto:` links | 3 | Email extraction |
| `tel` | Extract from `tel:` links | 3 | Phone extraction |
| `selector` | Generic CSS selector | 3-4 | Auto-detected elements |
| `textPattern` | Regex on text content | 4-5 | Pattern matching fallback |

## Config Schema v2.2

```json
{
  "name": "example-directory",
  "version": "2.2",
  "selectionMethod": "manual",
  "createdAt": "2025-12-03T...",
  "sourceUrl": "https://example.com/people",
  "domain": "example.com",

  "cardPattern": {
    "primarySelector": "div.person-card",
    "fallbackSelectors": ["article.person", ".person-card"],
    "structural": { "tagName": "div", "classes": ["person-card"] },
    "visual": { "width": 1200, "height": 180 }
  },

  "fieldExtraction": {
    "version": "2.2",
    "strategy": "multi-method",
    "selectionMethod": "manual",
    "fields": {
      "name": {
        "required": true,
        "capturedValue": "John Smith",
        "methods": [
          { "priority": 1, "type": "userSelected", "selector": "h3.name a", "attribute": "textContent", "confidence": 1.0 },
          { "priority": 2, "type": "coordinates", "coordinates": { "relativeX": 20, "relativeY": 15 }, "confidence": 0.85 },
          { "priority": 3, "type": "selector", "selector": "h1, h2, h3, [class*='name']", "confidence": 0.7 }
        ],
        "validation": "name",
        "source": "manual"
      },
      "email": {
        "required": true,
        "capturedValue": "john.smith@example.com",
        "methods": [
          { "priority": 1, "type": "userSelected", "selector": "a.email-link", "attribute": "href", "confidence": 1.0 },
          { "priority": 2, "type": "coordinates", "coordinates": { "relativeX": 150, "relativeY": 80 }, "confidence": 0.85 },
          { "priority": 3, "type": "mailto", "selector": "a[href^='mailto:']", "confidence": 0.95 },
          { "priority": 4, "type": "textPattern", "pattern": "[^\\s@]+@[^\\s@]+\\.[^\\s@]+", "confidence": 0.7 }
        ],
        "validation": "email",
        "source": "manual"
      }
    }
  },

  "relationships": {
    "nameAboveEmail": true,
    "nameToEmail": { "above": true, "distance": 45 }
  },

  "siteCharacteristics": {
    "isSPA": false,
    "framework": "unknown",
    "dynamicLoading": "lazy"
  },

  "detectionStats": {
    "totalCardsFound": 25,
    "avgConfidence": 94,
    "selectionMethod": "manual"
  }
}
```

## Field Requirements

### Required Fields (must be selected)

| Field | Description | Validation |
|-------|-------------|------------|
| `name` | Person's full name | 2-6 words, no email/phone |
| `email` | Email address | Valid email format |
| `profileUrl` | Link to profile page | Valid URL or path |

### Optional Fields (can skip)

| Field | Description |
|-------|-------------|
| `phone` | Phone number |
| `title` | Job title/position |
| `location` | Office/city location |

## Runtime Behavior

### Extraction Priority

At runtime, methods execute in order:

1. Try `userSelected` selector
2. If fails, try `coordinates` fallback
3. If fails, try `mailto`/`tel` links
4. Continue through methods until success
5. Apply validation to result

### Fallback Effectiveness

The coordinate fallback is effective when:
- Page layout is similar to capture time
- Element positions haven't changed drastically
- Viewport size matches config

## Migrating from v2.1

### Automatic Upgrade

v2.2 is backwards-compatible with v2.1 configs. The runtime automatically:
- Detects config version
- Uses appropriate extraction method
- Falls back gracefully if methods fail

### Manual Regeneration (Recommended)

For best accuracy, regenerate configs:

```bash
node src/tools/config-generator.js --url "https://example.com/directory"
```

Then use Manual Selection mode for precise targeting.

## Troubleshooting

### Issue: Selector Not Found at Runtime

**Cause**: Page structure changed since config generation
**Solution**:
1. Coordinates fallback should kick in automatically
2. If that fails, regenerate config

### Issue: Wrong Element Extracted

**Cause**: Selector matches multiple elements
**Solution**:
1. Use more specific selector during manual selection
2. Regenerate config clicking on a more unique element

### Issue: Coordinates Extraction Returns Wrong Data

**Cause**: Page layout significantly changed
**Solution**:
1. Regenerate config with current page layout
2. Ensure viewport size matches config options

## API Reference

### ElementCapture

```javascript
const ElementCapture = require('./src/tools/lib/element-capture');
const capture = new ElementCapture(logger);

const result = await capture.processManualSelections(page, selections, cardBox);
// result.fields - Processed field data
// result.extractionMethods - Generated methods per field
// result.validation - Required field validation
```

### ConfigBuilder.buildConfigV22()

```javascript
const ConfigBuilder = require('./src/tools/lib/config-builder');
const builder = new ConfigBuilder(logger);

const config = builder.buildConfigV22(capturedData, matchResult, metadata);
const isValid = builder.isV22Config(config);
```

### MultiMethodExtractor (v2.2)

```javascript
const extractor = new MultiMethodExtractor(logger);

// Now supports 'userSelected' and 'coordinates' methods
const contacts = await extractor.extractFromCards(page, cardBoxes, fieldConfigs, limit);
```

## Files Overview

| File | Purpose |
|------|---------|
| `src/tools/lib/constants/field-requirements.js` | Field definitions and validation rules |
| `src/tools/lib/element-capture.js` | Manual selection processing |
| `src/tools/lib/config-builder.js` | v2.2 config generation |
| `src/tools/lib/multi-method-extractor.js` | Runtime extraction with userSelected/coordinates |
| `src/tools/lib/profile-enrichment.js` | Profile page visiting with name matching |
| `src/tools/assets/overlay.html` | Manual selection UI |
| `src/tools/assets/overlay-client.js` | Browser-side state machine |
| `src/scrapers/config-scraper.js` | v2.2-aware scraper |

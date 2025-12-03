# Architecture Analysis - Config Generator v2.1

## Executive Summary

This document describes the v2.1 Config Generator architecture - an "intelligent, self-teaching" configuration system with multi-method extraction strategies and automatic fallbacks.

**Status: IMPLEMENTED**

## Implementation Summary

### New Files Created
| File | Purpose |
|------|---------|
| `src/tools/lib/enhanced-capture.js` | Comprehensive browser-side DOM capture with method tracking |
| `src/tools/lib/multi-method-extractor.js` | Runtime multi-method extraction engine |
| `docs/CONFIG_V21_GUIDE.md` | User documentation for v2.1 configs |

### Modified Files
| File | Changes |
|------|---------|
| `src/tools/lib/config-builder.js` | Added `buildConfigV21()`, `validateConfigV21()`, `migrateToV21()` |
| `src/tools/lib/interactive-session.js` | Integrated EnhancedCapture, v2.1 config generation |
| `src/scrapers/config-scraper.js` | Added v2.1 extraction with fallback selectors |
| `src/utils/profile-visitor.js` | Updated documentation |

---

## Previous Architecture (v2.0 - for reference)

---

## Current Architecture Overview

### Data Flow (v2.0)

```
User Selection (Browser)
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  overlay-client.js (Browser-Side)                                │
│  - Rectangle selection UI                                        │
│  - Sends box coordinates to backend via exposed functions        │
│  - Displays card highlights and preview data                     │
└─────────────────────────────────────────────────────────────────┘
        │ __configGen_handleRectangleSelection(box)
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  interactive-session.js (Node-Side Orchestrator)                 │
│  - Injects overlay UI                                            │
│  - Exposes backend functions for browser communication           │
│  - Coordinates CardMatcher and SmartFieldExtractor               │
│  - Calls ConfigBuilder to generate config                        │
└─────────────────────────────────────────────────────────────────┘
        │                                     │
        ▼                                     ▼
┌───────────────────────┐         ┌───────────────────────┐
│  card-matcher.js      │         │  smart-field-extractor│
│  - Hybrid matching    │         │  - Email-first extract│
│  - 60% structural     │         │  - Name proximity     │
│  - 40% visual         │         │  - Pattern matching   │
└───────────────────────┘         └───────────────────────┘
        │                                     │
        └──────────────┬──────────────────────┘
                       ▼
        ┌───────────────────────────────────────┐
        │  config-builder.js                     │
        │  - Builds v2.0 config JSON             │
        │  - Saves to configs/ directory         │
        └───────────────────────────────────────┘
                       │
                       ▼
        ┌───────────────────────────────────────┐
        │  config-scraper.js (Runtime)           │
        │  - Loads config                        │
        │  - Extracts using SmartFieldExtractor  │
        │  - Handles pagination                  │
        └───────────────────────────────────────┘
```

---

## Core Components Analysis

### 1. overlay-client.js (Browser-Side UI)

**Location:** `src/tools/assets/overlay-client.js`

**Current Responsibilities:**
- Canvas-based rectangle selection
- Visual feedback (selection preview, card highlights)
- Communication with backend via `window.__configGen_*` functions
- Display preview table with extracted fields

**Current Limitations:**
- Captures only rectangle coordinates (x, y, width, height)
- No DOM snapshot or element-level data capture
- No link/attribute analysis
- No site characteristic detection

**Enhancement Points:**
- Add comprehensive DOM capture for selected region
- Capture element hierarchy, attributes, and computed styles
- Detect site characteristics (SPA, infinite scroll, iframe usage)
- Analyze all links within selection (mailto:, tel:, profile URLs)

---

### 2. interactive-session.js (Orchestrator)

**Location:** `src/tools/lib/interactive-session.js`

**Current Responsibilities:**
- Browser lifecycle management
- Overlay injection via `page.evaluate()` (CSP bypass)
- Backend function exposure (`exposeFunction`)
- Coordinates CardMatcher and SmartFieldExtractor calls
- Manages pagination detection
- Calls ConfigBuilder to generate and save config

**Current Data Passed:**
```javascript
// From handleRectangleSelection
const box = { x, y, width, height };
const matchResult = await this.cardMatcher.findSimilarCards(page, box);
const previewResult = await this.fieldExtractor.extractFromSelection(page, box);
this.extractionRules = this.fieldExtractor.generateExtractionRules(previewData);
```

**Enhancement Points:**
- Add enhanced capture call after rectangle selection
- Receive comprehensive DOM snapshot from browser
- Pass enriched data to ConfigBuilder
- Store multiple extraction strategies in config

---

### 3. card-matcher.js (Hybrid Pattern Matching)

**Location:** `src/tools/lib/card-matcher.js`

**Current Responsibilities:**
- Inject browser-side matching code
- Extract structural signature (tag, parent chain, child structure, classes)
- Extract visual properties (box, dimensions, margins, display)
- Calculate hybrid similarity score (60% structural + 40% visual)
- Generate CSS selector for matched elements

**Current Matching Algorithm:**
```javascript
// Structural components (60%)
- Tag match (20 weight)
- Parent chain similarity (15 weight)
- Child count similarity (15 weight)
- Child tag distribution (15 weight)
- Class pattern overlap (15 weight)
- Link structure (10 weight)
- Content indicators (10 weight - hasEmail, hasPhone)

// Visual components (40%)
- Size similarity (30 weight)
- Aspect ratio (20 weight)
- Display type (15 weight)
- Margin/spacing (15 weight)
- Visual styling (20 weight - boxShadow, borderRadius)
```

**Enhancement Points:**
- Currently returns basic match data; could return richer element analysis
- No fallback selector strategies stored
- No spatial relationship analysis between elements

---

### 4. smart-field-extractor.js (Field Extraction)

**Location:** `src/tools/lib/smart-field-extractor.js`

**Current Extraction Strategy:**
1. **Email** (PRIORITY 1)
   - Strategy 1: `mailto:` links (highest priority)
   - Strategy 2: Links with email text pattern
   - Strategy 3: Plain text regex fallback

2. **Name** (using email as anchor)
   - Strategy 1: Name-specific elements (`[class*="name"]`, h1-h4, strong)
   - Strategy 2: Proximity to email element (400px context window)
   - Strategy 3: First reasonable text (2-4 words)

3. **Phone**
   - Regex patterns (international, US, generic)
   - `tel:` links

4. **Title, Location, ProfileUrl, SocialLinks**
   - Selector-based with keyword scoring

**Current Limitations:**
- Single strategy execution (no fallbacks stored)
- No priority ordering recorded in config
- No recording of which strategy succeeded

**Enhancement Points:**
- Record all attempted strategies with success/failure
- Store priority ordering in config for runtime fallbacks
- Add positional relationship tracking (name above/left of email)

---

### 5. config-builder.js (Config Generation)

**Location:** `src/tools/lib/config-builder.js`

**Current v2.0 Config Structure:**
```json
{
  "name": "site-name",
  "version": "2.0",
  "cardPattern": {
    "selector": "CSS selector",
    "structural": { /* signature */ },
    "visual": { /* properties */ },
    "matching": { "structuralWeight": 0.6, "visualWeight": 0.4 }
  },
  "fieldExtraction": {
    "strategy": "smart",
    "contextWindow": 400,
    "fields": { /* generic rules */ }
  },
  "pagination": { /* type, settings */ },
  "extraction": { /* waitFor, timeout */ },
  "options": { /* delays, viewport */ },
  "detectionStats": { /* cards found, confidence */ }
}
```

**Current Limitations:**
- Generic field extraction rules (not site-specific)
- No multi-method extraction strategies with priorities
- No captured DOM structure or element relationships
- No site characteristics recorded

---

### 6. config-scraper.js (Runtime Execution)

**Location:** `src/scrapers/config-scraper.js`

**Current Execution Flow:**
```javascript
// For v2.0 configs:
1. Find cards using cardPattern.selector
2. If no cards found, fall back to pattern matching
3. Extract fields using SmartFieldExtractor (re-runs generic extraction)
4. Apply domain info and deduplication
5. Optional: Profile page enrichment
```

**Current Limitations:**
- SmartFieldExtractor runs generic extraction, ignores site-specific patterns
- No multi-method fallback execution
- No use of captured selectors/attributes from config generation
- Re-discovers extraction strategies at runtime instead of using stored strategies

---

## v2.1 Enhancement Requirements

### 1. Enhanced Data Capture (Browser-Side)

**New Data to Capture:**
```javascript
{
  // Card container analysis
  cardElement: {
    selector: "primary CSS selector",
    alternativeSelectors: ["fallback1", "fallback2"],
    attributes: { class, id, data-* },
    computedStyles: { display, position, overflow },
    dimensions: { width, height, x, y }
  },

  // Field elements with relationships
  fields: {
    name: {
      element: { selector, attributes, textContent },
      position: { x, y, relativeToCard },
      confidence: 0.95,
      extractionMethod: "selector" // or "proximity", "pattern"
    },
    email: {
      element: { selector, attributes, href },
      position: { x, y },
      extractedVia: "mailto", // or "text", "href"
      confidence: 1.0
    },
    // ... other fields
  },

  // Link analysis
  links: {
    mailto: [{ selector, href, text }],
    tel: [{ selector, href, text }],
    profile: [{ selector, href, pattern }]
  },

  // Spatial relationships
  relationships: {
    nameAboveEmail: true,
    phoneNearEmail: true,
    titleBelowName: true
  },

  // Site characteristics
  siteCharacteristics: {
    isSPA: false,
    hasInfiniteScroll: false,
    usesIframes: false,
    dynamicLoading: "lazy" // or "eager", "none"
  }
}
```

### 2. Enhanced Config Format (v2.1)

**Proposed v2.1 Structure:**
```json
{
  "version": "2.1",

  "cardPattern": {
    "primarySelector": "main selector",
    "fallbackSelectors": ["alt1", "alt2"],
    "structural": { /* existing */ },
    "visual": { /* existing */ }
  },

  "fieldExtraction": {
    "name": {
      "methods": [
        {
          "priority": 1,
          "type": "selector",
          "selector": "[class*='name'] a",
          "attribute": "textContent",
          "confidence": 0.95
        },
        {
          "priority": 2,
          "type": "proximity",
          "anchor": "email",
          "direction": "above",
          "maxDistance": 200
        },
        {
          "priority": 3,
          "type": "pattern",
          "pattern": "first 2-4 word text node"
        }
      ],
      "validation": "name"
    },
    "email": {
      "methods": [
        { "priority": 1, "type": "mailto", "selector": "a[href^='mailto:']" },
        { "priority": 2, "type": "linkText", "pattern": "/@/" },
        { "priority": 3, "type": "textPattern" }
      ]
    },
    "phone": {
      "methods": [
        { "priority": 1, "type": "tel", "selector": "a[href^='tel:']" },
        { "priority": 2, "type": "selector", "selector": "[class*='phone']" },
        { "priority": 3, "type": "textPattern" }
      ]
    },
    "profileUrl": {
      "methods": [
        { "priority": 1, "type": "selector", "selector": "captured.profileLink.selector" },
        { "priority": 2, "type": "urlPattern", "patterns": ["/lawyers/", "/attorney/"] }
      ]
    }
  },

  "siteCharacteristics": {
    "isSPA": false,
    "dynamicLoading": "lazy",
    "requiresScroll": false,
    "hasProfilePages": true
  },

  "capturedElements": {
    "card": { /* full element snapshot */ },
    "fields": { /* all field element snapshots */ }
  }
}
```

### 3. Multi-Method Extraction Runtime

**Enhanced ConfigScraper Execution:**
```javascript
async extractField(fieldName, cardElement, methods) {
  for (const method of methods.sort((a, b) => a.priority - b.priority)) {
    try {
      let value;

      switch (method.type) {
        case 'mailto':
          value = await this.extractMailto(cardElement, method.selector);
          break;
        case 'selector':
          value = await this.extractBySelector(cardElement, method);
          break;
        case 'proximity':
          value = await this.extractByProximity(cardElement, method);
          break;
        case 'textPattern':
          value = await this.extractByPattern(cardElement, method);
          break;
      }

      if (value && this.validateField(fieldName, value, method.validation)) {
        return { value, method: method.type, confidence: method.confidence };
      }
    } catch (e) {
      // Continue to next method
    }
  }
  return null;
}
```

---

## Files Requiring Modification

### High Priority (Core Changes)

| File | Changes Needed |
|------|----------------|
| `overlay-client.js` | Add comprehensive DOM capture function |
| `interactive-session.js` | Call enhanced capture, pass to ConfigBuilder |
| `config-builder.js` | Generate v2.1 format with multi-method strategies |
| `config-scraper.js` | Implement multi-method extraction with fallbacks |

### Medium Priority (Supporting Changes)

| File | Changes Needed |
|------|----------------|
| `smart-field-extractor.js` | Return method metadata, not just values |
| `card-matcher.js` | Generate fallback selectors |

### Low Priority (Optional Enhancements)

| File | Changes Needed |
|------|----------------|
| `profile-visitor.js` | Use config-stored profile URL patterns |
| `base-scraper.js` | No changes needed |

---

## Implementation Order

1. **Phase 1:** Enhanced Data Capture (overlay-client.js)
2. **Phase 2:** Enhanced Config Generation (config-builder.js)
3. **Phase 3:** Interactive Session Integration (interactive-session.js)
4. **Phase 4:** Multi-Method Scraper Execution (config-scraper.js)
5. **Phase 5:** Profile Page Intelligence
6. **Phase 6:** Testing and Validation
7. **Phase 7:** Documentation and Migration Guide
8. **Phase 8:** Output Organization and Final Polish

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing v2.0 configs | Add backwards compatibility layer in config-scraper |
| Increased config file size | Only store essential element data, compress repeated patterns |
| Performance impact from multiple methods | Execute methods in priority order, stop on success |
| Complex DOM capture in browser | Use efficient TreeWalker, limit depth |

---

## Success Metrics

1. **Extraction Accuracy:** 95%+ email extraction rate (up from ~80%)
2. **Fallback Effectiveness:** Configs work across page redesigns
3. **Generation Speed:** Config generation < 5 seconds
4. **Config Reusability:** One config works for variations of same site

---

## Appendix: Current Config Example (v2.0)

From `configs/sullcrom-lawyerlisting.json`:
- Version: 2.0
- Card selector: `div.BioListingCard_card__Mkk7U.row.border-bottom.py-4`
- Detection confidence: 96%
- Cards found: 20
- Field extraction: Generic "smart" strategy (no site-specific methods stored)

**Key Observation:** Despite high card detection confidence (96%), the fieldExtraction section contains only generic rules, not the actual selectors/methods that successfully extracted data during config generation.

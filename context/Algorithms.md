# Algorithms & Strategies

**Last Updated**: 2025-12-22
**Documentation Version**: 2.0

---

## How to Read This Document

This document explains the **thinking** behind the code — the algorithms, strategies, and design decisions that power the project. While `API.md` documents *what* each function does, this document explains *how* and *why* the complex parts work.

Each algorithm entry includes:

**Problem Statement** — What challenge does this solve?
**Approach** — High-level strategy
**Step-by-Step Breakdown** — Detailed walkthrough
**Edge Cases** — What could go wrong and how we handle it
**Performance** — Time/space complexity and optimization notes
**Visual Diagram** — ASCII visualization where helpful

---

# PAGINATION: Finding True Max Page

> Algorithms for efficiently discovering how many pages exist on a paginated site.

---

## Binary Search for Max Page

**Location**: `src/features/pagination/binary-searcher.js` → `findTrueMaxPage()`
**Complexity**: O(log n) time, O(1) space
**Related Functions**: `_testPageValidity()`, `_validatePage()`

### Problem Statement

A paginated directory might have anywhere from 1 to 500+ pages. The naive approach would be to crawl every page sequentially until finding an empty one (O(n) requests). For a 200-page site, that's 200+ HTTP requests just for discovery.

We need to find the maximum page number efficiently, ideally in ~10 requests regardless of how many pages exist.

### Approach

Use binary search on page numbers. Start with known bounds (page 1 is valid, visualMax or hardCap is the upper limit), then repeatedly test the midpoint to narrow the range. When we find the boundary between valid and invalid pages, confirm it by checking 2 consecutive empty pages.

### Step-by-Step Breakdown

**Step 1: Establish Initial Bounds**

Test page 1 to confirm the site has content. If page 1 is empty, there's no pagination.

```javascript
const page1Valid = await this._testPageValidity(page, urlGenerator, 1, minContacts);
if (!page1Valid.hasContacts) {
  return { trueMax: 0, ... };
}
lowerBound = 1;
```

**Step 2: Test Visual Max (if available)**

If we detected "Page 55" on the page visually, test that page. If valid, we know there are AT LEAST 55 pages, so expand the upper bound to hardCap.

```javascript
if (visualMax && visualMax > 1) {
  const visualMaxValid = await this._testPageValidity(page, urlGenerator, visualMax, minContacts);
  if (visualMaxValid.hasContacts) {
    lowerBound = visualMax;
    upperBound = hardCap;  // CRITICAL: Expand to find true max beyond visual
  } else {
    upperBound = visualMax - 1;  // Search backward
  }
}
```

**Step 3: Binary Search Loop**

Repeatedly test the midpoint and narrow bounds.

```javascript
while (lowerBound <= upperBound && iterations < maxIterations) {
  const mid = Math.floor((lowerBound + upperBound) / 2);

  const midValid = await this._testPageValidity(page, urlGenerator, mid, minContacts);

  if (midValid.hasContacts) {
    lastValidPage = mid;
    lowerBound = mid + 1;  // Search higher
  } else {
    upperBound = mid - 1;  // Search lower
  }
}
```

**Step 4: Confirm Boundary**

To prevent false positives from temporarily empty pages, confirm boundary by checking 2 consecutive empty pages.

```javascript
const next1 = await this._testPageValidity(page, urlGenerator, lastValidPage + 1, minContacts);
const next2 = await this._testPageValidity(page, urlGenerator, lastValidPage + 2, minContacts);
const isBoundaryConfirmed = !next1.hasContacts && !next2.hasContacts;
```

### Visual Diagram

```
Initial State:
Page Range: [1 -------- 55 (visual) -------- 200 (hardCap)]
                         ↓
Step 1: Test visual max  [VALID - 40 contacts]
                         ↓
Expand to hardCap:       [55 -------- 127 -------- 200]
                                       ↓
Step 2: Test page 127    [VALID - 40 contacts]
                                       ↓
Search higher:           [127 -------- 163 -------- 200]
                                         ↓
Step 3: Test page 163    [VALID - 40 contacts]
                                         ↓
Search higher:           [163 -------- 181 -------- 200]
                                         ↓
Step 4: Test page 181    [VALID - 40 contacts]
                                         ↓
Continue until:          [198 -- 199 -- 200]
                                 ↓
Test page 199            [VALID]
                                 ↓
Test page 200            [VALID]
                                 ↓
HIT HARD CAP → Return trueMax = 200, isCapped = true
```

### Edge Cases

| Edge Case | How It's Handled | Why |
|-----------|------------------|-----|
| Page 1 empty | Return trueMax: 0 immediately | No point searching if base page is empty |
| All pages valid (hit hardCap) | Return isCapped: true | Prevents infinite crawling |
| Visual max is invalid | Search backward from visual max | Visual detection may be wrong |
| Temporary empty page | Confirm with 2 consecutive empties | Single empty page might be transient |
| Already tested page | Skip in binary search loop | Avoid redundant requests |

### Performance Considerations

**Time Complexity:** O(log n) — Binary search halves the range each iteration. For 200 pages, ~8 tests needed.

**Space Complexity:** O(1) — Only stores bounds and tested pages array.

**Optimization Notes:**
- Rate limiter waits between requests to avoid detection
- cardSelector passed to validation for accurate counting
- visualMax hint often cuts search in half immediately

### Historical Notes

- **2025-12-22**: Fixed card detection timing. Changed from 1s wait to 3s fixed wait, and from `waitForSelector` to direct `$$eval`. Issue: Compass.com pages 56+ were returning 0 contacts despite having 40 cards.

---

## Page Validation Strategy

**Location**: `src/features/pagination/binary-searcher.js` → `_validatePage()`
**Complexity**: O(1) time
**Related Functions**: `_testPageValidity()`

### Problem Statement

To binary search effectively, we need a fast, reliable way to determine if a page has contacts. Different sites have different structures — some have mailto links, some have profile URLs, some just have cards with names.

### Approach

Use a priority-ordered fallback chain:
1. If we have a card selector from config, count cards directly
2. Otherwise try mailto links, profile URLs, email regex, tel links in order
3. First method that finds content wins

### Step-by-Step Breakdown

**Step 1: Direct Card Counting (Best Method)**

If config provides a card selector, count matching elements directly.

```javascript
if (this.cardSelector) {
  const contactCount = await page.$$eval(this.cardSelector, els => els.length).catch(() => 0);
  return { hasContacts: contactCount >= minContacts, contactCount, method: 'config-card-selector' };
}
```

**Key Insight**: Use `$$eval` with `.catch(() => 0)`, NOT `waitForSelector`. The latter can timeout before dynamic content loads, while `$$eval` returns 0 gracefully if selector not found.

**Step 2: Fallback Chain (When No Card Selector)**

```javascript
// 1. Mailto links
const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]').length;
if (mailtoLinks > 0) return { hasContacts: true, contactCount: mailtoLinks };

// 2. Profile URL patterns
const profilePatterns = ['a[href*="/profile"]', 'a[href*="/people/"]', ...];
for (const pattern of profilePatterns) {
  const links = document.querySelectorAll(pattern);
  if (links.length >= 3) return { hasContacts: true, contactCount: links.length };
}

// 3. Email regex in page text
const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const emails = bodyText.match(emailRegex);

// 4. Tel links
const telLinks = document.querySelectorAll('a[href^="tel:"]').length;
```

### Critical Timing Pattern

**PROVEN WORKING** (Compass.com and others):
```javascript
// 1. Navigate with domcontentloaded (fast, doesn't wait for all resources)
await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

// 2. Fixed 3-second wait (allows JavaScript to render cards)
await new Promise(r => setTimeout(r, 3000));

// 3. Direct count (no waitForSelector which can timeout early)
const count = await page.$$eval(selector, els => els.length).catch(() => 0);
```

**WHY NOT networkidle0?** — Some sites never stop making requests (analytics, ads), so `networkidle0` may never resolve.

**WHY NOT waitForSelector?** — Can timeout before content loads on slow/dynamic sites.

---

# EXTRACTION: Card Detection

> Algorithms for finding and extracting contact cards from pages.

---

## 4-Layer Extraction Strategy

**Location**: `src/tools/lib/extraction-tester.js`
**Related Files**: `src/extraction/smart-field-extractor.js`

### Problem Statement

Contact information appears in many forms on different sites — direct mailto links, text labels, coordinate-based positions, or sometimes only visible in screenshots. We need a robust method that works across all sites.

### Approach

Try 4 extraction layers in order of reliability:

1. **Direct Hit**: Element at click point is the data (e.g., mailto link)
2. **Text-Triggered**: Click on "Email" label triggers search for nearby mailto
3. **Expanded Area**: Search ±100px region for links or text
4. **Fallback**: OCR on screenshot region

### Visual Diagram

```
User clicks on "Email" text
         │
         ▼
Layer 1: Direct Hit
         │ Check: Is there a mailto link at exact click point?
         │ Result: NO (just text "Email")
         ▼
Layer 2: Text-Triggered
         │ Check: Does text contain "Email"? Search nearby for mailto
         │ Scan: <a href="mailto:..."> within 50px
         │ Result: YES → Found "john@company.com"
         │
         ✓ RETURN: { value: "john@company.com", method: "text-triggered" }

If Layer 2 failed:
         │
         ▼
Layer 3: Expanded Area
         │ Check: Search ±100px region for any mailto/tel/text patterns
         │
         ▼
Layer 4: Fallback (OCR)
         │ Screenshot region, run Tesseract, extract text patterns
```

---

# SCROLLING: Infinite Scroll Detection

> Algorithms for handling infinite scroll pages.

---

## Selenium PAGE_DOWN Strategy

**Location**: `src/scrapers/config-scrapers/infinite-scroll-scraper.js`
**Related Files**: `src/core/selenium-manager.js`

### Problem Statement

Many modern sites use infinite scroll instead of pagination. Puppeteer's wheel events don't reliably trigger lazy loading on all sites. We need a method that works consistently.

### Approach

Use Selenium WebDriver to simulate keyboard PAGE_DOWN presses. This triggers the same scroll events as a real user pressing the Page Down key.

### Why Selenium Over Puppeteer?

| Method | Contacts Extracted (Compass.com) | Notes |
|--------|----------------------------------|-------|
| Puppeteer `page.mouse.wheel()` | 10 | Doesn't trigger scroll listeners |
| Puppeteer `page.evaluate('window.scrollBy')` | 10 | Same issue |
| Selenium `Key.PAGE_DOWN` | 584 | Works like real user |

### Step-by-Step Breakdown

```javascript
// 1. Launch Selenium with Chrome
const driver = await new Builder().forBrowser('chrome').build();
await driver.get(url);

// 2. Get body element for key events
const body = await driver.findElement({ css: 'body' });

// 3. Scroll loop
let previousCount = 0;
let noChangeCount = 0;

while (noChangeCount < maxRetries && totalScrolls < maxScrolls) {
  // Send PAGE_DOWN key
  await body.sendKeys(Key.PAGE_DOWN);
  await sleep(scrollDelay);  // Default 400ms

  // Count current contacts
  const currentCount = await countCards(driver, cardSelector);

  if (currentCount > previousCount) {
    previousCount = currentCount;
    noChangeCount = 0;
  } else {
    noChangeCount++;  // No new content, may be at end
  }
}
```

### Edge Cases

| Edge Case | How It's Handled | Why |
|-----------|------------------|-----|
| Content loads slowly | Configurable `scrollDelay` (400ms default) | Wait for lazy load |
| Reached end of content | `maxRetries` consecutive no-change scrolls | Detect end reliably |
| Very long page | `maxScrolls` limit (default 50) | Prevent infinite loop |

---

# Quick Reference: Algorithm Lookup

| I need to... | Algorithm | File |
|--------------|-----------|------|
| Find max page efficiently | Binary Search | `binary-searcher.js` |
| Check if page has contacts | Page Validation | `binary-searcher.js` |
| Extract field from card | 4-Layer Extraction | `extraction-tester.js` |
| Scroll infinite page | Selenium PAGE_DOWN | `infinite-scroll-scraper.js` |

---

# Design Decisions Log

## Use Selenium for Infinite Scroll

**Date**: 2025-12
**Context**: Puppeteer wheel events weren't triggering lazy loading on Compass.com
**Decision**: Use Selenium WebDriver with PAGE_DOWN key simulation
**Alternatives Considered**:
- Puppeteer `mouse.wheel()`: Didn't trigger scroll listeners
- Puppeteer `evaluate(scrollBy)`: Same issue
- Puppeteer `keyboard.press('PageDown')`: Inconsistent

**Consequences**:
- Positive: Works reliably (584 contacts vs 10)
- Negative: Requires system Chrome, slower startup

---

## Fixed Wait vs networkidle0

**Date**: 2025-12-22
**Context**: Binary searcher was returning 0 contacts on valid pages
**Decision**: Use 3-second fixed wait after `domcontentloaded` instead of `networkidle0`
**Alternatives Considered**:
- `networkidle0`: Never resolves on sites with continuous analytics
- `networkidle2`: Still too sensitive to background requests
- `waitForSelector`: Can timeout before dynamic content loads

**Consequences**:
- Positive: Reliable card detection on all tested sites
- Negative: 3 seconds per page (acceptable for O(log n) binary search)

---

## Direct $$eval vs waitForSelector

**Date**: 2025-12-22
**Context**: `waitForSelector` was timing out on pages with 40+ contacts
**Decision**: Use `page.$$eval(selector, els => els.length).catch(() => 0)`
**Alternatives Considered**:
- `waitForSelector` + `$$`: Times out on slow-loading dynamic content
- `page.$$(selector).length`: Throws if selector not found

**Consequences**:
- Positive: Returns 0 gracefully if no elements, never throws
- Negative: None observed

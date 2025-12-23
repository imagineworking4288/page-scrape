# Changelog

> Append-only historical record. Never delete entries.

---

## 2025

### 2025-12-22 - Binary Searcher Card Detection Fix

**Type**: Bugfix
**Files**: `src/features/pagination/binary-searcher.js`

**What**: Fixed `_validatePage()` to use `page.$$()` instead of `page.evaluate(querySelectorAll)`.

**Why**: Binary searcher was returning 0 contacts on pages where the scraper successfully found cards. The scraper uses `page.$$(selector)` (Puppeteer native API) while binary searcher was using `page.evaluate()`. Also increased timeout from 5s to 10s to match scraper.

**How**:
- Changed from `page.evaluate((sel) => document.querySelectorAll(sel).length)` to `const cards = await page.$$(this.cardSelector)`
- Added 10s timeout to match pagination-scraper
- Continue counting cards even if waitForSelector times out (same as scraper behavior)

---

### 2025-12-22 - Binary Searcher HardCap Enforcement

**Type**: Bugfix
**Files**: `src/features/pagination/binary-searcher.js`

**What**: Added hardCap checks in boundary confirmation logic (Step 4).

**Why**: When all pages are valid (e.g., Compass.com with 200+ pages), the recursive boundary confirmation would crawl linearly past hardCap forever instead of stopping.

**How**: Added `if (lastValidPage >= hardCap)` checks at three points:
1. At start of Step 4
2. After `next1` is valid
3. After `next2` is valid (before recursing)

---

### 2025-12-22 - Context System Initialization

**Type**: Feature
**Files**: `context/*.md`

**What**: Populated context documentation system with actual project content.

**Why**: Template files contained placeholders. Updated with real project architecture, APIs, and dependencies.

---

### 2025-12-22 - ProjectContext.md Cleanup

**Type**: Refactor
**Files**: `ProjectContext.md` (root)

**What**: Rebuilt ProjectContext.md from scratch, reduced from ~2000 lines to ~200 lines.

**Why**: Previous version had accumulated bloat with exhaustive file listings, historical notes, and redundant documentation.

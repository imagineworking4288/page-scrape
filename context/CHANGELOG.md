# Changelog

> **Append-only historical record.** Never delete entries. Newest entries at the top.

---

## How to Write Changelog Entries

Each entry should include:

**Type** — What kind of change (Feature, Bugfix, Refactor, Breaking, Docs, Perf)
**Files** — Which files were modified
**What** — What changed (the observable difference)
**Why** — The problem that prompted this change
**How** — Key implementation details (especially for complex changes)
**Impact** — What other parts of the codebase are affected

---

# 2025

## 2025-12-22 — Binary Searcher Card Detection Fix

**Type**: Bugfix
**Files**: `src/features/pagination/binary-searcher.js`
**Impact**: High — Affects all pagination discovery

### What Changed

Fixed binary searcher returning 0 contacts on valid pages. Pages 56+ on Compass.com (and similar dynamic sites) were incorrectly reported as empty despite having 40+ contact cards.

Two key changes:
1. Increased wait time from 1 second to 3 seconds after navigation
2. Changed card counting from `waitForSelector` + `$$` to direct `$$eval` with `.catch(() => 0)`

### Why

The binary searcher was failing on Compass.com during pagination discovery. Diagnostic testing showed:
- Pages 1 and 56 both have 40 cards when tested directly
- Binary searcher was returning 0 for pages 56+
- Root cause: timing and method issues, not selector problems

### How

```javascript
// BEFORE (broken)
await page.goto(url, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 1000));  // Too short
await page.waitForSelector(selector);  // Times out
const cards = await page.$$(selector);

// AFTER (working)
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));  // Fixed 3s wait
const count = await page.$$eval(selector, els => els.length).catch(() => 0);
```

Key insights:
- `networkidle0` may never resolve on sites with continuous analytics
- `waitForSelector` can timeout before dynamic content loads
- `$$eval` with `.catch(() => 0)` returns gracefully if selector not found
- 3 seconds is sufficient for most dynamic content to render

### Related

- See `Algorithms.md` → "Binary Search for Max Page" for full algorithm documentation
- See `Algorithms.md` → "Page Validation Strategy" for timing pattern details

---

## 2025-12-22 — Context Documentation System Initialized

**Type**: Docs
**Files**: `context/Summary.md`, `context/ProjectContext.md`, `context/ProjectStructure.md`, `context/API.md`, `context/Algorithms.md`, `context/Dependencies.md`, `context/CHANGELOG.md`
**Impact**: Low — Documentation only

### What Changed

Created comprehensive project documentation system with 7 interconnected files:
- **Summary.md**: Navigation hub and project overview
- **ProjectContext.md**: Operational guide with commands, patterns, diagnostics
- **ProjectStructure.md**: Complete directory tree with file purposes
- **API.md**: Function encyclopedia for key modules
- **Algorithms.md**: In-depth algorithm explanations (binary search, extraction, scrolling)
- **Dependencies.md**: All packages with usage patterns and gotchas
- **CHANGELOG.md**: This file

### Why

Project needed structured documentation to:
1. Preserve knowledge across sessions (context continuity)
2. Document critical patterns that must be followed
3. Explain non-obvious algorithm choices
4. Track changes over time

### How

Analyzed codebase structure, read key files, and populated templates with project-specific content. Focused on documenting:
- Today's binary searcher fix as first changelog entry
- Critical timing patterns that caused bugs
- Algorithm explanations for binary search and infinite scroll

---

# Changelog Entry Types

| Type | When to Use | Example |
|------|-------------|---------|
| **Feature** | New functionality added | "Added profile enrichment system" |
| **Bugfix** | Something broken was fixed | "Fixed card detection returning 0" |
| **Refactor** | Code restructured, behavior unchanged | "Moved pagination logic to separate module" |
| **Breaking** | Change that breaks existing usage | "Changed API signature of scrape()" |
| **Docs** | Documentation updates | "Updated API.md with new functions" |
| **Perf** | Performance improvements | "Reduced page load checks by 50%" |

---

# Quick Stats

| Metric | Value |
|--------|-------|
| Total Entries | 2 |
| Features Added | 0 |
| Bugs Fixed | 1 |
| Last Updated | 2025-12-22 |

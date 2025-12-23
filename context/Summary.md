# Context System Summary

> **Claude Code**: This is your entry point. Read this first, then navigate to specific files as needed.

**Project**: Page Scrape — Universal Professional Directory Scraper
**Context System Version**: 2.0 (Encyclopedia Edition)
**Last Updated**: 2025-12-22

---

## Quick Navigation

| I need to understand... | Go To |
|-------------------------|-------|
| What this project does and how to run it | `ProjectContext.md` |
| Where files are located and folder structure | `ProjectStructure.md` |
| Every function in detail (internal + external) | `API.md` |
| How complex algorithms work (the "why") | `Algorithms.md` |
| What packages are installed and why | `Dependencies.md` |
| What changed and when | `CHANGELOG.md` |

---

## Project Overview

**Page Scrape** is an enterprise-grade web scraping platform for extracting contact information from professional directories (law firms, real estate agencies, corporate directories). It features visual config generation, intelligent pagination handling with binary search, profile enrichment, and Google Sheets export.

**Key Capabilities:**
- **Visual Config Generator**: Interactive 4-layer detection with click-to-select field mapping
- **Smart Pagination**: Binary search algorithm to find true max pages efficiently
- **Infinite Scroll Support**: Selenium PAGE_DOWN simulation for dynamic loading sites
- **Profile Enrichment**: Automated profile page visits to validate and fill missing data
- **Multi-Method Extraction**: DOM-based, coordinate-based, mailto/tel link detection
- **Google Sheets Export**: Direct export with configurable columns

---

## Context Files Explained

```
context/
├── Summary.md           # You are here — navigation hub
├── ProjectContext.md    # Operational guide (what, why, how to run)
├── ProjectStructure.md  # Directory tree with file purposes
├── API.md               # COMPLETE function encyclopedia (internal + external)
├── Algorithms.md        # Complex logic explained step-by-step
├── Dependencies.md      # All packages with purposes and notes
└── CHANGELOG.md         # Historical record of all changes
```

### What Makes This Different (Encyclopedia Edition)

This context system goes beyond quick reference. Each file in `API.md` documents:

1. **Every function** — both exported (external) and private (internal)
2. **Parameters and returns** — with type signatures and example values
3. **Connection maps** — showing what calls what and why
4. **Data structures** — the shape of objects flowing through the code
5. **Critical notes** — bugs fixed, gotchas, and implementation details

The `Algorithms.md` file explains the *thinking* behind complex code — not just what it does, but why it works that way.

---

## Quick Commands

```bash
# Validation (test config works)
node orchestrator.js --validate --url "URL" --limit 2

# Full pipeline (complete workflow)
node orchestrator.js --full-pipeline --url "URL" --auto

# Generate new config
node src/tools/config-generator.js --url "URL"

# Scrape with pagination
node orchestrator.js --url "URL" --paginate --max-pages 50

# Infinite scroll sites
node orchestrator.js --url "URL" --scroll

# Enrichment
node src/tools/enrich-contacts.js --input output/scrape.json

# Export to Google Sheets
node src/tools/export-to-sheets.js --input output/file.json --name "My Contacts"
```

---

## How to Use This System

### Starting a Session

1. Read `ProjectContext.md` for current state and active warnings
2. Check `CHANGELOG.md` for recent changes that might affect your work

### During Development

- **Adding a function?** Follow the format in `API.md` — document both internal and external
- **Building complex logic?** Add an entry to `Algorithms.md` explaining the approach
- **Adding a package?** Document it in `Dependencies.md` with the "why"
- **Creating a file?** Update `ProjectStructure.md` with its purpose

### After Making Changes

1. Update the relevant context file(s)
2. Add entry to `CHANGELOG.md` with date, type, files, and explanation
3. Update "Last Updated" dates in modified files

---

## Architecture at a Glance

```
┌─────────────────────┐
│   orchestrator.js   │  ← Main CLI entry point
└─────────┬───────────┘
          │
    ┌─────┴─────┐
    ▼           ▼
┌────────┐  ┌────────────────┐
│Scraper │  │ Full Pipeline  │
│Factory │  │   Workflow     │
└───┬────┘  └────────────────┘
    │
┌───┴────────────────────────┐
│                            │
▼                            ▼
┌────────────────┐    ┌────────────────────┐
│  Pagination    │    │   Infinite Scroll  │
│    Scraper     │    │      Scraper       │
└───────┬────────┘    └────────────────────┘
        │
        ▼
┌────────────────┐
│   Paginator    │ → Pattern Detector → URL Generator
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ Binary Searcher│ → Finds true max page efficiently
└────────────────┘
```

---

## Current State

**Active Branch**: main
**Last Stable Commit**: 2b603b9 - Bin Searcher Updated
**In Progress**: Binary searcher card detection fix completed
**Known Issues**: None currently active

---

## Recent Activity

| Date | Summary |
|------|---------|
| 2025-12-22 | Fixed binary searcher card detection for Compass.com (3s wait, direct $eval) |
| 2025-12-22 | Context documentation system initialized |

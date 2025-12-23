# Context System Summary

> **Claude Code**: This is your entry point. Read this first, then navigate to specific files as needed.

**Project**: Page Scrape
**Context System Version**: 1.0
**Last Updated**: December 22, 2025

---

## Quick Navigation

| Need | Go To |
|------|-------|
| What should I do? How does this work? | `ProjectContext.md` |
| Where is a file? What's the structure? | `ProjectStructure.md` |
| What functions exist? What are their signatures? | `API.md` |
| What packages are installed? Why? | `Dependencies.md` |
| What changed before? Why was it done that way? | `CHANGELOG.md` |

---

## Project Overview

**Page Scrape** is a universal professional directory scraper. It extracts contacts (name, email, phone, title, location, profileUrl) from websites using config-driven selectors and coordinate-based extraction.

**Key capabilities**:
- Visual config generator for creating site-specific extraction rules
- Pagination handling with binary search for true max page
- Infinite scroll support via Selenium PAGE_DOWN
- Profile enrichment by visiting individual profile pages
- Export to JSON and Google Sheets

---

## Context Files

```
context/
├── Summary.md           # You are here - navigation and overview
├── ProjectContext.md    # Operational guide (read every session)
├── ProjectStructure.md  # Directory tree and file purposes
├── API.md               # Key functions in the codebase
├── Dependencies.md      # All packages with purposes
└── CHANGELOG.md         # Historical record
```

---

## Quick Commands

```bash
# Generate config for new site
node src/tools/config-generator.js --url "URL"

# Scrape with pagination
node orchestrator.js --paginate --url "URL" --config domain-com

# Scrape with infinite scroll
node orchestrator.js --scroll --force-selenium --url "URL" --config domain-com

# Full pipeline
node orchestrator.js --full-pipeline --auto --url "URL"

# Run tests
npm test
npm run test:nav
```

---

## How to Use This System

### At Session Start
1. Read `ProjectContext.md` for current patterns and warnings
2. Check "Recent Changes" for context on current work

### During Work
- Creating files? Check `ProjectStructure.md` for conventions
- Need function details? Check `API.md`
- Adding packages? Check `Dependencies.md` first

### After Changes
1. Update relevant context files if significant
2. Add to "Recent Changes" in `ProjectContext.md`

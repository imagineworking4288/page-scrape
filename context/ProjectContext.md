# Project Context

> **Claude Code**: Read this at session start. Keep lean—details go in API.md.

**Project**: Page Scrape
**Updated**: December 22, 2025

---

## What This Project Does

Universal professional directory scraper that extracts contacts (name, email, phone, title, location, profileUrl) from websites using config-driven selectors and coordinate-based extraction.

---

## Tech Stack

**Runtime**: Node.js
**Browser**: Puppeteer (stealth) + Selenium (for infinite scroll)
**Key Libraries**: puppeteer-extra-plugin-stealth, selenium-webdriver, googleapis, tesseract.js, winston

---

## Entry Points

```bash
node orchestrator.js --paginate --url "URL" --config domain-com   # Paginated sites
node orchestrator.js --scroll --force-selenium --url "URL"        # Infinite scroll
node orchestrator.js --full-pipeline --auto --url "URL"           # Complete workflow
node src/tools/config-generator.js --url "URL"                    # Create site config
```

---

## Architecture Summary

```
orchestrator.js → scraper (pagination/scroll/single) → extractor → export
                         ↓
              paginator → binary-searcher → pattern-detector
                         ↓
              profile-enricher (optional)
```

**Key Decisions**:
- Config-driven: Each site has a JSON config with card selector and field extraction rules
- Coordinate-based extraction: Fields extracted by relative position within cards
- Binary search: Finds true max page efficiently instead of linear crawl

---

## Critical Patterns

### Card Detection
Both scraper and binary-searcher must use identical card detection:
```javascript
const cards = await page.$$(this.cardSelector);  // Puppeteer native API
```

### HardCap Enforcement
Binary searcher stops at hardCap to prevent infinite crawl:
```javascript
if (lastValidPage >= hardCap) {
  return { trueMax: hardCap, isCapped: true };
}
```

### Config Structure
```json
{
  "cardPattern": { "primarySelector": "div.card" },
  "fields": {
    "name": { "userValidatedMethod": "coordinate-text", "coordinates": {...} },
    "email": { "userValidatedMethod": "mailto-link", "coordinates": {...} }
  }
}
```

---

## Active Warnings

| Warning | Details | Workaround |
|---------|---------|------------|
| None currently | - | - |

---

## Diagnostic Table

| Symptom | Check First | Fix |
|---------|-------------|-----|
| Binary search runs forever | hardCap checks in boundary confirmation | Ensure all paths check lastValidPage >= hardCap |
| Cards not detected | cardSelector in config | Verify selector matches DOM with browser DevTools |
| Page shows 0 contacts | _validatePage method | Ensure using page.$$() not page.evaluate() |

---

## Recent Changes

| Date | Change | Files |
|------|--------|-------|
| 2025-12-22 | Fixed _validatePage to use page.$$() like scraper | binary-searcher.js |
| 2025-12-22 | Added hardCap enforcement in boundary confirmation | binary-searcher.js |
| 2025-12-22 | Rebuilt ProjectContext.md (clean version) | ProjectContext.md |

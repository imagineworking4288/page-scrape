# Example: Subsystem Report

This is an example of what a subsystem exploration report looks like.
Generated with: `npm run report:subsystem pagination`

---

## What This Report Contains

1. **Files List** - All files in the subsystem with:
   - Line count
   - Exports
   - Import count
   - Key functions

2. **Related Files** - Other files that interact with this subsystem

3. **Quick Overview** - What this subsystem does

---

## Sample Output

```markdown
# Subsystem Report: Pagination System

**Generated:** 2025-12-04T06:14:15.800Z
**Description:** URL-based and infinite scroll pagination handling

---

## Files

### src/features/pagination/paginator.js
- **Lines:** 412
- **Exports:** Paginator
- **Imports:** 5 modules
- **Functions/Methods:** 12

**Key Functions:**
- `constructor(browserManager, rateLimiter, logger, configLoader)`
- `async paginate(baseUrl, options)`
- `async detectPattern(page, url)`
- `async generatePages(pattern, maxPages)`
- `async scrapePages(urls, scraper)`
- ...

### src/features/pagination/pattern-detector.js
- **Lines:** 287
- **Exports:** PatternDetector
- **Imports:** 2 modules
- **Functions/Methods:** 8

**Key Functions:**
- `detect(url, page)`
- `detectUrlPattern(url)`
- `detectInfiniteScroll(page)`
- ...

## Related Files

- src/scrapers/config-scraper.js
- orchestrator.js
```

---

## How to Use This Report

1. **Upload to Human Claude** for analysis
2. Reference specific functions when asking questions
3. Use as context for implementation planning

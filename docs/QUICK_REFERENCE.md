# Quick Reference

Essential commands and common workflows.

---

## Common Commands

### Scraping
```bash
# Basic scrape
node orchestrator.js --url "URL" --limit 20

# With config file
node orchestrator.js --url "URL" --method config --config sitename

# Visible browser
node orchestrator.js --url "URL" --headless false

# With pagination
node orchestrator.js --url "URL" --paginate --max-pages 10
```

### Config Generator
```bash
# Create new config visually
node src/tools/config-generator.js --url "URL"

# Site diagnostics
node src/tools/site-tester.js --url "URL"
```

### Testing
```bash
npm test              # Main tests
npm run test:all      # All tests
```

### Reports
```bash
npm run report:subsystem pagination
npm run report:file src/utils/contact-extractor.js
npm run report:pattern "extractEmails"
npm run report:deps src/scrapers/
```

---

## Common Workflows

### Debug Extraction Issues
1. Generate extraction subsystem report
2. Check contact-extractor.js patterns
3. Test with visible browser

### Create Site Config
1. Run config-generator with URL
2. Select cards, then fields
3. Save and test config

### Add New Feature
1. Generate subsystem report
2. Plan with Human Claude
3. Implement changes
4. Run tests

---

## Key Files

| Need to... | Check... |
|------------|----------|
| Extract contacts | `src/utils/contact-extractor.js` |
| Configure site | `configs/*.json` |
| Add pagination | `src/features/pagination/` |
| Debug scraping | `src/scrapers/config-scraper.js` |
| Modify UI overlay | `src/tools/assets/` |

---

## Documentation

| Topic | Document |
|-------|----------|
| Project layout | [PROJECT_STRUCTURE.md](architecture/PROJECT_STRUCTURE.md) |
| System design | [SYSTEM_ARCHITECTURE.md](architecture/SYSTEM_ARCHITECTURE.md) |
| Development | [DEVELOPMENT_WORKFLOW.md](workflows/DEVELOPMENT_WORKFLOW.md) |
| All docs | [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) |

---

## Subsystems

| Name | Command | Key Files |
|------|---------|-----------|
| pagination | `npm run report:subsystem pagination` | `src/features/pagination/` |
| extraction | `npm run report:subsystem extraction` | `src/utils/contact-extractor.js` |
| configgen | `npm run report:subsystem configgen` | `src/tools/` |
| scrapers | `npm run report:subsystem scrapers` | `src/scrapers/` |
| browser | `npm run report:subsystem browser` | `src/utils/browser-manager.js` |
| config | `npm run report:subsystem config` | `src/utils/config-loader.js` |

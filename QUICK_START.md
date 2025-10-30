# Quick Start Guide

## Installation (30 seconds)
```bash
cd universal-scraper
npm install
```

## Test Week 1 Foundation
```bash
node orchestrator.js --url https://example.com
```

## All Available Commands

### Basic Usage
```bash
# Scrape with defaults (100 contacts, all outputs)
node orchestrator.js --url https://directory-site.com

# Specify limit
node orchestrator.js --url https://directory-site.com --limit 500

# CSV output only
node orchestrator.js --url https://directory-site.com --output csv
```

### Get Help
```bash
node orchestrator.js --help
```

### View Version
```bash
node orchestrator.js --version
```

### Run Tests (When implemented)
```bash
npm test
```

## Week-by-Week Progress

### ✅ Week 1 (Complete)
- Browser manager
- Rate limiter
- Logger
- Basic CLI
- Project structure

### 🚧 Week 2 (Next)
Prompt: `"Build Week 2: Simple Scraper"`
- Simple scraper implementation
- Pattern recognition
- Contact extraction

### 📅 Future Weeks
- Week 3: Click Handler Scraper
- Week 4: Profile Resolver Scraper
- Week 5: Pagination Detection
- Week 6: Template Adapters
- Week 7: SQLite & CSV Export
- Week 8: Google Sheets Integration
- Week 9: Deduplication & Normalization
- Week 10: Testing & Documentation

## Troubleshooting One-Liners

```bash
# Check if dependencies are installed
npm list --depth=0

# View recent logs
tail -f logs/scraper.log

# Clear logs
rm -rf logs/*.log

# Test with verbose output
LOG_LEVEL=debug node orchestrator.js --url https://example.com

# Force garbage collection (if needed)
node --expose-gc orchestrator.js --url https://example.com
```

## Expected Week 1 Output
```
✓ Browser initialized successfully
✓ Navigation completed without errors
✓ Rate limiting active
✓ Memory management active
✓ CAPTCHA detection active
```

## File Structure Summary
```
utils/              ← Week 1 (DONE ✅)
scrapers/           ← Weeks 2-4
pagination/         ← Week 5
adapters/           ← Week 6
io/                 ← Weeks 7-9
tests/              ← Weeks 4-10
orchestrator.js     ← Week 1 (DONE ✅)
```

## Common Issues

**Can't find module**: Run `npm install`  
**Permission errors**: Check Node.js version (need 16+)  
**Browser won't launch**: Puppeteer installing dependencies  
**CAPTCHA detected**: Normal behavior, try different URL

## Next Steps
1. ✅ Install: `npm install`
2. ✅ Test: `node orchestrator.js --url https://example.com`
3. ✅ Check logs: `cat logs/scraper.log`
4. 📅 Ready for Week 2!

---
**Status**: Week 1 Foundation Complete  
**Time to Week 2**: Ready when you are!

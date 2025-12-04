# Week 2 Setup & Testing Guide

## 🚀 Quick Setup (5 minutes)

### Prerequisites
- Node.js 18+ installed
- npm or yarn
- Internet connection

### Installation Steps

1. **Navigate to project directory**
```bash
cd universal-scraper
```

2. **Install dependencies**
```bash
npm install
```

This will install:
- ✅ puppeteer (browser automation)
- ✅ puppeteer-extra + stealth plugin (anti-detection)
- ✅ winston (logging)
- ✅ commander (CLI)
- ✅ cli-table3 (table formatting)
- ✅ dotenv (environment variables)

Installation takes 2-3 minutes due to Puppeteer downloading Chromium (~170MB).

3. **Create environment file**
```bash
# On Mac/Linux:
cp .env.example .env

# On Windows CMD:
copy .env.example .env

# On Windows PowerShell:
Copy-Item .env.example .env
```

## ✅ Verify Installation

Run the test suite:
```bash
npm test
```

Expected output:
```
═══════════════════════════════════════
  SIMPLE SCRAPER TESTS
═══════════════════════════════════════

✓ Email Pattern - Valid Emails
✓ Email Pattern - Invalid Emails
✓ Phone Pattern - US Formats
✓ Phone Normalization
✓ Email Validation
✓ Contact Deduplication
✓ Card Selectors Defined
✓ Contact Object Structure
✓ Empty Input Handling
✓ Null Field Handling

═══════════════════════════════════════
  TEST SUMMARY
═══════════════════════════════════════
Total Tests: 10
Passed: 10
Failed: 0

✓ All tests passed!
```

## 🧪 Test the Scraper

### Test 1: Compass Real Estate Directory

```bash
node orchestrator.js --url "https://www.compass.com/agents/"
```

Expected results:
- ✅ Browser launches successfully
- ✅ Page loads without CAPTCHA
- ✅ Detects contact cards on page
- ✅ Extracts 40-70 contacts
- ✅ Saves to `output/contacts-[timestamp].json`
- ✅ Displays sample contacts in terminal

### Test 2: With Limit

```bash
node orchestrator.js --url "https://www.compass.com/agents/" --limit 10
```

Should extract exactly 10 contacts.

### Test 3: Visible Browser Mode

```bash
node orchestrator.js --url "https://www.compass.com/agents/" --headless false
```

You'll see the browser window open and navigate the page.

### Test 4: Custom Delays

```bash
node orchestrator.js --url "https://www.compass.com/agents/" --delay "3000-7000"
```

Slower scraping with 3-7 second delays (more human-like).

## 📊 Understanding Output

### Console Output
```
═══════════════════════════════════════
  UNIVERSAL PROFESSIONAL SCRAPER v1.0
═══════════════════════════════════════

Target URL: https://www.compass.com/agents/
Output: json

Initializing components...
Launching browser with stealth configuration...
Browser launched successfully
Starting simple scraper...
Detecting card pattern...
Found 48 cards with selector: .agent-card
Extracted 48 contacts

═══════════════════════════════════════
  SCRAPING COMPLETE
═══════════════════════════════════════
Statistics:
  Total Contacts: 45 (3 duplicates removed)
  With Email: 38
  With Phone: 42
  With Both: 35
  Complete (Name+Email+Phone): 35
  High Confidence: 35
  Medium Confidence: 8
  Low Confidence: 2

Sample Contacts (first 5):
┌────────────────────────┬──────────────────────────────┬────────────────────┬────────────┐
│ Name                   │ Email                        │ Phone              │ Confidence │
├────────────────────────┼──────────────────────────────┼────────────────────┼────────────┤
│ John Smith             │ john.smith@compass.com       │ (212) 555-0100     │ high       │
│ Sarah Johnson          │ sarah.johnson@compass.com    │ (212) 555-0101     │ high       │
│ Michael Brown          │ michael.brown@compass.com    │ (212) 555-0102     │ high       │
│ Emily Davis            │ emily.davis@compass.com      │ (212) 555-0103     │ high       │
│ David Wilson           │ david.wilson@compass.com     │ (212) 555-0104     │ high       │
└────────────────────────┴──────────────────────────────┴────────────────────┴────────────┘

✓ Contacts saved to: output/contacts-2025-10-30T23-45-12-000Z.json
✓ Scraping completed successfully
```

### JSON Output
File: `output/contacts-[timestamp].json`

```json
[
  {
    "name": "John Smith",
    "email": "john.smith@compass.com",
    "phone": "(212) 555-0100",
    "source": "visible_text",
    "confidence": "high",
    "rawText": "John Smith Real Estate Agent..."
  }
]
```

## 🎯 What Week 2 Can Do

### ✅ Capabilities
- Extract contacts from any professional directory
- Detect repeating card patterns automatically
- Extract emails using regex
- Extract phone numbers in multiple formats
- Normalize phone numbers to (XXX) XXX-XXXX
- Identify names using heuristics
- Deduplicate contacts
- Confidence scoring
- Export to JSON

### ⏳ Not Yet Implemented (Future Weeks)
- Detail page scraping (Week 3)
- JavaScript/dynamic content (Week 4)
- Multi-page pagination (Week 5)
- Site-specific adapters (Week 6)
- SQLite export (Week 7)
- CSV export (Week 8)
- Google Sheets export (Week 9)

## 🐛 Troubleshooting

### Issue: "CAPTCHA detected"
**Solution:**
```bash
# Try with visible browser
node orchestrator.js --url "..." --headless false

# Or increase delays
node orchestrator.js --url "..." --delay "5000-10000"
```

### Issue: "Navigation timeout"
**Solution:** Site may be slow or blocked. Try:
```bash
# Increase timeout in .env
BROWSER_TIMEOUT=60000
```

### Issue: "No contacts found"
**Possible causes:**
1. Site uses JavaScript to load content (Week 4 will handle this)
2. Contact info is on detail pages (Week 3 will handle this)
3. Site structure doesn't match patterns (may need adapter in Week 6)

**Debug:**
```bash
# Run with visible browser to see what's happening
node orchestrator.js --url "..." --headless false
```

### Issue: npm install hangs on Puppeteer
**Solution:**
```bash
# Install with verbose output to see progress
npm install --verbose
```

Puppeteer downloads ~170MB of Chromium, so it takes 2-3 minutes on good internet.

### Issue: Permission errors
**Solution:**
```bash
# On Mac/Linux, you may need to make orchestrator executable
chmod +x orchestrator.js
```

## 📋 Testing Checklist

Before moving to Week 3, verify:

- [ ] `npm test` passes all 10 tests
- [ ] Can scrape Compass.com successfully
- [ ] Extracts 40+ contacts from test site
- [ ] JSON file is created in `output/` directory
- [ ] Console shows statistics correctly
- [ ] Table displays sample contacts
- [ ] No errors in `logs/error.log`
- [ ] Headless mode works
- [ ] Non-headless mode works
- [ ] Custom delays work
- [ ] Limit parameter works

## 🔍 Test Other Sites

Try these professional directories:

### Real Estate
- Compass.com/agents
- Zillow profile pages
- Realtor.com agent directories

### Lawyers
- Avvo.com directories
- Martindale.com

### Doctors
- Healthgrades.com
- Zocdoc.com directories

### Business
- LinkedIn company pages
- Chamber of Commerce directories

## 📖 Understanding the Code

### Key Files for Week 2

**orchestrator.js** (Main entry point)
- Parses CLI arguments
- Initializes components
- Calls SimpleScraper
- Formats and saves output

**scrapers/simple-scraper.js** (Core scraper)
- `detectCardPattern()` - Finds repeating elements
- `extractContacts()` - Pulls data from cards
- `postProcessContacts()` - Deduplication & normalization

**utils/browser-manager.js** (Browser control)
- Launches Puppeteer with stealth
- Rotates user agents
- Manages memory
- Detects CAPTCHAs

**utils/rate-limiter.js** (Request throttling)
- Random delays
- Exponential backoff
- Retry logic

**utils/logger.js** (Logging)
- Winston-based logging
- File rotation
- Memory tracking

## 🎓 Next Steps

Once Week 2 is working well:

1. **Week 3**: Add LinkScraper to click into detail pages
2. **Week 4**: Add JavaScriptScraper for dynamic content
3. **Week 5**: Add pagination support
4. **Week 6**: Add site-specific adapters
5. **Week 7**: Add SQLite export
6. **Week 8**: Add CSV export
7. **Week 9**: Add Google Sheets export
8. **Week 10**: Integration & polish

## 🆘 Getting Help

If stuck:
1. Check `logs/scraper.log` for detailed logs
2. Check `logs/error.log` for errors
3. Run with `--headless false` to see browser
4. Try a different test site
5. Verify internet connection (Puppeteer needs to download Chromium)

## ✨ Success Criteria

Week 2 is complete when:
- ✅ All tests pass
- ✅ Can scrape real directory sites
- ✅ Extracts names, emails, phones
- ✅ Handles sites without cards (full page mode)
- ✅ Normalizes and deduplicates
- ✅ Exports clean JSON

Good luck! 🚀

# Project Cleanup and Troubleshooting Guide

## Current Status
According to your test output, **the scraper is now working successfully**:
- Successfully launched browser
- Navigated to target URL
- Extracted 40 contacts with emails and phones
- Saved to JSON output file

## Part 1: Redundant Files to Remove

### Diagnostic/Test Files (Pick ONE to keep)

**KEEP THIS ONE:**
```
diagnose.js - Most comprehensive diagnostic tool
```

**DELETE THESE (redundant):**
```
diag.js - Simpler version, redundant with diagnose.js
test-logger.js - Only tests logger, redundant with diagnose.js
test-startup.js - Only tests startup, redundant with diagnose.js
apply-fix.bat - Batch file for Windows fix - no longer needed since fix is applied
```

### Documentation Files (Already Fixed)

**DELETE THESE (issue already resolved):**
```
orchestrator-corrected.js - If it exists, the fix is already in orchestrator.js
orchestrator.js.backup - If it exists, old backup no longer needed
FIX_GUIDE.md - If it exists, issue already resolved
```

### Future Stub Files (Not Implemented Yet)

These are placeholders for future weeks. You can either:
1. **Keep them** as reminders for future development
2. **Delete them** if you want a cleaner project now

**Stub files (Weeks 4-10):**
```
scrapers/js-scraper.js - Week 4 stub
scrapers/profile-resolver-scraper.js - Week 4 stub
pagination/infinite-scroll.js - Week 5 stub
pagination/navigator.js - Week 5 stub
adapters/loader.js - Week 6 stub
adapters/registry.json - Week 6 stub
adapters/template-adapter.json - Week 6 stub
io/csv-handler.js - Week 7 stub
io/sqlite-handler.js - Week 7 stub
io/sheets-handler.js - Week 8 stub
io/normalizer.js - Week 9 stub
io/deduplicator.js - Week 9 stub
tests/pagination-test.js - Week 5 stub
tests/full-run-test.js - Week 10 stub
```

**RECOMMENDATION:** Delete stub files for now. You can recreate them when needed.

---

## Part 2: Files to KEEP (Core Functionality)

### Essential Files:
```
orchestrator.js - Main entry point ✓
package.json - Dependencies ✓
package-lock.json - Dependency lock ✓

utils/logger.js - Logging system ✓
utils/browser-manager.js - Browser control ✓
utils/rate-limiter.js - Rate limiting ✓

scrapers/simple-scraper.js - Working scraper ✓

tests/scraper-test.js - Unit tests ✓

.env.example - Configuration template ✓
.gitignore - Git configuration ✓
```

### Keep ONE diagnostic file:
```
diagnose.js - Most comprehensive ✓
```

---

## Part 3: Clean Project Structure

After cleanup, your project should look like this:

```
page-scrape/
├── orchestrator.js           # Main entry point
├── package.json
├── package-lock.json
├── diagnose.js              # Diagnostic tool
├── .env.example
├── .gitignore
│
├── utils/
│   ├── logger.js
│   ├── browser-manager.js
│   └── rate-limiter.js
│
├── scrapers/
│   └── simple-scraper.js
│
├── tests/
│   └── scraper-test.js
│
├── logs/                     # Auto-created
│   ├── scraper.log
│   ├── error.log
│   └── exceptions.log
│
└── output/                   # Auto-created
    └── contacts-*.json
```

---

## Part 4: Current Issues and Troubleshooting

### Issue #1: Name Extraction Not Working

**Observation:** All 40 contacts show "N/A" for name

**Problem:** The name extraction logic is too strict in `scrapers/simple-scraper.js`

**Location:** Line 134-155 in simple-scraper.js

**Current Logic:**
```javascript
// Current pattern requires:
// - First name starting with capital
// - Last name starting with capital
// - Pattern: /^[A-Z][a-z]+(?:\s[A-Z][a-z.]+)+$/
```

**Issue:** This pattern is too restrictive. It rejects:
- Names with hyphens (e.g., "John Smith-Jones")
- Names with apostrophes (e.g., "O'Brien")
- Middle initials (e.g., "John Q. Public")
- Single-word names
- Names in all caps (e.g., "JOHN DOE")

**Fix Needed:** Relax the name extraction pattern

---

### Issue #2: Low Confidence Scores

**Observation:** All 40 contacts marked as "low" confidence

**Problem:** The confidence scoring logic requires all three fields (name, email, phone)

**Current Logic:**
```javascript
confidence: (name && emails.length > 0 && phones.length > 0) ? 'high' : 
           ((name && (emails.length > 0 || phones.length > 0)) ? 'medium' : 'low')
```

**Issue:** Since names aren't being extracted, all contacts get "low" confidence even though they have email + phone

**Fix Needed:** Adjust confidence logic to recognize email+phone as "medium" confidence

---

### Issue #3: Memory Management

**Potential Issue:** The browser manager recycles pages every 50 navigations or 1GB memory growth

**Current Setup:**
- Good: Automatic page recycling
- Good: Memory monitoring
- Good: User-agent rotation

**Status:** Working well, but monitor for long scraping sessions

---

## Part 5: Recommended Fixes

### Fix #1: Improve Name Extraction

**File:** `scrapers/simple-scraper.js`

**Replace the name extraction logic (lines 134-174):**

```javascript
// Helper to extract name
const extractName = (element) => {
  // Try common name selectors first
  const nameSelectors = [
    'h1', 'h2', 'h3', 'h4',
    '.name', '.title', '.agent-name', '.profile-name',
    '[class*="name"]', '[class*="title"]', '[class*="agent"]',
    'a.profile-link', 'a[href*="/agent/"]', 'a[href*="/profile/"]',
    'strong', 'b'
  ];
  
  for (const sel of nameSelectors) {
    const nameEl = element.querySelector(sel);
    if (nameEl) {
      let text = nameEl.textContent.trim();
      
      // Clean up common prefixes/suffixes
      text = text.replace(/^(agent|broker|realtor|mr\.|mrs\.|ms\.|dr\.)\s+/i, '');
      text = text.replace(/,\s*(jr|sr|ii|iii|iv)\.?$/i, '');
      
      // Check if it looks like a name (more flexible pattern)
      // Accepts: John Doe, John Q. Doe, O'Brien, Smith-Jones, etc.
      if (/^[A-Z][a-z'\-]+(?:\s+[A-Z]\.?\s*)?(?:\s+[A-Z][a-z'\-]+)+$/i.test(text)) {
        return text;
      }
      
      // Also accept names in all caps (convert to title case)
      if (/^[A-Z\s'\-]{5,50}$/.test(text) && text.split(/\s+/).length >= 2) {
        return text.split(/\s+/)
          .map(word => word.charAt(0) + word.slice(1).toLowerCase())
          .join(' ');
      }
    }
  }
  
  // Fallback: Look for text that looks like a name in links
  const links = element.querySelectorAll('a');
  for (const link of links) {
    const text = link.textContent.trim();
    if (/^[A-Z][a-z'\-]+(?:\s+[A-Z]\.?\s*)?(?:\s+[A-Z][a-z'\-]+)+$/.test(text) && 
        text.length < 50) {
      return text;
    }
  }
  
  return null;
};
```

### Fix #2: Improve Confidence Scoring

**File:** `scrapers/simple-scraper.js`

**Replace confidence logic (line 224):**

```javascript
// Improved confidence scoring
let confidence;
if (name && emails.length > 0 && phones.length > 0) {
  confidence = 'high';
} else if ((emails.length > 0 && phones.length > 0) || 
           (name && emails.length > 0) || 
           (name && phones.length > 0)) {
  confidence = 'medium';
} else {
  confidence = 'low';
}

results.push({
  name: name,
  email: emails[0] || null,
  phone: phones[0] || null,
  source: 'visible_text',
  confidence: confidence,
  rawText: allText.substring(0, 200)
});
```

### Fix #3: Better Card Detection for Compass.com

**File:** `scrapers/simple-scraper.js`

**Add to CARD_SELECTORS array (line 21):**

```javascript
this.CARD_SELECTORS = [
  // Add these specific selectors FIRST (they're more specific)
  '[data-testid*="agent"]', '[data-testid*="profile"]',
  '[data-qa*="agent"]', '[data-qa*="profile"]',
  
  // Then existing selectors...
  '.card', '.profile', '.agent', '.person', '.member', '.contact',
  // ... rest of existing selectors
];
```

---

## Part 6: Cleanup Script

I'll create a cleanup script for you to run:

**File:** `cleanup.js`

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('Starting project cleanup...\n');

const filesToDelete = [
  'diag.js',
  'test-logger.js',
  'test-startup.js',
  'apply-fix.bat',
  'orchestrator-corrected.js',
  'orchestrator.js.backup',
  'FIX_GUIDE.md',
  'scrapers/js-scraper.js',
  'scrapers/profile-resolver-scraper.js',
  'pagination/infinite-scroll.js',
  'pagination/navigator.js',
  'adapters/loader.js',
  'adapters/registry.json',
  'adapters/template-adapter.json',
  'io/csv-handler.js',
  'io/sqlite-handler.js',
  'io/sheets-handler.js',
  'io/normalizer.js',
  'io/deduplicator.js',
  'tests/pagination-test.js',
  'tests/full-run-test.js'
];

let deleted = 0;
let notFound = 0;

for (const file of filesToDelete) {
  const fullPath = path.join(process.cwd(), file);
  
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
      console.log(`✓ Deleted: ${file}`);
      deleted++;
    } catch (error) {
      console.log(`✗ Error deleting ${file}: ${error.message}`);
    }
  } else {
    notFound++;
  }
}

// Clean up empty directories
const emptyDirs = ['pagination', 'adapters', 'io'];
for (const dir of emptyDirs) {
  const dirPath = path.join(process.cwd(), dir);
  
  if (fs.existsSync(dirPath)) {
    try {
      const files = fs.readdirSync(dirPath);
      if (files.length === 0) {
        fs.rmdirSync(dirPath);
        console.log(`✓ Removed empty directory: ${dir}`);
      }
    } catch (error) {
      // Directory not empty, skip
    }
  }
}

console.log(`\nCleanup complete!`);
console.log(`Files deleted: ${deleted}`);
console.log(`Files not found: ${notFound}`);
console.log(`\nYour project is now cleaner and ready for development!`);
```

---

## Part 7: Next Steps

### Immediate Actions:

1. **Run the cleanup script:**
   ```bash
   node cleanup.js
   ```

2. **Apply the fixes to simple-scraper.js:**
   - Update name extraction logic
   - Update confidence scoring
   - Add better card selectors

3. **Test the improvements:**
   ```bash
   node orchestrator.js --url "https://www.compass.com/agents/locations/manhattan-ny/21425/" --headless false --limit 10
   ```

4. **Verify results:**
   - Check if names are now being extracted
   - Verify confidence scores are more accurate
   - Ensure contacts still have email and phone

### Medium-term Development:

1. **Add more sophisticated scrapers** (Week 4+)
   - Click handler for "Show More" buttons
   - Profile resolver for individual pages
   - API detection for JSON endpoints

2. **Add pagination support** (Week 5)
   - Numbered page navigation
   - Infinite scroll handling
   - Load more buttons

3. **Add export formats** (Week 7-8)
   - CSV export
   - SQLite database
   - Google Sheets integration

### Long-term Goals:

1. **Site-specific adapters** (Week 6)
2. **Data quality improvements** (Week 9)
3. **Full test suite** (Week 10)

---

## Part 8: Success Metrics

After applying fixes, you should see:

**Before (Current State):**
```
Total Contacts: 40
With Email: 40
With Phone: 40
With Both: 40
Complete (Name+Email+Phone): 0  ← Problem
High Confidence: 0  ← Problem
Medium Confidence: 0  ← Problem
Low Confidence: 40  ← Problem
```

**After (Expected State):**
```
Total Contacts: 40
With Email: 40
With Phone: 40
With Both: 40
Complete (Name+Email+Phone): 35-40  ← Fixed!
High Confidence: 30-35  ← Fixed!
Medium Confidence: 5-10
Low Confidence: 0-5
```

---

## Part 9: Testing Your Fixes

After applying the fixes, run this test:

```bash
# Test 1: Small batch with visible browser
node orchestrator.js --url "https://www.compass.com/agents/locations/manhattan-ny/21425/" --headless false --limit 5

# Test 2: Full scrape in headless mode
node orchestrator.js --url "https://www.compass.com/agents/locations/manhattan-ny/21425/" --headless true

# Test 3: Run unit tests
node tests/scraper-test.js

# Test 4: Run diagnostics
node diagnose.js
```

Check the output JSON file to verify:
- Names are being extracted
- Confidence scores are distributed (not all "low")
- Contact data is accurate

---

## Summary

**DELETE:** 15-20 redundant files (diagnostics, stubs, old fixes)

**KEEP:** 11 core files (orchestrator, utils, scrapers, tests)

**FIX:** 3 issues (name extraction, confidence scoring, card detection)

**RESULT:** A cleaner, better-functioning scraper ready for Week 2+ development

Good luck with your project! The scraper is working well - these fixes will make it even better.

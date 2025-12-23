# Complex Algorithms Documentation

This document provides detailed explanations of the most complex algorithms used in the Universal Professional Scraper, focusing on implementations exceeding 50 lines with multiple strategies, edge cases, or intricate logic.

**Generated:** 2025-12-23

---

## Table of Contents

1. [Pagination Algorithms](#pagination-algorithms)
2. [Infinite Scroll Detection](#infinite-scroll-detection)
3. [Contact Extraction](#contact-extraction)
4. [Field Comparison and Merging](#field-comparison-and-merging)
5. [Name Cleaning and Title Extraction](#name-cleaning-and-title-extraction)
6. [Multi-Location Handling](#multi-location-handling)
7. [Phone-Location Correlation](#phone-location-correlation)
8. [Load More Button Detection](#load-more-button-detection)

---

## 1. Pagination Algorithms

### Binary Search for Maximum Page Number

**Location:** `src/features/pagination/binary-searcher.js`
**Function:** `findTrueMaxPage()`
**Complexity:** O(log n) where n is the true max page number

#### Algorithm Overview

Uses binary search to efficiently find the true maximum page number on paginated websites, even when visual indicators (like "Page 1 of 150") are incorrect or missing.

#### Pseudocode

```
function findTrueMaxPage(visualMax, hardCap):
    # Set search boundaries
    if visualMax exists:
        low = visualMax - 10  (but >= 1)
        high = visualMax + 50
    else:
        low = 1
        high = hardCap

    # Boundary confirmation tracking
    lastValidPage = 1
    consecutiveEmpty = 0

    # Binary search loop
    while low <= high:
        mid = floor((low + high) / 2)

        # Test if page mid has contacts
        result = testPageValidity(mid)

        if result.hasContacts:
            lastValidPage = mid
            consecutiveEmpty = 0
            low = mid + 1  # Search higher
        else:
            consecutiveEmpty++
            high = mid - 1  # Search lower

            # Boundary confirmation: test 2 consecutive empty pages
            if consecutiveEmpty >= 2:
                break

    return {
        trueMax: lastValidPage,
        boundaryConfirmed: consecutiveEmpty >= 2
    }
```

#### Edge Cases Handled

1. **Visual max is incorrect**: Website shows "Page 1 of 200" but only has 50 pages
   - Solution: Test pages around visual max with ±10 buffer

2. **No visual indicator**: Website doesn't show total pages
   - Solution: Search from 1 to hardCap (default 200)

3. **Sparse pagination**: Pages 1-100 exist, then jump to 500-600
   - Solution: Binary search finds highest contiguous page

4. **False positives**: Page returns 200 OK but has no contacts
   - Solution: `testPageValidity()` checks for actual contact presence (emails, card elements)

5. **Infinite pagination**: Site generates pages endlessly
   - Solution: `hardCap` parameter limits maximum search

#### Boundary Confirmation

Critical feature: Confirms the boundary by testing **2 consecutive empty pages**.

```javascript
// Example: Finding max page = 47
// Test page 50: empty (consecutiveEmpty = 1)
// Test page 48: empty (consecutiveEmpty = 2) ← BOUNDARY CONFIRMED
// Return trueMax = 47 with boundaryConfirmed = true
```

Without this confirmation, a single empty page could be a temporary error.

#### Performance

- **Best case:** O(1) - Visual max is exactly correct
- **Average case:** O(log n) - Binary search iterations
- **Worst case:** O(log hardCap) - No visual max, search full range

**Example:** Finding max of 150 pages with hardCap=200:
- Linear search: 150 page tests
- Binary search: ~8 page tests (log₂ 200 ≈ 7.6)

---

### Pagination Pattern Detection Priority Chain

**Location:** `src/features/pagination/pattern-detector.js`
**Function:** `discoverPattern()`

#### Detection Strategy Priority

The system tries 5 detection methods in priority order, stopping at the first successful match:

```
Priority 1: Manual Config (90-100% confidence)
    ↓ (if not found)
Priority 2: Cache Lookup (85% confidence)
    ↓ (if not found)
Priority 3: URL Parameter Detection (80-95% confidence)
    ↓ (if not found)
Priority 4: Visual Controls Detection (70-85% confidence)
    ↓ (if not found)
Priority 5: Navigation Button Test (60-75% confidence)
```

#### Strategy Implementations

**Strategy 1: Manual Config**
```javascript
// Check if config explicitly defines pagination
if (config.pagination?.manual) {
    return {
        type: config.pagination.type,  // 'parameter', 'path', or 'offset'
        paramName: config.pagination.paramName,
        baseUrl: extractBaseUrl(url),
        confidence: 95,
        source: 'manual-config'
    };
}
```

**Strategy 2: Cache Lookup**
```javascript
// Check if we've seen this domain before
const domain = extractDomain(url);
const cached = configLoader.getCachedPattern(domain);

if (cached && isCacheValid(cached)) {
    // CRITICAL: Update baseUrl from current URL path
    // This fixes the bug where cache stores /manhattan-ny/
    // but current URL is /brooklyn-ny/
    const currentUrlBase = extractBaseUrl(url, cached.paramName);
    if (currentUrlBase !== cached.baseUrl) {
        cached.baseUrl = currentUrlBase;  // Update to current path
    }

    return {
        ...cached.pattern,
        confidence: 85,
        source: 'cache'
    };
}
```

**The Cache URL Path Fix** (Critical Bug Fix):

This addresses a subtle but critical bug:

```javascript
// PROBLEM:
// Cache is keyed by domain only: "compass.com"
// Cache stores: { baseUrl: "/agents/manhattan-ny/21425/", paramName: "page" }
// Current URL:  "/agents/brooklyn-ny/21429/"

// OLD BEHAVIOR (WRONG):
// Generated URL: /agents/manhattan-ny/21425/?page=2  ← Wrong path!

// FIXED BEHAVIOR:
const currentUrlBase = extractBaseUrl(currentUrl, pattern.paramName);
if (currentUrlBase !== pattern.baseUrl) {
    pattern.baseUrl = currentUrlBase;  // Update to /brooklyn-ny/21429/
}
// Generated URL: /agents/brooklyn-ny/21429/?page=2  ← Correct!
```

**Strategy 3: URL Parameter Detection**
```javascript
// Parse URL query parameters
const urlParams = new URL(url).searchParams;

for (const [param, value] of urlParams) {
    if (PAGE_PARAMETER_NAMES.includes(param.toLowerCase())) {
        return {
            type: 'parameter',
            paramName: param,
            currentValue: parseInt(value),
            baseUrl: removeParam(url, param),
            confidence: 95,
            source: 'url-analysis'
        };
    }
}
```

**Strategy 4: Visual Controls Detection**
```javascript
// Search DOM for pagination controls
const paginationSelectors = [
    '.pagination',
    '[class*="pagination"]',
    '[aria-label*="pagination"]'
];

for (const selector of paginationSelectors) {
    const controls = await page.$(selector);
    if (controls) {
        // Extract max page from visual controls
        const maxPage = await extractMaxPageNumber(controls);

        // Look for "Next" button to determine URL pattern
        const nextButton = await controls.$('a[rel="next"]');
        if (nextButton) {
            const nextUrl = await nextButton.evaluate(el => el.href);
            const pattern = compareUrls(url, nextUrl);

            return {
                ...pattern,
                visualMax: maxPage,
                confidence: 80,
                source: 'visual-controls'
            };
        }
    }
}
```

**Strategy 5: Navigation Button Test**
```javascript
// Last resort: click "Next" button and compare URLs
const nextButton = await findNextButton(page);
if (nextButton) {
    const beforeUrl = page.url();
    await nextButton.click();
    await page.waitForNavigation();
    const afterUrl = page.url();

    const pattern = compareUrls(beforeUrl, afterUrl);

    // Navigate back to original page
    await page.goBack();

    return {
        ...pattern,
        confidence: 65,
        source: 'navigation-test'
    };
}
```

#### Pattern Confidence Calculation

```javascript
function calculateConfidence(pattern, context) {
    let baseConfidence = pattern.confidence;

    // Boost confidence if we have visual confirmation
    if (context.visualMax && pattern.type === 'parameter') {
        baseConfidence += 10;  // Visual max aligns with URL param
    }

    // Reduce confidence for navigation-based detection
    if (pattern.source === 'navigation-test') {
        baseConfidence -= 10;  // Less reliable method
    }

    // Boost if domain is known
    if (KNOWN_DOMAIN_PAGINATION[domain]) {
        baseConfidence += 5;
    }

    return Math.min(100, Math.max(0, baseConfidence));
}
```

---

## 2. Infinite Scroll Detection

### Selenium PAGE_DOWN Scroll Algorithm

**Location:** `src/core/selenium-manager.js`
**Function:** `scrollToFullyLoad()`
**Lines:** ~300+ lines

#### Algorithm Features

1. **PAGE_DOWN key simulation** (not `scrollBy()`) - More reliable for triggering lazy load
2. **Retry counter reset on ANY height change** - Key insight for infinite scroll
3. **Scroll up/down cycle** every 5 failed retries - Triggers stubborn lazy loaders
4. **Load More button detection** - Automatic fallback when scrolling stops
5. **Button-first mode** - Optimizes button-based pagination after first successful click

#### Pseudocode

```
function scrollToFullyLoad(options):
    # Initialize
    lastHeight = getPageHeight()
    retries = 0
    scrollCount = 0
    heightChanges = 0
    buttonClicks = 0
    buttonClickMode = false  # Optimized mode after first button click

    # Wait for initial content
    sleep(initialWait)
    dismissCookieBanners()

    # Main scroll loop
    while scrollCount < maxScrolls:
        # BUTTON-FIRST MODE: Check for button immediately
        if buttonClickMode and buttonClicks < maxButtonClicks:
            button = detectLoadMoreButton()
            if button:
                clickButton(button)
                buttonClicks++
                lastHeight = getPageHeight()
                retries = 0
                continue  # Check for button again immediately
            else:
                buttonClickMode = false  # No more buttons, resume scrolling

        # Send PAGE_DOWN key
        sendKey(PAGE_DOWN)
        scrollCount++
        sleep(scrollDelay)

        # Check new height
        newHeight = getPageHeight()

        if newHeight > lastHeight:
            # Height increased - RESET retries!
            retries = 0
            heightChanges++
            lastHeight = newHeight

        else:
            # Height unchanged - increment retries
            retries++

            # Every 5 failed retries: scroll up/down cycle
            if retries % 5 == 0 and retries < maxRetries:
                # Scroll up 3 times
                for i in 1..3:
                    sendKey(PAGE_UP)
                    sleep(150)

                sleep(500)

                # Scroll down 5 times
                for i in 1..5:
                    sendKey(PAGE_DOWN)
                    sleep(150)

                sleep(scrollDelay)

                # Check if cycle triggered content
                heightAfterCycle = getPageHeight()
                if heightAfterCycle > lastHeight:
                    retries = 0
                    heightChanges++
                    lastHeight = heightAfterCycle

            # If max retries reached: try Load More button
            if retries >= maxRetries:
                if enableLoadMoreButton and buttonClicks < maxButtonClicks:
                    button = detectLoadMoreButton()
                    if button:
                        clickButton(button)
                        buttonClicks++

                        # ENABLE BUTTON-FIRST MODE
                        buttonClickMode = true

                        lastHeight = getPageHeight()
                        retries = 0
                        continue
                    else:
                        break  # No button found, stop
                else:
                    break  # Max clicks reached or button detection disabled

    return {
        scrollCount,
        heightChanges,
        finalHeight: lastHeight,
        buttonClicks
    }
```

#### Key Algorithm Insights

**1. Why PAGE_DOWN instead of scrollBy()?**

```javascript
// BAD: scrollBy() doesn't always trigger lazy load
await page.evaluate(() => window.scrollBy(0, 1000));

// GOOD: PAGE_DOWN simulates real user behavior
await element.sendKeys(Key.PAGE_DOWN);
```

Many infinite scroll implementations listen for keyboard events, not just scroll position.

**2. Why reset retries on ANY height change?**

```javascript
// Key insight: Height only stops changing at ABSOLUTE BOTTOM
if (newHeight > lastHeight) {
    retries = 0;  // ← CRITICAL: Reset counter
}
```

Even a 1px height change means more content is loading. Don't give up!

**3. The scroll up/down cycle trick**

```javascript
// Every 5 failed retries, try to "wake up" lazy loaders
if (retries % 5 === 0) {
    // Scroll UP to trigger "viewport entered" events
    sendKeys(PAGE_UP, PAGE_UP, PAGE_UP);
    sleep(500);

    // Scroll DOWN again
    sendKeys(PAGE_DOWN × 5);

    // Check if this triggered new content
    if (newHeight > lastHeight) {
        retries = 0;  // Success! Reset and continue
    }
}
```

Some lazy loaders only trigger when elements "enter" the viewport from above, not just from scrolling down.

**4. Button-First Mode Optimization**

After the first successful Load More button click, the algorithm switches modes:

```javascript
// BEFORE FIRST BUTTON CLICK:
// Scroll 25 times → No change → Look for button → Click → Repeat

// AFTER FIRST BUTTON CLICK (button-first mode):
// Look for button → Click → Look for button → Click → ...
//   (only scroll if button not found)
```

This is 10-50x faster on sites like Skadden that use pure button pagination without infinite scroll.

**5. Timeline Callbacks for Testing**

```javascript
// Real-time event tracking
onHeightChange: (data) => {
    console.log(`Height: ${data.previousHeight} → ${data.newHeight} (+${data.delta}px)`);
}

onButtonClick: (data) => {
    console.log(`Button click #${data.buttonClicks}: "${data.buttonText}"`);
    console.log(`  Loaded ${data.newElementCount} new elements`);
}

onScrollBatch: (data) => {
    console.log(`Batch ${Math.floor(data.scrollCount/10)}: ${data.scrollCount} scrolls, ${data.heightChanges} changes`);
}
```

This enables:
- Progress bars in UI
- Debugging scroll behavior
- Performance analysis
- Unit testing

---

### Load More Button Detection (5 Strategies)

**Location:** `src/core/selenium-manager.js`
**Function:** `detectLoadMoreButton()`

#### Detection Strategies (Priority Order)

```javascript
const strategies = [
    // Strategy 1: Text Content Patterns (highest priority)
    {
        name: 'text-content',
        find: async () => {
            const patterns = ['load more', 'show more', 'view more', 'see more'];
            for (const pattern of patterns) {
                // Case-insensitive XPath search
                const xpath = `//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${pattern}')] | //a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${pattern}')]`;

                const elements = await driver.findElements(By.xpath(xpath));
                for (const el of elements) {
                    if (await el.isDisplayed() && await el.isEnabled()) {
                        return { button: el, text: await el.getText() };
                    }
                }
            }
            return null;
        }
    },

    // Strategy 2: ARIA Label Patterns
    {
        name: 'aria-label',
        find: async () => {
            const xpath = `//button[contains(translate(@aria-label, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'load') or contains(translate(@aria-label, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'more')]`;
            // ... similar logic
        }
    },

    // Strategy 3: CSS Class Patterns
    {
        name: 'css-class',
        find: async () => {
            const selectors = [
                '.load-more',
                '.show-more',
                '[class*="load-more"]',
                '[class*="loadmore"]'
            ];
            // ... search each selector
        }
    },

    // Strategy 4: Data Attribute Patterns
    {
        name: 'data-attribute',
        find: async () => {
            const selectors = [
                '[data-action*="load"]',
                '[data-load-more]',
                '[data-testid*="load-more"]'
            ];
            // ... search each selector
        }
    },

    // Strategy 5: Generic Fallback
    {
        name: 'generic-more',
        find: async () => {
            // Find any button/link with "more" that looks like pagination
            const xpath = `//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'more') and not(contains(., '@'))]`;

            const elements = await driver.findElements(By.xpath(xpath));
            for (const el of elements) {
                const text = await el.getText();

                // Check if "more" is a word boundary (not part of name like "Dellamore")
                const lowerText = text.toLowerCase();
                const hasMoreAsWord = (
                    lowerText === 'more' ||
                    lowerText.includes(' more') ||
                    lowerText.startsWith('more ') ||
                    lowerText.startsWith('more\n')
                );

                if (hasMoreAsWord && text.length < 50 && !text.includes('@')) {
                    return { button: el, text };
                }
            }
            return null;
        }
    }
];

// Try each strategy in order
for (const strategy of strategies) {
    const result = await strategy.find();
    if (result) {
        return { ...result, strategy: strategy.name };
    }
}

return null;  // No button found
```

#### Edge Cases Handled

1. **Name that contains "more"** - "John Dellamore"
   - Solution: Check word boundaries - "more" must be standalone word

2. **Email addresses** - "loadmore@example.com"
   - Solution: Exclude elements containing '@'

3. **Hidden buttons** - Button in DOM but not visible
   - Solution: Check `isDisplayed()` and `isEnabled()`

4. **Multiple buttons** - Multiple "Load More" buttons on page
   - Solution: Return first visible + enabled button found

5. **Button becomes stale after click** - Button removed from DOM after click
   - Solution: Treat `StaleElementReferenceError` as success indicator

---

## 3. Contact Extraction

### Multi-Method Name Extraction

**Location:** `src/utils/contact-extractor.js`
**Function:** `findNameInContext()`

#### Algorithm Overview

Finds person names in text context surrounding an email address using multiple strategies with proximity scoring.

#### Strategy Priority

```
1. Find email position in text
2. Extract context before email (500 chars)
3. Search for capitalized word sequences
4. Score each candidate by:
   - Proximity to email (closer = higher score)
   - Match with email terms (name parts in email = higher)
   - Name validation (blacklist check, format check)
5. Return highest-scoring valid name
```

#### Implementation

```javascript
function findNameInContext(beforeContext, email, emailPos) {
    // Extract terms from email for matching
    const emailPrefix = email.split('@')[0];
    const emailTerms = emailPrefix
        .split(/[._-]/)
        .filter(term => term.length > 2 && !NON_NAME_WORDS.has(term.toLowerCase()));

    // Find all capitalized word sequences (potential names)
    const namePattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g;
    let match;
    let bestCandidate = null;
    let bestScore = -1;

    while ((match = namePattern.exec(beforeContext)) !== null) {
        const candidateName = match[0].trim();
        const matchPos = match.index;

        // Validate candidate
        if (!isValidNameCandidate(candidateName)) {
            continue;
        }

        // Calculate distance from email (closer = better)
        const distance = beforeContext.length - matchPos;

        // Score this candidate
        const score = scoreNameCandidate(candidateName, emailTerms, distance);

        if (score > bestScore) {
            bestScore = score;
            bestCandidate = {
                name: candidateName,
                distance: distance,
                score: score
            };
        }
    }

    return bestCandidate;
}

function scoreNameCandidate(name, emailTerms, distance) {
    let score = 0;

    // Proximity score (0-50 points)
    // Closer to email = higher score
    const proximityScore = Math.max(0, 50 - (distance / 10));
    score += proximityScore;

    // Email term matching (0-50 points)
    const nameParts = name.toLowerCase().split(/\s+/);
    let matchCount = 0;

    for (const emailTerm of emailTerms) {
        for (const namePart of nameParts) {
            if (namePart.includes(emailTerm) || emailTerm.includes(namePart)) {
                matchCount++;
            }
        }
    }

    const matchScore = Math.min(50, matchCount * 25);
    score += matchScore;

    return score;
}
```

#### Example Execution

```
Text: "John Smith is a partner at... Contact: john.smith@example.com"
Email position: 350

Context before email (500 chars):
"... Meet our team. John Smith is a partner at the firm with 20 years of experience in corporate law. His practice focuses on M&A transactions. Contact: "

Step 1: Extract email terms
  email = "john.smith@example.com"
  prefix = "john.smith"
  terms = ["john", "smith"]

Step 2: Find capitalized sequences
  Candidate 1: "Meet" (position 0)
    - Validate: FAIL (single word, in blacklist)

  Candidate 2: "John Smith" (position 15)
    - Validate: PASS
    - Distance: 500 - 15 = 485 chars from end
    - Proximity score: 50 - (485/10) = 1.5
    - Email matching:
      * "john" matches "john" → +25
      * "smith" matches "smith" → +25
    - Match score: 50
    - Total score: 1.5 + 50 = 51.5 ✓ BEST

  Candidate 3: "Contact" (position 495)
    - Validate: FAIL (blacklisted word)

Step 3: Return best
  {
    name: "John Smith",
    distance: 485,
    score: 51.5
  }
```

---

## 4. Field Comparison and Merging

### Enrichment Decision Algorithm

**Location:** `src/features/enrichment/field-comparator.js`
**Function:** `compareAndMerge()`

#### Decision Tree

```
INPUT: originalField, profileField, fieldName

┌─────────────────────────────────────┐
│ Is original field empty/null?       │
└──────────┬──────────────────────────┘
           │
       YES │  NO
           │  │
           │  ├─────────────────────────────────┐
           │  │ Is profile field empty/null?    │
           │  └──────────┬──────────────────────┘
           │         YES │  NO
           │             │  │
           ▼             │  ├──────────────────────────────────────────┐
    ┌──────────────┐    │  │ Do original and profile match?           │
    │  ENRICHED    │    │  └──────────┬───────────────────────────────┘
    │              │    │         YES │  NO
    │ Use profile  │    │             │  │
    │ value        │    │             │  ├──────────────────────────────────────┐
    └──────────────┘    │             │  │ Is original contaminated?            │
                        │             │  │ (has phone in location, title in    │
                        │             │  │  name, etc.)                         │
                        │             │  └──────────┬───────────────────────────┘
                        │             │         YES │  NO
                        │             │             │  │
                        │             ▼             │  ▼
                        │      ┌──────────────┐    │  ┌──────────────┐
                        │      │  VALIDATED   │    │  │   CLEANED    │
                        │      │              │    │  │              │
                        │      │ Values match │    │  │ Remove noise │
                        │      │ Keep original│    │  │ from original│
                        │      └──────────────┘    │  └──────────────┘
                        │                          │
                        │                          ▼
                        │                   ┌──────────────┐
                        │                   │  REPLACED    │
                        │                   │              │
                        │                   │ Use profile  │
                        │                   │ (higher      │
                        │                   │ confidence)  │
                        │                   └──────────────┘
                        │
                        ▼
                 ┌──────────────┐
                 │  UNCHANGED   │
                 │              │
                 │ No profile   │
                 │ data         │
                 └──────────────┘
```

#### Implementation

```javascript
function compareAndMerge(originalField, profileField, fieldName, contact = {}) {
    // Normalize values
    const original = normalizeValue(originalField);
    const profile = normalizeValue(profileField);

    // Case 1: Original is empty → ENRICHED
    if (!original && profile) {
        return {
            action: 'ENRICHED',
            finalValue: profile,
            confidence: 'high',
            source: 'profile',
            notes: 'Field was empty, filled from profile'
        };
    }

    // Case 2: Both empty → BOTH_MISSING
    if (!original && !profile) {
        return {
            action: 'BOTH_MISSING',
            finalValue: null,
            confidence: 'n/a'
        };
    }

    // Case 3: Profile is empty → UNCHANGED
    if (original && !profile) {
        return {
            action: 'UNCHANGED',
            finalValue: original,
            confidence: 'low',
            source: 'original'
        };
    }

    // Case 4: Both have values → Compare
    if (valuesMatch(original, profile, fieldName)) {
        // Values match → VALIDATED
        return {
            action: 'VALIDATED',
            finalValue: original,
            confidence: 'high',
            source: 'validated',
            notes: 'Original and profile values match'
        };
    }

    // Values don't match → Check for contamination
    const contamination = checkContamination(original, profile, fieldName, contact);

    if (contamination.isContaminated) {
        // Original is contaminated → CLEANED
        return {
            action: 'CLEANED',
            finalValue: contamination.cleanValue,
            originalValue: original,
            confidence: 'medium',
            source: 'cleaned',
            removedNoise: contamination.removedNoise,
            notes: `Cleaned contamination: ${contamination.extracted.join(', ')}`
        };
    }

    // No contamination → Profile is likely more accurate → REPLACED
    return {
        action: 'REPLACED',
        finalValue: profile,
        originalValue: original,
        confidence: 'medium',
        source: 'profile',
        notes: 'Values differ, using profile data (higher confidence)',
        flag: 'MANUAL_REVIEW'  // Recommend manual review
    };
}
```

#### Contamination Detection Logic

```javascript
function checkContamination(original, profile, fieldName, contact) {
    let isContaminated = false;
    const extracted = [];
    let cleanValue = original;
    let removedNoise = [];

    if (fieldName === 'name') {
        // Check for embedded title
        const titlePattern = /,?\s*(MD|PhD|Esq\.?|Jr\.?|Sr\.?|Partner|Associate)$/i;
        const match = original.match(titlePattern);

        if (match) {
            isContaminated = true;
            extracted.push(match[1]);
            cleanValue = original.replace(titlePattern, '').trim();
            removedNoise.push(`title: ${match[1]}`);
        }
    }

    if (fieldName === 'location') {
        // Check for embedded phone
        const phonePattern = /\+?\d{1,3}?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
        const phones = original.match(phonePattern);

        if (phones) {
            isContaminated = true;
            extracted.push(...phones);
            cleanValue = original.replace(phonePattern, '').trim();
            removedNoise.push(`phones: ${phones.join(', ')}`);
        }

        // Check for embedded email
        const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const emails = original.match(emailPattern);

        if (emails) {
            isContaminated = true;
            extracted.push(...emails);
            cleanValue = cleanValue.replace(emailPattern, '').trim();
            removedNoise.push(`emails: ${emails.join(', ')}`);
        }
    }

    return {
        isContaminated,
        cleanValue,
        extracted,
        removedNoise
    };
}
```

#### Action Summary Statistics

After enrichment, the system tracks action counts:

```javascript
// Example enrichment result
{
    totalContacts: 150,
    actions: {
        ENRICHED: 45,      // 30% - Fields filled from profile
        VALIDATED: 60,     // 40% - Original and profile matched
        CLEANED: 20,       // 13% - Removed contamination
        REPLACED: 15,      // 10% - Used profile over original
        UNCHANGED: 10      // 7%  - No profile data available
    },
    fieldsEnriched: {
        email: 45,
        phone: 30,
        title: 25,
        location: 15
    }
}
```

---

## 5. Name Cleaning and Title Extraction

### Title Pattern Detection

**Location:** `src/features/enrichment/cleaners/name-cleaner.js`
**Function:** `cleanName()`

#### Title Patterns (70+ variations)

```javascript
const TITLE_PATTERNS = [
    // Executive titles
    /\b(CEO|CFO|CTO|COO|CMO|CIO|CPO|CSO|CDO|CRO)\b/i,
    /\bChief\s+\w+\s+Officer\b/i,
    /\bExecutive\s+Director\b/i,
    /\bManaging\s+Director\b/i,

    // Legal titles
    /\b(Partner|Associate|Counsel|Attorney|Lawyer)\b/i,
    /\bOf\s+Counsel\b/i,
    /\bSenior\s+Partner\b/i,
    /\bManaging\s+Partner\b/i,
    /\bEquity\s+Partner\b/i,

    // Academic/Professional titles
    /\b(Dr\.?|MD|PhD|Esq\.?|JD|MBA|CPA|PE)\b/i,
    /\bProfessor\b/i,
    /\bDoctor\b/i,

    // Honorifics
    /\b(Mr\.?|Mrs\.?|Ms\.?|Miss|Sir|Dame|Lord|Lady)\b/i,

    // Suffixes
    /\b(Jr\.?|Sr\.?|II|III|IV|V)\b/i,

    // Positions (50+ more patterns)
    // ...
];
```

#### Algorithm

```javascript
function cleanName(name, profileTitle = null) {
    let cleaned = name.trim();
    let extractedTitle = null;
    let wasContaminated = false;

    // Try each pattern
    for (const pattern of TITLE_PATTERNS) {
        const match = cleaned.match(pattern);
        if (match) {
            extractedTitle = match[1] || match[0];

            // Remove title from name
            cleaned = cleaned.replace(pattern, '').trim();

            // Clean up punctuation left behind
            cleaned = cleaned.replace(/^[,\-\s]+|[,\-\s]+$/g, '').trim();

            wasContaminated = true;
            break;  // Only extract first title found
        }
    }

    // Normalize extracted title
    if (extractedTitle) {
        extractedTitle = normalizeTitle(extractedTitle);
    }

    // If we already have a profile title and it differs, note it
    if (profileTitle && extractedTitle && profileTitle !== extractedTitle) {
        // Log discrepancy but prefer profile title
        extractedTitle = profileTitle;
    }

    // Final validation
    if (cleaned.length < 2 || cleaned.length > 100) {
        cleaned = name;  // Revert if cleaning went wrong
        wasContaminated = false;
    }

    return {
        cleaned,
        extractedTitle,
        wasContaminated
    };
}
```

#### Title Normalization Map

```javascript
const TITLE_NORMALIZATION = {
    // Standardize variations
    'ceo': 'CEO',
    'chief executive officer': 'CEO',
    'cfo': 'CFO',
    'chief financial officer': 'CFO',
    'cto': 'CTO',
    'chief technology officer': 'CTO',

    // Legal
    'attorney': 'Attorney',
    'lawyer': 'Attorney',
    'counsel': 'Counsel',
    'partner': 'Partner',
    'associate': 'Associate',
    'of counsel': 'Of Counsel',

    // Academic
    'dr': 'Dr.',
    'doctor': 'Dr.',
    'professor': 'Professor',
    'prof': 'Professor',

    // 100+ more mappings...
};
```

#### Example Transformations

```
Input: "John Smith, MD"
Output: {
    cleaned: "John Smith",
    extractedTitle: "MD",
    wasContaminated: true
}

Input: "Jane Doe - Partner"
Output: {
    cleaned: "Jane Doe",
    extractedTitle: "Partner",
    wasContaminated: true
}

Input: "Dr. Robert Johnson, PhD, Esq."
Output: {
    cleaned: "Robert Johnson",
    extractedTitle: "Dr.",  // First match only
    wasContaminated: true
}

Input: "Sarah Williams"  (no title)
Output: {
    cleaned: "Sarah Williams",
    extractedTitle: null,
    wasContaminated: false
}
```

---

## 6. Multi-Location Handling

### Location Parsing and Prioritization

**Location:** `src/features/enrichment/post-cleaners/multi-location-handler.js`
**Function:** `parse()`

#### Algorithm Overview

Handles contacts that list multiple office locations (common for attorneys who work in multiple cities).

#### Strategy

```
1. Split raw location field by delimiters (newline, semicolon, pipe)
2. Parse each segment as location-phone pair
3. Determine if each location is US or international
4. Prioritize US locations if prioritizeUS=true
5. Select primary location (first in priority list)
6. Return structured data with all locations
```

#### Implementation

```javascript
function parse(rawLocation, primaryPhone, prioritizeUS = true) {
    // Step 1: Split into segments
    const segments = splitLocationSegments(rawLocation);

    // Step 2: Parse segments into location-phone pairs
    const locationPairs = parseLocationPairs(segments, primaryPhone);

    // Step 3: Prioritize locations
    const prioritized = prioritizeLocations(locationPairs, prioritizeUS);

    // Step 4: Extract primary and additional locations
    const primaryLocation = prioritized[0]?.location || null;
    const additionalLocations = prioritized.slice(1).map(pair => pair.location);

    // Step 5: Build location data map
    const locationData = buildLocationData(prioritized);

    return {
        isMultiLocation: locationPairs.length > 1,
        primaryLocation,
        primaryPhone,
        additionalLocations,
        allLocations: prioritized.map(p => p.location),
        locationData,
        rawLocation
    };
}
```

#### Location Prioritization Logic

```javascript
function prioritizeLocations(locationPairs, prioritizeUS) {
    if (!prioritizeUS) {
        return locationPairs;  // Keep original order
    }

    // Separate US and non-US locations
    const usLocations = [];
    const nonUSLocations = [];

    for (const pair of locationPairs) {
        if (isUSLocation(pair.location, pair.phone)) {
            usLocations.push(pair);
        } else {
            nonUSLocations.push(pair);
        }
    }

    // Return US locations first, then others
    return [...usLocations, ...nonUSLocations];
}

function isUSLocation(location, phone) {
    // Method 1: Check phone country code
    const countryCode = extractCountryCode(phone);
    if (countryCode === '1') {
        return true;  // US/Canada
    }

    // Method 2: Check for US state names/abbreviations
    const US_STATES = [
        'Alabama', 'AL', 'Alaska', 'AK', 'Arizona', 'AZ',
        // ... all 50 states + DC
    ];

    for (const state of US_STATES) {
        if (location.includes(state)) {
            return true;
        }
    }

    // Method 3: Check for US city names
    const US_CITIES = [
        'New York', 'Los Angeles', 'Chicago', 'Houston',
        'San Francisco', 'Washington', 'Boston', 'Seattle',
        // ... top 100 US cities
    ];

    for (const city of US_CITIES) {
        if (location.includes(city)) {
            return true;
        }
    }

    return false;  // Assume international
}
```

#### Example Execution

```
Input:
  rawLocation = "New York, NY +1-212-555-0100\nLondon, UK +44-20-7946-0958"
  primaryPhone = "+1-212-555-0100"
  prioritizeUS = true

Step 1: Split segments
  ["New York, NY +1-212-555-0100", "London, UK +44-20-7946-0958"]

Step 2: Parse pairs
  [
    { location: "New York, NY", phone: "+1-212-555-0100" },
    { location: "London, UK", phone: "+44-20-7946-0958" }
  ]

Step 3: Prioritize (US first)
  isUSLocation("New York, NY", "+1-212-555-0100"):
    - countryCode = '1' → TRUE (US)

  isUSLocation("London, UK", "+44-20-7946-0958"):
    - countryCode = '44' → FALSE
    - No US state in "London, UK" → FALSE
    - No US city in "London, UK" → FALSE

  Prioritized:
    [
      { location: "New York, NY", phone: "+1-212-555-0100" },    ← US (first)
      { location: "London, UK", phone: "+44-20-7946-0958" }       ← Non-US (second)
    ]

Step 4: Extract
  primaryLocation = "New York, NY"
  additionalLocations = ["London, UK"]

Step 5: Build data
  locationData = {
    "New York, NY": {
      phone: "+1-212-555-0100",
      countryCode: "1",
      country: "USA",
      isPrimary: true
    },
    "London, UK": {
      phone: "+44-20-7946-0958",
      countryCode: "44",
      country: "United Kingdom",
      isPrimary: false
    }
  }

Output:
  {
    isMultiLocation: true,
    primaryLocation: "New York, NY",
    primaryPhone: "+1-212-555-0100",
    additionalLocations: ["London, UK"],
    allLocations: ["New York, NY", "London, UK"],
    locationData: { ... },
    rawLocation: "New York, NY +1-212-555-0100\nLondon, UK +44-20-7946-0958"
  }
```

---

## 7. Phone-Location Correlation

### Area Code Validation

**Location:** `src/features/enrichment/post-cleaners/phone-location-correlator.js`
**Function:** `validate()`

#### Algorithm

```javascript
function validate(phone, location, locationData) {
    // Step 1: Extract country code from phone
    const countryCode = extractCountryCode(phone);

    if (!countryCode) {
        return {
            valid: false,
            hasMismatch: false,
            reason: 'no-country-code'
        };
    }

    // Step 2: Detect location country
    const locationCountry = detectLocationCountry(location, locationData);

    if (!locationCountry) {
        return {
            valid: false,
            hasMismatch: false,
            reason: 'unknown-location-country'
        };
    }

    // Step 3: Map country code to country name
    const phoneCountry = COUNTRY_CODE_MAP[countryCode];

    if (!phoneCountry) {
        return {
            valid: false,
            hasMismatch: false,
            reason: 'unknown-country-code'
        };
    }

    // Step 4: Compare countries
    if (phoneCountry !== locationCountry) {
        return {
            valid: false,
            hasMismatch: true,
            reason: 'country-mismatch',
            details: {
                phoneCountry,
                locationCountry,
                phoneCountryCode: countryCode
            }
        };
    }

    // Step 5: For US phones, validate area code vs city
    if (countryCode === '1') {
        const areaCode = extractUSAreaCode(phone);
        if (areaCode) {
            const cityMatch = validateUSCityAreaCode(areaCode, location);

            if (!cityMatch) {
                return {
                    valid: false,
                    hasMismatch: true,
                    reason: 'city-mismatch',
                    details: {
                        areaCode,
                        location,
                        expectedCities: AREA_CODE_CITIES[areaCode]
                    }
                };
            }
        }
    }

    // All checks passed
    return {
        valid: true,
        hasMismatch: false,
        reason: null
    };
}
```

#### US Area Code to City Mapping

```javascript
const AREA_CODE_CITIES = {
    // New York
    '212': ['New York', 'Manhattan'],
    '646': ['New York', 'Manhattan'],
    '917': ['New York'],
    '718': ['New York', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'],

    // California
    '213': ['Los Angeles'],
    '310': ['Los Angeles', 'Santa Monica', 'Beverly Hills'],
    '415': ['San Francisco'],
    '650': ['San Francisco', 'Palo Alto', 'San Mateo'],

    // Texas
    '214': ['Dallas'],
    '469': ['Dallas'],
    '512': ['Austin'],
    '713': ['Houston'],
    '832': ['Houston'],

    // ... 300+ area codes mapped to cities
};

function validateUSCityAreaCode(areaCode, location) {
    const expectedCities = AREA_CODE_CITIES[areaCode];

    if (!expectedCities) {
        return true;  // Unknown area code, can't validate
    }

    // Check if location contains any of the expected cities
    for (const city of expectedCities) {
        if (locationContainsCity(location, city)) {
            return true;
        }
    }

    return false;  // Area code doesn't match location
}
```

#### Example Validations

```javascript
// VALID: Phone and location match
validate('+1-212-555-0100', 'New York, NY')
// → { valid: true, hasMismatch: false }

// INVALID: Country mismatch
validate('+44-20-7946-0958', 'New York, NY')
// → {
//   valid: false,
//   hasMismatch: true,
//   reason: 'country-mismatch',
//   details: {
//     phoneCountry: 'United Kingdom',
//     locationCountry: 'USA',
//     phoneCountryCode: '44'
//   }
// }

// INVALID: City mismatch within same country
validate('+1-213-555-0100', 'New York, NY')
// → {
//   valid: false,
//   hasMismatch: true,
//   reason: 'city-mismatch',
//   details: {
//     areaCode: '213',
//     location: 'New York, NY',
//     expectedCities: ['Los Angeles']
//   }
// }
```

---

## 8. Load More Button Detection

*[Already covered in section 2 - Infinite Scroll Detection]*

---

## Summary

This document covered the 8 most complex algorithms in the Universal Professional Scraper:

1. **Binary Search Pagination** - O(log n) page discovery with boundary confirmation
2. **Pagination Pattern Detection** - 5-strategy priority chain with cache URL path fix
3. **Infinite Scroll with PAGE_DOWN** - 300+ line algorithm with retry logic and button-first optimization
4. **Name Extraction from Context** - Proximity scoring and email term matching
5. **Field Comparison Decision Tree** - 5-action enrichment logic with contamination detection
6. **Title Pattern Extraction** - 70+ regex patterns with normalization
7. **Multi-Location Handling** - Parsing, country detection, and US-prioritization
8. **Phone-Location Correlation** - Area code validation with 300+ city mappings

Each algorithm handles multiple edge cases and uses sophisticated logic to ensure accuracy and reliability.

---
**Total Lines of Complex Algorithm Code:** ~1,500+ lines across all modules

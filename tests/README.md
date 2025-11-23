# Pagination Test Utility

Comprehensive pagination detection and validation tool for the Universal Professional Directory Scraper.

## Overview

The `pagination-test.js` utility performs deep analysis of pagination patterns on any given URL. It auto-detects pagination methods, validates page URLs, and provides confidence scoring for pagination reliability.

## Features

- ✅ **Multi-Method Detection**: Tests manual config, cache, and 4+ auto-detection methods
- ✅ **Strategic Validation**: Validates first, middle, and last pages intelligently
- ✅ **Duplicate Detection**: Uses MD5 hashing to detect duplicate content
- ✅ **Confidence Scoring**: 0-100 score based on 8 weighted criteria
- ✅ **Pattern Caching**: Optionally save discovered patterns for reuse
- ✅ **Detailed Reporting**: Comprehensive console output and JSON export

## Usage

### Basic Test

```bash
node tests/pagination-test.js --url "https://example.com/agents/"
```

### Full Options

```bash
node tests/pagination-test.js \
  --url "https://example.com/agents/" \
  --headless true \
  --max-pages 50 \
  --validate-sample 10 \
  --min-contacts 1 \
  --timeout 30000 \
  --save-cache \
  --output results.json
```

## Command-Line Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--url <url>` | string | *required* | Target URL to test |
| `--headless [value]` | boolean | `true` | Run browser in headless mode |
| `--max-pages <number>` | integer | `200` | Maximum pages to generate |
| `--validate-sample <number>` | integer | `10` | Number of pages to validate |
| `--min-contacts <number>` | integer | `1` | Minimum contacts per page threshold |
| `--timeout <ms>` | integer | `30000` | Navigation timeout in milliseconds |
| `--save-cache` | flag | `false` | Save discovered pattern to cache |
| `--clear-cache` | flag | `false` | Clear cache before testing |
| `--output <file>` | string | - | Save JSON results to file |

## Test Phases

### Phase 1: Pre-Detection Checks
- Verifies page has content
- Counts initial contacts/emails
- Detects infinite scroll indicators
- Checks for pagination UI elements

### Phase 2: Pattern Detection
Executes ALL detection methods:

1. **Manual Configuration** - Checks `configs/{domain}.json`
2. **Cached Patterns** - Checks `configs/_pagination_cache.json`
3. **Auto-Detect URL Parameters** - Finds `?page=`, `?p=`, `?pageNum=`, etc.
4. **Auto-Detect Path Segments** - Finds `/page/N`, `/p/N` patterns
5. **Auto-Detect Offset** - Finds `?offset=`, `?start=` parameters
6. **DOM Link Analysis** - Analyzes next/prev link patterns

### Phase 3: URL Generation
- Generates ALL page URLs (up to `--max-pages`)
- Handles different pagination types:
  - **Parameter**: `?page=1`, `?page=2`, ...
  - **Path**: `/page/1`, `/page/2`, ...
  - **Offset**: `?offset=0`, `?offset=20`, ...

### Phase 4: Validation
Strategically validates ~10 URLs:
- **First 3 pages**: Verify pagination starts correctly
- **Last 3 pages**: Check pagination end boundary
- **Middle 4 pages**: Distributed evenly to check consistency

For each validated page:
- ✓ Navigation success/failure
- ✓ HTTP status code
- ✓ Contact/email count
- ✓ Content hash (MD5)
- ✓ Load time
- ✓ Empty page detection

### Phase 5: Confidence Scoring
Calculates score (0-100) based on:

| Criteria | Points | Description |
|----------|--------|-------------|
| Pattern detected | 20 | Any pagination pattern found |
| Multiple methods agree | 10 | 2+ auto-detect methods match |
| Page load success | 15 | % of validated pages that loaded |
| No duplicate content | 15 | % of pages with unique content |
| Contact count consistent | 10 | Average contacts ≥ 1 per page |
| Valid pagination type | 10 | Type is parameter/path/offset |
| Cached or manual | 10 | Pattern from cache or config |
| No empty pages | 10 | % of pages with contacts |

**Reliability Levels:**
- **High** (80-100): Very reliable pagination
- **Medium** (50-79): Usable but may have issues
- **Low** (0-49): Unreliable or no pagination

## Output

### Console Output

```
═══════════════════════════════════════════════════════
  PAGINATION DETECTION & VALIDATION UTILITY
═══════════════════════════════════════════════════════

Initializing components...
Target URL: https://example.com/agents/
Max pages: 200
Validate sample: 10

═══════════════════════════════════════════════════════
  PHASE 1: PRE-DETECTION CHECKS
═══════════════════════════════════════════════════════

Page loaded: YES
Emails found: 42
Contact estimate: 42
Infinite scroll: NO

═══════════════════════════════════════════════════════
  PHASE 2: PATTERN DETECTION
═══════════════════════════════════════════════════════

[1/4] Checking manual configuration...
  ✓ Manual pattern found: parameter
[2/4] Checking cached patterns...
  ✗ No cached pattern
[3/4] Auto-detecting URL parameter patterns...
  ✓ URL parameter pattern: page
[4/4] Auto-detecting path-based patterns...
  ✗ No path pattern detected

✓ Selected pattern: parameter (via manual)

═══════════════════════════════════════════════════════
  PHASE 3: URL GENERATION
═══════════════════════════════════════════════════════

Generated 200 page URLs
Pattern type: parameter
Parameter name: page

═══════════════════════════════════════════════════════
  PHASE 4: URL VALIDATION
═══════════════════════════════════════════════════════

Validating 10 strategic URLs...

[1/10] Testing page 1: https://example.com/agents/?page=1
  ✓ Loaded: 200 | Contacts: 40 | Time: 1234ms
[2/10] Testing page 2: https://example.com/agents/?page=2
  ✓ Loaded: 200 | Contacts: 38 | Time: 1156ms
...

═══════════════════════════════════════════════════════
  PHASE 5: CONFIDENCE SCORING
═══════════════════════════════════════════════════════

Confidence Score: 85/100
Reliability: HIGH

Score Breakdown:
  ✓ Pattern detected: +20/20
  ✓ Multiple detection methods agree: +10/10
  ✓ Page load success (100%): +15/15
  ✓ No duplicate content (100%): +15/15
  ✓ Contact count consistent (avg: 39): +10/10
  ✓ Valid pagination type: +10/10
  ✗ Cached or manual configuration: +0/10
  ✓ No empty pages (100%): +10/10

═══════════════════════════════════════════════════════
  TEST RESULTS SUMMARY
═══════════════════════════════════════════════════════

┌───────────────────────────┬─────────────────────────┐
│ Metric                    │ Value                   │
├───────────────────────────┼─────────────────────────┤
│ Target URL                │ https://example.com/... │
│ Domain                    │ example.com             │
│                           │                         │
│ Pagination Type           │ parameter               │
│ Detection Method          │ manual                  │
│ Pattern Detected          │ YES                     │
│                           │                         │
│ Total Pages Found         │ 200                     │
│ Pages Validated           │ 10                      │
│ Unique Pages              │ 10                      │
│ Duplicate Pages           │ 0                       │
│ Empty Pages               │ 0                       │
│                           │                         │
│ Successful Loads          │ 10                      │
│ Failed Loads              │ 0                       │
│ Avg Contacts/Page         │ 39                      │
│ Avg Load Time (ms)        │ 1205                    │
│                           │                         │
│ Confidence Score          │ 85/100                  │
│ Reliability               │ HIGH                    │
│                           │                         │
│ Was Cached                │ NO                      │
│ Saved to Cache            │ YES                     │
│                           │                         │
│ Test Duration             │ 15.23s                  │
└───────────────────────────┴─────────────────────────┘

✓ Pattern saved to cache
✓ Results saved to: results.json

Sample URLs (First 5):
  1. https://example.com/agents/?page=1
  2. https://example.com/agents/?page=2
  3. https://example.com/agents/?page=3
  4. https://example.com/agents/?page=4
  5. https://example.com/agents/?page=5

Test completed successfully
```

### JSON Output

When using `--output results.json`:

```json
{
  "targetUrl": "https://example.com/agents/",
  "domain": "example.com",
  "testedAt": "2025-11-22T22:30:00.000Z",
  "paginationType": "parameter",
  "patternDetected": true,
  "detectionMethod": "manual",
  "pattern": {
    "type": "parameter",
    "paramName": "page",
    "baseUrl": "https://example.com/agents/"
  },
  "totalPagesFound": 200,
  "actualPagesValidated": 10,
  "uniquePages": 10,
  "duplicatePages": 0,
  "emptyPages": 0,
  "sampleUrls": {
    "first5": ["https://example.com/agents/?page=1", "..."],
    "middle5": ["https://example.com/agents/?page=98", "..."],
    "last5": ["https://example.com/agents/?page=196", "..."]
  },
  "validationSummary": {
    "totalValidated": 10,
    "successfulLoads": 10,
    "failedLoads": 0,
    "averageContactsPerPage": 39,
    "averageLoadTime": 1205,
    "duplicatesDetected": 0
  },
  "confidence": 85,
  "reliability": "high",
  "warnings": [],
  "issues": [],
  "wasCached": false,
  "savedToCache": true
}
```

## Common Scenarios

### Test a new site

```bash
node tests/pagination-test.js \
  --url "https://newsite.com/directory/" \
  --save-cache
```

### Quick test (fewer pages)

```bash
node tests/pagination-test.js \
  --url "https://site.com/agents/" \
  --max-pages 20 \
  --validate-sample 5
```

### Debug mode (non-headless)

```bash
node tests/pagination-test.js \
  --url "https://site.com/agents/" \
  --headless false \
  --validate-sample 3
```

### Export results for analysis

```bash
node tests/pagination-test.js \
  --url "https://site.com/agents/" \
  --output pagination-analysis.json
```

### Clear cache and retest

```bash
node tests/pagination-test.js \
  --url "https://site.com/agents/" \
  --clear-cache \
  --save-cache
```

## Interpreting Results

### High Confidence (80-100)
✅ Pagination is **reliable** and ready for production use
- Pattern consistently detected
- All pages load successfully
- No duplicate content
- Contact counts are consistent

**Action**: Safe to use `--paginate` flag in production

### Medium Confidence (50-79)
⚠️ Pagination **works but has issues**
- Pattern detected but validation has problems
- Some pages may fail or be empty
- Minor inconsistencies in content

**Action**: Use with caution, monitor results

### Low Confidence (0-49)
❌ Pagination is **unreliable or not present**
- Pattern not detected or highly inconsistent
- Many failed loads or empty pages
- Duplicate content detected

**Action**: Do NOT use pagination, scrape single pages only

## Troubleshooting

### "No pagination pattern detected"
- Site may use infinite scroll (not supported)
- Site may have single page only
- Pagination may require JavaScript interaction
- Try non-headless mode: `--headless false`

### "Duplicate pages detected"
- Pagination pattern may be incorrect
- Site may have fixed page limit
- URL generation logic may need adjustment

### "Empty pages detected"
- Reached end of available pages
- Site returns 200 but shows "no results"
- Consider lowering `--max-pages`

### "Failed loads"
- Timeout too short (increase `--timeout`)
- Site blocking automated requests
- Network issues
- CAPTCHA detected

## Integration with Main Scraper

After testing pagination:

1. **If confidence ≥ 80**: Use pagination in production
   ```bash
   node orchestrator.js --url "URL" --method select --paginate
   ```

2. **If pattern saved to cache**: Will be auto-used next time
   ```bash
   # Pagination pattern automatically loaded from cache
   node orchestrator.js --url "URL" --method select --paginate
   ```

3. **If confidence < 80**: Scrape without pagination
   ```bash
   node orchestrator.js --url "URL" --method select
   ```

## Files Generated

- `configs/_pagination_cache.json` - Cached patterns (if `--save-cache`)
- `{output-file}.json` - Test results (if `--output` specified)

## Advanced Usage

### Batch Testing Multiple Sites

```bash
#!/bin/bash
# test-all-sites.sh

sites=(
  "https://site1.com/agents/"
  "https://site2.com/agents/"
  "https://site3.com/directory/"
)

for site in "${sites[@]}"; do
  domain=$(echo $site | awk -F[/:] '{print $4}')
  node tests/pagination-test.js \
    --url "$site" \
    --save-cache \
    --output "results-$domain.json"
done
```

### Compare Manual vs Auto-Detection

```bash
# Test with manual config
node tests/pagination-test.js --url "URL" --output manual.json

# Clear cache and test with auto-detect only
node tests/pagination-test.js --url "URL" --clear-cache --output auto.json

# Compare results
diff manual.json auto.json
```

## Notes

- **Rate Limiting**: Built-in delays between page validations (1-2 seconds)
- **Browser Stealth**: Uses same stealth configuration as main scraper
- **Timeout Handling**: Gracefully handles navigation timeouts
- **Memory Efficient**: Closes pages after validation

## Related Tools

- `orchestrator.js --paginate` - Main scraper with pagination
- `tests/select-scraper-test.js` - Select scraper unit tests
- `utils/paginator.js` - Pagination utility class

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review pagination implementation in `utils/paginator.js`
3. Test with `--headless false` to see browser behavior
4. Open an issue on GitHub with test results JSON

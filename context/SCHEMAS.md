# Schema Documentation

Comprehensive schema documentation for all configuration objects and data structures.

## Config Schema v2.3 (`src/config/schemas.js`)

### FIELD_SCHEMA_V23

| Field | Type | Description |
|-------|------|-------------|
| `coordinates` | `Object` | Rectangle coordinates {x, y, width, height} for field extraction region |
| `selector` | `string\|null` | CSS selector for field fallback to coordinate extraction if selector fails |
| `userValidatedMethod` | `string` | User-validated extraction method email-text email-mailto phone-text phone-tel href-link coordinate-text screenshot-ocr label-detection |
| `extractionMethods` | `Array<Object>` | Array of tested extraction methods with value confidence metadata |
| `confidence` | `number` | Field extraction confidence score 0-100 based on validation testing |

### CONFIG_SCHEMA_V23

| Field | Type | Description |
|-------|------|-------------|
| `version` | `string` | Config version identifier must be "2.3" |
| `domain` | `string` | Target website domain without protocol e.g. "example.com" |
| `name` | `string` | Human-readable config name for display and identification |
| `cards` | `Object` | Card pattern definition with primarySelector fallbackSelectors |
| `cards.primarySelector` | `string` | Primary CSS selector for contact cards |
| `cards.fallbackSelectors` | `Array<string>` | Fallback selectors if primary fails |
| `fields` | `Object` | Field extraction definitions name email profileUrl phone title location |
| `pagination` | `Object` | Pagination configuration type enabled patterns maxPages |
| `extraction` | `Object` | Extraction settings waitTime scrollBehavior validation |
| `metadata` | `Object` | Config metadata createdAt createdBy version tool |

### EXTRACTION_METHOD_RESULT

| Field | Type | Description |
|-------|------|-------------|
| `method` | `string` | Extraction method name email-text href-link coordinate-text screenshot-ocr |
| `value` | `string\|null` | Extracted value or null if extraction failed |
| `confidence` | `number` | Method confidence 0-100 based on extraction quality |
| `metadata` | `Object` | Method-specific metadata selector regex pattern OCR details |

## Field Requirements (`src/tools/lib/constants/field-requirements.js`)

### REQUIRED_FIELDS

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Contact full name required for all contacts |
| `email` | `string` | Contact email address required for all contacts |
| `profileUrl` | `string` | Profile page URL required for enrichment |

### OPTIONAL_FIELDS

| Field | Type | Description |
|-------|------|-------------|
| `phone` | `string` | Contact phone number formatted as +1-XXX-XXX-XXXX |
| `title` | `string` | Job title or position e.g. "Partner" "Attorney" |
| `location` | `string` | Office location city state country |

### FIELD_METADATA

| Field | Type | Description |
|-------|------|-------------|
| `name.label` | `string` | Display label "Name" |
| `name.prompt` | `string` | User prompt for field selection |
| `name.required` | `boolean` | Whether field is required true for name email profileUrl |
| `name.validationPattern` | `RegExp` | Regex pattern for field validation |
| `name.example` | `string` | Example value for user guidance |
| `email.label` | `string` | Display label "Email" |
| `email.validationPattern` | `RegExp` | Email regex pattern RFC 5322 subset |
| `phone.label` | `string` | Display label "Phone" |
| `phone.validationPattern` | `RegExp` | Phone regex accepts digits spaces dashes parens |
| `profileUrl.label` | `string` | Display label "Profile URL" |
| `profileUrl.validationPattern` | `RegExp` | URL regex http https protocol |
| `title.label` | `string` | Display label "Title" |
| `location.label` | `string` | Display label "Location" |

### VALIDATION_RULES

| Field | Type | Description |
|-------|------|-------------|
| `name.minLength` | `number` | Minimum name length 2 characters |
| `name.maxLength` | `number` | Maximum name length 100 characters |
| `name.minWords` | `number` | Minimum word count 2 words first last |
| `name.maxWords` | `number` | Maximum word count 5 words reasonable limit |
| `name.blacklist` | `Array<string>` | Blacklisted terms directory page team staff email phone |
| `email.requireAt` | `boolean` | Require @ symbol in email |
| `email.requireDot` | `boolean` | Require dot in domain |
| `phone.minDigits` | `number` | Minimum digits 10 for US numbers |
| `phone.maxDigits` | `number` | Maximum digits 15 for international |
| `profileUrl.requireProtocol` | `boolean` | Require http https protocol |
| `profileUrl.requireDomain` | `boolean` | Require valid domain structure |

### CONFIDENCE_SCORES

| Method | Confidence | Description |
|--------|-----------|-------------|
| `email-mailto` | `95` | Email extracted from mailto link highest confidence |
| `phone-tel` | `95` | Phone extracted from tel link highest confidence |
| `href-link` | `90` | Profile URL from href attribute high confidence |
| `email-text` | `80` | Email found via regex in text medium-high confidence |
| `phone-text` | `75` | Phone found via regex in text medium confidence |
| `coordinate-text` | `70` | Text extracted at coordinates medium confidence |
| `label-detection` | `75` | Value extracted via label search medium confidence |
| `screenshot-ocr` | `60` | OCR text extraction lower confidence due to errors |

## Pagination Patterns (`src/constants/pagination-patterns.js`)

### PAGE_PARAMETER_NAMES

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | `string` | Most common pagination parameter name |
| `p` | `string` | Short form page parameter |
| `pg` | `string` | Abbreviated page parameter |
| `pageNum` | `string` | Explicit page number parameter |
| `pageNumber` | `string` | Explicit page number parameter |
| `pageNo` | `string` | Page number abbreviation |
| `pageindex` | `string` | Zero-indexed page parameter |
| `currentPage` | `string` | Current page indicator |

### OFFSET_PARAMETER_NAMES

| Parameter | Type | Description |
|-----------|------|-------------|
| `offset` | `string` | Most common offset parameter name |
| `start` | `string` | Start index for results |
| `from` | `string` | From index for results |
| `skip` | `string` | Number of results to skip |
| `startIndex` | `string` | Explicit start index parameter |

### PAGINATION_PATTERN_TYPES

| Pattern Type | Description |
|--------------|-------------|
| `parameter` | URL query parameter pagination ?page=N ?p=N |
| `path` | Path-based pagination /page/N /p/N |
| `offset` | Offset-based pagination ?offset=N ?start=N |
| `cursor` | Cursor-based pagination ?cursor=TOKEN not fully supported |
| `infinite-scroll` | Infinite scroll detected requires Selenium |
| `none` | No pagination detected single page only |

## Scraper Configuration Objects

### BaseConfigScraperOptions

| Field | Type | Description |
|-------|------|-------------|
| `config` | `Object` | v2.3 config object with version domain cards fields |
| `outputDir` | `string` | Output directory path for results default ./output |
| `bufferSize` | `number` | Contact buffer size for flushing default 50 |
| `screenshotExtractorEnabled` | `boolean` | Enable OCR extraction default false due to performance |

### PaginationScraperOptions

| Field | Type | Description |
|-------|------|-------------|
| `maxPages` | `number` | Maximum pages to scrape default 200 hard cap 500 |
| `pageDelay` | `number` | Delay between page scrapes milliseconds default 2000 |
| `discoverOnly` | `boolean` | Only discover pattern don't scrape default false |
| `minContacts` | `number` | Minimum contacts per page for validity default 1 |

### InfiniteScrollScraperOptions

| Field | Type | Description |
|-------|------|-------------|
| `maxScrolls` | `number` | Maximum scroll iterations default 50 |
| `scrollDelay` | `number` | Delay between scrolls milliseconds default 1500 |
| `buttonFirst` | `boolean` | Prioritize Load More buttons over scrolling default true |
| `maxRetries` | `number` | Max retries for Load More button clicks default 20 |

## Pagination Discovery Objects

### PaginationPattern

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Pattern type parameter path offset cursor infinite-scroll |
| `paginationType` | `string` | Alias for type maintains backward compatibility |
| `paramName` | `string` | URL parameter name for pagination e.g. "page" "offset" |
| `baseUrl` | `string` | Base URL with all query params except pagination param |
| `originalUrl` | `string` | Original URL preserves all filter params offices practices |
| `maxPage` | `number\|null` | Visual max page from DOM or null if unknown |
| `currentPage` | `number` | Current page number 1-indexed |
| `confidence` | `number` | Pattern confidence 0-1 based on detection method |
| `detectionMethod` | `string` | Detection method manual cache url-parameter navigation url-analysis |

### PaginationResult

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Whether pagination discovery succeeded |
| `urls` | `Array<string>` | Array of page URLs to scrape |
| `pattern` | `Object\|null` | Discovered pagination pattern or null |
| `totalPages` | `number` | Total number of pages discovered |
| `trueMaxPage` | `number` | True max page from binary search |
| `visualMaxPage` | `number\|null` | Visual max from DOM or null |
| `isCapped` | `boolean` | Whether max pages hit hard cap limit |
| `boundaryConfirmed` | `boolean` | Whether boundary confirmed with 2 empty pages |
| `testedPages` | `Array<Object>` | Array of tested pages with validity status |
| `searchPath` | `Array<string>` | Binary search path for debugging |
| `paginationType` | `string` | Pagination type for logging |
| `confidence` | `number` | Overall confidence 0-100 |
| `error` | `string\|null` | Error message if discovery failed |

### PaginationControls

| Field | Type | Description |
|-------|------|-------------|
| `hasPagination` | `boolean` | Whether pagination controls found in DOM |
| `maxPage` | `number\|null` | Maximum page number from controls or null |
| `nextButton` | `Object\|null` | Next button selector and text |
| `prevButton` | `Object\|null` | Previous button selector and text |
| `pageNumbers` | `Array<number>` | Array of page numbers from controls sorted |
| `controlsType` | `string` | Controls type numeric next-prev none |
| `currentPage` | `number\|null` | Current page number from active indicator |
| `hasLoadMore` | `boolean` | Whether Load More button detected |

## Enrichment Data Structures

### EnrichmentResult

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Whether enrichment succeeded for contact |
| `contact` | `Object` | Enriched contact object with merged fields |
| `changes` | `Object` | Changes made during enrichment field diffs |
| `confidence` | `number` | Enrichment confidence 0-100 |
| `source` | `string` | Data source profile-page manual-entry |

### FieldComparisonResult

| Field | Type | Description |
|-------|------|-------------|
| `fieldName` | `string` | Field being compared name email phone title location |
| `originalValue` | `string\|null` | Original value from listing page |
| `profileValue` | `string\|null` | Value extracted from profile page |
| `match` | `boolean` | Whether values match after normalization |
| `confidence` | `number` | Comparison confidence 0-100 |
| `action` | `string` | Action taken keep-original use-profile merge conflict |

### EnrichmentReport

| Field | Type | Description |
|-------|------|-------------|
| `totalContacts` | `number` | Total contacts processed |
| `enriched` | `number` | Number of contacts successfully enriched |
| `failed` | `number` | Number of contacts that failed enrichment |
| `fieldStats` | `Object` | Field-level statistics found kept updated conflicts |
| `elapsedTime` | `number` | Total enrichment time in milliseconds |
| `rate` | `number` | Contacts per second processing rate |

## Export Structures

### SheetExportOptions

| Field | Type | Description |
|-------|------|-------------|
| `spreadsheetId` | `string` | Google Sheets spreadsheet ID from URL |
| `sheetName` | `string` | Sheet name within spreadsheet default "Contacts" |
| `clearExisting` | `boolean` | Clear existing data before export default false |
| `columnMapping` | `Object` | Custom column mapping overrides default field order |

### BatchWriteResult

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Whether batch write succeeded |
| `rowsWritten` | `number` | Number of rows written to sheet |
| `totalContacts` | `number` | Total contacts in batch |
| `spreadsheetUrl` | `string` | URL to spreadsheet for user access |
| `error` | `string\|null` | Error message if write failed |

### ColumnDetectionResult

| Field | Type | Description |
|-------|------|-------------|
| `columns` | `Array<string>` | Ordered array of column names for header row |
| `fieldMap` | `Object` | Field to column index mapping |
| `hasCustomFields` | `boolean` | Whether custom fields detected beyond standard |

## Browser and Selenium Structures

### BrowserOptions

| Field | Type | Description |
|-------|------|-------------|
| `headless` | `boolean\|string` | Headless mode true false "new" default true |
| `timeout` | `number` | Navigation timeout milliseconds default 30000 |
| `userAgent` | `string\|null` | Custom user agent or null for random rotation |

### SeleniumOptions

| Field | Type | Description |
|-------|------|-------------|
| `headless` | `boolean` | Headless mode default true |
| `stealth` | `boolean` | Stealth mode randomize user agents default true |
| `windowSize` | `Object` | Window size {width, height} default 1920x1080 |

### ScrollConfig

| Field | Type | Description |
|-------|------|-------------|
| `scrollDelay` | `number` | Delay between scrolls milliseconds default 1500 |
| `maxScrolls` | `number` | Maximum scroll iterations default 50 |
| `buttonFirst` | `boolean` | Check Load More buttons before scrolling default true |
| `maxRetries` | `number` | Max button click retries default 20 |

### ScrollStats

| Field | Type | Description |
|-------|------|-------------|
| `scrollCount` | `number` | Total scroll iterations performed |
| `buttonClicks` | `number` | Load More button clicks performed |
| `finalHeight` | `number` | Final page height in pixels |
| `initialHeight` | `number` | Initial page height in pixels |
| `heightGrowth` | `number` | Total height growth in pixels |
| `elapsedTime` | `number` | Total scroll time in milliseconds |

## Rate Limiter Structures

### RateLimiterOptions

| Field | Type | Description |
|-------|------|-------------|
| `baseDelay` | `number` | Base delay between requests milliseconds default 1000 |
| `maxDelay` | `number` | Maximum delay with backoff milliseconds default 10000 |
| `jitter` | `number` | Random jitter percentage 0-1 default 0.2 |
| `backoffMultiplier` | `number` | Exponential backoff multiplier default 2 |

### RateLimiterStats

| Field | Type | Description |
|-------|------|-------------|
| `currentDelay` | `number` | Current delay in milliseconds with backoff |
| `errorCount` | `number` | Consecutive error count for backoff calculation |
| `backoffMultiplier` | `number` | Current backoff multiplier increases with errors |

## Validation Structures

### PageValidation

| Field | Type | Description |
|-------|------|-------------|
| `hasContent` | `boolean` | Whether page has content body length > 100 |
| `emailCount` | `number` | Unique emails found on page |
| `contactEstimate` | `number` | Estimated contacts from mailto links or emails |
| `contentHash` | `string` | MD5 hash of first 1000 chars for duplicate detection |
| `fingerprintData` | `Array<Object>` | Card fingerprint data for duplicate detection |

### ConfigValidationResult

| Field | Type | Description |
|-------|------|-------------|
| `valid` | `boolean` | Whether config is valid |
| `errors` | `Array<string>` | Array of validation error messages |
| `warnings` | `Array<string>` | Array of non-critical warnings |
| `version` | `string` | Detected config version 1.0 2.0 2.1 2.2 2.3 |

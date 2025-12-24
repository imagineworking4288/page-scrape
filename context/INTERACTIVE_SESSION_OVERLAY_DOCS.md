# Interactive Session & Overlay Client Documentation

Complete API documentation for the config generator's backend session manager and frontend overlay UI.

**Files Documented:**
1. `src/tools/lib/interactive-session.js` - Backend session orchestrator (v2.3)
2. `src/tools/assets/overlay-client.js` - Frontend overlay UI (v2.3)

**Last Updated:** 2025-12-23

---

## Table of Contents

1. [Interactive Session (Backend)](#interactive-session-backend)
2. [Overlay Client (Frontend)](#overlay-client-frontend)
3. [Backend-Frontend Communication](#backend-frontend-communication)
4. [State Machine](#state-machine)
5. [Workflow Diagrams](#workflow-diagrams)

---

# Interactive Session (Backend)

**File:** `src/tools/lib/interactive-session.js`

**Purpose:** Core workflow orchestrator for the config generator. Manages browser lifecycle, injects overlay UI, coordinates visual card selection workflow, and handles v2.1/v2.2/v2.3 config generation.

**Version:** 2.3

**Features:**
- Rectangle-based card selection
- Hybrid pattern matching (structural + visual)
- Enhanced capture with multi-method extraction strategies
- Card highlighting with confidence scores
- Manual field selection with click mode (v2.2)
- Profile link disambiguation (v2.2)
- Multi-method extraction testing with user validation (v2.3)
- Pagination diagnosis and scraping orchestration

---

## Class: InteractiveSession

### Constructor

#### `constructor(browserManager, rateLimiter, logger, configLoader, options = {}): InteractiveSession`

Initializes interactive session with dependencies and state management.

**Parameters:**
- `browserManager` (BrowserManager): Puppeteer browser manager instance
- `rateLimiter` (RateLimiter): Rate limiter for network requests
- `logger` (Object): Winston logger instance
- `configLoader` (ConfigLoader): Configuration loader instance
- `options` (Object): Optional configuration
  - `configVersion` (string): Config version to generate (default: '2.3')
  - `outputDir` (string): Output directory for configs (default: 'configs')
  - `timeout` (number): Navigation timeout in ms (default: 30000)
  - `matchThreshold` (number): Card matching threshold (default: 65)
  - `testAfterGeneration` (boolean): Test config after generation (default: true)

**Properties:**
- `browserManager` (BrowserManager): Browser manager
- `rateLimiter` (RateLimiter): Rate limiter
- `logger` (Object): Logger instance
- `configLoader` (ConfigLoader): Config loader
- `options` (Object): Session options
- `currentStep` (string): Current workflow step
- `selections` (Object): User selections
- `matchResult` (Object): Card matching results
- `previewData` (Object): Preview data for UI
- `extractionRules` (Object): Generated extraction rules
- `captureData` (Object): Enhanced capture data (v2.1)
- `manualSelections` (Object): Manual field selections (v2.2)
- `v23Selections` (Object): User-validated extraction methods (v2.3)
- `extractionTester` (ExtractionTester): v2.3 extraction tester
- `seleniumManager` (SeleniumManager): Selenium for infinite scroll
- `page` (Page): Puppeteer page instance
- `domain` (string): Extracted domain
- `testUrl` (string): Target URL
- `sessionComplete` (boolean): Session completion flag
- `sessionResult` (Object): Session result data
- `resolveSession` (Function): Promise resolver
- `rejectSession` (Function): Promise rejector

**Helper Modules:**
- `configBuilder` (ConfigBuilder): Config generation
- `configValidator` (ConfigValidator): Config validation
- `cardMatcher` (CardMatcher): Card pattern matching
- `fieldExtractor` (SmartFieldExtractor): Field extraction
- `enhancedCapture` (EnhancedCapture): v2.1 capture
- `elementCapture` (ElementCapture): v2.2 element capture

---

### Main Entry Point

#### `async start(url): Promise<Object>`

Main entry point - starts the interactive session.

**Parameters:**
- `url` (string): Target URL to scrape

**Returns:** Promise<Object> - Result with success and configPath
```javascript
{
  success: boolean,
  configPath?: string,
  config?: Object,
  validation?: Object,
  scrapingResult?: Object,
  cancelled?: boolean,
  error?: string
}
```

**Behavior:**
1. Initializes browser and navigates to URL
2. Injects overlay UI (HTML, CSS, JS)
3. Exposes backend functions for browser communication
4. Sends initial state to overlay
5. Waits for user actions via callbacks
6. Resolves when user saves config or cancels

**Throws:** Error on initialization failure

---

### Initialization Methods

#### `async initialize(url): Promise<void>`

Initializes browser and navigates to URL.

**Parameters:**
- `url` (string): Target URL

**Behavior:**
1. Extracts domain from URL
2. Gets Puppeteer page from browser manager
3. Navigates to URL with 'domcontentloaded' wait
4. Waits 3 seconds for dynamic content
5. Logs success

**Why 'domcontentloaded':**
- Modern sites with analytics/tracking never reach network idle
- Config generator is interactive - user confirms when ready
- Sufficient for DOM parsing and UI rendering

---

#### `async injectOverlay(): Promise<void>`

Injects overlay UI into the page using CSP bypass.

**Behavior:**
1. Reads overlay files from `src/tools/assets/`:
   - `overlay.html` - HTML structure and styles
   - `overlay-client.js` - Client-side script
2. Extracts CSS from `<style>` tags
3. Extracts HTML from `<body>` tags
4. Injects via `page.evaluate()` to bypass CSP:
   - Creates `<style>` tag with CSS
   - Creates container `<div>` with HTML
   - Executes JS inline using `new Function()`
5. Waits for `#controlPanel` selector (5s timeout)
6. Logs success or warning

**CSP Bypass:** Uses `page.evaluate()` which runs in page context, not as external resource.

**Throws:** Error if overlay files not found

---

#### `async exposeBackendFunctions(): Promise<void>`

Exposes backend functions for browser-to-Node communication.

**Exposed Functions:**

**Core Functions:**
- `__configGen_initialize()` - Handshake
- `__configGen_ping()` - Heartbeat
- `__configGen_setMode(mode)` - Set selection mode
- `__configGen_autoDetect(type)` - Auto-detect cards
- `__configGen_detectPagination(cardSelector)` - Detect pagination
- `__configGen_save(selections)` - Save configuration
- `__configGen_close()` - Close session

**v2.0 Functions (Rectangle Selection):**
- `__configGen_handleRectangleSelection(box)` - Handle rectangle selection
- `__configGen_confirmAndGenerate()` - Confirm and generate config

**v2.2 Functions (Manual Selection):**
- `__configGen_confirmWithSelections(selections)` - Confirm with manual selections
- `__configGen_handleFieldRectangle(data)` - Handle field rectangle

**v2.3 Functions (Multi-Method Extraction):**
- `__configGen_testFieldExtraction(data)` - Test extraction methods
- `__configGen_confirmFieldExtraction(data)` - Confirm user-validated result
- `__configGen_generateV23Config(selections)` - Generate v2.3 config
- `__configGen_finalSaveAndClose()` - Final save and close

**Validation Functions:**
- `__configGen_validateData()` - Run config validation

**Diagnosis & Scraping Functions:**
- `__configGen_diagnosePagination()` - Diagnose pagination type
- `__configGen_startScraping(scrapingConfig)` - Start scraping

---

### v2.1 Rectangle Selection Handlers

#### `async handleRectangleSelection(box): Promise<Object>`

Handles rectangle selection from user using enhanced capture for v2.1 configs.

**Parameters:**
- `box` (Object): Selection box `{x, y, width, height}`

**Returns:** Promise<Object> - Result with matches
```javascript
{
  success: boolean,
  matches?: Array<Object>,
  totalFound?: number,
  selector?: string,
  previewData?: Object,
  captureVersion?: string,
  methodsCount?: number,
  error?: string
}
```

**Behavior:**
1. Finds similar cards using CardMatcher
2. Stores match result and selector
3. Runs enhanced capture for v2.1 (comprehensive DOM capture)
4. Generates extraction rules for backward compatibility
5. Sends result to overlay via `window.handleCardDetectionResult()`

**Logs:**
- Number of matching cards
- Capture version (2.1 or 2.0)
- Method counts per field

---

#### `async handleConfirmAndGenerate(): Promise<Object>`

Handles config generation (v2.1 with v2.0 fallback).

**Returns:** Promise<Object> - Result with config path

**Behavior:**
1. Determines config version (v2.1 if captureData available)
2. Prepares metadata (URL, domain, pagination)
3. Builds config using appropriate builder:
   - v2.1: `configBuilder.buildConfigV21()` with multi-method extraction
   - v2.0: `configBuilder.buildConfigV2()` with standard rules
4. Validates config
5. Saves config to disk
6. Sends result to overlay via `window.handleConfigComplete()`
7. Stores session result but **does NOT resolve session**
8. Waits for user to click "Save & Close"

**Important:** Session remains open until `handleFinalSaveAndClose()` is called.

---

### v2.2 Manual Selection Handlers

#### `async handleConfirmWithSelections(selections): Promise<Object>`

Handles config generation with manual field selections (v2.2).

**Parameters:**
- `selections` (Object): Manual selections
```javascript
{
  fieldName: {
    selector: string,
    value: string,
    coordinates: Object,
    element: Object
  }
}
```

**Returns:** Promise<Object> - Result with config path

**Behavior:**
1. Validates matchResult exists
2. Stores manual selections
3. Processes selections with ElementCapture
4. Logs captured fields and missing required fields
5. Prepares metadata
6. Builds v2.2 config (or v2.1 fallback):
   - `configBuilder.buildConfigV22()` if available
   - Merges capture data format for v2.1 fallback
7. Adds extraction rules from manual selections
8. Validates config
9. Saves config to disk
10. Builds field details for preview panel
11. Sends result to overlay via `window.handleConfigComplete()`
12. Stores session result but **does NOT resolve yet**
13. Waits for user confirmation in preview panel

**Logs Extensively:** Step-by-step debug logging with separator lines

---

#### `async handleFieldRectangleSelection(data): Promise<Object>`

Handles field rectangle selection (v2.2). Extracts field value from elements within drawn rectangle.

**Parameters:**
- `data` (Object):
```javascript
{
  fieldName: string,
  box: {x, y, width, height}
}
```

**Returns:** Promise<Object> - Result with extracted value

**Behavior:**
1. Uses ElementCapture to extract field from rectangle
2. Sends result to overlay via `window.handleFieldRectangleResult()`

---

### v2.3 Extraction Testing Handlers

#### `async getExtractionTester(): Promise<ExtractionTester>`

Initializes extraction tester (lazy loading).

**Returns:** Promise<ExtractionTester>

**Behavior:**
- Creates ExtractionTester if not exists
- Initializes tester
- Logs initialization
- Returns tester instance

---

#### `async handleTestFieldExtraction(data): Promise<Object>`

Tests multiple extraction methods for a field (v2.3).

**Parameters:**
- `data` (Object):
```javascript
{
  fieldName: string,
  box: {x, y, width, height}
}
```

**Returns:** Promise<Object> - Results with top 5 methods
```javascript
{
  success: boolean,
  fieldName: string,
  coordinates: Object,
  results: Array<Object>,
  failedMethods: Array<Object>,
  totalMethodsTested: number,
  hasGoodResult: boolean,
  error?: string
}
```

**Behavior:**
1. Gets card element using matchResult.selector
2. Gets card bounding box
3. Calculates relative coordinates (field position relative to card)
4. Gets extraction tester
5. Runs `tester.testFieldWithRetry()` with auto-retry
6. Formats results for UI
7. Sends results to overlay via `window.handleExtractionResults()`
8. Logs top 3 results

**Logs:** Extensive debug logging with separator lines

---

#### `async handleConfirmFieldExtraction(data): Promise<Object>`

Handles user confirmation of an extraction result (v2.3).

**Parameters:**
- `data` (Object):
```javascript
{
  fieldName: string,
  selectedResult: Object,
  coordinates: Object
}
```

**Returns:** Promise<Object> - Confirmation

**Behavior:**
1. Logs user's choice
2. Stores validated selection in `v23Selections`
3. Returns success

---

#### `async handleGenerateV23Config(selections): Promise<Object>`

Generates v2.3 config with user-validated extraction methods.

**Parameters:**
- `selections` (Object): Field selections with validated methods

**Returns:** Promise<Object> - Result with config path

**Behavior:**
1. Validates matchResult exists
2. Creates base config using `createConfigV23()`
3. Populates field data from validated selections
4. Validates config using `validateConfigV23()`
5. Saves config to disk
6. Builds field details for preview panel
7. Sends result to overlay via `window.handleConfigComplete()`
8. Stores session result but **does NOT resolve yet**
9. Waits for user confirmation in preview panel

**Note:** Does NOT cleanup extraction tester here - cleanup happens in `handleFinalSaveAndClose()`

---

#### `async handleFinalSaveAndClose(): Promise<Object>`

Handles final save and close from preview panel (v2.3).

**Returns:** Promise<Object> - Completion result

**Behavior:**
1. Marks session as complete
2. Logs config path and scraping result (if present)
3. Cleans up extraction tester if exists
4. Cleans up Selenium manager if exists
5. Resolves session promise (closes browser)
6. Returns control to config-generator.js

**Important:** This is the ONLY place where session is resolved after config generation.

---

### Auto-Detection Methods

#### `async autoDetectCards(): Promise<Object>`

Auto-detects contact cards on the page.

**Returns:** Promise<Object> - Detection result

**Candidate Selectors (priority order):**
```javascript
[
  '.card', '.item', '.result', '.entry',
  '.person', '.contact', '.profile', '.member',
  '.attorney', '.lawyer', '.staff', '.employee',
  'li.card', 'li.item', 'li.result',
  'article', 'article.card',
  'tr.contact', 'tbody tr',
  'div[class*="card"]', 'div[class*="item"]',
  'div[class*="person"]', 'div[class*="contact"]',
  'div[class*="result"]', 'div[class*="profile"]'
]
```

**Selection Criteria:**
- Count between 5 and 200
- Highest count wins

---

#### `validateField(fieldType, values): Object`

Validates extracted field values.

**Parameters:**
- `fieldType` (string): Field type (name, email, phone)
- `values` (Array): Extracted values

**Returns:** Object - Validation results
```javascript
{
  validCount: number,
  totalCount: number,
  coverage: number,
  samples: Array<string>
}
```

**Validation Logic:**
- **name**: Uses `contactExtractor.isValidNameCandidate()`
- **email**: Uses `contactExtractor.extractEmails()`
- **phone**: Uses `contactExtractor.extractPhones()`

---

### Pagination Detection

#### `async detectPagination(): Promise<Object>`

Detects pagination pattern (including infinite scroll).

**Returns:** Promise<Object> - Pagination detection results

**Behavior:**
1. Tries traditional pagination using Paginator
2. If traditional pagination found:
   - Stores pattern
   - Returns type, totalPages, confidence
3. If no traditional pagination:
   - Checks for infinite scroll
   - Returns infinite scroll or single-page

**Traditional Pagination Detection:**
- Uses `paginator.paginate()` with `discoverOnly: true`
- Max 200 pages, min 1 contact
- Logs type and total pages

**Infinite Scroll Detection:**
- Calls `detectInfiniteScroll()`
- Stores pattern with scroll configuration
- Logs confidence and card counts

---

#### `async detectInfiniteScroll(): Promise<Object>`

Detects if page uses infinite scroll using robust multi-scroll testing.

**Returns:** Promise<Object> - Detection results
```javascript
{
  detected: boolean,
  confidence: string,
  scrollResults: Array<Object>,
  totalNewCards: number,
  initialCards: number,
  finalCards: number,
  scrollsWithNewContent: number
}
```

**Behavior:**
1. Gets initial card count and height
2. Performs 3-5 test scrolls
3. For each scroll:
   - Scrolls to bottom with smooth behavior
   - Waits 2 seconds for content
   - Counts cards and height after
   - Logs changes
   - Tracks no-new-content count
4. Stops if 2 consecutive scrolls with no new content
5. Scrolls back to top
6. Analyzes results:
   - `detected`: true if any scroll had new content
   - `confidence`: high (2+ scrolls), medium (1 scroll), low (0 scrolls)

**Logs:** Detailed scroll-by-scroll analysis

---

### User Action Handlers

#### `async handleStepConfirmed(stepData): Promise<Object>`

Handles step confirmation.

**Parameters:**
- `stepData` (Object): Step data

**Returns:** Promise<Object> - Result

**Behavior:**
- If phone step or `proceedToPagination`: moves to pagination
- Otherwise: returns success

---

#### `async handleFieldSkipped(fieldType): Promise<Object>`

Handles field skip (for optional fields like phone).

**Parameters:**
- `fieldType` (string): Field being skipped

**Returns:** Promise<Object> - Result

**Behavior:**
- If phone: moves to pagination detection
- Otherwise: returns success

---

#### `async handleRetryRequested(): Promise<Object>`

Handles retry request from user.

**Returns:** Promise<Object> - Result

**Behavior:**
1. Clears highlights via `window.OverlayController.clearHighlights()`
2. Resets to card selection step
3. Clears all selections
4. Returns next step as 'card'

---

#### `async handleUserCancelled(): Promise<Object>`

Handles user cancellation.

**Returns:** Promise<Object> - Result

**Behavior:**
1. Marks session complete
2. Sets result as cancelled
3. Resolves session promise
4. Returns success

---

#### `async handleSaveRequested(): Promise<Object>`

Handles save request (legacy v2.0 method).

**Returns:** Promise<Object> - Result with config path

**Behavior:**
1. Prepares metadata
2. Builds config using ConfigBuilder
3. Validates config
4. Tests config if enabled
5. Saves config to disk
6. Stores session result but **does NOT resolve**
7. Returns result

**Note:** Browser stays open until "Save & Close" clicked.

---

### Validation Handler

#### `async handleValidateData(): Promise<Object>`

Handles validation request from UI. Tests config by scraping and enriching contacts.

**Returns:** Promise<Object> - Validation results
```javascript
{
  success: boolean,
  data?: {
    contactsTested: number,
    withEmail: number,
    withPhone: number,
    withProfileUrl: number,
    enriched: number,
    contacts: Array<Object>,
    passed: boolean,
    hasErrors: boolean,
    recommendation: string
  },
  error?: string
}
```

**Behavior:**
1. Loads config from session or file
2. Determines scraper type from pagination type:
   - `infinite-scroll` → InfiniteScrollScraper (Selenium)
   - `pagination` → PaginationScraper (Puppeteer)
   - `single-page` → SinglePageScraper (Puppeteer)
3. Scrapes 5 contacts using appropriate scraper
4. Enriches contacts with profile URLs
5. Builds validation results with field comparison
6. Generates recommendation based on extraction rates

**Validation Limit:** 5 contacts

**Important:** Uses SAME scraper type that production will use.

---

### Diagnosis & Scraping Handlers

#### `async handleDiagnosePagination(): Promise<Object>`

Handles pagination diagnosis request.

**Returns:** Promise<Object> - Diagnosis results
```javascript
{
  success: boolean,
  type: string,
  confidence: string,
  cardSelector: string,
  cardCounts?: Object,
  controlsFound?: Object,
  error?: string
}
```

**Behavior:**
1. Gets card selector from config
2. Counts initial cards
3. Checks for pagination controls:
   - Numeric pagination
   - Next button
   - Load More button
   - Infinite scroll indicators
4. Determines type:
   - `pagination`: Traditional pagination controls found
   - `infinite-scroll`: Infinite scroll indicators found
   - Tests scroll behavior if no controls
5. Sends result to frontend via `window.handleDiagnosisComplete()`

---

#### `async handleStartScraping(scrapingConfig): Promise<Object>`

Handles start scraping request.

**Parameters:**
- `scrapingConfig` (Object):
```javascript
{
  paginationType: string,
  limit: number,
  configName: string,
  configPath: string,
  diagnosisResults?: Object
}
```

**Returns:** Promise<Object> - Scraping results

**Behavior:**
1. Loads config from session or file
2. Validates config structure
3. Creates appropriate scraper:
   - For infinite-scroll: Initializes SeleniumManager
   - Creates scraper using `createScraper()`
4. Sets config on scraper
5. Sets output path to 'output/'
6. Starts scraping:
   - Delegates to real scraper
   - Scraper handles scrolling, waiting, retry, extraction
7. Checks if overlay still exists (re-injects if removed)
8. Sends result to frontend via `window.handleScrapingComplete()`
9. Stores scraping result but **does NOT resolve session**

**Note:** Browser stays open until "Save & Close" clicked.

---

### Utility Methods

#### `sleep(ms): Promise<void>`

Sleep helper.

**Parameters:**
- `ms` (number): Milliseconds to sleep

**Returns:** Promise<void>

---

#### `formatMethodName(method): string`

Formats method name for display.

**Parameters:**
- `method` (string): Method name (e.g., 'coordinate-text')

**Returns:** string - Formatted name (e.g., 'Coordinate Text')

**Logic:**
- Replaces hyphens with spaces
- Capitalizes first letter of each word
- Returns 'Manual' if no method

---

#### `sendToOverlay(command, data): Promise<void>`

Sends data to overlay UI.

**Parameters:**
- `command` (string): Command name
- `data` (Object): Data to send

**Behavior:**
- Calls `window.OverlayController.handleBackendMessage(command, data)` via `page.evaluate()`

---

### Static Methods

#### `InteractiveSession.setActiveSession(session): void`

Tracks active session for cleanup.

**Parameters:**
- `session` (InteractiveSession): Active session instance

---

#### `InteractiveSession.clearActiveSession(): void`

Clears active session.

---

### Process Signal Handlers

**Graceful Shutdown:**
```javascript
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
process.on('uncaughtException', cleanup)
process.on('unhandledRejection', cleanup)
```

**Cleanup Function:**
1. Terminates extraction tester
2. Closes Selenium manager
3. Exits process

---

# Overlay Client (Frontend)

**File:** `src/tools/assets/overlay-client.js`

**Purpose:** Frontend overlay UI script that runs in browser context. Handles rectangle selection, card highlighting, field selection, extraction results display, and backend communication.

**Version:** 2.3

**Features:**
- Rectangle-based card selection
- Field rectangle selection with toggle mode
- Multi-method extraction results display
- User validation of extraction methods
- Config preview before saving
- Pagination diagnosis UI
- Scraping progress tracking
- Validation modal

---

## Constants

### Field Order & Requirements

```javascript
const FIELD_ORDER = ['name', 'email', 'phone', 'profileUrl', 'title', 'location'];
const REQUIRED_FIELDS = ['name', 'email', 'profileUrl'];
const OPTIONAL_FIELDS = ['phone', 'title', 'location'];
```

### Field Metadata

```javascript
const FIELD_METADATA = {
  name: {
    id: 'name',
    label: 'Name',
    prompt: "Click on a person's NAME in the card",
    validationHint: 'Should contain 2-4 words...',
    example: 'John Smith, Jane Doe...',
    required: true
  },
  // ... similar for email, phone, profileUrl, title, location
}
```

### State Machine States

```javascript
const STATES = {
  IDLE: 'IDLE',
  RECTANGLE_SELECTION: 'RECTANGLE_SELECTION',
  PROCESSING: 'PROCESSING',
  PREVIEW: 'PREVIEW',
  MANUAL_SELECTION: 'MANUAL_SELECTION',
  FIELD_RECTANGLE_SELECTION: 'FIELD_RECTANGLE_SELECTION',
  EXTRACTION_RESULTS: 'EXTRACTION_RESULTS',
  LINK_DISAMBIGUATION: 'LINK_DISAMBIGUATION',
  GENERATING: 'GENERATING',
  CONFIG_PREVIEW: 'CONFIG_PREVIEW',
  DIAGNOSIS: 'DIAGNOSIS',
  SCRAPING: 'SCRAPING',
  COMPLETE: 'COMPLETE'
}
```

---

## State Management

### State Object

```javascript
const state = {
  // Core state
  currentState: STATES.IDLE,
  isDrawing: false,
  startX: 0, startY: 0,
  currentX: 0, currentY: 0,
  selectionBox: null,
  detectedCards: [],
  previewData: null,
  backendReady: false,

  // v2.2: Manual selection
  manualSelections: {},
  currentFieldIndex: 0,
  currentField: null,
  pendingFieldCapture: null,
  autoDetectedFields: {},

  // v2.2: Field rectangle selection
  isDrawingField: false,
  fieldStartX: 0, fieldStartY: 0,
  fieldCurrentX: 0, fieldCurrentY: 0,
  selectorEnabled: false,

  // v2.2: Link disambiguation
  pendingLinks: [],
  selectedLinkIndex: -1,
  personName: null,

  // v2.3: Extraction results
  extractionResults: [],
  failedMethods: [],
  selectedResultIndex: -1,
  currentFieldCoords: null,
  lastFieldAbsoluteBox: null,

  // v2.3: Field validation progress
  fieldProgress: {
    name: false, email: false, phone: false,
    title: false, location: false, profileUrl: false
  },
  v23RequiredFields: ['name', 'email', 'profileUrl'],
  v23OptionalFields: ['phone', 'title', 'location'],

  // v2.3: Config preview
  generatedConfigData: null,

  // Diagnosis
  diagnosisResults: null,
  manualPaginationType: null,
  scrapingInProgress: false,
  contactLimit: 0
}
```

---

## Initialization

### `async init(): Promise<void>`

Initializes the overlay.

**Behavior:**
1. Gets DOM elements (canvas, preview, dimensions, highlights)
2. Sets up canvas and resize listener
3. Waits for backend with `waitForBackend()`
4. Shows error toast if backend timeout

---

### `async waitForBackend(): Promise<boolean>`

Waits for backend functions to be exposed.

**Returns:** Promise<boolean> - True if backend ready

**Behavior:**
- Attempts to call `__configGen_initialize()` up to 50 times
- Waits 100ms between attempts (5 second total timeout)
- Checks for `result.ready` flag
- Sets `state.backendReady = true` on success

---

### `resizeCanvas(): void`

Resizes canvas to match window dimensions.

---

## Panel Management

### `showPanel(panelId): void`

Shows a specific panel and hides others.

**Parameters:**
- `panelId` (string): Panel ID to show

**Panels:**
- `instructionPanel` - Initial instructions
- `confirmationPanel` - Card confirmation
- `progressPanel` - Progress indicator
- `completePanel` - Completion message
- `previewPanel` - Auto-detection preview (v2.2)
- `manualPanel` - Manual field selection (v2.2)
- `extractionResultsPanel` - Extraction results (v2.3)
- `configPreviewPanel` - Config preview before save (v2.3)
- `diagnosisPanel` - Pagination diagnosis

---

### `window.toggleMinimize(): void`

Toggles panel minimize/maximize.

---

### `showProgress(title, message): void`

Shows progress panel with message.

**Parameters:**
- `title` (string): Progress title
- `message` (string): Progress message

---

## Selection Drawing (Card Rectangle)

### `window.startSelection(): void`

Starts card selection mode.

**Behavior:**
1. Shows canvas
2. Adds mouse event listeners
3. Updates subtitle

---

### `handleMouseDown(e): void`

Handles mouse down - starts drawing card rectangle.

---

### `handleMouseMove(e): void`

Handles mouse move - updates card rectangle.

---

### `handleMouseUp(e): void`

Handles mouse up - finalizes card selection.

**Behavior:**
1. Calculates selection box
2. Validates minimum size (50x50)
3. Stores selection
4. Hides canvas and preview
5. Removes event listeners
6. Calls `processSelection(box)`

---

### `updateSelectionPreview(): void`

Updates card selection preview rectangle.

---

### `getSelectionBox(): Object`

Gets normalized selection box (handles any drag direction).

**Returns:** Object - `{x, y, width, height}`

---

### `hideSelectionPreview(): void`

Hides card selection preview.

---

## Selection Processing

### `async processSelection(box): Promise<void>`

Processes card selection and finds similar cards.

**Parameters:**
- `box` (Object): Selection box

**Behavior:**
1. Shows progress
2. Calls `__configGen_handleRectangleSelection(box)`
3. Waits for `window.handleCardDetectionResult()` callback
4. Shows error on failure

---

### `window.handleCardDetectionResult(result): void`

Handles card detection result from backend (callback).

**Parameters:**
- `result` (Object): Detection result

**Behavior:**
1. Validates result
2. Stores detected cards and preview data
3. Updates stats (card count, confidence)
4. Builds preview table
5. Highlights cards
6. Shows preview panel (v2.2) or confirmation panel (v2.0)

---

### `buildPreviewTable(data): void`

Builds preview table from extracted data.

**Parameters:**
- `data` (Object): Preview data

**Fields Displayed:**
- name, email, phone, title, location, profileUrl
- socialLinks (if present)
- otherFields (first 3)

---

## Card Highlighting

### `highlightCards(cards): void`

Highlights detected cards on the page.

**Parameters:**
- `cards` (Array): Card matches

**Behavior:**
1. Clears existing highlights
2. For each card:
   - Creates highlight div
   - Sets confidence class (high/medium/low)
   - Positions at card location
   - Adds badge with number and confidence
3. Appends to highlights container

**Confidence Classes:**
- `high-confidence`: ≥75%
- `medium-confidence`: ≥50%
- `low-confidence`: <50%

---

### `clearHighlights(): void`

Clears all card highlights.

---

## User Actions

### `window.retrySelection(): void`

Retries card selection.

**Behavior:**
1. Clears state (selections, cards, preview)
2. Exits field rectangle mode
3. Clears highlights
4. Shows instruction panel

---

### `window.confirmAndGenerate(): void`

Confirms card selection and generates config.

**Behavior:**
1. Shows progress
2. Calls `__configGen_confirmAndGenerate()`
3. Waits for `window.handleConfigComplete()` callback

---

### `window.handleConfigComplete(result): void`

Handles config generation complete (callback).

**Parameters:**
- `result` (Object): Generation result

**Behavior (v2.3):**
1. Validates result
2. Extracts config name for scraping
3. Stores generated config data:
   - configPath, configName, config, validation, score, fields
4. Builds config preview panel
5. Shows config preview panel
6. **Does NOT complete session** - waits for user to click "Save & Close"

**Behavior (v2.0):**
- Showed complete panel immediately

---

### `window.closePanel(): async void`

Closes panel and notifies backend.

**Behavior:**
- If config/scraping complete: Calls `__configGen_finalSaveAndClose()`
- Otherwise: Calls `__configGen_close()`

---

## Preview Panel Functions (v2.2)

### `buildPreviewPanel(autoDetected): void`

Builds preview panel with auto-detected fields.

**Parameters:**
- `autoDetected` (Object): Auto-detected field values

**Behavior:**
1. Stores auto-detected fields
2. Builds result rows for each field
3. Updates stats (card count, field count)
4. Updates tip based on missing required fields

---

### `window.acceptAutoDetection(): void`

Accepts auto-detection and proceeds to config generation.

**Behavior:**
1. Merges auto-detected fields as selections
2. Calls `confirmAndGenerate()`

---

### `window.startManualSelection(): void`

Starts manual field selection workflow.

**Behavior:**
1. Sets state to MANUAL_SELECTION
2. Pre-populates with auto-detected values
3. Shows manual panel
4. Shows first field prompt

---

## Manual Selection Functions (v2.2)

### `showFieldPrompt(index): void`

Shows prompt for specific field.

**Parameters:**
- `index` (number): Field index in FIELD_ORDER

**Behavior:**
1. Updates current field index and name
2. Updates step indicator and progress bar
3. Updates prompt, hint, example
4. Shows/hides skip button based on required status
5. Shows captured feedback if already captured
6. Enters field rectangle selection mode
7. Updates finish button

---

### `resetFeedbackSection(): void`

Resets feedback section to waiting state.

---

### `showCapturedFeedback(value): void`

Shows captured value feedback.

**Parameters:**
- `value` (string): Captured value

---

### `showErrorFeedback(message): void`

Shows error feedback.

**Parameters:**
- `message` (string): Error message

---

### `window.skipCurrentField(): void`

Skips current optional field.

**Behavior:**
1. Removes selection for field
2. Moves to next field

---

### `window.confirmCurrentField(): void`

Confirms current field and moves to next.

**Behavior:**
1. Stores pending capture in manualSelections
2. Moves to next field

---

### `window.backToPreview(): void`

Returns to preview panel from manual selection.

---

### `window.finishManualSelection(): void`

Finishes manual selection and generates config.

**Behavior:**
1. Validates at least one field captured
2. Logs selections being sent
3. Exits field rectangle mode
4. Shows progress
5. Calls `confirmAndGenerateWithSelections()`

**Note:** Required field validation is currently bypassed for testing.

---

### `updateFinishButton(): void`

Updates finish button state.

**Logic:**
- Enabled if any field captured (validation bypassed)
- Tooltip shows missing optional fields

---

### `updateFieldCompletionUI(): void`

Updates field completion UI with checkmarks and progress.

**Behavior:**
1. Updates progress counter
2. Updates progress bar
3. Updates field status indicators
4. Updates finish button

---

### `updateFieldStatusIndicators(): void`

Updates individual field status indicators.

**Creates:**
- Field status row with icons:
  - `✓` - Captured
  - `○` - Required, not captured
  - `·` - Optional, not captured
- Tooltips with field values

---

## Config Preview Panel Functions (v2.3)

### `buildConfigPreviewPanel(configData): void`

Builds config preview panel with generated config data.

**Parameters:**
- `configData` (Object): Generated config data

**Behavior:**
1. Builds field rows showing:
   - Field label (with * for required)
   - Field value
   - Extraction method
   - Status badge (Found/Missing)
   - Confidence badge
2. Updates stats (cards, fields, score)
3. Shows warnings if any:
   - Validation warnings
   - Missing required fields

---

### `window.saveAndCloseConfig(): async void`

Saves config and closes from preview panel.

**Behavior:**
1. Validates config data exists
2. Disables save button and shows "Saving..."
3. Calls `__configGen_finalSaveAndClose()`
4. On success:
   - Clears highlights
   - Shows success toast
   - Shows complete panel
   - Browser closes automatically
5. On error:
   - Re-enables save button
   - Shows error toast

---

### `window.backToEditConfig(): void`

Returns to editing from config preview.

**Behavior:**
1. Sets state to MANUAL_SELECTION
2. Shows manual panel
3. Resets to current field
4. Shows info toast

---

## Validation Functions

### `window.validateData(): async void`

Validates generated config by testing scrape + enrichment.

**Behavior:**
1. Disables button, shows loading
2. Shows validation modal with loading spinner
3. Calls `__configGen_validateData()`
4. Displays results via `displayValidationResults()`
5. Re-enables button

---

### `window.closeValidationModal(): void`

Closes validation modal.

---

### `displayValidationResults(data): void`

Displays validation results in modal.

**Parameters:**
- `data` (Object): Validation data

**Displays:**
1. Stats cards:
   - Contacts Tested
   - With Email
   - With Profile URL
   - Enriched
2. Contact comparison cards:
   - Scraped vs Enriched fields
   - Action badges (ENRICHED, UPDATED, UNCHANGED)
3. Summary:
   - Pass/Fail status
   - Recommendation

---

## Diagnosis & Scraping Functions

### `window.startDiagnosis(): async void`

Starts pagination diagnosis.

**Behavior:**
1. Updates state
2. Shows diagnosis panel with "Analyzing..."
3. Hides details and options
4. Calls `__configGen_diagnosePagination()`
5. Waits for `window.handleDiagnosisComplete()` callback

---

### `window.handleDiagnosisComplete(results): void`

Handles diagnosis complete from backend (callback).

**Parameters:**
- `results` (Object): Diagnosis results

**Behavior:**
1. Validates result
2. Stores diagnosis results
3. Updates badge with detected type
4. Builds and shows details table
5. Shows manual override section
6. Shows scraping options section

---

### `formatDiagnosisType(type): string`

Formats pagination type for display.

**Type Mapping:**
- `infinite-scroll` → 'Infinite Scroll'
- `pagination` → 'Traditional Pagination'
- `single-page` → 'Single Page'

---

### `buildDiagnosisDetails(results): void`

Builds diagnosis details table based on pagination type.

**Parameters:**
- `results` (Object): Diagnosis results

**Rows:**
- Common: Type, Confidence
- Infinite Scroll: Initial Cards, After Scroll, Scrolls Performed
- Pagination: Total Pages, Sample URLs
- Single Page: Cards Found

---

### `window.startScraping(mode): async void`

Starts scraping with "all" mode.

**Parameters:**
- `mode` (string): Scraping mode

**Behavior:**
1. Validates config name available
2. Gets pagination type (manual override or detected)
3. Updates state
4. Shows progress
5. Calls `__configGen_startScraping(scrapingConfig)`

**Scraping Config:**
```javascript
{
  paginationType: string,
  limit: 0,
  diagnosisResults: Object,
  configName: string,
  configPath: string
}
```

---

### `window.startScrapingWithLimit(): async void`

Starts scraping with user-specified limit.

**Behavior:**
- Same as `startScraping()` but with user input limit

---

### `window.backToConfigPreview(): void`

Returns to config preview from diagnosis.

---

### `window.handleScrapingProgress(progress): void`

Handles scraping progress update from backend (callback).

**Parameters:**
- `progress` (Object): Progress data

**Updates:**
- Contact count
- Page number (if pagination)
- Scroll number (if infinite scroll)

---

### `window.handleScrapingComplete(results): void`

Handles scraping complete from backend (callback).

**Parameters:**
- `results` (Object): Scraping results

**Behavior:**
1. Updates state
2. Shows complete panel on success
3. Shows error on failure
4. Updates contact count and output path

---

## Field Rectangle Selection Functions (v2.2)

### `enterFieldRectangleSelection(): void`

Enters field rectangle selection mode.

**Behavior:**
- Initializes selector toggle (starts disabled)

---

### `exitFieldRectangleSelection(): void`

Exits field rectangle selection mode.

**Behavior:**
1. Removes body class
2. Disables selector
3. Hides field selection preview
4. Resets drawing state

---

## Selector Toggle Functions (v2.2)

### `initializeSelectorToggle(): void`

Initializes the selector toggle button.

**Behavior:**
- Sets up onclick handler
- Starts with selector disabled

---

### `enableSelector(): void`

Enables the selector - allows drawing rectangles.

**Behavior:**
1. Sets `selectorEnabled = true`
2. Shows canvas
3. Adds body class for visual feedback
4. Adds field rectangle event listeners
5. Updates button visual

---

### `disableSelector(): void`

Disables the selector - prevents drawing, allows scrolling.

**Behavior:**
1. Sets `selectorEnabled = false`
2. Hides canvas
3. Removes body class
4. Removes event listeners
5. Updates button visual

---

### `updateSelectorToggleButton(): void`

Updates selector toggle button appearance.

**Visual:**
- Active: `✓ Selector ON` (green)
- Inactive: `○ Selector OFF` (gray)

---

### `window.toggleSelector(): void`

Toggles selector on/off (exposed for onclick handlers).

---

### Field Rectangle Event Handlers

#### `handleFieldMouseDown(e): void`

Handles mouse down for field rectangle.

**Behavior:**
- Ignores clicks on panel/modal
- Starts drawing
- Shows field selection preview

---

#### `handleFieldMouseMove(e): void`

Handles mouse move for field rectangle.

---

#### `handleFieldMouseUp(e): void`

Handles mouse up for field rectangle - finalizes selection.

**Behavior:**
1. Validates minimum size (10x10)
2. Hides preview
3. Calls `processFieldRectangle(box)`

---

#### `handleFieldKeyDown(e): void`

Handles keydown in field selection mode.

**Keys:**
- `Escape` - Cancels field selection

---

### `getFieldSelectionBox(): Object`

Gets normalized field selection box.

**Returns:** Object - `{x, y, width, height}`

---

### Field Rectangle Preview Functions

#### `showFieldSelectionPreview(): void`

Shows field selection preview rectangle.

---

#### `updateFieldSelectionPreview(): void`

Updates field selection preview rectangle.

---

#### `hideFieldSelectionPreview(): void`

Hides field selection preview.

---

## Field Rectangle Processing (v2.3 Routing)

### `async processFieldRectangle(box): Promise<void>`

Processes field rectangle - **routes DIRECTLY to v2.3 multi-method testing**.

**Parameters:**
- `box` (Object): Selection box (absolute viewport coordinates)

**Behavior:**
1. Stores absolute box for v2.3
2. Shows progress feedback
3. Prepares test data with ABSOLUTE coordinates
4. Calls `__configGen_testFieldExtraction(testData)`
5. Waits for `window.handleExtractionResults()` callback

**Important:** Bypasses v2.2 entirely - v2.3 is the primary workflow.

---

### `window.handleFieldRectangleResult(result): void`

**DEPRECATED** - Should not be called in v2.3.

**Fallback Behavior:**
- Logs deprecation warning
- Attempts v2.3 extraction as fallback

---

### `async triggerV23Extraction(fieldName, rectangleResult): Promise<void>`

Triggers multi-method extraction testing for a field (v2.3).

**Parameters:**
- `fieldName` (string): Field to test
- `rectangleResult` (Object): Result from rectangle selection

**Behavior:**
1. Shows progress
2. Stores relative coordinates
3. Uses stored absolute box
4. Prepares test data
5. Calls `__configGen_testFieldExtraction(testData)`
6. Falls back to v2.2 on error

---

### `fallbackToV22(fieldName, rectangleResult): void`

Fallback to v2.2 workflow when v2.3 unavailable.

**Parameters:**
- `fieldName` (string): Field name
- `rectangleResult` (Object): Rectangle result

**Behavior:**
1. Creates capture data
2. Stores in manualSelections
3. Shows captured feedback
4. Updates UI

**Note:** This is a safety fallback - v2.3 should always be available.

---

## Link Disambiguation Functions (v2.2)

### `handleProfileUrlDisambiguation(links): void`

Handles profile URL disambiguation when multiple links found.

**Parameters:**
- `links` (Array): Found links

**Behavior:**
1. Classifies links using `classifyLink()`
2. Shows disambiguation modal

---

### `selectProfileLink(link): void`

Selects profile link from disambiguation.

**Parameters:**
- `link` (Object): Selected link

**Behavior:**
1. Creates capture data
2. Stores in manualSelections
3. Closes modal
4. Shows success feedback
5. Updates UI

---

### `classifyLink(href, text, personName): Object`

Classifies a link.

**Parameters:**
- `href` (string): Link URL
- `text` (string): Link text
- `personName` (string): Person's name for matching

**Returns:** Object - Classification result
```javascript
{
  type: string,        // 'profile' or 'unknown'
  confidence: number,  // 0.5 to 0.95
  nameMatch: string    // 'none', 'partial', 'strong'
}
```

**Profile Patterns:**
```javascript
[
  /\/people\//, /\/person\//, /\/lawyers\//, /\/attorney/,
  /\/staff\//, /\/team\//, /\/bio\//, /\/profile\//,
  /\/about\//, /\/professionals\//
]
```

**Name Matching:**
- Strong: 2+ name parts in URL
- Partial: 1 name part in URL

---

### Link Disambiguation Modal Functions

#### `showLinkDisambiguationModal(links): void`

Shows link disambiguation modal.

**Parameters:**
- `links` (Array): Classified links

**Displays:**
- Link text
- Link href
- Badges: Profile, Name Match, Partial Match, Clicked

---

#### `selectLinkOption(index): void`

Selects link option in modal.

**Parameters:**
- `index` (number): Link index

---

#### `window.confirmLinkSelection(): void`

Confirms link selection.

---

#### `window.cancelLinkSelection(): void`

Cancels link selection.

---

#### `hideModal(): void`

Hides modal.

---

## Extraction Results Functions (v2.3)

### `window.handleExtractionResults(result): void`

Handles extraction results from backend (callback).

**Parameters:**
- `result` (Object): Extraction results
```javascript
{
  success: boolean,
  fieldName: string,
  results: Array<Object>,
  failedMethods: Array<Object>,
  coordinates: Object,
  totalMethodsTested: number,
  hasGoodResult: boolean,
  error?: string
}
```

**Behavior:**
1. Validates result
2. Stores results and failed methods
3. Shows extraction results panel
4. Builds results UI

---

### `buildExtractionResultsPanel(fieldName, result): void`

Builds extraction results panel showing top 5 methods.

**Parameters:**
- `fieldName` (string): Field name
- `result` (Object): Extraction result

**Behavior:**
1. Updates header with field label and method count
2. Builds result items:
   - Radio button for selection
   - Result value (truncated to 60 chars)
   - Result method label
   - Confidence badge (high/medium/low)
   - Recommended badge for first high-confidence result
3. Auto-selects first result if confidence ≥70%
4. Builds failed methods section (collapsible)
5. Updates confirm button

**Confidence Classes:**
- `high`: ≥90%
- `medium`: ≥70%
- `low`: <70%

---

### `buildFailedMethodsSection(): void`

Builds failed methods collapsible section.

**Displays:**
- Count of failed methods
- List with method name and failure reason

---

### `selectExtractionResult(index): void`

Selects an extraction result.

**Parameters:**
- `index` (number): Result index

**Behavior:**
1. Updates selected index
2. Updates visual selection
3. Updates confirm button

---

### `updateExtractionConfirmButton(): void`

Updates confirm button state.

**Logic:**
- Disabled if no result selected

---

### `window.confirmExtractionResult(): void`

Confirms selected extraction result.

**Behavior:**
1. Validates selection
2. Creates capture data with:
   - value
   - userValidatedMethod
   - methodLabel
   - coordinates
   - confidence
   - metadata
   - source: 'v2.3-validated'
3. Stores in manualSelections
4. Marks field as validated in progress tracker
5. Shows captured feedback
6. Updates UI
7. Returns to field selection state
8. Disables selector

---

### `updateFinishButtonStateV23(): void`

Updates finish button state based on v2.3 validation progress.

**Logic:**
- Enabled if all required fields validated
- Tooltip shows completed/total fields
- Tooltip shows missing required fields if incomplete

---

### `window.retryFieldExtraction(): void`

Retries field selection (reselects area).

---

### `window.skipFieldFromResults(): void`

Skips current field from extraction results view.

**Validation:**
- Cannot skip required fields

---

## Validation Functions (v2.2)

### `validateFieldValue(fieldName, value): Object`

Validates field value.

**Parameters:**
- `fieldName` (string): Field name
- `value` (string): Field value

**Returns:** Object - Validation result
```javascript
{
  valid: boolean,
  message?: string
}
```

**Validation Rules:**

**name:**
- Not an email (no @)
- Not a phone (no digit patterns)
- 1-6 words

**email:**
- Valid email format: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`

**phone:**
- 7-15 digits

**profileUrl:**
- Starts with 'http' or '/'

---

## Selector Generation (v2.2)

### `generateSelector(el): string|null`

Generates a CSS selector for an element.

**Parameters:**
- `el` (Element): DOM element

**Returns:** string|null - CSS selector

**Strategy (priority order):**
1. ID selector: `#id`
2. Tag + classes: `tag.class1.class2`
3. Tag + data attributes: `tag[data-attr="value"]`
4. Path-based selector: `parent > child > element` (max 5 depth)

**Filters:**
- Excludes hover/active/focus classes
- Limits data attributes to first 2
- Uses CSS.escape() for safety

---

### `getElementCoordinates(el): Object|null`

Gets element coordinates relative to viewport.

**Parameters:**
- `el` (Element): DOM element

**Returns:** Object|null - Coordinates
```javascript
{
  x: number,
  y: number,
  width: number,
  height: number,
  centerX: number,
  centerY: number
}
```

---

## Config Generation with Selections (v2.2/v2.3)

### `hasV23ValidatedFields(): boolean`

Checks if any field has a v2.3 user-validated method.

**Returns:** boolean

**Logic:**
- Checks for `userValidatedMethod` property
- Checks for `source === 'v2.3-validated'`

---

### `confirmAndGenerateWithSelections(): void`

Generates config with manual selections. Auto-detects v2.3 workflow.

**Behavior:**
1. Validates field count
2. Checks if v2.3 validated fields exist
3. Routes to appropriate backend:
   - v2.3: `__configGen_generateV23Config()` if validated fields
   - v2.2: `__configGen_confirmWithSelections()` otherwise
   - v2.0: `__configGen_confirmAndGenerate()` as fallback
4. Logs extensively
5. Handles promise resolution/rejection

---

### `callV22Backend(): void`

Calls v2.2 backend for config generation.

**Behavior:**
- Calls `__configGen_confirmWithSelections()`
- Falls back to `__configGen_confirmAndGenerate()` if unavailable
- Handles promise resolution/rejection

---

## Handle Card Detection Override (v2.2)

### `window.handleCardDetectionResult(result): void` (Override)

Overrides original handler to show preview panel instead of confirmation.

**Behavior:**
1. Validates result
2. Stores cards and preview data
3. Highlights cards
4. Builds preview panel (v2.2 style)
5. Shows preview panel

---

## Utility Functions

### `sleep(ms): Promise<void>`

Sleeps for specified milliseconds.

**Parameters:**
- `ms` (number): Milliseconds

---

### `truncate(str, maxLength): string`

Truncates string to specified length.

**Parameters:**
- `str` (string): String to truncate
- `maxLength` (number): Max length

**Returns:** string - Truncated string with '...' if needed

---

### `escapeHtml(str): string`

Escapes HTML to prevent XSS.

**Parameters:**
- `str` (string): String to escape

**Returns:** string - Escaped HTML

**Method:** Uses `textContent` + `innerHTML` for safe escaping

---

### `formatFieldName(name): string`

Formats camelCase to Title Case.

**Parameters:**
- `name` (string): Field name

**Returns:** string - Formatted name

**Example:** `profileUrl` → `Profile Url`

---

### `formatMethodName(method): string`

Formats method name for display.

**Parameters:**
- `method` (string): Method name

**Returns:** string - Formatted name

**Example:** `coordinate-text` → `Coordinate Text`

---

### `extractFieldsFromSelections(): Object`

Extracts field information from manual selections for preview.

**Returns:** Object - Fields object
```javascript
{
  fieldName: {
    value: string,
    found: boolean,
    method: string,
    methodLabel: string,
    confidence: number
  }
}
```

---

## Toast Notifications

### `showToast(message, type = 'info'): void`

Shows toast notification.

**Parameters:**
- `message` (string): Toast message
- `type` (string): Toast type ('info', 'success', 'warning', 'error')

**Duration:** 3 seconds

---

## Backend Communication

### `window.OverlayController`

Exposed controller for backend communication.

#### `handleBackendMessage(command, data): void`

Handles message from backend.

**Parameters:**
- `command` (string): Command name
- `data` (Object): Command data

**Commands:**
- `initialize` - Backend initialized
- `showProgress` - Show progress panel
- `showError` - Show error toast

---

#### `clearHighlights(): void`

Clears all highlights.

---

#### `highlightElements(selector, type): void`

Legacy support - not used in v2.0+.

---

#### `highlightFieldsInCards(cardSelector, fieldSelector, type): void`

Legacy support - not used in v2.0+.

---

### Debug State

```javascript
window.__configGenState = state;
```

Exposes state for debugging in browser console.

---

# Backend-Frontend Communication

## Communication Flow

```
Backend (Node.js)           Frontend (Browser)
─────────────────           ──────────────────

page.exposeFunction()   →   window.__configGen_*()

page.evaluate()         →   window.handle*()

                        ←   await __configGen_*()
```

## Exposed Backend Functions

All backend functions are prefixed with `__configGen_` and exposed via `page.exposeFunction()`.

### Handshake & Monitoring

```javascript
__configGen_initialize() → {ready: true, timestamp, version}
__configGen_ping() → {alive: true, timestamp}
```

### Core Workflow

```javascript
__configGen_setMode(mode) → {success: true}
__configGen_autoDetect(type) → {success, selector, cardCount, message}
__configGen_handleRectangleSelection(box) → {success, matches, previewData}
__configGen_detectPagination(cardSelector) → {success, type, pattern}
__configGen_confirmAndGenerate() → {success, configPath, validation}
__configGen_save(selections) → {success, configPath}
__configGen_close() → {success}
```

### v2.2 Functions

```javascript
__configGen_confirmWithSelections(selections) → {success, configPath, fields}
__configGen_handleFieldRectangle(data) → {success, value, selector}
```

### v2.3 Functions

```javascript
__configGen_testFieldExtraction(data) → {success, results, failedMethods}
__configGen_confirmFieldExtraction(data) → {success, stored}
__configGen_generateV23Config(selections) → {success, configPath, fields}
__configGen_finalSaveAndClose() → {success, configPath}
```

### Validation

```javascript
__configGen_validateData() → {success, data: {contactsTested, ...}}
```

### Diagnosis & Scraping

```javascript
__configGen_diagnosePagination() → {success, type, confidence}
__configGen_startScraping(config) → {success, totalContacts, outputPath}
```

---

## Frontend Callbacks

All callbacks are exposed as `window.handle*()` and called by backend via `page.evaluate()`.

### Core Callbacks

```javascript
window.handleCardDetectionResult(result)
window.handleConfigComplete(result)
window.handlePaginationResult(result)
window.handleSaveResult(result)
```

### v2.2 Callbacks

```javascript
window.handleFieldRectangleResult(result)
```

### v2.3 Callbacks

```javascript
window.handleExtractionResults(result)
```

### Validation Callbacks

```javascript
// No specific callback - uses modal display
```

### Diagnosis & Scraping Callbacks

```javascript
window.handleDiagnosisComplete(results)
window.handleScrapingProgress(progress)
window.handleScrapingComplete(results)
```

### Backend Message Handler

```javascript
window.OverlayController.handleBackendMessage(command, data)
```

---

# State Machine

## State Transitions

```
IDLE
  └─> startSelection() → RECTANGLE_SELECTION
        └─> processSelection() → PROCESSING
              └─> handleCardDetectionResult() → PREVIEW
                    ├─> acceptAutoDetection() → GENERATING
                    │     └─> handleConfigComplete() → CONFIG_PREVIEW
                    │           └─> saveAndCloseConfig() → COMPLETE
                    │
                    └─> startManualSelection() → MANUAL_SELECTION
                          └─> showFieldPrompt() → FIELD_RECTANGLE_SELECTION
                                └─> processFieldRectangle() → EXTRACTION_RESULTS
                                      ├─> confirmExtractionResult() → FIELD_RECTANGLE_SELECTION
                                      ├─> retryFieldExtraction() → FIELD_RECTANGLE_SELECTION
                                      └─> skipFieldFromResults() → FIELD_RECTANGLE_SELECTION

                                └─> finishManualSelection() → GENERATING
                                      └─> handleConfigComplete() → CONFIG_PREVIEW
                                            ├─> startDiagnosis() → DIAGNOSIS
                                            │     └─> handleDiagnosisComplete()
                                            │           └─> startScraping() → SCRAPING
                                            │                 └─> handleScrapingComplete() → COMPLETE
                                            │
                                            └─> saveAndCloseConfig() → COMPLETE
```

## State Descriptions

| State | Description | Panel | User Actions |
|-------|-------------|-------|--------------|
| IDLE | Initial state | instruction | Click "Start Selection" |
| RECTANGLE_SELECTION | Drawing card rectangle | instruction | Draw rectangle |
| PROCESSING | Processing selection | progress | Wait |
| PREVIEW | Auto-detection preview | preview | Accept / Manual Selection |
| MANUAL_SELECTION | Manual field selection | manual | Select fields |
| FIELD_RECTANGLE_SELECTION | Drawing field rectangle | manual | Draw around field |
| EXTRACTION_RESULTS | Viewing extraction results | extractionResults | Select result / Retry / Skip |
| LINK_DISAMBIGUATION | Choosing profile link | modal | Select link |
| GENERATING | Generating config | progress | Wait |
| CONFIG_PREVIEW | Reviewing config | configPreview | Save / Edit / Validate / Scrape |
| DIAGNOSIS | Diagnosing pagination | diagnosis | View results / Start scraping |
| SCRAPING | Scraping in progress | progress | Wait |
| COMPLETE | Session complete | complete | Close |

---

# Workflow Diagrams

## v2.3 Workflow (Full Pipeline)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CARD SELECTION (Rectangle-based)                        │
├─────────────────────────────────────────────────────────────┤
│ User draws rectangle around a card                          │
│ Backend finds similar cards                                 │
│ Frontend shows preview with auto-detected fields            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. FIELD SELECTION (Manual with extraction testing)        │
├─────────────────────────────────────────────────────────────┤
│ For each required field (name, email, profileUrl):          │
│   1. Enable selector                                        │
│   2. Draw rectangle around field                            │
│   3. Backend tests ALL extraction methods                   │
│   4. Frontend shows top 5 results                           │
│   5. User validates best result                             │
│   6. Store user-validated method                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. CONFIG GENERATION (v2.3 format)                         │
├─────────────────────────────────────────────────────────────┤
│ Backend creates v2.3 config with:                           │
│   - Card selector                                           │
│   - User-validated extraction methods per field             │
│   - Relative coordinates                                    │
│   - Confidence scores                                       │
│ Frontend shows config preview                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. VALIDATION (Optional)                                    │
├─────────────────────────────────────────────────────────────┤
│ Tests config on 5 contacts:                                 │
│   - Scrapes using appropriate scraper                       │
│   - Enriches from profile pages                             │
│   - Compares scraped vs enriched                            │
│   - Generates recommendation                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. PAGINATION DIAGNOSIS                                     │
├─────────────────────────────────────────────────────────────┤
│ Analyzes page for pagination type:                          │
│   - Checks for pagination controls                          │
│   - Tests scroll behavior                                   │
│   - Detects: infinite-scroll / pagination / single-page     │
│ User can override auto-detection                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. SCRAPING (Full or Limited)                              │
├─────────────────────────────────────────────────────────────┤
│ Uses appropriate scraper based on pagination:               │
│   - Infinite Scroll → InfiniteScrollScraper (Selenium)      │
│   - Pagination → PaginationScraper (Puppeteer)              │
│   - Single Page → SinglePageScraper (Puppeteer)             │
│ Scrapes all contacts or user-specified limit                │
│ Saves to output/domain-timestamp.json                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. COMPLETION                                               │
├─────────────────────────────────────────────────────────────┤
│ User clicks "Save & Close"                                  │
│ Backend finalizes and closes browsers                       │
│ Session resolves with config path and scraping results      │
└─────────────────────────────────────────────────────────────┘
```

## v2.3 Extraction Testing Flow

```
User draws rectangle around field
          │
          ▼
Frontend sends ABSOLUTE box coordinates to backend
          │
          ▼
Backend calculates RELATIVE coordinates (field position in card)
          │
          ▼
Backend tests ALL extraction methods:
  - coordinate-text (primary)
  - selector-text
  - ocr (if enabled)
  - attribute-based
  - regex patterns
  - etc.
          │
          ▼
Backend ranks results by confidence
          │
          ▼
Backend sends TOP 5 results to frontend
          │
          ▼
Frontend displays results with:
  - Extracted value
  - Method label
  - Confidence %
  - Recommended badge (first high-confidence)
          │
          ▼
User selects best result
          │
          ▼
Frontend stores:
  - User-validated method
  - Coordinates
  - Confidence
  - Metadata
          │
          ▼
Config generation uses validated method for field
```

---

## Key Design Decisions

### 1. Session Resolution Strategy

**Problem:** When should the session resolve and browser close?

**Solution:** Session does NOT resolve when config is generated. It resolves only when:
- User clicks "Save & Close" in preview panel
- User cancels session
- Error occurs

**Rationale:**
- Allows validation after config generation
- Allows pagination diagnosis
- Allows scraping before closing
- Provides better UX with preview

### 2. Coordinate System

**Problem:** How to store coordinates that work across cards?

**Solution:**
- Frontend sends ABSOLUTE viewport coordinates
- Backend calculates RELATIVE coordinates (to card origin)
- Config stores RELATIVE coordinates
- Scrapers use RELATIVE coordinates + card position

**Rationale:**
- Cards may be at different positions
- Relative coordinates are portable
- Works for infinite scroll, pagination, etc.

### 3. v2.3 Workflow Integration

**Problem:** How to integrate multi-method testing without breaking v2.2?

**Solution:**
- Frontend routes DIRECTLY to v2.3 when available
- v2.2 backend becomes fallback only
- Detects v2.3 validated fields automatically
- Uses appropriate config generator

**Rationale:**
- v2.3 is superior (user validation)
- Backward compatibility maintained
- Graceful degradation if v2.3 unavailable

### 4. Selector Toggle Pattern

**Problem:** Drawing rectangles prevents scrolling.

**Solution:**
- Selector starts DISABLED
- User must click "Selector ON" to enable
- User can toggle off to scroll/navigate
- Clear visual feedback (green vs gray)

**Rationale:**
- Prevents accidental rectangle draws
- Allows page navigation during field selection
- Explicit user intent required

### 5. Extraction Method Priority

**Problem:** Which extraction method to try first?

**Solution:**
- Backend tests ALL applicable methods
- Ranks by confidence
- User validates best result
- Stores user's choice in config

**Rationale:**
- No assumptions about best method
- User has final say
- Config is highly reliable
- Foolproof universal scraper approach

---

## Error Handling Patterns

### Frontend Error Handling

```javascript
try {
  await __configGen_someFunction(data);
  // Success handled by callback
} catch (error) {
  console.error('[Error]', error);
  showToast('Operation failed: ' + error.message, 'error');
  // Return to safe state
  showPanel('previousPanel');
}
```

### Backend Error Handling

```javascript
try {
  const result = await someOperation();
  await this.page.evaluate((res) => {
    if (window.handleSomeResult) {
      window.handleSomeResult(res);
    }
  }, result);
  return result;
} catch (error) {
  this.logger.error('Operation failed:', error);
  await this.page.evaluate((err) => {
    if (window.handleSomeResult) {
      window.handleSomeResult({ success: false, error: err });
    }
  }, error.message);
  return { success: false, error: error.message };
}
```

---

## Performance Considerations

### 1. Lazy Loading

- Extraction tester initialized only when needed
- Selenium manager created only for infinite scroll
- Modules loaded on demand

### 2. Memory Management

- Cleanup functions for extraction tester
- Cleanup functions for Selenium manager
- Process signal handlers for graceful shutdown

### 3. Network Efficiency

- CSP bypass eliminates network requests for overlay
- Inline CSS/JS injection
- Single navigation for entire workflow

### 4. User Experience

- Progress indicators for long operations
- Immediate visual feedback
- Non-blocking UI updates
- Responsive canvas resizing

---

## Testing Workflow

### Manual Testing Checklist

1. **Card Selection**
   - [ ] Draw rectangle around card
   - [ ] Verify similar cards highlighted
   - [ ] Check confidence scores

2. **Field Selection**
   - [ ] Enable selector
   - [ ] Draw around each required field
   - [ ] Verify extraction results displayed
   - [ ] Select best result for each field

3. **Config Generation**
   - [ ] Verify config preview shows all fields
   - [ ] Check confidence scores
   - [ ] Verify method labels

4. **Validation**
   - [ ] Click "Validate Data"
   - [ ] Wait for 5 contacts to be tested
   - [ ] Review scraped vs enriched comparison

5. **Pagination Diagnosis**
   - [ ] Verify correct type detected
   - [ ] Test manual override

6. **Scraping**
   - [ ] Start scraping with limit
   - [ ] Monitor progress
   - [ ] Verify output file created

7. **Completion**
   - [ ] Click "Save & Close"
   - [ ] Verify browser closes
   - [ ] Verify config file saved

---

## Common Issues & Solutions

### Issue: Backend function not available

**Symptoms:**
```
TypeError: __configGen_* is not a function
```

**Solution:**
1. Check backend initialization with `__configGen_initialize()`
2. Wait for `backendReady` flag
3. Verify function exposed in `exposeBackendFunctions()`

### Issue: Extraction results not showing

**Symptoms:**
- Feedback shows "Testing..." but never completes
- No results panel displayed

**Solution:**
1. Check console for errors in `handleExtractionResults`
2. Verify backend returned results array
3. Check if extraction tester initialized

### Issue: Config preview not showing

**Symptoms:**
- Progress panel shows "Generating..." but hangs
- No preview panel displayed

**Solution:**
1. Check console for errors in `handleConfigComplete`
2. Verify backend sent config data
3. Check if `generatedConfigData` stored

### Issue: Selector toggle not working

**Symptoms:**
- Button clicks but selector doesn't enable
- Canvas not showing

**Solution:**
1. Check if `selectorEnabled` flag updated
2. Verify event listeners added
3. Check canvas visibility classes

### Issue: Browser doesn't close after "Save & Close"

**Symptoms:**
- Complete panel shows but browser stays open
- Session doesn't resolve

**Solution:**
1. Verify `__configGen_finalSaveAndClose` called
2. Check if `resolveSession` exists
3. Look for errors in backend cleanup

---

## Future Enhancements

### Planned v2.4 Features

1. **Field Editing**
   - Edit captured fields after selection
   - Retest extraction methods
   - Compare method performance

2. **Batch Testing**
   - Test config on multiple pages
   - Aggregate statistics
   - Identify edge cases

3. **Export Options**
   - Export to different formats
   - Template customization
   - Bulk config generation

4. **Advanced Diagnosis**
   - JavaScript-based pagination detection
   - AJAX request monitoring
   - Dynamic content analysis

5. **Collaborative Features**
   - Share configs
   - Config marketplace
   - Community ratings

---

This documentation provides complete API coverage for both backend session management and frontend overlay UI, enabling developers to understand and extend the config generator system.

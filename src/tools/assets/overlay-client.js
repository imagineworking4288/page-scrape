/**
 * Visual Card Scraper - Overlay Client Script v2.3
 *
 * This script runs in the browser context and handles:
 * - Rectangle selection for card detection
 * - Card highlighting
 * - Preview data display
 * - Communication with Node.js backend
 * - v2.2: Manual field selection with click mode
 * - v2.2: Profile link disambiguation modal
 * - v2.3: Multi-method extraction testing with user validation
 */

(function() {
  'use strict';

  // ===========================
  // CONSTANTS (v2.3)
  // ===========================

  const FIELD_ORDER = ['name', 'email', 'phone', 'profileUrl', 'title', 'location'];
  const REQUIRED_FIELDS = ['name', 'email', 'profileUrl'];
  const OPTIONAL_FIELDS = ['phone', 'title', 'location'];

  const FIELD_METADATA = {
    name: {
      id: 'name',
      label: 'Name',
      prompt: "Click on a person's NAME in the card",
      validationHint: 'Should contain 2-4 words, no email addresses or phone numbers',
      example: 'John Smith, Jane Doe, Dr. Robert Johnson',
      required: true
    },
    email: {
      id: 'email',
      label: 'Email',
      prompt: "Click on the person's EMAIL address",
      validationHint: 'Must be a valid email format',
      example: 'john.smith@example.com, contact@company.org',
      required: true
    },
    phone: {
      id: 'phone',
      label: 'Phone',
      prompt: "Click on the person's PHONE number",
      validationHint: 'Should be a valid phone number format',
      example: '(555) 123-4567, +1 555 123 4567',
      required: false
    },
    profileUrl: {
      id: 'profileUrl',
      label: 'Profile URL',
      prompt: "Click on a LINK that goes to this person's profile page",
      validationHint: 'Should be a link to their detailed profile page',
      example: '/lawyers/john-smith, /team/jane-doe',
      required: true
    },
    title: {
      id: 'title',
      label: 'Title',
      prompt: "Click on the person's JOB TITLE",
      validationHint: 'Should be a professional title or role',
      example: 'Partner, Senior Associate, Managing Director',
      required: false
    },
    location: {
      id: 'location',
      label: 'Location',
      prompt: "Click on the person's LOCATION or office",
      validationHint: 'Should be a city, state, or office location',
      example: 'New York, NY, San Francisco Office',
      required: false
    }
  };

  // State machine states
  const STATES = {
    IDLE: 'IDLE',
    RECTANGLE_SELECTION: 'RECTANGLE_SELECTION',
    PROCESSING: 'PROCESSING',
    PREVIEW: 'PREVIEW',
    MANUAL_SELECTION: 'MANUAL_SELECTION',
    FIELD_RECTANGLE_SELECTION: 'FIELD_RECTANGLE_SELECTION',  // v2.2: Rectangle selection for fields
    EXTRACTION_RESULTS: 'EXTRACTION_RESULTS',  // v2.3: Showing extraction method results
    LINK_DISAMBIGUATION: 'LINK_DISAMBIGUATION',
    GENERATING: 'GENERATING',
    CONFIG_PREVIEW: 'CONFIG_PREVIEW',  // v2.3: Preview generated config before saving
    DIAGNOSIS: 'DIAGNOSIS',  // Pagination diagnosis state
    SCRAPING: 'SCRAPING',    // Scraping in progress state
    COMPLETE: 'COMPLETE'
  };

  // ===========================
  // STATE MANAGEMENT
  // ===========================

  const state = {
    // Core state
    currentState: STATES.IDLE,
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    selectionBox: null,
    detectedCards: [],
    previewData: null,
    backendReady: false,

    // v2.2: Manual selection state
    manualSelections: {},          // { fieldName: { selector, value, element, coordinates } }
    currentFieldIndex: 0,          // Index in FIELD_ORDER
    currentField: null,            // Current field being captured
    pendingFieldCapture: null,     // Data from field rectangle selection
    autoDetectedFields: {},        // Fields auto-detected by v2.1

    // v2.2: Field rectangle selection state
    isDrawingField: false,         // Currently drawing field rectangle
    fieldStartX: 0,                // Field rectangle start X
    fieldStartY: 0,                // Field rectangle start Y
    fieldCurrentX: 0,              // Field rectangle current X
    fieldCurrentY: 0,              // Field rectangle current Y
    selectorEnabled: false,        // v2.2: Toggle for enabling/disabling drawing mode

    // v2.2: Link disambiguation state
    pendingLinks: [],              // Links found when clicking for profileUrl
    selectedLinkIndex: -1,         // Index of selected link in modal
    personName: null,              // Name for matching profile links

    // v2.3: Extraction results state
    extractionResults: [],         // Array of extraction method results
    failedMethods: [],             // Methods that failed
    selectedResultIndex: -1,       // User's selected extraction result
    currentFieldCoords: null,      // Current field coordinates being tested
    lastFieldAbsoluteBox: null,    // Last field's absolute viewport coordinates (for v2.3 extraction testing)

    // v2.3: Field validation progress tracking
    fieldProgress: {               // Track which fields have been validated
      name: false,
      email: false,
      phone: false,
      title: false,
      location: false,
      profileUrl: false
    },
    v23RequiredFields: ['name', 'email', 'profileUrl'],  // Required for config generation
    v23OptionalFields: ['phone', 'title', 'location'],   // Optional fields

    // v2.3: Config preview state
    generatedConfigData: null,  // Stores config data for preview before final save

    // Diagnosis state
    diagnosisResults: null,       // Pagination diagnosis results
    manualPaginationType: null,   // User override for pagination type
    scrapingInProgress: false,    // Flag for scraping in progress
    contactLimit: 0               // User-specified contact limit (0 = no limit)
  };

  // DOM Elements
  let canvas, ctx, selectionPreview, dimensionsLabel;
  let cardHighlightsContainer;

  // ===========================
  // INITIALIZATION
  // ===========================

  /**
   * Initialize the overlay
   */
  async function init() {
    console.log('[ConfigGen v2.2] Initializing overlay...');

    // Get DOM elements
    canvas = document.getElementById('selectionCanvas');
    selectionPreview = document.getElementById('selectionPreview');
    dimensionsLabel = document.getElementById('selectionDimensions');
    cardHighlightsContainer = document.getElementById('cardHighlights');

    // Setup canvas
    if (canvas) {
      ctx = canvas.getContext('2d');
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);
    }

    // Wait for backend
    const initialized = await waitForBackend();
    if (!initialized) {
      showToast('Failed to connect to backend', 'error');
      return;
    }

    console.log('[ConfigGen v2.2] Overlay initialized successfully');
  }

  /**
   * Wait for backend functions to be exposed
   */
  async function waitForBackend() {
    const maxAttempts = 50;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        if (typeof __configGen_initialize === 'function') {
          const result = await __configGen_initialize();
          if (result && result.ready) {
            state.backendReady = true;
            return true;
          }
        }
      } catch (err) {
        // Continue waiting
      }

      attempts++;
      await sleep(100);
    }

    console.error('[ConfigGen v2.2] Backend initialization timeout');
    return false;
  }

  /**
   * Resize canvas to match window
   */
  function resizeCanvas() {
    if (canvas) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
  }

  // ===========================
  // PANEL MANAGEMENT
  // ===========================

  /**
   * Show a specific panel
   */
  function showPanel(panelId) {
    const panels = [
      'instructionPanel',
      'confirmationPanel',
      'progressPanel',
      'completePanel',
      'previewPanel',         // v2.2
      'manualPanel',          // v2.2
      'extractionResultsPanel', // v2.3
      'configPreviewPanel',   // v2.3: Config preview before save
      'diagnosisPanel'        // Diagnosis panel for pagination detection
    ];
    panels.forEach(id => {
      const panel = document.getElementById(id);
      if (panel) {
        panel.classList.toggle('active', id === panelId);
      }
    });
  }

  /**
   * Toggle panel minimize
   */
  window.toggleMinimize = function() {
    const panel = document.getElementById('controlPanel');
    if (panel) {
      panel.classList.toggle('minimized');
      const btn = panel.querySelector('.minimize-btn');
      if (btn) {
        btn.textContent = panel.classList.contains('minimized') ? '+' : '−';
      }
    }
  };

  /**
   * Show progress panel with message
   */
  function showProgress(title, message) {
    document.getElementById('progressTitle').textContent = title;
    document.getElementById('progressMessage').textContent = message;
    showPanel('progressPanel');
  }

  // ===========================
  // SELECTION DRAWING
  // ===========================

  /**
   * Start selection mode
   */
  window.startSelection = function() {
    console.log('[ConfigGen v2.2] Starting selection mode');

    // Show canvas
    canvas.classList.remove('hidden');

    // Setup event listeners
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);

    // Update subtitle
    document.getElementById('panelSubtitle').textContent = 'Draw a rectangle around a card';
  };

  /**
   * Handle mouse down - start drawing
   */
  function handleMouseDown(e) {
    // Ignore if clicking on panel
    const panel = document.getElementById('controlPanel');
    if (panel && panel.contains(e.target)) return;

    state.isDrawing = true;
    state.startX = e.clientX;
    state.startY = e.clientY;
    state.currentX = e.clientX;
    state.currentY = e.clientY;

    // Show preview
    selectionPreview.style.display = 'block';
    updateSelectionPreview();
  }

  /**
   * Handle mouse move - update rectangle
   */
  function handleMouseMove(e) {
    if (!state.isDrawing) return;

    state.currentX = e.clientX;
    state.currentY = e.clientY;
    updateSelectionPreview();
  }

  /**
   * Handle mouse up - finalize selection
   */
  function handleMouseUp(e) {
    if (!state.isDrawing) return;

    state.isDrawing = false;
    state.currentX = e.clientX;
    state.currentY = e.clientY;

    // Calculate selection box
    const box = getSelectionBox();

    // Validate minimum size
    if (box.width < 50 || box.height < 50) {
      showToast('Selection too small. Please draw a larger rectangle.', 'warning');
      hideSelectionPreview();
      return;
    }

    // Store selection
    state.selectionBox = box;

    // Hide canvas and preview
    canvas.classList.add('hidden');
    hideSelectionPreview();

    // Remove event listeners
    canvas.removeEventListener('mousedown', handleMouseDown);
    canvas.removeEventListener('mousemove', handleMouseMove);
    canvas.removeEventListener('mouseup', handleMouseUp);

    // Process selection
    processSelection(box);
  }

  /**
   * Update selection preview rectangle
   */
  function updateSelectionPreview() {
    const box = getSelectionBox();

    selectionPreview.style.left = box.x + 'px';
    selectionPreview.style.top = box.y + 'px';
    selectionPreview.style.width = box.width + 'px';
    selectionPreview.style.height = box.height + 'px';

    dimensionsLabel.textContent = `${Math.round(box.width)} x ${Math.round(box.height)}`;
  }

  /**
   * Get normalized selection box (handles any drag direction)
   */
  function getSelectionBox() {
    const x = Math.min(state.startX, state.currentX);
    const y = Math.min(state.startY, state.currentY);
    const width = Math.abs(state.currentX - state.startX);
    const height = Math.abs(state.currentY - state.startY);

    return { x, y, width, height };
  }

  /**
   * Hide selection preview
   */
  function hideSelectionPreview() {
    selectionPreview.style.display = 'none';
  }

  // ===========================
  // SELECTION PROCESSING
  // ===========================

  /**
   * Process the selection and find similar cards
   */
  async function processSelection(box) {
    showProgress('Finding Similar Cards', 'Analyzing page structure...');

    try {
      // Send selection to backend
      if (typeof __configGen_handleRectangleSelection === 'function') {
        await __configGen_handleRectangleSelection(box);
      } else {
        throw new Error('Backend function not available');
      }
    } catch (error) {
      console.error('[ConfigGen v2.2] Selection processing error:', error);
      showToast('Failed to process selection: ' + error.message, 'error');
      showPanel('instructionPanel');
    }
  }

  /**
   * Handle card detection result from backend
   * Called by backend via page.evaluate
   */
  window.handleCardDetectionResult = function(result) {
    console.log('[ConfigGen v2.2] Card detection result:', result);

    if (!result.success) {
      showToast(result.error || 'No cards found', 'error');
      showPanel('instructionPanel');
      return;
    }

    // Store data
    state.detectedCards = result.matches || [];
    state.previewData = result.previewData || {};

    // Update stats
    document.getElementById('cardCountStat').textContent = state.detectedCards.length;

    const avgConfidence = state.detectedCards.length > 0
      ? Math.round(state.detectedCards.reduce((sum, c) => sum + c.confidence, 0) / state.detectedCards.length)
      : 0;
    document.getElementById('avgConfidenceStat').textContent = avgConfidence + '%';

    // Build preview table
    buildPreviewTable(state.previewData);

    // Highlight detected cards
    highlightCards(state.detectedCards);

    // Show confirmation panel
    showPanel('confirmationPanel');
    document.getElementById('panelSubtitle').textContent = `${state.detectedCards.length} cards detected`;
  };

  /**
   * Build preview table from extracted data
   */
  function buildPreviewTable(data) {
    const tbody = document.getElementById('previewTableBody');
    tbody.innerHTML = '';

    // Standard fields
    const fields = [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'title', label: 'Title' },
      { key: 'location', label: 'Location' },
      { key: 'profileUrl', label: 'Profile URL' }
    ];

    fields.forEach(field => {
      const value = data[field.key];
      const row = document.createElement('tr');

      const nameCell = document.createElement('td');
      nameCell.className = 'field-name';
      nameCell.textContent = field.label;

      const valueCell = document.createElement('td');
      valueCell.className = 'field-value' + (value ? '' : ' empty');
      valueCell.textContent = value || '(not found)';
      valueCell.title = value || '';

      row.appendChild(nameCell);
      row.appendChild(valueCell);
      tbody.appendChild(row);
    });

    // Social links
    if (data.socialLinks && data.socialLinks.length > 0) {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      nameCell.className = 'field-name';
      nameCell.textContent = 'Social';

      const valueCell = document.createElement('td');
      valueCell.className = 'field-value';
      valueCell.textContent = data.socialLinks.map(s => s.platform).join(', ');

      row.appendChild(nameCell);
      row.appendChild(valueCell);
      tbody.appendChild(row);
    }

    // Other fields
    if (data.otherFields && data.otherFields.length > 0) {
      data.otherFields.slice(0, 3).forEach((field, i) => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        nameCell.className = 'field-name';
        nameCell.textContent = `Other ${i + 1}`;

        const valueCell = document.createElement('td');
        valueCell.className = 'field-value';
        valueCell.textContent = truncate(field.value, 50);
        valueCell.title = field.value;

        row.appendChild(nameCell);
        row.appendChild(valueCell);
        tbody.appendChild(row);
      });
    }
  }

  // ===========================
  // CARD HIGHLIGHTING
  // ===========================

  /**
   * Highlight detected cards on the page
   */
  function highlightCards(cards) {
    clearHighlights();

    cards.forEach((card, index) => {
      const highlight = document.createElement('div');
      highlight.className = 'card-highlight';

      // Set confidence class
      if (card.confidence >= 75) {
        highlight.classList.add('high-confidence');
      } else if (card.confidence >= 50) {
        highlight.classList.add('medium-confidence');
      } else {
        highlight.classList.add('low-confidence');
      }

      // Position
      highlight.style.left = card.box.x + 'px';
      highlight.style.top = card.box.y + 'px';
      highlight.style.width = card.box.width + 'px';
      highlight.style.height = card.box.height + 'px';

      // Badge
      const badge = document.createElement('div');
      badge.className = 'confidence-badge';
      badge.textContent = `#${index + 1} - ${Math.round(card.confidence)}%`;
      highlight.appendChild(badge);

      cardHighlightsContainer.appendChild(highlight);
    });
  }

  /**
   * Clear all card highlights
   */
  function clearHighlights() {
    if (cardHighlightsContainer) {
      cardHighlightsContainer.innerHTML = '';
    }
  }

  // ===========================
  // USER ACTIONS
  // ===========================

  /**
   * Retry selection
   */
  window.retrySelection = function() {
    console.log('[ConfigGen v2.2] Retrying selection');

    // Clear state
    state.currentState = STATES.IDLE;
    state.selectionBox = null;
    state.detectedCards = [];
    state.previewData = null;
    state.manualSelections = {};
    state.currentFieldIndex = 0;
    state.currentField = null;
    state.autoDetectedFields = {};

    // Exit field rectangle selection if active
    exitFieldRectangleSelection();

    // Clear highlights
    clearHighlights();

    // Show instruction panel
    showPanel('instructionPanel');
    document.getElementById('panelSubtitle').textContent = 'Config Generator v2.2';
  };

  /**
   * Confirm selection and generate config
   */
  window.confirmAndGenerate = function() {
    console.log('[ConfigGen v2.2] Confirming and generating config');

    showProgress('Generating Config', 'Extracting field patterns...');

    // Call backend to generate config
    if (typeof __configGen_confirmAndGenerate === 'function') {
      __configGen_confirmAndGenerate();
    } else {
      showToast('Backend function not available', 'error');
      showPanel('confirmationPanel');
    }
  };

  /**
   * Handle config generation complete
   * Called by backend via page.evaluate
   * v2.3: Now shows preview panel instead of completing immediately
   */
  window.handleConfigComplete = function(result) {
    console.log('');
    console.log('========================================');
    console.log('[v2.3-UI] CONFIG GENERATION COMPLETE');
    console.log('========================================');
    console.log('[v2.3-UI] Timestamp:', new Date().toISOString());
    console.log('[v2.3-UI] Result received:', result);
    console.log('[v2.3-UI] Success status:', result?.success);
    console.log('[v2.3-UI] Config path:', result?.configPath);
    console.log('[v2.3-UI] Config name:', result?.configName);
    console.log('[v2.3-UI] Config version:', result?.configVersion);
    console.log('[v2.3-UI] Selection method:', result?.selectionMethod);
    console.log('[v2.3-UI] Validation:', result?.validation);
    console.log('========================================');
    console.log('');

    if (!result.success) {
      console.error('[v2.3-UI] Config generation FAILED');
      console.error('[v2.3-UI] Error:', result.error);
      showToast(result.error || 'Config generation failed', 'error');
      showPanel('manualPanel');
      return;
    }

    console.log('[v2.3-UI] Config generation SUCCEEDED!');
    console.log('[v2.3-UI] Showing config preview instead of completing...');

    // Store config data for preview and saving later
    state.generatedConfigData = {
      configPath: result.configPath,
      configName: result.configName,
      config: result.config,  // The actual config object
      validation: result.validation,
      score: result.validation?.score || 80,
      fields: result.fields || extractFieldsFromSelections()
    };

    console.log('[v2.3-UI] Stored config data:', state.generatedConfigData);

    // Build and show preview panel
    buildConfigPreviewPanel(state.generatedConfigData);
    state.currentState = STATES.CONFIG_PREVIEW;
    showPanel('configPreviewPanel');
    document.getElementById('panelSubtitle').textContent = 'Review Generated Config';

    console.log('[v2.3-UI] Config preview panel displayed');
  };

  /**
   * Extract field information from manual selections for preview
   * Used when backend doesn't provide field details
   */
  function extractFieldsFromSelections() {
    const fields = {};
    FIELD_ORDER.forEach(fieldName => {
      const selection = state.manualSelections[fieldName];
      if (selection) {
        fields[fieldName] = {
          value: selection.value,
          found: true,
          method: selection.userValidatedMethod || selection.method || 'manual',
          methodLabel: selection.methodLabel || formatMethodName(selection.userValidatedMethod),
          confidence: selection.confidence || 85
        };
      } else {
        fields[fieldName] = {
          value: null,
          found: false
        };
      }
    });
    return fields;
  }

  /**
   * Format method name for display (e.g., 'coordinate-text' -> 'Coordinate Text')
   */
  function formatMethodName(method) {
    if (!method) return 'Manual';
    return method
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Close panel and notify backend
   */
  window.closePanel = function() {
    console.log('[ConfigGen v2.2] Closing panel');

    if (typeof __configGen_close === 'function') {
      __configGen_close();
    }
  };

  // ===========================
  // TOAST NOTIFICATIONS
  // ===========================

  /**
   * Show toast notification
   */
  function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = 'toast ' + type;
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  // ===========================
  // UTILITY FUNCTIONS
  // ===========================

  /**
   * Sleep for specified milliseconds
   */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Truncate string to specified length
   */
  function truncate(str, maxLength) {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Format camelCase to Title Case
   */
  function formatFieldName(name) {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  // ===========================
  // BACKEND COMMUNICATION HELPERS
  // ===========================

  /**
   * Exposed controller for backend communication
   */
  window.OverlayController = {
    /**
     * Handle message from backend
     */
    handleBackendMessage(command, data) {
      console.log('[ConfigGen v2.2] Backend message:', command, data);

      switch (command) {
        case 'initialize':
          // Backend initialized
          break;
        case 'showProgress':
          showProgress(data.title, data.message);
          break;
        case 'showError':
          showToast(data.message, 'error');
          break;
        default:
          console.warn('[ConfigGen v2.2] Unknown command:', command);
      }
    },

    /**
     * Clear all highlights
     */
    clearHighlights() {
      clearHighlights();
    },

    /**
     * Highlight elements by selector
     */
    highlightElements(selector, type) {
      // Legacy support - not used in v2.0
    },

    /**
     * Highlight fields in cards
     */
    highlightFieldsInCards(cardSelector, fieldSelector, type) {
      // Legacy support - not used in v2.0
    }
  };

  // Expose state for debugging
  window.__configGenState = state;

  // ===========================
  // v2.2: PREVIEW PANEL FUNCTIONS
  // ===========================

  /**
   * Build the preview panel with auto-detected fields
   */
  function buildPreviewPanel(autoDetected) {
    state.autoDetectedFields = autoDetected || {};
    state.personName = autoDetected.name || null;

    const container = document.getElementById('detectionResults');
    container.innerHTML = '';

    let foundCount = 0;

    FIELD_ORDER.forEach(fieldName => {
      const meta = FIELD_METADATA[fieldName];
      const value = state.autoDetectedFields[fieldName];
      const found = !!value;
      if (found) foundCount++;

      const row = document.createElement('div');
      row.className = 'result-row';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'field-label';
      labelSpan.textContent = meta.label;
      if (meta.required) {
        labelSpan.innerHTML += ' <span style="color: #dc3545;">*</span>';
      }

      const valueSpan = document.createElement('span');
      valueSpan.className = 'field-value';
      valueSpan.textContent = found ? truncate(value, 30) : '(not detected)';
      valueSpan.style.color = found ? '#333' : '#999';

      const badge = document.createElement('span');
      badge.className = 'status-badge ' + (found ? 'found' : 'missing');
      badge.textContent = found ? 'Found' : 'Missing';

      row.appendChild(labelSpan);
      row.appendChild(valueSpan);
      row.appendChild(badge);
      container.appendChild(row);
    });

    // Update stats
    document.getElementById('previewCardCount').textContent = state.detectedCards.length;
    document.getElementById('previewFieldCount').textContent = `${foundCount}/${FIELD_ORDER.length}`;

    // Update tip based on required fields
    const missingRequired = REQUIRED_FIELDS.filter(f => !state.autoDetectedFields[f]);
    const tipEl = document.getElementById('previewTip');
    if (missingRequired.length > 0) {
      tipEl.textContent = `Missing required: ${missingRequired.map(f => FIELD_METADATA[f].label).join(', ')}. Manual selection recommended.`;
    } else {
      tipEl.textContent = 'All required fields detected. You can accept or manually refine.';
    }
  }

  /**
   * Accept auto-detection and proceed to config generation
   */
  window.acceptAutoDetection = function() {
    console.log('[ConfigGen v2.2] Accepting auto-detection');
    state.currentState = STATES.GENERATING;

    // Merge auto-detected fields as selections
    FIELD_ORDER.forEach(fieldName => {
      if (state.autoDetectedFields[fieldName]) {
        state.manualSelections[fieldName] = {
          value: state.autoDetectedFields[fieldName],
          source: 'auto',
          confidence: 0.8
        };
      }
    });

    // Proceed with config generation
    confirmAndGenerate();
  };

  /**
   * Start manual field selection workflow
   */
  window.startManualSelection = function() {
    console.log('[ConfigGen v2.2] Starting manual field selection');
    state.currentState = STATES.MANUAL_SELECTION;
    state.currentFieldIndex = 0;
    state.manualSelections = {};

    // Pre-populate with auto-detected values
    FIELD_ORDER.forEach(fieldName => {
      if (state.autoDetectedFields[fieldName]) {
        state.manualSelections[fieldName] = {
          value: state.autoDetectedFields[fieldName],
          source: 'auto',
          confidence: 0.8
        };
      }
    });

    showPanel('manualPanel');
    showFieldPrompt(0);
    document.getElementById('panelSubtitle').textContent = 'Manual Selection Mode';
  };

  // ===========================
  // v2.2: MANUAL SELECTION FUNCTIONS
  // ===========================

  /**
   * Show prompt for specific field
   */
  function showFieldPrompt(index) {
    if (index >= FIELD_ORDER.length) {
      // All fields processed
      exitFieldRectangleSelection();
      updateFinishButton();
      return;
    }

    state.currentFieldIndex = index;
    state.currentField = FIELD_ORDER[index];
    const meta = FIELD_METADATA[state.currentField];

    // Update step indicator
    document.getElementById('currentStepLabel').textContent = `Field ${index + 1} of ${FIELD_ORDER.length}`;
    const captured = Object.keys(state.manualSelections).length;
    document.getElementById('fieldsCompleteLabel').textContent = `${captured} captured`;

    // Update progress bar
    const progress = (index / FIELD_ORDER.length) * 100;
    document.getElementById('manualProgressBar').style.width = `${progress}%`;

    // Update prompt - changed to rectangle-based instructions
    document.getElementById('fieldPromptTitle').innerHTML = `Select ${meta.label.toUpperCase()}`;
    const badge = document.getElementById('fieldRequiredBadge');
    if (meta.required) {
      badge.className = 'required-badge';
      badge.textContent = 'Required';
      badge.style.display = 'inline-block';
    } else {
      badge.className = 'optional-badge';
      badge.textContent = 'Optional';
      badge.style.display = 'inline-block';
    }
    // Update prompt to rectangle-based with toggle hint
    document.getElementById('fieldPromptText').textContent = `Enable selector, then draw a rectangle around the ${meta.label.toUpperCase()}`;

    // Update hint and example
    document.getElementById('fieldHintText').textContent = meta.validationHint;
    document.getElementById('fieldExampleText').textContent = meta.example;

    // Reset feedback section
    resetFeedbackSection();
    document.getElementById('waitingFieldName').textContent = meta.label.toUpperCase();

    // Update skip button visibility
    const skipBtn = document.getElementById('skipFieldBtn');
    skipBtn.style.display = meta.required ? 'none' : 'block';
    skipBtn.textContent = `Skip ${meta.label}`;

    // Check if already captured
    if (state.manualSelections[state.currentField]) {
      showCapturedFeedback(state.manualSelections[state.currentField].value);
    }

    // Enter field rectangle selection mode
    enterFieldRectangleSelection();
    updateFinishButton();
  }

  /**
   * Reset feedback section to waiting state
   */
  function resetFeedbackSection() {
    const section = document.getElementById('feedbackSection');
    section.className = 'feedback-section';
    section.innerHTML = `
      <div class="waiting-indicator">
        <span class="pulse">●</span> Click <strong>Selector ON</strong> above, then draw around the <strong id="waitingFieldName">FIELD</strong>
      </div>
    `;
    document.getElementById('confirmFieldBtn').disabled = true;
  }

  /**
   * Show captured value feedback
   */
  function showCapturedFeedback(value) {
    const section = document.getElementById('feedbackSection');
    section.className = 'feedback-section success';
    section.innerHTML = `
      <div class="feedback-icon">✓</div>
      <div class="feedback-value">${escapeHtml(truncate(value, 60))}</div>
    `;
    document.getElementById('confirmFieldBtn').disabled = false;
  }

  /**
   * Show error feedback
   */
  function showErrorFeedback(message) {
    const section = document.getElementById('feedbackSection');
    section.className = 'feedback-section error';
    section.innerHTML = `
      <div class="feedback-icon">✗</div>
      <div class="feedback-error">${escapeHtml(message)}</div>
    `;
    document.getElementById('confirmFieldBtn').disabled = true;
  }

  /**
   * Skip current optional field
   */
  window.skipCurrentField = function() {
    const fieldName = state.currentField;
    console.log(`[ConfigGen v2.2] Skipping field: ${fieldName}`);

    // Remove any existing selection for this field
    delete state.manualSelections[fieldName];

    // Move to next field
    showFieldPrompt(state.currentFieldIndex + 1);
  };

  /**
   * Confirm current field and move to next
   */
  window.confirmCurrentField = function() {
    const fieldName = state.currentField;
    console.log(`[ConfigGen v2.2] Confirmed field: ${fieldName}`);

    // Field should already be in manualSelections from rectangle capture
    if (state.pendingFieldCapture) {
      state.manualSelections[fieldName] = state.pendingFieldCapture;
      state.pendingFieldCapture = null;
    }

    // Move to next field
    showFieldPrompt(state.currentFieldIndex + 1);
  };

  /**
   * Go back to preview panel
   */
  window.backToPreview = function() {
    console.log('[ConfigGen v2.2] Back to preview');
    exitFieldRectangleSelection();
    state.currentState = STATES.PREVIEW;
    showPanel('previewPanel');
    document.getElementById('panelSubtitle').textContent = `${state.detectedCards.length} cards detected`;
  };

  /**
   * Finish manual selection and generate config
   */
  window.finishManualSelection = function() {
    console.log('[v2.2-DEBUG] ========================================');
    console.log('[v2.2-DEBUG] FINISH SELECTION CLICKED');
    console.log('[v2.2-DEBUG] ========================================');
    console.log('[v2.2-DEBUG] state.manualSelections:', JSON.stringify(state.manualSelections, null, 2));
    console.log('[v2.2-DEBUG] Object.keys:', Object.keys(state.manualSelections || {}));
    console.log('[v2.2-DEBUG] Field count:', Object.keys(state.manualSelections || {}).length);
    console.log('[v2.2-DEBUG] state.detectedCards count:', state.detectedCards?.length);
    console.log('[v2.2-DEBUG] state.selectionBox:', state.selectionBox);
    console.log('[v2.2-DEBUG] state.previewData:', state.previewData);

    try {
      // ==========================================
      // TEMPORARY: Bypass required field validation for pipeline testing
      // ==========================================
      // const missingRequired = REQUIRED_FIELDS.filter(f => !state.manualSelections[f]);
      // if (missingRequired.length > 0) {
      //   const missingNames = missingRequired.map(f => FIELD_METADATA[f].label).join(', ');
      //   showToast(`Missing required fields: ${missingNames}`, 'error');
      //   console.log('[v2.2-DEBUG] Cannot finish - missing required fields:', missingRequired);
      //   return;
      // }
      // ==========================================

      const fieldCount = Object.keys(state.manualSelections || {}).length;
      console.log('[v2.2-VALIDATION-BYPASS] Required field validation disabled for testing');
      console.log('[v2.2-VALIDATION-BYPASS] Proceeding with', fieldCount, 'fields');

      if (fieldCount === 0) {
        showToast('Please capture at least one field', 'error');
        console.log('[v2.2-DEBUG] Cannot finish - no fields captured');
        return;
      }

      // Log what we're sending to backend
      console.log('[v2.2-DEBUG] Proceeding to config generation with', fieldCount, 'fields');
      Object.entries(state.manualSelections).forEach(([field, data]) => {
        console.log(`[v2.2-DEBUG] Field ${field}:`);
        console.log(`  - value: "${data.value?.substring(0, 50)}..."`);
        console.log(`  - selector: ${data.selector}`);
        console.log(`  - coordinates:`, data.coordinates);
        console.log(`  - source: ${data.source}`);
      });

      // Exit field rectangle selection mode
      exitFieldRectangleSelection();

      // Update state and show progress
      state.currentState = STATES.GENERATING;
      showProgress('Generating Config', 'Building config with manual selections...');

      // Call backend with complete selections
      console.log('[v2.2-DEBUG] About to call confirmAndGenerateWithSelections()...');
      confirmAndGenerateWithSelections();

    } catch (error) {
      console.error('[v2.2-DEBUG] ERROR in finishManualSelection:', error);
      console.error('[v2.2-DEBUG] Error stack:', error.stack);
      showToast('Error finishing selection: ' + error.message, 'error');
      showPanel('manualPanel');
    }
  };

  /**
   * Update finish button state
   */
  function updateFinishButton() {
    const btn = document.getElementById('finishManualBtn');

    // ==========================================
    // TEMPORARY: Bypass validation for pipeline testing
    // ==========================================
    // Enable "Finish Selection" if ANY field is captured
    // This allows testing config generation with partial data
    //
    // TODO: After confirming pipeline works, restore validation:
    // const hasAllRequired = REQUIRED_FIELDS.every(f => state.manualSelections[f]);
    // btn.disabled = !hasAllRequired;
    // ==========================================

    const hasSomeFields = Object.keys(state.manualSelections || {}).length > 0;
    btn.disabled = !hasSomeFields;

    console.log('[v2.2-VALIDATION-BYPASS] Finish button enabled:', !btn.disabled);
    console.log('[v2.2-VALIDATION-BYPASS] Fields captured:', Object.keys(state.manualSelections || {}).length);

    if (!hasSomeFields) {
      btn.title = 'Capture at least one field to generate config';
    } else {
      const missing = REQUIRED_FIELDS.filter(f => !state.manualSelections[f]);
      if (missing.length > 0) {
        btn.title = `Generate config (missing optional: ${missing.map(f => FIELD_METADATA[f].label).join(', ')})`;
      } else {
        btn.title = 'Generate config with all fields';
      }
    }
  }

  /**
   * Update field completion UI with checkmarks and progress
   * Called after each field capture to show visual feedback
   */
  function updateFieldCompletionUI() {
    const capturedCount = Object.keys(state.manualSelections).length;
    const totalFields = FIELD_ORDER.length;

    // Update progress counter
    const fieldsCompleteLabel = document.getElementById('fieldsCompleteLabel');
    if (fieldsCompleteLabel) {
      fieldsCompleteLabel.textContent = `${capturedCount} captured`;
    }

    // Update progress bar
    const progressBar = document.getElementById('manualProgressBar');
    if (progressBar) {
      const progress = (capturedCount / totalFields) * 100;
      progressBar.style.width = `${progress}%`;
    }

    // Update field status indicators in step indicator area
    updateFieldStatusIndicators();

    // Update finish button state
    updateFinishButton();

    console.log(`[v2.2] Field completion: ${capturedCount}/${totalFields} fields captured`);
  }

  /**
   * Update individual field status indicators
   */
  function updateFieldStatusIndicators() {
    // Create or update field status container
    let statusContainer = document.getElementById('fieldStatusContainer');

    if (!statusContainer) {
      // Create status container after step indicator
      const stepIndicator = document.querySelector('.manual-panel .step-indicator');
      if (stepIndicator) {
        statusContainer = document.createElement('div');
        statusContainer.id = 'fieldStatusContainer';
        statusContainer.className = 'field-status-container';
        stepIndicator.parentNode.insertBefore(statusContainer, stepIndicator.nextSibling);
      }
    }

    if (statusContainer) {
      // Build status indicators for each field
      let html = '<div class="field-status-row">';

      FIELD_ORDER.forEach(fieldName => {
        const meta = FIELD_METADATA[fieldName];
        const isCaptured = !!state.manualSelections[fieldName];
        const isRequired = REQUIRED_FIELDS.includes(fieldName);
        const isCurrent = fieldName === state.currentField;

        let statusClass = isCaptured ? 'captured' : (isRequired ? 'required' : 'optional');
        if (isCurrent) statusClass += ' current';

        const icon = isCaptured ? '✓' : (isRequired ? '○' : '·');
        const tooltip = isCaptured
          ? `${meta.label}: ${truncate(state.manualSelections[fieldName].value, 20)}`
          : `${meta.label}: ${isRequired ? 'Required' : 'Optional'}`;

        html += `<span class="field-status-item ${statusClass}" title="${escapeHtml(tooltip)}">${icon}</span>`;
      });

      html += '</div>';
      statusContainer.innerHTML = html;
    }
  }

  // ===========================
  // v2.3: CONFIG PREVIEW PANEL FUNCTIONS
  // ===========================

  /**
   * Build the config preview panel with generated config data
   * Shows all fields with their extraction status, values, methods, and confidence
   */
  function buildConfigPreviewPanel(configData) {
    console.log('[v2.3] Building config preview panel:', configData);

    const container = document.getElementById('configFieldsList');
    if (!container) {
      console.error('[v2.3] configFieldsList container not found');
      return;
    }

    container.innerHTML = '';

    let foundCount = 0;

    // Build field rows for each field in order
    FIELD_ORDER.forEach(fieldName => {
      const meta = FIELD_METADATA[fieldName];
      const fieldData = configData.fields[fieldName];
      const found = fieldData?.found || false;

      if (found) foundCount++;

      const row = document.createElement('div');
      row.className = 'config-field-row';

      // Field info column
      const infoDiv = document.createElement('div');
      infoDiv.className = 'field-info';

      const labelDiv = document.createElement('div');
      labelDiv.className = 'field-label';
      labelDiv.textContent = meta.label;
      if (meta.required) {
        labelDiv.innerHTML += ' <span style="color: #dc3545;">*</span>';
      }

      const valueDiv = document.createElement('div');
      valueDiv.className = 'field-value';
      valueDiv.textContent = found ? truncate(fieldData.value, 50) : '(not detected)';
      valueDiv.style.color = found ? '#333' : '#999';

      infoDiv.appendChild(labelDiv);
      infoDiv.appendChild(valueDiv);

      // Method info if available
      if (found && fieldData.method) {
        const methodDiv = document.createElement('div');
        methodDiv.className = 'field-method';
        methodDiv.textContent = `Method: ${fieldData.methodLabel || formatMethodName(fieldData.method)}`;
        infoDiv.appendChild(methodDiv);
      }

      // Badges column
      const badgesDiv = document.createElement('div');
      badgesDiv.className = 'field-badges';

      // Status badge
      const statusBadge = document.createElement('span');
      statusBadge.className = 'status-badge ' + (found ? 'found' : 'missing');
      statusBadge.textContent = found ? 'Found' : 'Missing';
      badgesDiv.appendChild(statusBadge);

      // Confidence badge if available
      if (found && fieldData.confidence) {
        const confidenceBadge = document.createElement('span');
        const conf = fieldData.confidence;
        const confClass = conf >= 90 ? 'high' : conf >= 70 ? 'medium' : 'low';
        confidenceBadge.className = `confidence-badge ${confClass}`;
        confidenceBadge.textContent = `${Math.round(conf)}%`;
        badgesDiv.appendChild(confidenceBadge);
      }

      row.appendChild(infoDiv);
      row.appendChild(badgesDiv);
      container.appendChild(row);
    });

    // Update stats
    const cardsCountEl = document.getElementById('configCardsCount');
    const fieldsCountEl = document.getElementById('configFieldsCount');
    const scoreValueEl = document.getElementById('configScoreValue');

    if (cardsCountEl) {
      cardsCountEl.textContent = state.detectedCards?.length || 0;
    }
    if (fieldsCountEl) {
      fieldsCountEl.textContent = `${foundCount}/${FIELD_ORDER.length}`;
    }
    if (scoreValueEl) {
      scoreValueEl.textContent = `${configData.score || 0}/100`;
    }

    // Show warnings if any
    const warningsSection = document.getElementById('configWarningsSection');
    const warningsText = document.getElementById('configWarningsText');

    if (warningsSection && warningsText) {
      if (configData.validation?.warnings && configData.validation.warnings.length > 0) {
        warningsSection.style.display = 'block';
        warningsText.textContent = configData.validation.warnings.join('. ');
      } else {
        // Check for missing required fields
        const missingRequired = REQUIRED_FIELDS.filter(f => !configData.fields[f]?.found);
        if (missingRequired.length > 0) {
          warningsSection.style.display = 'block';
          warningsText.textContent = `Missing required: ${missingRequired.map(f => FIELD_METADATA[f].label).join(', ')}. Config may not work reliably.`;
        } else {
          warningsSection.style.display = 'none';
        }
      }
    }

    console.log('[v2.3] Config preview built:', {
      totalFields: FIELD_ORDER.length,
      foundCount,
      score: configData.score
    });
  }

  /**
   * Save config and close (from preview panel)
   * Calls backend to finalize session and close browser
   */
  window.saveAndCloseConfig = async function() {
    console.log('[v2.3] User confirmed config save from preview');

    if (!state.generatedConfigData) {
      console.error('[v2.3] No config data to save');
      showToast('Config data not available', 'error');
      return;
    }

    // Show saving indicator
    const saveBtn = document.getElementById('saveConfigBtn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    // Call backend to finalize and close session
    try {
      if (typeof __configGen_finalSaveAndClose === 'function') {
        console.log('[v2.3] Calling backend finalSaveAndClose...');
        const result = await __configGen_finalSaveAndClose();

        if (result.success) {
          console.log('[v2.3] Session finalized successfully');
          console.log('[v2.3] Config saved to:', result.configPath);

          // Clear highlights
          clearHighlights();

          // Show success message briefly before browser closes
          showToast('Config saved successfully! Browser closing...', 'success');

          // Update complete panel (may not be visible if browser closes quickly)
          const completeCardCount = document.getElementById('completeCardCount');
          const completeConfigPath = document.getElementById('completeConfigPath');

          if (completeCardCount) {
            completeCardCount.textContent = `${state.detectedCards?.length || 0} cards detected`;
          }
          if (completeConfigPath) {
            completeConfigPath.textContent = state.generatedConfigData.configPath || 'configs/generated.json';
          }

          // Show complete panel
          state.currentState = STATES.COMPLETE;
          showPanel('completePanel');
          document.getElementById('panelSubtitle').textContent = 'Complete!';

          // Browser will close automatically via backend session resolution
        } else {
          console.error('[v2.3] Session finalization failed:', result.error);
          showToast('Error finalizing session: ' + result.error, 'error');

          // Re-enable save button on error
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save & Close';
          }
        }
      } else {
        console.error('[v2.3] __configGen_finalSaveAndClose not available');
        showToast('Backend function not available', 'error');

        // Re-enable save button
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save & Close';
        }
      }
    } catch (error) {
      console.error('[v2.3] Error calling finalSaveAndClose:', error);
      showToast('Error: ' + error.message, 'error');

      // Re-enable save button on error
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save & Close';
      }
    }
  };

  /**
   * Return to editing from config preview
   */
  window.backToEditConfig = function() {
    console.log('[v2.3] User wants to return to editing from preview');

    // Return to manual selection panel
    state.currentState = STATES.MANUAL_SELECTION;
    showPanel('manualPanel');
    document.getElementById('panelSubtitle').textContent = 'Manual Selection Mode';

    // Reset to current field or last field
    showFieldPrompt(state.currentFieldIndex);

    showToast('You can modify field selections and regenerate config', 'info');
  };

  // ===========================
  // DIAGNOSIS & SCRAPING FUNCTIONS
  // ===========================

  /**
   * Start pagination diagnosis
   * Called when user clicks "Start Scraping" from config preview
   */
  window.startDiagnosis = async function() {
    console.log('[Diagnosis] Starting pagination diagnosis...');

    // Update state
    state.currentState = STATES.DIAGNOSIS;
    state.diagnosisResults = null;
    state.manualPaginationType = null;

    // Show diagnosis panel with analyzing state
    showPanel('diagnosisPanel');
    document.getElementById('panelSubtitle').textContent = 'Analyzing Pagination...';

    // Update badge to analyzing state
    const badge = document.getElementById('diagnosisBadge');
    badge.className = 'diagnosis-badge analyzing';
    document.getElementById('diagnosisBadgeText').textContent = 'Analyzing...';

    // Hide details and options sections initially
    document.getElementById('diagnosisDetailsSection').style.display = 'none';
    document.getElementById('manualOverrideSection').style.display = 'none';
    document.getElementById('scrapingOptionsSection').style.display = 'none';

    try {
      // Call backend to perform diagnosis
      if (typeof __configGen_diagnosePagination === 'function') {
        console.log('[Diagnosis] Calling backend diagnosis function...');
        await __configGen_diagnosePagination();
        // Backend will call handleDiagnosisComplete when done
      } else {
        console.error('[Diagnosis] Backend function not available');
        showToast('Diagnosis function not available', 'error');
        showPanel('configPreviewPanel');
      }
    } catch (error) {
      console.error('[Diagnosis] Error:', error);
      showToast('Diagnosis failed: ' + error.message, 'error');
      showPanel('configPreviewPanel');
    }
  };

  /**
   * Handle diagnosis complete from backend
   * Called by backend via page.evaluate
   */
  window.handleDiagnosisComplete = function(results) {
    console.log('[Diagnosis] Results received:', results);

    if (!results.success) {
      showToast(results.error || 'Diagnosis failed', 'error');
      showPanel('configPreviewPanel');
      return;
    }

    // Store results
    state.diagnosisResults = results;

    // Update badge
    const badge = document.getElementById('diagnosisBadge');
    const badgeText = document.getElementById('diagnosisBadgeText');

    const typeClass = results.type.toLowerCase().replace(/_/g, '-');
    badge.className = 'diagnosis-badge ' + typeClass;
    badgeText.textContent = formatDiagnosisType(results.type);

    // Build and show details table
    buildDiagnosisDetails(results);
    document.getElementById('diagnosisDetailsSection').style.display = 'block';

    // Show manual override
    document.getElementById('manualOverrideSection').style.display = 'block';

    // Show scraping options
    document.getElementById('scrapingOptionsSection').style.display = 'block';

    // Update subtitle
    document.getElementById('panelSubtitle').textContent = 'Detected: ' + formatDiagnosisType(results.type);

    console.log('[Diagnosis] Panel updated with results');
  };

  /**
   * Format pagination type for display
   */
  function formatDiagnosisType(type) {
    const types = {
      'infinite-scroll': 'Infinite Scroll',
      'infinite_scroll': 'Infinite Scroll',
      'pagination': 'Traditional Pagination',
      'single-page': 'Single Page',
      'single_page': 'Single Page'
    };
    return types[type] || type;
  }

  /**
   * Build diagnosis details table based on pagination type
   */
  function buildDiagnosisDetails(results) {
    const table = document.getElementById('diagnosisDetailsTable');
    table.innerHTML = '';

    const rows = [];

    // Common rows
    rows.push({ label: 'Type', value: formatDiagnosisType(results.type) });
    rows.push({ label: 'Confidence', value: results.confidence || 'N/A' });

    // Type-specific rows
    if (results.type === 'infinite-scroll' || results.type === 'infinite_scroll') {
      rows.push({ label: 'Initial Cards', value: results.cardCounts?.initial || 0 });
      rows.push({ label: 'After Scroll', value: results.cardCounts?.afterScroll || 0 });
      rows.push({ label: 'Scrolls Performed', value: results.scrollsPerformed || 1 });
    } else if (results.type === 'pagination') {
      rows.push({ label: 'Total Pages', value: results.totalPages || '?' });
      if (results.sampleUrls && results.sampleUrls.length > 0) {
        rows.push({
          label: 'Sample URLs',
          value: results.sampleUrls.slice(0, 3).map(function(url) { return url.split('/').pop(); }).join(', ')
        });
      }
    } else if (results.type === 'single-page' || results.type === 'single_page') {
      rows.push({ label: 'Cards Found', value: results.cardCounts?.initial || 0 });
    }

    // Build table
    rows.forEach(function(row) {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      const td2 = document.createElement('td');

      td1.textContent = row.label;
      td2.textContent = row.value;

      tr.appendChild(td1);
      tr.appendChild(td2);
      table.appendChild(tr);
    });
  }

  /**
   * Start scraping with "all" mode
   */
  window.startScraping = async function(mode) {
    console.log('[Scraping] Starting scraping in ' + mode + ' mode...');

    // Get pagination type (manual override or detected)
    const manualOverride = document.getElementById('manualPaginationType').value;
    const paginationType = manualOverride || state.diagnosisResults?.type;

    if (!paginationType) {
      showToast('No pagination type available', 'error');
      return;
    }

    // Update state
    state.scrapingInProgress = true;
    state.currentState = STATES.SCRAPING;

    // Show progress
    showProgress('Scraping Contacts', 'Initializing scraper...');

    var scrapingConfig = {
      paginationType: paginationType,
      limit: 0,  // No limit for "all" mode
      diagnosisResults: state.diagnosisResults
    };

    try {
      if (typeof __configGen_startScraping === 'function') {
        console.log('[Scraping] Calling backend with config:', scrapingConfig);
        await __configGen_startScraping(scrapingConfig);
        // Backend will handle progress and completion
        // Session will resolve when scraping is complete
      } else {
        console.error('[Scraping] Backend function not available');
        showToast('Scraping function not available', 'error');
        state.scrapingInProgress = false;
        showPanel('diagnosisPanel');
      }
    } catch (error) {
      console.error('[Scraping] Error:', error);
      showToast('Scraping failed: ' + error.message, 'error');
      state.scrapingInProgress = false;
      showPanel('diagnosisPanel');
    }
  };

  /**
   * Start scraping with user-specified limit
   */
  window.startScrapingWithLimit = async function() {
    var limitInput = document.getElementById('contactLimitInput');
    var limit = parseInt(limitInput.value) || 0;

    if (limit <= 0) {
      showToast('Please enter a valid contact limit', 'warning');
      return;
    }

    console.log('[Scraping] Starting scraping with limit: ' + limit + '...');

    // Get pagination type
    var manualOverride = document.getElementById('manualPaginationType').value;
    var paginationType = manualOverride || state.diagnosisResults?.type;

    if (!paginationType) {
      showToast('No pagination type available', 'error');
      return;
    }

    // Update state
    state.scrapingInProgress = true;
    state.currentState = STATES.SCRAPING;
    state.contactLimit = limit;

    // Show progress
    showProgress('Scraping Contacts', 'Scraping first ' + limit + ' contacts...');

    var scrapingConfig = {
      paginationType: paginationType,
      limit: limit,
      diagnosisResults: state.diagnosisResults
    };

    try {
      if (typeof __configGen_startScraping === 'function') {
        console.log('[Scraping] Calling backend with config:', scrapingConfig);
        await __configGen_startScraping(scrapingConfig);
      } else {
        console.error('[Scraping] Backend function not available');
        showToast('Scraping function not available', 'error');
        state.scrapingInProgress = false;
        showPanel('diagnosisPanel');
      }
    } catch (error) {
      console.error('[Scraping] Error:', error);
      showToast('Scraping failed: ' + error.message, 'error');
      state.scrapingInProgress = false;
      showPanel('diagnosisPanel');
    }
  };

  /**
   * Return to config preview from diagnosis
   */
  window.backToConfigPreview = function() {
    console.log('[Diagnosis] Returning to config preview...');
    state.currentState = STATES.CONFIG_PREVIEW;
    state.diagnosisResults = null;
    state.manualPaginationType = null;
    showPanel('configPreviewPanel');
    document.getElementById('panelSubtitle').textContent = 'Review Generated Config';
  };

  /**
   * Handle scraping progress update from backend
   */
  window.handleScrapingProgress = function(progress) {
    console.log('[Scraping] Progress:', progress);

    var progressMessage = document.getElementById('progressMessage');
    if (progressMessage) {
      var message = 'Contacts: ' + (progress.contactCount || 0);
      if (progress.page) {
        message += ' | Page: ' + progress.page;
      }
      if (progress.scroll) {
        message += ' | Scroll: ' + progress.scroll;
      }
      progressMessage.textContent = message;
    }
  };

  /**
   * Handle scraping complete from backend
   */
  window.handleScrapingComplete = function(results) {
    console.log('[Scraping] Complete:', results);

    state.scrapingInProgress = false;

    if (results.success) {
      // Show complete panel
      state.currentState = STATES.COMPLETE;
      showPanel('completePanel');
      document.getElementById('panelSubtitle').textContent = 'Scraping Complete!';

      var completeCardCount = document.getElementById('completeCardCount');
      var completeConfigPath = document.getElementById('completeConfigPath');

      if (completeCardCount) {
        completeCardCount.textContent = (results.totalContacts || 0) + ' contacts extracted';
      }
      if (completeConfigPath && results.outputPath) {
        completeConfigPath.textContent = results.outputPath;
      }

      showToast('Scraping complete! ' + (results.totalContacts || 0) + ' contacts extracted', 'success');
    } else {
      showToast('Scraping failed: ' + (results.error || 'Unknown error'), 'error');
      showPanel('diagnosisPanel');
    }
  };

  // ===========================
  // v2.2: FIELD RECTANGLE SELECTION FUNCTIONS
  // ===========================

  /**
   * Enter field rectangle selection mode
   */
  function enterFieldRectangleSelection() {
    console.log('[ConfigGen v2.2] Entering field rectangle selection mode');
    state.currentState = STATES.FIELD_RECTANGLE_SELECTION;

    // Initialize toggle button (starts with selector disabled)
    // User must click toggle button to enable drawing
    initializeSelectorToggle();
  }

  /**
   * Exit field rectangle selection mode
   */
  function exitFieldRectangleSelection() {
    console.log('[ConfigGen v2.2] Exiting field rectangle selection mode');
    document.body.classList.remove('field-selection-mode');

    // Disable selector (removes event listeners and hides canvas)
    disableSelector();

    // Hide field selection preview
    hideFieldSelectionPreview();

    // Reset field drawing state
    state.isDrawingField = false;
  }

  // ===========================
  // v2.2: SELECTOR TOGGLE FUNCTIONS
  // ===========================

  /**
   * Initialize the selector toggle button
   * Call this after manualPanel is shown
   */
  function initializeSelectorToggle() {
    const toggleBtn = document.getElementById('selectorToggleBtn');
    if (toggleBtn) {
      toggleBtn.onclick = function() {
        if (state.selectorEnabled) {
          disableSelector();
        } else {
          enableSelector();
        }
      };
    }
    // Start with selector disabled
    disableSelector();
  }

  /**
   * Enable the selector - allow drawing rectangles
   */
  function enableSelector() {
    console.log('[ConfigGen v2.2] Enabling selector');
    state.selectorEnabled = true;

    // Show canvas for field selection
    canvas.classList.remove('hidden');
    document.body.classList.add('field-selection-mode');

    // Add field rectangle event listeners
    canvas.addEventListener('mousedown', handleFieldMouseDown);
    canvas.addEventListener('mousemove', handleFieldMouseMove);
    canvas.addEventListener('mouseup', handleFieldMouseUp);
    document.addEventListener('keydown', handleFieldKeyDown, true);

    // Update button visual
    updateSelectorToggleButton();
  }

  /**
   * Disable the selector - prevent drawing, allow scrolling
   */
  function disableSelector() {
    console.log('[ConfigGen v2.2] Disabling selector');
    state.selectorEnabled = false;

    // Hide canvas
    canvas.classList.add('hidden');
    document.body.classList.remove('field-selection-mode');

    // Remove event listeners
    canvas.removeEventListener('mousedown', handleFieldMouseDown);
    canvas.removeEventListener('mousemove', handleFieldMouseMove);
    canvas.removeEventListener('mouseup', handleFieldMouseUp);
    document.removeEventListener('keydown', handleFieldKeyDown, true);

    // Update button visual
    updateSelectorToggleButton();
  }

  /**
   * Update the selector toggle button appearance
   */
  function updateSelectorToggleButton() {
    const toggleBtn = document.getElementById('selectorToggleBtn');
    if (!toggleBtn) return;

    if (state.selectorEnabled) {
      toggleBtn.classList.add('active');
      toggleBtn.innerHTML = '<span class="toggle-icon">✓</span> Selector ON';
      toggleBtn.title = 'Click to disable drawing mode (allows scrolling)';
    } else {
      toggleBtn.classList.remove('active');
      toggleBtn.innerHTML = '<span class="toggle-icon">○</span> Selector OFF';
      toggleBtn.title = 'Click to enable drawing mode';
    }
  }

  /**
   * Expose toggleSelector for onclick handlers
   */
  window.toggleSelector = function() {
    if (state.selectorEnabled) {
      disableSelector();
    } else {
      enableSelector();
    }
  };

  /**
   * Handle mouse down for field rectangle
   */
  function handleFieldMouseDown(e) {
    // Ignore if clicking on panel or modal
    const panel = document.getElementById('controlPanel');
    const modal = document.getElementById('profileLinkModal');
    if ((panel && panel.contains(e.target)) ||
        (modal && modal.contains(e.target))) {
      return;
    }

    state.isDrawingField = true;
    state.fieldStartX = e.clientX;
    state.fieldStartY = e.clientY;
    state.fieldCurrentX = e.clientX;
    state.fieldCurrentY = e.clientY;

    // Show field selection preview
    showFieldSelectionPreview();
    updateFieldSelectionPreview();
  }

  /**
   * Handle mouse move for field rectangle
   */
  function handleFieldMouseMove(e) {
    if (!state.isDrawingField) return;

    state.fieldCurrentX = e.clientX;
    state.fieldCurrentY = e.clientY;
    updateFieldSelectionPreview();
  }

  /**
   * Handle mouse up for field rectangle - finalize selection
   */
  function handleFieldMouseUp(e) {
    if (!state.isDrawingField) return;

    state.isDrawingField = false;
    state.fieldCurrentX = e.clientX;
    state.fieldCurrentY = e.clientY;

    // Calculate field box
    const box = getFieldSelectionBox();

    // Validate minimum size
    if (box.width < 10 || box.height < 10) {
      showErrorFeedback('Selection too small. Please draw a larger rectangle.');
      hideFieldSelectionPreview();
      return;
    }

    // Hide preview but keep canvas active for re-selection
    hideFieldSelectionPreview();

    // Process field rectangle - send to backend
    processFieldRectangle(box);
  }

  /**
   * Handle keydown in field selection mode (Escape to cancel)
   */
  function handleFieldKeyDown(e) {
    if (e.key === 'Escape') {
      console.log('[ConfigGen v2.2] Escape pressed, canceling field selection');
      state.isDrawingField = false;
      hideFieldSelectionPreview();
      resetFeedbackSection();
    }
  }

  /**
   * Get normalized field selection box
   */
  function getFieldSelectionBox() {
    const x = Math.min(state.fieldStartX, state.fieldCurrentX);
    const y = Math.min(state.fieldStartY, state.fieldCurrentY);
    const width = Math.abs(state.fieldCurrentX - state.fieldStartX);
    const height = Math.abs(state.fieldCurrentY - state.fieldStartY);

    return { x, y, width, height };
  }

  /**
   * Show field selection preview rectangle
   */
  function showFieldSelectionPreview() {
    let preview = document.getElementById('fieldSelectionPreview');
    if (!preview) {
      preview = document.createElement('div');
      preview.id = 'fieldSelectionPreview';
      preview.className = 'field-selection-preview';
      document.body.appendChild(preview);
    }
    preview.style.display = 'block';
  }

  /**
   * Update field selection preview rectangle
   */
  function updateFieldSelectionPreview() {
    const preview = document.getElementById('fieldSelectionPreview');
    if (!preview) return;

    const box = getFieldSelectionBox();

    preview.style.left = box.x + 'px';
    preview.style.top = box.y + 'px';
    preview.style.width = box.width + 'px';
    preview.style.height = box.height + 'px';
  }

  /**
   * Hide field selection preview
   */
  function hideFieldSelectionPreview() {
    const preview = document.getElementById('fieldSelectionPreview');
    if (preview) {
      preview.style.display = 'none';
    }
  }

  /**
   * Process field rectangle - send DIRECTLY to v2.3 multi-method testing
   * IMPORTANT: This function bypasses v2.2 entirely and calls v2.3 directly
   */
  async function processFieldRectangle(box) {
    const fieldName = state.currentField;
    console.log('');
    console.log('========================================');
    console.log(`[v2.3 Routing] Processing field: ${fieldName.toUpperCase()}`);
    console.log('========================================');
    console.log(`[v2.3] Box coordinates:`, box);

    // Store the absolute box for v2.3 extraction testing
    state.lastFieldAbsoluteBox = box;

    // Show progress feedback
    const section = document.getElementById('feedbackSection');
    if (section) {
      section.className = 'feedback-section';
      section.innerHTML = `
        <div class="waiting-indicator">
          <span class="pulse">●</span> Testing extraction methods for ${fieldName}...
        </div>
      `;
    }

    // Prepare test data - send ABSOLUTE box coordinates directly to v2.3
    const testData = {
      fieldName: fieldName,
      box: box,  // Absolute viewport coordinates
      cardSelector: state.previewData?.cardSelector || state.matchResult?.selector
    };

    console.log(`[v2.3 Routing] Field: ${fieldName} → Multi-method testing`);
    console.log('[v2.3] Test data:', JSON.stringify(testData, null, 2));

    try {
      // Call v2.3 backend directly - skip v2.2 entirely
      if (typeof __configGen_testFieldExtraction === 'function') {
        console.log('[v2.3] Calling __configGen_testFieldExtraction...');
        await __configGen_testFieldExtraction(testData);
        console.log('[v2.3] Backend call completed, waiting for handleExtractionResults callback');
        // Backend will call window.handleExtractionResults when done
      } else {
        console.error('[v2.3] CRITICAL: __configGen_testFieldExtraction NOT AVAILABLE');
        console.error('[v2.3] This is a v2.3 system - v2.2 fallback is NOT supported');
        showErrorFeedback('v2.3 backend function not available - check console for details');
      }
    } catch (error) {
      console.error('[v2.3] Extraction test failed:', error);
      console.error('[v2.3] Error stack:', error.stack);
      showErrorFeedback('Extraction testing failed: ' + error.message);
    }
  }

  /**
   * DEPRECATED: Handle field rectangle result from backend
   * This function is no longer used - processFieldRectangle now calls v2.3 directly
   * Kept for backwards compatibility but should never be called
   */
  window.handleFieldRectangleResult = function(result) {
    console.warn('[DEPRECATED] handleFieldRectangleResult called - this should not happen in v2.3');
    console.warn('[DEPRECATED] processFieldRectangle should call __configGen_testFieldExtraction directly');
    console.log('[DEPRECATED] Result received:', result);

    // If somehow called, still try to process via v2.3
    if (result.success && result.fieldName) {
      console.log('[DEPRECATED] Attempting v2.3 extraction as fallback...');
      triggerV23Extraction(result.fieldName, result);
    } else {
      showErrorFeedback(result.error || 'Could not extract field value');
    }
  };

  /**
   * v2.3: Trigger multi-method extraction testing for a field
   * This calls the backend to test all applicable extraction methods
   * @param {string} fieldName - Field to test (e.g., 'name')
   * @param {Object} rectangleResult - Result from handleFieldRectangle with coordinates
   */
  async function triggerV23Extraction(fieldName, rectangleResult) {
    console.log('');
    console.log('========================================');
    console.log(`[v2.3] TRIGGERING MULTI-METHOD EXTRACTION`);
    console.log('========================================');
    console.log(`[v2.3] Field: ${fieldName.toUpperCase()}`);
    console.log('[v2.3] Rectangle result:', JSON.stringify(rectangleResult, null, 2));

    // Show progress feedback while testing
    const section = document.getElementById('feedbackSection');
    if (section) {
      section.className = 'feedback-section';
      section.innerHTML = `
        <div class="waiting-indicator">
          <span class="pulse">●</span> Testing extraction methods...
        </div>
      `;
    }

    // Store relative coordinates for later use (these will be stored in config)
    state.currentFieldCoords = rectangleResult.coordinates;

    // Use the stored absolute box for backend testing (backend calculates relative internally)
    const absoluteBox = state.lastFieldAbsoluteBox;
    if (!absoluteBox) {
      console.error('[ConfigGen v2.3] No absolute box stored, falling back to v2.2');
      fallbackToV22(fieldName, rectangleResult);
      return;
    }

    // Prepare test data for backend - send ABSOLUTE box coordinates
    // The backend handleTestFieldExtraction expects absolute viewport coordinates
    // and will calculate relative coordinates using the card's bounding box
    const testData = {
      fieldName: fieldName,
      box: absoluteBox,  // Absolute viewport coordinates
      cardSelector: rectangleResult.cardSelector || state.previewData?.cardSelector,
      // Include the initial extraction for reference
      initialValue: rectangleResult.value,
      initialMethod: 'coordinate-text'
    };

    console.log('[ConfigGen v2.3] Test data with absolute box:', testData);

    try {
      // Call backend to test all extraction methods
      if (typeof __configGen_testFieldExtraction === 'function') {
        console.log('[v2.3] Backend function available: __configGen_testFieldExtraction');
        console.log('[v2.3] Calling backend with test data...');
        await __configGen_testFieldExtraction(testData);
        console.log('[v2.3] Backend call completed, waiting for handleExtractionResults callback');
        // Backend will call window.handleExtractionResults when done
      } else {
        console.error('[v2.3] ERROR: __configGen_testFieldExtraction NOT AVAILABLE');
        console.error('[v2.3] This should not happen - check backend function exposure');
        console.warn('[v2.3] Falling back to v2.2 workflow for', fieldName);
        // Fallback: use the v2.2 workflow
        fallbackToV22(fieldName, rectangleResult);
      }
    } catch (error) {
      console.error('[v2.3] ERROR: Extraction test failed:', error);
      console.error('[v2.3] Error stack:', error.stack);
      showErrorFeedback('Extraction testing failed: ' + error.message);
      // Fallback to v2.2 workflow on error
      console.warn('[v2.3] Falling back to v2.2 workflow for', fieldName);
      fallbackToV22(fieldName, rectangleResult);
    }
  }

  /**
   * v2.3: Fallback to v2.2 workflow when v2.3 backend is not available
   */
  function fallbackToV22(fieldName, rectangleResult) {
    console.log('');
    console.log('========================================');
    console.log(`[v2.2] FALLBACK - USING V2.2 WORKFLOW`);
    console.log('========================================');
    console.log(`[v2.2] Field: ${fieldName.toUpperCase()}`);
    console.log('[v2.2] This means v2.3 multi-method testing was not available or failed');
    console.log('[v2.2] The field will be saved without user-validated method selection');

    const captureData = {
      value: rectangleResult.value,
      selector: rectangleResult.selector,
      coordinates: rectangleResult.coordinates,
      element: rectangleResult.element,
      source: 'manual',
      confidence: 1.0
    };

    state.pendingFieldCapture = captureData;
    state.manualSelections[fieldName] = captureData;

    showCapturedFeedback(rectangleResult.value);
    updateFieldCompletionUI();
  }

  /**
   * Handle profile URL disambiguation when multiple links found
   */
  function handleProfileUrlDisambiguation(links) {
    // Classify links for display
    const classifiedLinks = links.map(link => ({
      ...link,
      classification: classifyLink(link.href, link.text, state.personName)
    }));

    // Show disambiguation modal
    showLinkDisambiguationModal(classifiedLinks);
  }

  /**
   * Select profile link and store capture (from disambiguation)
   */
  function selectProfileLink(link) {
    const value = link.href;
    const fieldName = 'profileUrl';

    const captureData = {
      value: value,
      selector: link.selector || generateSelector(link.element),
      coordinates: link.coordinates || getElementCoordinates(link.element),
      element: {
        tagName: 'a',
        className: link.element?.className || '',
        href: value,
        textContent: link.text
      },
      linkClassification: link.classification,
      source: 'manual',
      confidence: link.classification?.confidence || 0.8
    };

    // Store in both places for reliable access
    state.pendingFieldCapture = captureData;

    // CRITICAL: Store directly in manualSelections for persistence
    state.manualSelections[fieldName] = captureData;
    console.log('[v2.2] Stored profileUrl from disambiguation:', captureData.value);

    // Close modal if open
    hideModal();

    // Show success feedback
    showCapturedFeedback(truncate(value, 50));

    // Update field completion UI
    updateFieldCompletionUI();
  }

  /**
   * Classify a link
   */
  function classifyLink(href, text, personName) {
    const result = {
      type: 'unknown',
      confidence: 0.5,
      nameMatch: 'none'
    };

    if (!href) return result;

    const url = href.toLowerCase();

    // Check for profile patterns
    const profilePatterns = [
      /\/people\//,
      /\/person\//,
      /\/lawyers\//,
      /\/attorney/,
      /\/staff\//,
      /\/team\//,
      /\/bio\//,
      /\/profile\//,
      /\/about\//,
      /\/professionals\//
    ];

    if (profilePatterns.some(p => p.test(url))) {
      result.type = 'profile';
      result.confidence = 0.9;
    }

    // Check for name match
    if (personName) {
      const nameParts = personName.toLowerCase().split(/\s+/);
      const urlParts = url.split(/[\/\-_]/);

      let matchCount = 0;
      nameParts.forEach(part => {
        if (part.length > 2 && urlParts.some(up => up.includes(part))) {
          matchCount++;
        }
      });

      if (matchCount >= 2) {
        result.nameMatch = 'strong';
        result.confidence = Math.max(result.confidence, 0.95);
      } else if (matchCount >= 1) {
        result.nameMatch = 'partial';
        result.confidence = Math.max(result.confidence, 0.8);
      }
    }

    return result;
  }

  // ===========================
  // v2.2: LINK DISAMBIGUATION MODAL
  // ===========================

  /**
   * Show link disambiguation modal
   */
  function showLinkDisambiguationModal(links) {
    console.log('[ConfigGen v2.2] Showing link disambiguation modal', links);
    state.currentState = STATES.LINK_DISAMBIGUATION;
    state.pendingLinks = links;
    state.selectedLinkIndex = -1;

    const container = document.getElementById('linkOptionsContainer');
    container.innerHTML = '';

    links.forEach((link, index) => {
      const option = document.createElement('div');
      option.className = 'link-option';
      option.onclick = () => selectLinkOption(index);

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'linkOption';
      radio.id = `linkOption${index}`;

      const content = document.createElement('div');
      content.className = 'link-option-content';

      const textDiv = document.createElement('div');
      textDiv.className = 'link-text';
      textDiv.textContent = link.text || '(no text)';

      const hrefDiv = document.createElement('div');
      hrefDiv.className = 'link-href';
      hrefDiv.textContent = truncate(link.href, 60);

      const badges = document.createElement('div');
      badges.className = 'link-option-badges';

      if (link.classification.type === 'profile') {
        const badge = document.createElement('span');
        badge.className = 'link-type-badge profile';
        badge.textContent = 'Profile';
        badges.appendChild(badge);
      }

      if (link.classification.nameMatch !== 'none') {
        const badge = document.createElement('span');
        badge.className = 'link-type-badge name-match ' + link.classification.nameMatch;
        badge.textContent = link.classification.nameMatch === 'strong' ? 'Name Match' : 'Partial Match';
        badges.appendChild(badge);
      }

      if (link.isClicked) {
        const badge = document.createElement('span');
        badge.className = 'link-type-badge action';
        badge.textContent = 'Clicked';
        badges.appendChild(badge);
      }

      content.appendChild(textDiv);
      content.appendChild(hrefDiv);
      content.appendChild(badges);

      option.appendChild(radio);
      option.appendChild(content);
      container.appendChild(option);
    });

    // Show modal
    document.getElementById('profileLinkModal').classList.add('show');
    document.getElementById('confirmLinkBtn').disabled = true;
  }

  /**
   * Select link option in modal
   */
  function selectLinkOption(index) {
    state.selectedLinkIndex = index;

    // Update visual selection
    const options = document.querySelectorAll('.link-option');
    options.forEach((opt, i) => {
      opt.classList.toggle('selected', i === index);
      opt.querySelector('input[type="radio"]').checked = (i === index);
    });

    document.getElementById('confirmLinkBtn').disabled = false;
  }

  /**
   * Confirm link selection
   */
  window.confirmLinkSelection = function() {
    if (state.selectedLinkIndex < 0) return;

    const link = state.pendingLinks[state.selectedLinkIndex];
    selectProfileLink(link);

    // Return to field rectangle selection mode
    state.currentState = STATES.FIELD_RECTANGLE_SELECTION;
  };

  /**
   * Cancel link selection
   */
  window.cancelLinkSelection = function() {
    hideModal();
    state.currentState = STATES.FIELD_RECTANGLE_SELECTION;
    resetFeedbackSection();
  };

  /**
   * Hide modal
   */
  function hideModal() {
    document.getElementById('profileLinkModal').classList.remove('show');
    state.pendingLinks = [];
    state.selectedLinkIndex = -1;
  }

  // ===========================
  // v2.3: EXTRACTION RESULTS FUNCTIONS
  // ===========================

  /**
   * Handle extraction results from backend
   * Called by backend via page.evaluate after testing all extraction methods
   */
  window.handleExtractionResults = function(result) {
    console.log('[ConfigGen v2.3] Extraction results:', result);

    if (!result.success) {
      showErrorFeedback(result.error || 'Extraction testing failed');
      return;
    }

    const fieldName = result.fieldName;
    state.extractionResults = result.results || [];
    state.failedMethods = result.failedMethods || [];
    state.selectedResultIndex = -1;
    state.currentFieldCoords = result.coordinates;

    // Show extraction results panel
    buildExtractionResultsPanel(fieldName, result);
    state.currentState = STATES.EXTRACTION_RESULTS;
    showPanel('extractionResultsPanel');
  };

  /**
   * Build the extraction results panel showing top 5 methods
   */
  function buildExtractionResultsPanel(fieldName, result) {
    const meta = FIELD_METADATA[fieldName];

    // Update header
    const headerEl = document.getElementById('extractionResultsHeader');
    if (headerEl) {
      headerEl.innerHTML = `
        <h3>Select Best Result for ${meta.label.toUpperCase()}</h3>
        <p class="extraction-hint">${result.totalMethodsTested} methods tested, ${state.extractionResults.length} returned values</p>
      `;
    }

    // Build results list
    const container = document.getElementById('extractionResultsList');
    if (!container) {
      console.error('[v2.3] extractionResultsList container not found');
      return;
    }
    container.innerHTML = '';

    if (state.extractionResults.length === 0) {
      container.innerHTML = `
        <div class="no-results-message">
          <p>No extraction methods found valid data for this field.</p>
          <p>Try selecting a different area or skip this field.</p>
        </div>
      `;
      return;
    }

    state.extractionResults.forEach((r, index) => {
      const resultItem = document.createElement('div');
      resultItem.className = 'extraction-result-item';
      resultItem.dataset.index = index;
      resultItem.onclick = () => selectExtractionResult(index);

      // Confidence indicator
      const confidenceClass = r.confidence >= 90 ? 'high' :
                              r.confidence >= 70 ? 'medium' : 'low';

      resultItem.innerHTML = `
        <div class="result-radio">
          <input type="radio" name="extractionResult" id="result${index}" ${index === 0 && r.confidence >= 70 ? 'checked' : ''}>
        </div>
        <div class="result-content">
          <div class="result-value">${escapeHtml(truncate(r.value, 60))}</div>
          <div class="result-method">${escapeHtml(r.methodLabel || r.method)}</div>
        </div>
        <div class="result-confidence ${confidenceClass}">
          <span class="confidence-value">${r.confidence}%</span>
          ${index === 0 && r.confidence >= 70 ? '<span class="recommended-badge">Recommended</span>' : ''}
        </div>
      `;

      container.appendChild(resultItem);

      // Auto-select first high-confidence result
      if (index === 0 && r.confidence >= 70) {
        state.selectedResultIndex = 0;
        resultItem.classList.add('selected');
      }
    });

    // Show failed methods section if any
    buildFailedMethodsSection();

    // Update confirm button state
    updateExtractionConfirmButton();
  }

  /**
   * Build the failed methods collapsible section
   */
  function buildFailedMethodsSection() {
    const container = document.getElementById('failedMethodsSection');
    if (!container) return;

    if (state.failedMethods.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    container.innerHTML = `
      <details class="failed-methods-details">
        <summary>Failed Methods (${state.failedMethods.length})</summary>
        <ul class="failed-methods-list">
          ${state.failedMethods.map(f => `
            <li><span class="failed-method-name">${escapeHtml(f.method)}</span>: ${escapeHtml(f.reason)}</li>
          `).join('')}
        </ul>
      </details>
    `;
  }

  /**
   * Select an extraction result
   */
  function selectExtractionResult(index) {
    state.selectedResultIndex = index;

    // Update visual selection
    const items = document.querySelectorAll('.extraction-result-item');
    items.forEach((item, i) => {
      item.classList.toggle('selected', i === index);
      const radio = item.querySelector('input[type="radio"]');
      if (radio) radio.checked = (i === index);
    });

    updateExtractionConfirmButton();
  }

  /**
   * Update confirm button state
   */
  function updateExtractionConfirmButton() {
    const btn = document.getElementById('confirmExtractionBtn');
    if (btn) {
      btn.disabled = state.selectedResultIndex < 0;
    }
  }

  /**
   * Confirm selected extraction result
   */
  window.confirmExtractionResult = function() {
    if (state.selectedResultIndex < 0) {
      showToast('Please select an extraction method', 'warning');
      return;
    }

    const selectedResult = state.extractionResults[state.selectedResultIndex];
    const fieldName = state.currentField;

    console.log(`[ConfigGen v2.3] Confirmed extraction for ${fieldName}:`, selectedResult);

    // Store the validated selection
    const captureData = {
      value: selectedResult.value,
      userValidatedMethod: selectedResult.method,
      methodLabel: selectedResult.methodLabel,
      coordinates: state.currentFieldCoords,
      confidence: selectedResult.confidence,
      metadata: selectedResult.metadata,
      source: 'v2.3-validated'
    };

    state.pendingFieldCapture = captureData;
    state.manualSelections[fieldName] = captureData;

    // Mark field as validated in progress tracker
    state.fieldProgress[fieldName] = true;

    console.log('[v2.3] Stored validated field:', fieldName, captureData.value);
    console.log('[v2.3] Field progress:', state.fieldProgress);

    // Show success feedback
    showCapturedFeedback(selectedResult.value);

    // Update field completion UI and finish button state
    updateFieldCompletionUI();
    updateFinishButtonStateV23();

    // Return to field selection state
    state.currentState = STATES.FIELD_RECTANGLE_SELECTION;
    showPanel('manualPanel');

    // Disable selector after successful capture
    disableSelector();
  };

  /**
   * Update finish button state based on v2.3 field validation progress
   */
  function updateFinishButtonStateV23() {
    const finishBtn = document.getElementById('finishManualBtn');
    if (!finishBtn) return;

    // Check if all required fields are validated
    const requiredComplete = state.v23RequiredFields.every(field =>
      state.fieldProgress[field] === true
    );

    // Count completed fields
    const completedCount = Object.values(state.fieldProgress).filter(Boolean).length;
    const totalFields = Object.keys(state.fieldProgress).length;

    if (requiredComplete) {
      finishBtn.disabled = false;
      finishBtn.classList.add('ready');
      finishBtn.title = `Generate config (${completedCount}/${totalFields} fields validated)`;
    } else {
      finishBtn.disabled = true;
      finishBtn.classList.remove('ready');

      const missing = state.v23RequiredFields.filter(f => !state.fieldProgress[f]);
      const missingLabels = missing.map(f => FIELD_METADATA[f]?.label || f).join(', ');
      finishBtn.title = `Complete required fields: ${missingLabels}`;
    }

    console.log('[v2.3] Finish button state - required complete:', requiredComplete,
                'completed:', completedCount, '/', totalFields);
  }

  /**
   * Retry field selection (reselect area)
   */
  window.retryFieldExtraction = function() {
    console.log('[ConfigGen v2.3] Retrying field extraction');
    state.extractionResults = [];
    state.failedMethods = [];
    state.selectedResultIndex = -1;

    // Return to field selection
    state.currentState = STATES.FIELD_RECTANGLE_SELECTION;
    showPanel('manualPanel');
    resetFeedbackSection();
  };

  /**
   * Skip current field from extraction results view
   */
  window.skipFieldFromResults = function() {
    const fieldName = state.currentField;
    const meta = FIELD_METADATA[fieldName];

    if (meta.required) {
      showToast(`${meta.label} is required and cannot be skipped`, 'warning');
      return;
    }

    console.log(`[ConfigGen v2.3] Skipping field from results: ${fieldName}`);
    delete state.manualSelections[fieldName];

    // Move to next field
    state.currentState = STATES.FIELD_RECTANGLE_SELECTION;
    showPanel('manualPanel');
    showFieldPrompt(state.currentFieldIndex + 1);
  };

  // ===========================
  // v2.2: VALIDATION FUNCTIONS
  // ===========================

  /**
   * Validate field value
   */
  function validateFieldValue(fieldName, value) {
    if (!value || !value.trim()) {
      return { valid: false, message: 'No value extracted. Try clicking a different element.' };
    }

    value = value.trim();

    switch (fieldName) {
      case 'name':
        // Should be 2-4 words, not an email or phone
        if (/@/.test(value)) {
          return { valid: false, message: 'This looks like an email address, not a name.' };
        }
        if (/^\+?\d[\d\s\-()]{6,}$/.test(value)) {
          return { valid: false, message: 'This looks like a phone number, not a name.' };
        }
        const words = value.split(/\s+/).filter(w => w.length > 0);
        if (words.length < 1 || words.length > 6) {
          return { valid: false, message: 'Name should be 1-6 words.' };
        }
        break;

      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return { valid: false, message: 'Not a valid email format.' };
        }
        break;

      case 'phone':
        // Basic phone validation
        const digits = value.replace(/\D/g, '');
        if (digits.length < 7 || digits.length > 15) {
          return { valid: false, message: 'Phone number should have 7-15 digits.' };
        }
        break;

      case 'profileUrl':
        if (!value.startsWith('http') && !value.startsWith('/')) {
          return { valid: false, message: 'Not a valid URL.' };
        }
        break;
    }

    return { valid: true };
  }

  // ===========================
  // v2.2: SELECTOR GENERATION
  // ===========================

  /**
   * Generate a CSS selector for an element
   */
  function generateSelector(el) {
    if (!el) return null;

    const selectors = [];

    // Try ID first
    if (el.id) {
      selectors.push(`#${CSS.escape(el.id)}`);
    }

    // Try unique class combination
    if (el.classList && el.classList.length > 0) {
      const classes = Array.from(el.classList)
        .filter(c => !c.includes('hover') && !c.includes('active') && !c.includes('focus'))
        .map(c => `.${CSS.escape(c)}`)
        .join('');
      if (classes) {
        selectors.push(`${el.tagName.toLowerCase()}${classes}`);
      }
    }

    // Try data attributes
    const dataAttrs = Array.from(el.attributes)
      .filter(a => a.name.startsWith('data-') && a.value)
      .slice(0, 2);
    if (dataAttrs.length > 0) {
      const attrSelector = dataAttrs
        .map(a => `[${a.name}="${CSS.escape(a.value)}"]`)
        .join('');
      selectors.push(`${el.tagName.toLowerCase()}${attrSelector}`);
    }

    // Build path-based selector as fallback
    const path = [];
    let current = el;
    let depth = 0;
    while (current && current.tagName && depth < 5) {
      let seg = current.tagName.toLowerCase();
      if (current.classList && current.classList.length > 0) {
        seg += `.${CSS.escape(current.classList[0])}`;
      }
      path.unshift(seg);
      current = current.parentElement;
      depth++;
    }
    if (path.length > 0) {
      selectors.push(path.join(' > '));
    }

    return selectors[0] || el.tagName.toLowerCase();
  }

  /**
   * Get element coordinates relative to viewport
   */
  function getElementCoordinates(el) {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2
    };
  }

  // ===========================
  // v2.2/v2.3: CONFIG GENERATION WITH SELECTIONS
  // ===========================

  /**
   * Check if any field has a v2.3 user-validated method
   * @returns {boolean}
   */
  function hasV23ValidatedFields() {
    if (!state.manualSelections) return false;
    return Object.values(state.manualSelections).some(
      field => field.userValidatedMethod || field.source === 'v2.3-validated'
    );
  }

  /**
   * Generate config with manual selections
   * Automatically detects v2.3 workflow and uses appropriate backend method
   */
  function confirmAndGenerateWithSelections() {
    console.log('[v2.2/v2.3-DEBUG] ========================================');
    console.log('[v2.2/v2.3-DEBUG] CONFIRM AND GENERATE WITH SELECTIONS');
    console.log('[v2.2/v2.3-DEBUG] ========================================');
    console.log('[v2.2/v2.3-DEBUG] Manual selections to send:', JSON.stringify(state.manualSelections, null, 2));

    // Verify we have selections
    const fieldCount = Object.keys(state.manualSelections).length;
    console.log('[v2.2/v2.3-DEBUG] Field count:', fieldCount);

    if (fieldCount === 0) {
      console.error('[v2.2/v2.3-DEBUG] ERROR: No fields captured in manualSelections!');
      showToast('No fields captured. Please capture at least the required fields.', 'error');
      showPanel('manualPanel');
      return;
    }

    // Check if any field was validated through v2.3 workflow
    const useV23 = hasV23ValidatedFields();
    console.log('[v2.2/v2.3-DEBUG] Has v2.3 validated fields:', useV23);

    console.log(`[v2.2/v2.3-DEBUG] Sending ${fieldCount} fields to backend for config generation`);

    // Check backend function availability
    console.log('[v2.2/v2.3-DEBUG] __configGen_generateV23Config exists:', typeof __configGen_generateV23Config === 'function');
    console.log('[v2.2/v2.3-DEBUG] __configGen_confirmWithSelections exists:', typeof __configGen_confirmWithSelections === 'function');
    console.log('[v2.2/v2.3-DEBUG] __configGen_confirmAndGenerate exists:', typeof __configGen_confirmAndGenerate === 'function');

    // Use v2.3 backend if any field was validated through v2.3 workflow
    if (useV23 && typeof __configGen_generateV23Config === 'function') {
      console.log('[v2.3-DEBUG] Using v2.3 config generation with validated methods...');
      console.log('[v2.3-DEBUG] Selections being sent:', state.manualSelections);

      try {
        __configGen_generateV23Config(state.manualSelections)
          .then(result => {
            console.log('[v2.3-DEBUG] ========================================');
            console.log('[v2.3-DEBUG] V2.3 BACKEND PROMISE RESOLVED');
            console.log('[v2.3-DEBUG] ========================================');
            console.log('[v2.3-DEBUG] Backend returned:', result);
            console.log('[v2.3-DEBUG] Result success:', result?.success);
            console.log('[v2.3-DEBUG] Config path:', result?.configPath);
          })
          .catch(err => {
            console.error('[v2.3-DEBUG] ========================================');
            console.error('[v2.3-DEBUG] V2.3 BACKEND PROMISE REJECTED');
            console.error('[v2.3-DEBUG] ========================================');
            console.error('[v2.3-DEBUG] Backend error:', err);
            console.error('[v2.3-DEBUG] Error message:', err?.message);
            showToast('Config generation failed: ' + err.message, 'error');
            showPanel('manualPanel');
          });
        console.log('[v2.3-DEBUG] V2.3 backend function called, waiting for promise...');
      } catch (syncError) {
        console.error('[v2.3-DEBUG] Synchronous error calling v2.3 backend:', syncError);
        // Fallback to v2.2
        callV22Backend();
      }
    } else {
      // Use v2.2 backend (no v2.3 validated fields or v2.3 backend not available)
      callV22Backend();
    }
  }

  /**
   * Call v2.2 backend for config generation
   */
  function callV22Backend() {
    if (typeof __configGen_confirmWithSelections === 'function') {
      console.log('[v2.2-DEBUG] Calling __configGen_confirmWithSelections with selections...');
      console.log('[v2.2-DEBUG] Selections being sent:', state.manualSelections);

      try {
        __configGen_confirmWithSelections(state.manualSelections)
          .then(result => {
            console.log('[v2.2-DEBUG] ========================================');
            console.log('[v2.2-DEBUG] BACKEND PROMISE RESOLVED');
            console.log('[v2.2-DEBUG] ========================================');
            console.log('[v2.2-DEBUG] Backend returned:', result);
            console.log('[v2.2-DEBUG] Result success:', result?.success);
            console.log('[v2.2-DEBUG] Config path:', result?.configPath);
          })
          .catch(err => {
            console.error('[v2.2-DEBUG] ========================================');
            console.error('[v2.2-DEBUG] BACKEND PROMISE REJECTED');
            console.error('[v2.2-DEBUG] ========================================');
            console.error('[v2.2-DEBUG] Backend error:', err);
            console.error('[v2.2-DEBUG] Error message:', err?.message);
            console.error('[v2.2-DEBUG] Error stack:', err?.stack);
            showToast('Config generation failed: ' + err.message, 'error');
            showPanel('manualPanel');
          });
        console.log('[v2.2-DEBUG] Backend function called, waiting for promise...');
      } catch (syncError) {
        console.error('[v2.2-DEBUG] Synchronous error calling backend:', syncError);
        console.error('[v2.2-DEBUG] Sync error stack:', syncError.stack);
      }
    } else if (typeof __configGen_confirmAndGenerate === 'function') {
      // Fallback to v2.0 method
      console.log('[v2.2-DEBUG] WARNING: Using fallback v2.0 method (manual selections may not be saved)');
      __configGen_confirmAndGenerate();
    } else {
      console.error('[v2.2-DEBUG] ERROR: No backend function available');
      console.error('[v2.2-DEBUG] Available window functions:', Object.keys(window).filter(k => k.startsWith('__configGen')));
      showToast('Backend function not available', 'error');
      showPanel('manualPanel');
    }
  }

  // ===========================
  // v2.2: HANDLE CARD DETECTION (OVERRIDE)
  // ===========================

  // Override handleCardDetectionResult to show preview panel
  const originalHandleCardDetectionResult = window.handleCardDetectionResult;
  window.handleCardDetectionResult = function(result) {
    console.log('[ConfigGen v2.2] Card detection result:', result);

    if (!result.success) {
      showToast(result.error || 'No cards found', 'error');
      showPanel('instructionPanel');
      return;
    }

    // Store data
    state.detectedCards = result.matches || [];
    state.previewData = result.previewData || {};
    state.currentState = STATES.PREVIEW;

    // Highlight detected cards
    highlightCards(state.detectedCards);

    // Build preview panel (v2.2)
    buildPreviewPanel(result.previewData);

    // Show preview panel instead of confirmation panel
    showPanel('previewPanel');
    document.getElementById('panelSubtitle').textContent = `${state.detectedCards.length} cards detected`;
  };

  // ===========================
  // INITIALIZATION
  // ===========================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

/**
 * Visual Card Scraper - Overlay Client Script v2.2
 *
 * This script runs in the browser context and handles:
 * - Rectangle selection for card detection
 * - Card highlighting
 * - Preview data display
 * - Communication with Node.js backend
 * - v2.2: Manual field selection with click mode
 * - v2.2: Profile link disambiguation modal
 */

(function() {
  'use strict';

  // ===========================
  // CONSTANTS (v2.2)
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
    LINK_DISAMBIGUATION: 'LINK_DISAMBIGUATION',
    GENERATING: 'GENERATING',
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
    personName: null               // Name for matching profile links
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
      'previewPanel',    // v2.2
      'manualPanel'      // v2.2
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
   */
  window.handleConfigComplete = function(result) {
    console.log('[ConfigGen v2.2] Config complete:', result);

    if (!result.success) {
      showToast(result.error || 'Config generation failed', 'error');
      showPanel('confirmationPanel');
      return;
    }

    // Clear highlights
    clearHighlights();

    // Update complete panel
    document.getElementById('completeCardCount').textContent =
      `${state.detectedCards.length} cards detected`;
    document.getElementById('completeConfigPath').textContent =
      result.configPath || 'configs/generated.json';

    // Show complete panel
    showPanel('completePanel');
    document.getElementById('panelSubtitle').textContent = 'Complete!';
  };

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
    console.log('[ConfigGen v2.2] Finishing manual selection');
    exitFieldRectangleSelection();
    state.currentState = STATES.GENERATING;
    confirmAndGenerateWithSelections();
  };

  /**
   * Update finish button state
   */
  function updateFinishButton() {
    const btn = document.getElementById('finishManualBtn');
    const hasAllRequired = REQUIRED_FIELDS.every(f => state.manualSelections[f]);
    btn.disabled = !hasAllRequired;

    if (!hasAllRequired) {
      const missing = REQUIRED_FIELDS.filter(f => !state.manualSelections[f]);
      btn.title = `Missing required: ${missing.map(f => FIELD_METADATA[f].label).join(', ')}`;
    } else {
      btn.title = 'Generate config with selected fields';
    }
  }

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
   * Process field rectangle - send to backend for extraction
   */
  async function processFieldRectangle(box) {
    const fieldName = state.currentField;
    console.log(`[ConfigGen v2.2] Processing field rectangle for ${fieldName}:`, box);

    try {
      // Send to backend for extraction
      if (typeof __configGen_handleFieldRectangle === 'function') {
        await __configGen_handleFieldRectangle({
          fieldName: fieldName,
          box: box
        });
      } else {
        throw new Error('Backend function not available');
      }
    } catch (error) {
      console.error('[ConfigGen v2.2] Field rectangle processing error:', error);
      showErrorFeedback('Failed to process selection: ' + error.message);
    }
  }

  /**
   * Handle field rectangle result from backend
   * Called by backend via page.evaluate
   */
  window.handleFieldRectangleResult = function(result) {
    console.log('[ConfigGen v2.2] Field rectangle result:', result);

    if (!result.success) {
      showErrorFeedback(result.error || 'Could not extract field value');
      return;
    }

    const fieldName = result.fieldName;

    // Special handling for profileUrl - may need disambiguation
    if (fieldName === 'profileUrl' && result.links && result.links.length > 1) {
      // Multiple links found - show disambiguation
      handleProfileUrlDisambiguation(result.links);
      return;
    }

    // Store the capture
    state.pendingFieldCapture = {
      value: result.value,
      selector: result.selector,
      coordinates: result.coordinates,
      element: result.element,
      source: 'manual',
      confidence: 1.0
    };

    // Show success feedback
    showCapturedFeedback(result.value);
  };

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

    state.pendingFieldCapture = {
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

    // Close modal if open
    hideModal();

    showCapturedFeedback(truncate(value, 50));
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
  // v2.2: CONFIG GENERATION WITH SELECTIONS
  // ===========================

  /**
   * Generate config with manual selections
   */
  function confirmAndGenerateWithSelections() {
    console.log('[ConfigGen v2.2] Generating config with selections:', state.manualSelections);

    showProgress('Generating Config', 'Building config with selected fields...');

    // Call backend with selections
    if (typeof __configGen_confirmWithSelections === 'function') {
      __configGen_confirmWithSelections(state.manualSelections);
    } else if (typeof __configGen_confirmAndGenerate === 'function') {
      // Fallback to v2.0 method
      __configGen_confirmAndGenerate();
    } else {
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

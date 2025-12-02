/**
 * Visual Card Scraper - Overlay Client Script v2.0
 *
 * This script runs in the browser context and handles:
 * - Rectangle selection for card detection
 * - Card highlighting
 * - Preview data display
 * - Communication with Node.js backend
 */

(function() {
  'use strict';

  // ===========================
  // STATE MANAGEMENT
  // ===========================

  const state = {
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    selectionBox: null,
    detectedCards: [],
    previewData: null,
    backendReady: false
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
    console.log('[ConfigGen v2.0] Initializing overlay...');

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

    console.log('[ConfigGen v2.0] Overlay initialized successfully');
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

    console.error('[ConfigGen v2.0] Backend initialization timeout');
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
    const panels = ['instructionPanel', 'confirmationPanel', 'progressPanel', 'completePanel'];
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
    console.log('[ConfigGen v2.0] Starting selection mode');

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
      console.error('[ConfigGen v2.0] Selection processing error:', error);
      showToast('Failed to process selection: ' + error.message, 'error');
      showPanel('instructionPanel');
    }
  }

  /**
   * Handle card detection result from backend
   * Called by backend via page.evaluate
   */
  window.handleCardDetectionResult = function(result) {
    console.log('[ConfigGen v2.0] Card detection result:', result);

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
    console.log('[ConfigGen v2.0] Retrying selection');

    // Clear state
    state.selectionBox = null;
    state.detectedCards = [];
    state.previewData = null;

    // Clear highlights
    clearHighlights();

    // Show instruction panel
    showPanel('instructionPanel');
    document.getElementById('panelSubtitle').textContent = 'Config Generator v2.0';
  };

  /**
   * Confirm selection and generate config
   */
  window.confirmAndGenerate = function() {
    console.log('[ConfigGen v2.0] Confirming and generating config');

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
    console.log('[ConfigGen v2.0] Config complete:', result);

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
    console.log('[ConfigGen v2.0] Closing panel');

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
      console.log('[ConfigGen v2.0] Backend message:', command, data);

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
          console.warn('[ConfigGen v2.0] Unknown command:', command);
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
  // INITIALIZATION
  // ===========================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

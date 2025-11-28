/**
 * Overlay Client Script
 *
 * This script runs in the browser context and communicates with the
 * Node.js backend via exposed functions.
 */

(function() {
  'use strict';

  // State
  const state = {
    currentStep: 'ready',
    currentField: null,
    selections: {
      cardSelector: null,
      nameSelector: null,
      emailSelector: null,
      phoneSelector: null,
      paginationType: 'none',
      infiniteScroll: null
    },
    cardCount: 0,
    isListening: false,
    hoveredElement: null,
    backendReady: false
  };

  // Field sequence for selection
  const fieldSequence = ['name', 'email', 'phone'];
  let currentFieldIndex = 0;

  // DOM elements
  let highlightBox;

  // Heartbeat monitoring
  let heartbeatInterval;
  let lastPingSuccess = Date.now();

  /**
   * Wait for backend initialization
   * @returns {Promise<boolean>}
   */
  async function waitForInitialization() {
    const maxAttempts = 50; // 5 seconds total (50 * 100ms)
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        if (typeof __configGen_initialize === 'function') {
          const result = await __configGen_initialize();
          if (result && result.ready) {
            console.log('[ConfigGen] Backend initialized successfully');
            state.backendReady = true;
            return true;
          }
        }
      } catch (err) {
        // Function not ready yet, continue waiting
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Failed to initialize
    console.error('[ConfigGen] Failed to connect to backend after 5 seconds');
    showError('Failed to connect to backend. Please refresh and try again.');
    return false;
  }

  /**
   * Start heartbeat monitoring
   */
  function startHeartbeat() {
    heartbeatInterval = setInterval(async () => {
      try {
        if (typeof __configGen_ping === 'function') {
          const result = await __configGen_ping();
          if (result && result.alive) {
            lastPingSuccess = Date.now();
          }
        }
      } catch (err) {
        // Check if we've been disconnected for >10 seconds
        if (Date.now() - lastPingSuccess > 10000) {
          showError('Connection lost. Please restart the config generator.');
          clearInterval(heartbeatInterval);
        }
      }
    }, 5000); // Ping every 5 seconds
  }

  /**
   * Show error message in overlay
   */
  function showError(message) {
    const phaseEl = document.getElementById('currentPhase');
    if (phaseEl) {
      phaseEl.textContent = 'Error: ' + message;
      phaseEl.style.color = '#ff6b6b';
    }
    console.error('[ConfigGen] ' + message);
  }

  /**
   * Initialize the overlay
   */
  async function init() {
    highlightBox = document.getElementById('highlightBox');
    updatePhase('Connecting to backend...');

    // Wait for backend initialization
    const initialized = await waitForInitialization();
    if (!initialized) {
      return;
    }

    // Start heartbeat monitoring
    startHeartbeat();

    updatePhase('Ready to start');
  }

  /**
   * Toggle panel minimize
   */
  window.toggleMinimize = function() {
    const panel = document.getElementById('controlPanel');
    panel.classList.toggle('minimized');
    const btn = panel.querySelector('.minimize-btn');
    btn.textContent = panel.classList.contains('minimized') ? '+' : '−';
  };

  /**
   * Show a specific step
   */
  function showStep(stepId) {
    document.querySelectorAll('.step').forEach(step => {
      step.classList.remove('active');
    });
    const step = document.getElementById(`step-${stepId}`);
    if (step) {
      step.classList.add('active');
    }
    state.currentStep = stepId;
  }

  /**
   * Update the phase display
   */
  function updatePhase(text) {
    const phaseEl = document.getElementById('currentPhase');
    if (phaseEl) {
      phaseEl.textContent = text;
    }
  }

  /**
   * Start selection process
   */
  window.startSelection = function() {
    showStep('card');
    updatePhase('Step 1: Select contact card');
    startElementSelection('card');
  };

  /**
   * Start listening for element clicks
   */
  function startElementSelection(type) {
    state.isListening = true;
    state.currentField = type;

    // Notify backend
    if (window.__configGen_setMode) {
      window.__configGen_setMode(type);
    }

    // Add hover effect listener
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
  }

  /**
   * Stop listening for clicks
   */
  function stopElementSelection() {
    state.isListening = false;
    state.currentField = null;
    hideHighlight();

    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('click', handleClick, true);
  }

  /**
   * Handle mouse move for hover highlight
   */
  function handleMouseMove(e) {
    if (!state.isListening) return;

    // Ignore events on the control panel
    const panel = document.getElementById('controlPanel');
    if (panel && panel.contains(e.target)) {
      hideHighlight();
      return;
    }

    const element = e.target;
    if (element !== state.hoveredElement) {
      state.hoveredElement = element;
      showHighlight(element, state.currentField);
    }
  }

  /**
   * Handle element click
   */
  function handleClick(e) {
    if (!state.isListening) return;

    // Ignore clicks on the control panel
    const panel = document.getElementById('controlPanel');
    if (panel && panel.contains(e.target)) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const element = e.target;

    // Report click to backend
    if (window.__configGen_reportClick) {
      window.__configGen_reportClick({
        x: e.clientX,
        y: e.clientY,
        type: state.currentField
      });
    }

    // Handle based on current step
    if (state.currentField === 'card') {
      handleCardSelection(element);
    } else {
      handleFieldSelection(element, state.currentField);
    }
  }

  /**
   * Handle card selection
   */
  function handleCardSelection(element) {
    stopElementSelection();

    // Build simple selector
    const selector = buildSimpleSelector(element);
    state.selections.cardSelector = selector;

    // Count matching elements
    const count = document.querySelectorAll(selector).length;
    state.cardCount = count;

    // Update UI
    document.getElementById('cardSelectorPreview').textContent = selector;
    document.getElementById('cardSelectorFinal').textContent = selector;
    document.getElementById('cardCount').textContent = count;

    // Highlight all matching cards
    highlightAllMatches(selector);

    // Move to confirmation step
    showStep('confirm-cards');
    updatePhase('Confirm card selection');
  }

  /**
   * Handle field selection
   */
  function handleFieldSelection(element, fieldName) {
    // Build selector relative to card
    const selector = buildRelativeSelector(element, state.selections.cardSelector);
    state.selections[`${fieldName}Selector`] = selector;

    // Update UI
    const previewEl = document.getElementById(`${fieldName}SelectorPreview`);
    if (previewEl) {
      previewEl.textContent = selector || '(empty)';
    }

    const iconEl = document.getElementById(`icon-${fieldName}`);
    if (iconEl) {
      iconEl.classList.remove('current', 'pending');
      iconEl.classList.add('selected');
    }

    // Move to next field
    currentFieldIndex++;

    if (currentFieldIndex < fieldSequence.length) {
      const nextField = fieldSequence[currentFieldIndex];
      startFieldSelection(nextField);
    } else {
      // All fields done
      stopElementSelection();
      document.getElementById('finishFieldsBtn').style.display = 'block';
    }
  }

  /**
   * Start field selection for a specific field
   */
  function startFieldSelection(fieldName) {
    state.currentField = fieldName;

    // Update icons
    fieldSequence.forEach(field => {
      const icon = document.getElementById(`icon-${field}`);
      if (icon) {
        icon.classList.remove('current');
        if (field === fieldName) {
          icon.classList.add('current');
        }
      }
    });

    const previewEl = document.getElementById(`${fieldName}SelectorPreview`);
    if (previewEl) {
      previewEl.textContent = 'Click to select...';
    }

    updatePhase(`Select ${fieldName} field`);
    startElementSelection(fieldName);
  }

  /**
   * Skip current step
   */
  window.skipStep = function(step) {
    if (step === 'card') {
      stopElementSelection();
      // Use auto-detection (backend will handle)
      if (window.__configGen_autoDetect) {
        window.__configGen_autoDetect('card');
      }
    }
  };

  /**
   * Skip current field
   */
  window.skipCurrentField = function() {
    const currentField = fieldSequence[currentFieldIndex];
    state.selections[`${currentField}Selector`] = null;

    const previewEl = document.getElementById(`${currentField}SelectorPreview`);
    if (previewEl) {
      previewEl.textContent = '(skipped)';
    }

    const iconEl = document.getElementById(`icon-${currentField}`);
    if (iconEl) {
      iconEl.classList.remove('current');
      iconEl.classList.add('pending');
    }

    currentFieldIndex++;

    if (currentFieldIndex < fieldSequence.length) {
      startFieldSelection(fieldSequence[currentFieldIndex]);
    } else {
      stopElementSelection();
      document.getElementById('finishFieldsBtn').style.display = 'block';
    }
  };

  /**
   * Go back to a previous step
   */
  window.goBack = function(step) {
    if (step === 'card') {
      showStep('card');
      updatePhase('Step 1: Select contact card');
      startElementSelection('card');
    }
  };

  /**
   * Confirm card selection
   */
  window.confirmCards = function() {
    hideAllHighlights();
    showStep('fields');
    updatePhase('Step 2: Select fields');
    currentFieldIndex = 0;
    startFieldSelection(fieldSequence[0]);
  };

  /**
   * Finish field selection
   */
  window.finishFields = function() {
    stopElementSelection();
    showStep('pagination');
    updatePhase('Detecting pagination...');

    // Request pagination detection from backend
    if (window.__configGen_detectPagination) {
      window.__configGen_detectPagination(state.selections.cardSelector);
    }
  };

  /**
   * Handle pagination detection result (called from backend)
   */
  window.handlePaginationResult = function(result) {
    document.getElementById('paginationLoading').style.display = 'none';
    document.getElementById('paginationResult').style.display = 'block';

    if (result.detected) {
      state.selections.paginationType = 'infinite-scroll';
      state.selections.infiniteScroll = result;

      document.getElementById('infiniteScrollInfo').style.display = 'block';
      document.getElementById('initialCardCount').textContent = result.initialCount || '-';
      document.getElementById('afterScrollCount').textContent = result.afterScrollCount || '-';
      document.getElementById('scrollConfidence').textContent = result.confidence || 'unknown';
    } else {
      document.getElementById('noPaginationInfo').style.display = 'block';
      state.selections.paginationType = 'none';
    }

    document.getElementById('paginationContinueBtn').style.display = 'block';
    updatePhase('Pagination check complete');
  };

  /**
   * Proceed to summary
   */
  window.proceedToSummary = function() {
    showStep('summary');
    updatePhase('Review configuration');

    // Fill summary table
    document.getElementById('summaryCard').textContent =
      state.selections.cardSelector || '(not set)';
    document.getElementById('summaryName').textContent =
      state.selections.nameSelector || '(not set)';
    document.getElementById('summaryEmail').textContent =
      state.selections.emailSelector || '(not set)';
    document.getElementById('summaryPhone').textContent =
      state.selections.phoneSelector || '(not set)';
    document.getElementById('summaryPagination').textContent =
      state.selections.paginationType === 'infinite-scroll' ? 'Infinite Scroll' :
      state.selections.paginationType || 'None';
  };

  /**
   * Start over
   */
  window.startOver = function() {
    state.selections = {
      cardSelector: null,
      nameSelector: null,
      emailSelector: null,
      phoneSelector: null,
      paginationType: 'none',
      infiniteScroll: null
    };
    currentFieldIndex = 0;
    hideAllHighlights();
    showStep('ready');
    updatePhase('Ready to start');
  };

  /**
   * Save configuration
   */
  window.saveConfig = function() {
    if (window.__configGen_save) {
      window.__configGen_save(state.selections);
    }
  };

  /**
   * Handle save result (called from backend)
   */
  window.handleSaveResult = function(result) {
    showStep('complete');
    updatePhase('Complete');

    if (result.success) {
      document.getElementById('savedConfigPath').textContent = result.configPath;
    } else {
      document.getElementById('savedConfigPath').textContent =
        'Error: ' + (result.error || 'Unknown error');
    }
  };

  /**
   * Close the panel
   */
  window.closePanel = function() {
    if (window.__configGen_close) {
      window.__configGen_close();
    }
  };

  /**
   * Build a simple CSS selector for an element
   */
  function buildSimpleSelector(element) {
    // Try ID first
    if (element.id) {
      return `#${element.id}`;
    }

    // Try semantic classes
    const classes = Array.from(element.classList);
    const semanticClass = classes.find(c => isSemanticClass(c));

    if (semanticClass) {
      const tag = element.tagName.toLowerCase();
      return `${tag}.${semanticClass}`;
    }

    // Use first class
    if (classes.length > 0) {
      const tag = element.tagName.toLowerCase();
      return `${tag}.${classes[0]}`;
    }

    // Just use tag
    return element.tagName.toLowerCase();
  }

  /**
   * Build a selector relative to a parent
   */
  function buildRelativeSelector(element, parentSelector) {
    // Try to find element within parent context
    const classes = Array.from(element.classList);

    // Try semantic class
    const semanticClass = classes.find(c => isSemanticClass(c));
    if (semanticClass) {
      return `.${semanticClass}`;
    }

    // Try any class
    if (classes.length > 0) {
      return `.${classes[0]}`;
    }

    // Use tag name
    return element.tagName.toLowerCase();
  }

  /**
   * Check if a class name is semantic
   */
  function isSemanticClass(className) {
    const patterns = [
      /name/i, /title/i, /heading/i,
      /email/i, /mail/i,
      /phone/i, /tel/i,
      /card/i, /item/i, /person/i, /contact/i,
      /bio/i, /profile/i
    ];
    return patterns.some(p => p.test(className));
  }

  /**
   * Show highlight box around an element
   */
  function showHighlight(element, label) {
    if (!highlightBox) return;

    const rect = element.getBoundingClientRect();
    highlightBox.style.display = 'block';
    highlightBox.style.left = rect.left + 'px';
    highlightBox.style.top = rect.top + 'px';
    highlightBox.style.width = rect.width + 'px';
    highlightBox.style.height = rect.height + 'px';
    highlightBox.setAttribute('data-label', label || '');
  }

  /**
   * Hide highlight box
   */
  function hideHighlight() {
    if (highlightBox) {
      highlightBox.style.display = 'none';
    }
    state.hoveredElement = null;
  }

  /**
   * Highlight all matching elements
   */
  function highlightAllMatches(selector) {
    const elements = document.querySelectorAll(selector);
    elements.forEach((el, index) => {
      const overlay = document.createElement('div');
      overlay.className = 'config-gen-highlight-all';
      overlay.setAttribute('data-index', index);

      const rect = el.getBoundingClientRect();
      Object.assign(overlay.style, {
        position: 'fixed',
        left: rect.left + 'px',
        top: rect.top + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        border: '2px solid #38ef7d',
        background: 'rgba(56, 239, 125, 0.1)',
        pointerEvents: 'none',
        zIndex: '999997'
      });

      document.body.appendChild(overlay);
    });
  }

  /**
   * Remove all highlight overlays
   */
  function hideAllHighlights() {
    document.querySelectorAll('.config-gen-highlight-all').forEach(el => {
      el.remove();
    });
    hideHighlight();
  }

  // Initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose state for debugging
  window.__configGenState = state;

})();

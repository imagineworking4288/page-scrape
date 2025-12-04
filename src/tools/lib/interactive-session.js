/**
 * Interactive Session v2.2
 *
 * Core workflow orchestrator for the config generator.
 * Manages browser page lifecycle, injects overlay UI, and coordinates
 * the visual card selection workflow.
 *
 * v2.1 Features:
 * - Rectangle-based card selection
 * - Hybrid pattern matching (structural + visual)
 * - Enhanced capture with multi-method extraction strategies
 * - Card highlighting with confidence scores
 * - v2.1 config generation with fallbacks
 *
 * v2.2 Features:
 * - Manual field selection with click mode
 * - Profile link disambiguation
 * - User-selected extraction methods with coordinate fallbacks
 * - Field requirements constants
 */

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ConfigBuilder = require('./config-builder');
const ConfigValidator = require('./config-validator');
const CardMatcher = require('./card-matcher');
const SmartFieldExtractor = require('./smart-field-extractor');
const EnhancedCapture = require('./enhanced-capture');
const ElementCapture = require('./element-capture');

class InteractiveSession {
  constructor(browserManager, rateLimiter, logger, configLoader, options = {}) {
    this.browserManager = browserManager;
    this.rateLimiter = rateLimiter;
    this.logger = logger;
    this.configLoader = configLoader;
    this.options = options;

    // Workflow state
    this.currentStep = 'navigate';
    this.selections = {
      cardSelector: null,
      nameMarker: null,
      emailMarker: null,
      phoneMarker: null,
      paginationPattern: null
    };

    // v2.0 state
    this.matchResult = null;
    this.previewData = null;
    this.extractionRules = null;

    // v2.1 state
    this.captureData = null;
    this.configVersion = options.configVersion || '2.2';

    // v2.2 state
    this.manualSelections = null;

    // Helper modules
    this.configBuilder = new ConfigBuilder(logger, { outputDir: options.outputDir || 'configs' });
    this.configValidator = new ConfigValidator(logger);

    // v2.0 modules
    this.cardMatcher = new CardMatcher(logger);
    this.fieldExtractor = new SmartFieldExtractor(logger);

    // v2.1 modules
    this.enhancedCapture = new EnhancedCapture(logger);

    // v2.2 modules
    this.elementCapture = new ElementCapture(logger);

    // Session state
    this.page = null;
    this.domain = null;
    this.testUrl = null;
    this.sessionComplete = false;
    this.sessionResult = null;

    // Promise resolvers for async communication
    this.resolveSession = null;
    this.rejectSession = null;
  }

  /**
   * Main entry point - starts the interactive session
   * @param {string} url - Target URL
   * @returns {Promise<Object>} - Result with success and configPath
   */
  async start(url) {
    return new Promise(async (resolve, reject) => {
      this.resolveSession = resolve;
      this.rejectSession = reject;

      try {
        // Initialize
        await this.initialize(url);

        // Inject overlay UI
        await this.injectOverlay();

        // Expose backend functions for browser-to-Node communication
        await this.exposeBackendFunctions();

        // Send initial state to overlay
        await this.sendToOverlay('initialize', {
          url: url,
          domain: this.domain,
          step: 'ready'
        });

        this.logger.info('Interactive session started. Waiting for user actions...');

        // Session continues via callbacks from overlay
        // Will resolve when user saves config or cancels

      } catch (error) {
        this.logger.error(`Session initialization failed: ${error.message}`);
        reject({ success: false, error: error.message });
      }
    });
  }

  /**
   * Initialize browser and navigate to URL
   * @param {string} url - Target URL
   */
  async initialize(url) {
    // Extract domain
    const urlObj = new URL(url);
    this.domain = urlObj.hostname.replace(/^www\./, '');
    this.testUrl = url;

    // Get page
    this.page = await this.browserManager.getPage();

    // Navigate to URL
    this.logger.info(`Navigating to: ${url}`);
    await this.page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: this.options.timeout || 30000
    });

    // Wait a bit for dynamic content
    await this.page.waitForTimeout(2000);

    this.logger.info('Page loaded successfully');
  }

  /**
   * Inject overlay UI into the page
   * Uses page.evaluate() for CSP bypass instead of addScriptTag/addStyleTag
   */
  async injectOverlay() {
    this.logger.info('Injecting overlay UI...');

    // Read overlay files
    const assetsDir = path.join(__dirname, '..', 'assets');

    const overlayHTMLPath = path.join(assetsDir, 'overlay.html');
    const overlayJSPath = path.join(assetsDir, 'overlay-client.js');

    // Check if files exist
    if (!fs.existsSync(overlayHTMLPath)) {
      throw new Error(`Overlay HTML not found: ${overlayHTMLPath}`);
    }
    if (!fs.existsSync(overlayJSPath)) {
      throw new Error(`Overlay JS not found: ${overlayJSPath}`);
    }

    const overlayHTML = fs.readFileSync(overlayHTMLPath, 'utf8');
    const overlayJS = fs.readFileSync(overlayJSPath, 'utf8');

    // Extract CSS (everything between <style> tags)
    const cssMatch = overlayHTML.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const css = cssMatch ? cssMatch[1] : '';

    // Extract HTML body content (everything in <body>)
    const bodyMatch = overlayHTML.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const html = bodyMatch ? bodyMatch[1] : overlayHTML;

    // Inject via page.evaluate (bypasses CSP restrictions)
    // This runs in page context, not as external resource
    await this.page.evaluate((cssStr, htmlStr, jsStr) => {
      // Inject CSS inline
      const styleEl = document.createElement('style');
      styleEl.id = 'config-generator-styles';
      styleEl.textContent = cssStr;
      document.head.appendChild(styleEl);

      // Inject HTML container
      const containerDiv = document.createElement('div');
      containerDiv.id = 'config-generator-overlay-root';
      containerDiv.innerHTML = htmlStr;
      document.body.appendChild(containerDiv);

      // Execute JS inline (create and execute in page context)
      // Wrap in try-catch to capture any initialization errors
      try {
        const fn = new Function(jsStr);
        fn();
      } catch (err) {
        console.error('[ConfigGen] Failed to initialize overlay script:', err);
      }
    }, css, html, overlayJS);

    // Wait for overlay to initialize
    try {
      await this.page.waitForSelector('#controlPanel', { timeout: 5000 });
      this.logger.info('Overlay UI injected successfully');
    } catch (error) {
      this.logger.warn(`Overlay selector check timed out: ${error.message}`);
      // Continue anyway - overlay might still work
    }
  }

  /**
   * Expose backend functions for browser-to-Node communication
   */
  async exposeBackendFunctions() {
    // Initialization handshake - MUST be first
    await this.page.exposeFunction('__configGen_initialize', async () => {
      this.logger.info('Backend initialization handshake received');
      return {
        ready: true,
        timestamp: Date.now(),
        version: '1.0.0'
      };
    });

    // Heartbeat/ping function for connection monitoring
    await this.page.exposeFunction('__configGen_ping', async () => {
      return { alive: true, timestamp: Date.now() };
    });

    // Set selection mode
    await this.page.exposeFunction('__configGen_setMode', async (mode) => {
      this.currentStep = mode;
      this.logger.info(`Selection mode set to: ${mode}`);
      return { success: true };
    });

    // Auto-detect cards
    await this.page.exposeFunction('__configGen_autoDetect', async (type) => {
      this.logger.info(`Auto-detect requested for: ${type}`);
      if (type === 'card') {
        return await this.autoDetectCards();
      }
      return { success: false, error: 'Unknown auto-detect type' };
    });

    // Detect pagination
    await this.page.exposeFunction('__configGen_detectPagination', async (cardSelector) => {
      this.logger.info('Pagination detection requested');
      this.selections.cardSelector = cardSelector;
      const result = await this.detectPagination();

      // Send result back to overlay
      await this.page.evaluate((res) => {
        if (window.handlePaginationResult) {
          window.handlePaginationResult(res);
        }
      }, result);

      return result;
    });

    // Save configuration
    await this.page.exposeFunction('__configGen_save', async (selections) => {
      this.logger.info('Save requested');
      // Merge selections from overlay
      Object.assign(this.selections, selections);
      const result = await this.handleSaveRequested();

      // Send result back to overlay
      await this.page.evaluate((res) => {
        if (window.handleSaveResult) {
          window.handleSaveResult(res);
        }
      }, result);

      return result;
    });

    // Close session
    await this.page.exposeFunction('__configGen_close', async () => {
      this.logger.info('Close requested');
      return await this.handleUserCancelled();
    });

    // ===========================
    // v2.0 Functions - Rectangle Selection
    // ===========================

    // Handle rectangle selection from overlay
    await this.page.exposeFunction('__configGen_handleRectangleSelection', async (box) => {
      this.logger.info(`Rectangle selection: ${JSON.stringify(box)}`);
      return await this.handleRectangleSelection(box);
    });

    // Confirm selection and generate config
    await this.page.exposeFunction('__configGen_confirmAndGenerate', async () => {
      this.logger.info('Confirm and generate requested');
      return await this.handleConfirmAndGenerate();
    });

    // ===========================
    // v2.2 Functions - Manual Selection
    // ===========================

    // Confirm with manual selections
    await this.page.exposeFunction('__configGen_confirmWithSelections', async (selections) => {
      this.logger.info('[v2.2] Confirm with manual selections requested');
      return await this.handleConfirmWithSelections(selections);
    });

    // Handle field rectangle selection (v2.2)
    await this.page.exposeFunction('__configGen_handleFieldRectangle', async (data) => {
      this.logger.info(`[v2.2] Field rectangle selection: ${data.fieldName}`);
      return await this.handleFieldRectangleSelection(data);
    });
  }

  // ===========================
  // v2.1 Rectangle Selection Handlers
  // ===========================

  /**
   * Handle rectangle selection from user
   * Uses enhanced capture for v2.1 configs
   * @param {Object} box - {x, y, width, height} of selection
   * @returns {Promise<Object>} - Result with matches
   */
  async handleRectangleSelection(box) {
    this.logger.info('[v2.1] Processing rectangle selection...');

    try {
      // Step 1: Find similar cards using CardMatcher
      const matchResult = await this.cardMatcher.findSimilarCards(
        this.page,
        box,
        this.options.matchThreshold || 65
      );

      if (!matchResult.success) {
        // Send error to overlay
        await this.page.evaluate((error) => {
          if (window.handleCardDetectionResult) {
            window.handleCardDetectionResult({ success: false, error: error });
          }
        }, matchResult.error || 'Failed to find cards');

        return matchResult;
      }

      // Store match result
      this.matchResult = matchResult;
      this.selections.cardSelector = matchResult.selector;

      this.logger.info(`[v2.1] Found ${matchResult.totalFound} matching cards`);

      // Step 2: Enhanced capture for v2.1 (comprehensive DOM capture)
      this.logger.info('[v2.1] Running enhanced capture...');
      const captureResult = await this.enhancedCapture.capture(this.page, box);

      if (captureResult.success) {
        this.captureData = captureResult;
        this.previewData = captureResult.preview || {};

        // Log captured methods
        const fields = captureResult.fields || {};
        const methodCounts = {
          name: fields.name?.methods?.length || 0,
          email: fields.email?.methods?.length || 0,
          phone: fields.phone?.methods?.length || 0,
          title: fields.title?.methods?.length || 0,
          profileUrl: fields.profileUrl?.methods?.length || 0
        };
        this.logger.info(`[v2.1] Captured extraction methods: ${JSON.stringify(methodCounts)}`);
      } else {
        this.logger.warn('[v2.1] Enhanced capture failed, falling back to basic extraction');
        // Fallback to legacy extraction
        const previewResult = await this.fieldExtractor.extractFromSelection(this.page, box);
        this.previewData = previewResult.success ? previewResult.data : {};
        this.captureData = null;
      }

      // Step 3: Generate extraction rules (for backward compatibility)
      this.extractionRules = this.fieldExtractor.generateExtractionRules(this.previewData);

      // Send result to overlay
      const result = {
        success: true,
        matches: matchResult.matches,
        totalFound: matchResult.totalFound,
        selector: matchResult.selector,
        previewData: this.previewData,
        // v2.1 additional data
        captureVersion: this.captureData ? '2.1' : '2.0',
        methodsCount: this.captureData ? Object.values(this.captureData.fields || {})
          .reduce((sum, f) => sum + (f?.methods?.length || 0), 0) : 0
      };

      await this.page.evaluate((res) => {
        if (window.handleCardDetectionResult) {
          window.handleCardDetectionResult(res);
        }
      }, result);

      return result;

    } catch (error) {
      this.logger.error(`[v2.1] Rectangle selection error: ${error.message}`);

      await this.page.evaluate((err) => {
        if (window.handleCardDetectionResult) {
          window.handleCardDetectionResult({ success: false, error: err });
        }
      }, error.message);

      return { success: false, error: error.message };
    }
  }

  /**
   * Handle confirm and generate config (v2.1 with v2.0 fallback)
   * @returns {Promise<Object>} - Result with config path
   */
  async handleConfirmAndGenerate() {
    // Determine which version to generate
    const generateV21 = this.captureData && this.configVersion === '2.1';
    const version = generateV21 ? '2.1' : '2.0';

    this.logger.info(`[v${version}] Generating config...`);

    try {
      if (!this.matchResult) {
        throw new Error('No card selection to confirm');
      }

      // Prepare metadata
      const metadata = {
        url: this.testUrl,
        domain: this.domain,
        pagination: this.selections.paginationPattern || { type: 'none' }
      };

      let config, validation;

      if (generateV21) {
        // Build v2.1 config with enhanced capture data
        this.logger.info('[v2.1] Building config with multi-method extraction strategies...');

        config = this.configBuilder.buildConfigV21(
          this.captureData,
          this.matchResult,
          metadata
        );

        // Validate v2.1 config
        validation = this.configBuilder.validateConfigV21(config);

        // Log method counts
        const fields = config.fieldExtraction?.fields || {};
        const totalMethods = Object.values(fields).reduce((sum, f) => sum + (f?.methods?.length || 0), 0);
        this.logger.info(`[v2.1] Config generated with ${totalMethods} extraction methods`);
      } else {
        // Fallback to v2.0 config
        this.logger.info('[v2.0] Building config with standard extraction rules...');

        config = this.configBuilder.buildConfigV2(
          this.matchResult,
          this.extractionRules,
          metadata
        );

        // Validate v2.0 config
        validation = this.configBuilder.validateConfigV2(config);
      }

      if (!validation.valid) {
        this.logger.warn(`[v${version}] Config validation errors: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        this.logger.warn(`[v${version}] Config validation warnings: ${validation.warnings.join(', ')}`);
      }

      // Save config
      const configPath = this.configBuilder.saveConfig(config, this.options.outputDir);

      this.logger.info(`[v${version}] Config saved to: ${configPath}`);
      this.logger.info(`[v${version}] Config score: ${validation.score}/100`);

      // Send result to overlay
      const result = {
        success: true,
        configPath: configPath,
        configName: config.name,
        configVersion: config.version,
        validation: validation
      };

      await this.page.evaluate((res) => {
        if (window.handleConfigComplete) {
          window.handleConfigComplete(res);
        }
      }, result);

      // Mark session complete
      this.sessionComplete = true;
      this.sessionResult = {
        success: true,
        configPath: configPath,
        config: config,
        validation: validation
      };

      if (this.resolveSession) {
        this.resolveSession(this.sessionResult);
      }

      return result;

    } catch (error) {
      this.logger.error(`[v${this.configVersion}] Generate config error: ${error.message}`);

      await this.page.evaluate((err) => {
        if (window.handleConfigComplete) {
          window.handleConfigComplete({ success: false, error: err });
        }
      }, error.message);

      return { success: false, error: error.message };
    }
  }

  /**
   * Handle confirm with manual selections (v2.2)
   * @param {Object} selections - Manual selections from overlay { fieldName: { selector, value, coordinates, element } }
   * @returns {Promise<Object>} - Result with config path
   */
  async handleConfirmWithSelections(selections) {
    this.logger.info('========================================');
    this.logger.info('[v2.2-BACKEND] RECEIVED CONFIRM WITH SELECTIONS');
    this.logger.info('========================================');
    this.logger.info('[v2.2-BACKEND] Selections type:', typeof selections);
    this.logger.info('[v2.2-BACKEND] Selections received:', JSON.stringify(selections, null, 2));
    this.logger.info('[v2.2-BACKEND] Field keys:', Object.keys(selections || {}));
    this.logger.info('[v2.2-BACKEND] Field count:', Object.keys(selections || {}).length);
    this.logger.info('[v2.2-BACKEND] matchResult exists:', !!this.matchResult);
    this.logger.info('[v2.2-BACKEND] matchResult.referenceBox:', JSON.stringify(this.matchResult?.referenceBox, null, 2));

    try {
      if (!this.matchResult) {
        this.logger.error('[v2.2-BACKEND] ERROR: No matchResult available!');
        throw new Error('No card selection to confirm');
      }

      // Store manual selections
      this.manualSelections = selections;
      this.logger.info('[v2.2-BACKEND] Stored manual selections');

      // Process selections with ElementCapture
      this.logger.info('[v2.2-BACKEND] Calling elementCapture.processManualSelections...');
      const capturedData = await this.elementCapture.processManualSelections(
        this.page,
        selections,
        this.matchResult.referenceBox
      );
      this.logger.info('[v2.2-BACKEND] ElementCapture returned capturedData');
      this.logger.info('[v2.2-BACKEND] capturedData.fields keys:', Object.keys(capturedData?.fields || {}));

      // Log capture results
      this.logger.info(`[v2.2-BACKEND] Captured fields: ${Object.keys(capturedData.fields).join(', ')}`);

      if (!capturedData.validation.valid) {
        this.logger.warn(`[v2.2-BACKEND] Missing required fields: ${capturedData.validation.missingRequired.join(', ')}`);
      }

      // Prepare metadata
      const metadata = {
        url: this.testUrl,
        domain: this.domain,
        pagination: this.selections.paginationPattern || { type: 'none' }
      };
      this.logger.info('[v2.2-BACKEND] Metadata prepared:', JSON.stringify(metadata, null, 2));

      // Build v2.2 config with manual selections
      let config, validation;

      // Check if configBuilder has v2.2 method, else use v2.1
      this.logger.info('[v2.2-BACKEND] configBuilder.buildConfigV22 exists:', typeof this.configBuilder.buildConfigV22 === 'function');

      if (typeof this.configBuilder.buildConfigV22 === 'function') {
        this.logger.info('[v2.2-BACKEND] Building config with buildConfigV22...');
        config = this.configBuilder.buildConfigV22(
          capturedData,
          this.matchResult,
          metadata
        );
        this.logger.info('[v2.2-BACKEND] buildConfigV22 returned config');
        validation = this.configBuilder.validateConfigV21(config);
      } else {
        // Fallback: Use v2.1 builder with captured data merged
        this.logger.info('[v2.2-BACKEND] Using v2.1 builder with manual selections (fallback)...');

        // Merge manual capture into captureData format
        const mergedCaptureData = {
          success: true,
          fields: capturedData.fields,
          preview: Object.fromEntries(
            Object.entries(capturedData.fields).map(([k, v]) => [k, v.value])
          ),
          relationships: capturedData.relationships,
          siteCharacteristics: this.captureData?.siteCharacteristics || {}
        };

        config = this.configBuilder.buildConfigV21(
          mergedCaptureData,
          this.matchResult,
          metadata
        );

        // Mark as v2.2 with manual selections
        config.version = '2.2';
        config.selectionMethod = 'manual';

        validation = this.configBuilder.validateConfigV21(config);
      }

      this.logger.info('[v2.2-BACKEND] Config built successfully');
      this.logger.info('[v2.2-BACKEND] Config version:', config?.version);
      this.logger.info('[v2.2-BACKEND] Config name:', config?.name);

      // Add extraction rules from manual selections
      this.logger.info('[v2.2-BACKEND] Building extraction rules...');
      const extractionRules = this.elementCapture.buildExtractionRules(capturedData);
      config.fieldExtraction = extractionRules;
      this.logger.info('[v2.2-BACKEND] Extraction rules added');

      // Log method counts
      const fields = config.fieldExtraction?.fields || {};
      const totalMethods = Object.values(fields).reduce((sum, f) => sum + (f?.methods?.length || 0), 0);
      this.logger.info(`[v2.2-BACKEND] Config generated with ${totalMethods} extraction methods`);

      if (!validation.valid) {
        this.logger.warn(`[v2.2-BACKEND] Config validation errors: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        this.logger.warn(`[v2.2-BACKEND] Config validation warnings: ${validation.warnings.join(', ')}`);
      }

      // Save config
      this.logger.info('========================================');
      this.logger.info('[v2.2-BACKEND] SAVING CONFIG FILE');
      this.logger.info('========================================');
      this.logger.info('[v2.2-BACKEND] Output directory:', this.options?.outputDir);
      this.logger.info('[v2.2-BACKEND] Config size:', JSON.stringify(config).length, 'characters');

      const configPath = this.configBuilder.saveConfig(config, this.options.outputDir);

      this.logger.info('[v2.2-BACKEND] Config saved successfully!');
      this.logger.info(`[v2.2-BACKEND] Config saved to: ${configPath}`);
      this.logger.info(`[v2.2-BACKEND] Config score: ${validation.score}/100`);

      // Send result to overlay
      const result = {
        success: true,
        configPath: configPath,
        configName: config.name,
        configVersion: config.version,
        validation: validation,
        selectionMethod: 'manual'
      };

      this.logger.info('[v2.2-BACKEND] Sending result to overlay:', JSON.stringify(result, null, 2));

      await this.page.evaluate((res) => {
        console.log('[v2.2-DEBUG] handleConfigComplete called with:', res);
        if (window.handleConfigComplete) {
          window.handleConfigComplete(res);
        } else {
          console.error('[v2.2-DEBUG] window.handleConfigComplete not found!');
        }
      }, result);

      this.logger.info('[v2.2-BACKEND] Result sent to overlay');

      // Mark session complete
      this.sessionComplete = true;
      this.sessionResult = {
        success: true,
        configPath: configPath,
        config: config,
        validation: validation,
        selectionMethod: 'manual'
      };

      if (this.resolveSession) {
        this.logger.info('[v2.2-BACKEND] Resolving session promise');
        this.resolveSession(this.sessionResult);
      }

      this.logger.info('========================================');
      this.logger.info('[v2.2-BACKEND] MANUAL SELECTION COMPLETE');
      this.logger.info('========================================');

      return result;

    } catch (error) {
      this.logger.error('========================================');
      this.logger.error('[v2.2-BACKEND] ERROR IN handleConfirmWithSelections');
      this.logger.error('========================================');
      this.logger.error(`[v2.2-BACKEND] Error message: ${error.message}`);
      this.logger.error(`[v2.2-BACKEND] Error stack: ${error.stack}`);

      await this.page.evaluate((err) => {
        console.error('[v2.2-DEBUG] handleConfigComplete called with error:', err);
        if (window.handleConfigComplete) {
          window.handleConfigComplete({ success: false, error: err });
        }
      }, error.message);

      return { success: false, error: error.message };
    }
  }

  /**
   * Handle field rectangle selection (v2.2)
   * Extracts field value from elements within the drawn rectangle
   * @param {Object} data - { fieldName, box: { x, y, width, height } }
   * @returns {Promise<Object>} - Result with extracted value
   */
  async handleFieldRectangleSelection(data) {
    const { fieldName, box } = data;
    this.logger.info(`[v2.2] Processing field rectangle for ${fieldName}: ${JSON.stringify(box)}`);

    try {
      // Use ElementCapture to extract field from rectangle
      const result = await this.elementCapture.extractFieldFromRectangle(
        this.page,
        fieldName,
        box,
        this.matchResult?.referenceBox
      );

      // Send result back to overlay
      await this.page.evaluate((res) => {
        if (window.handleFieldRectangleResult) {
          window.handleFieldRectangleResult(res);
        }
      }, result);

      return result;

    } catch (error) {
      this.logger.error(`[v2.2] Field rectangle extraction error: ${error.message}`);

      const errorResult = {
        success: false,
        fieldName: fieldName,
        error: error.message
      };

      await this.page.evaluate((res) => {
        if (window.handleFieldRectangleResult) {
          window.handleFieldRectangleResult(res);
        }
      }, errorResult);

      return errorResult;
    }
  }

  /**
   * Handle user clicking "I'm Ready"
   */
  async handleUserReady() {
    this.logger.info('User is ready to begin');
    this.currentStep = 'card';

    return {
      success: true,
      nextStep: 'card',
      message: 'Click on a contact card (the container with name, email, etc.)'
    };
  }

  /**
   * Auto-detect contact cards on the page
   * @returns {Promise<Object>} - Detection result
   */
  async autoDetectCards() {
    this.logger.info('Auto-detecting contact cards...');

    // Common card selectors to try
    const candidateSelectors = [
      // Common card patterns
      '.card', '.item', '.result', '.entry',
      '.person', '.contact', '.profile', '.member',
      '.attorney', '.lawyer', '.staff', '.employee',
      // List items
      'li.card', 'li.item', 'li.result',
      // Article-based
      'article', 'article.card',
      // Table rows
      'tr.contact', 'tbody tr',
      // Divs with common classes
      'div[class*="card"]', 'div[class*="item"]',
      'div[class*="person"]', 'div[class*="contact"]',
      'div[class*="result"]', 'div[class*="profile"]'
    ];

    let bestSelector = null;
    let bestCount = 0;

    for (const selector of candidateSelectors) {
      try {
        const count = await this.page.evaluate((sel) => {
          return document.querySelectorAll(sel).length;
        }, selector);

        if (count >= 5 && count <= 200 && count > bestCount) {
          bestSelector = selector;
          bestCount = count;
        }
      } catch (e) {
        // Ignore invalid selectors
      }
    }

    if (!bestSelector) {
      return {
        success: false,
        error: 'Could not auto-detect cards. Please select manually.'
      };
    }

    this.selections.cardSelector = bestSelector;

    this.logger.info(`Auto-detected card selector: "${bestSelector}" (${bestCount} cards)`);

    return {
      success: true,
      selector: bestSelector,
      cardCount: bestCount,
      message: `Auto-detected ${bestCount} cards. Proceed to field selection.`
    };
  }

  /**
   * Validate extracted field values
   * @param {string} fieldType - Field type
   * @param {Array} values - Extracted values
   * @returns {Object} - Validation results
   */
  validateField(fieldType, values) {
    const contactExtractor = require('../../utils/contact-extractor');

    let validCount = 0;
    const samples = [];
    const totalCount = values.filter(v => v !== null).length;

    for (const value of values) {
      if (!value) continue;

      let isValid = false;

      if (fieldType === 'name') {
        isValid = contactExtractor.isValidNameCandidate(value);
      } else if (fieldType === 'email') {
        const emails = contactExtractor.extractEmails(value);
        isValid = emails.length > 0;
      } else if (fieldType === 'phone') {
        const phones = contactExtractor.extractPhones(value);
        isValid = phones.length > 0;
      }

      if (isValid) {
        validCount++;
        if (samples.length < 5) {
          samples.push(value);
        }
      }
    }

    return {
      validCount: validCount,
      totalCount: totalCount,
      coverage: totalCount > 0 ? validCount / totalCount : 0,
      samples: samples
    };
  }

  /**
   * Handle step confirmation
   * @param {Object} stepData - Step data
   */
  async handleStepConfirmed(stepData) {
    this.logger.info(`Step confirmed: ${this.currentStep}`);

    if (this.currentStep === 'phone' || stepData.proceedToPagination) {
      // Move to pagination detection
      this.currentStep = 'pagination';
      return await this.detectPagination();
    }

    return { success: true };
  }

  /**
   * Handle field skip (for optional fields like phone)
   * @param {string} fieldType - Field being skipped
   */
  async handleFieldSkipped(fieldType) {
    this.logger.info(`User skipped: ${fieldType}`);

    if (fieldType === 'phone') {
      this.currentStep = 'pagination';
      return await this.detectPagination();
    }

    return { success: true };
  }

  /**
   * Detect pagination pattern (including infinite scroll)
   * @returns {Promise<Object>} - Pagination detection results
   */
  async detectPagination() {
    this.logger.info('Detecting pagination...');

    // First, try traditional pagination detection using existing Paginator
    const Paginator = require('../../utils/paginator');
    const paginator = new Paginator(
      this.browserManager,
      this.rateLimiter,
      this.logger,
      this.configLoader
    );

    try {
      const result = await paginator.paginate(this.testUrl, {
        maxPages: 200,
        minContacts: 1,
        timeout: 30000,
        discoverOnly: true
      });

      if (result.success && result.pattern && result.pattern.type !== 'none') {
        // Traditional pagination found
        this.selections.paginationPattern = result.pattern;
        this.currentStep = 'review';

        this.logger.info(`Traditional pagination detected: ${result.pattern.type}`);

        return {
          success: true,
          type: result.pattern.type,
          totalPages: result.trueMaxPage || result.totalPages || 1,
          pattern: result.pattern,
          confidence: result.confidence || 0,
          nextStep: 'review',
          message: `Pagination detected: ${result.pattern.type} (${result.totalPages || '?'} pages)`
        };
      }
    } catch (error) {
      this.logger.warn(`Traditional pagination detection failed: ${error.message}`);
    }

    // If no traditional pagination, check for infinite scroll
    this.logger.info('Checking for infinite scroll...');
    const infiniteScrollResult = await this.detectInfiniteScroll();

    if (infiniteScrollResult.detected) {
      this.selections.paginationPattern = {
        type: 'infinite-scroll',
        confidence: infiniteScrollResult.confidence,
        scrollBehavior: 'smooth',
        maxScrolls: 50,
        scrollDelay: 1000,
        waitForContent: 2000
      };

      this.currentStep = 'review';

      this.logger.info(`Infinite scroll detected (confidence: ${infiniteScrollResult.confidence})`);

      return {
        success: true,
        type: 'infinite-scroll',
        pattern: { type: 'infinite-scroll' },
        confidence: infiniteScrollResult.confidence,
        initialCards: infiniteScrollResult.initialCards,
        cardsAfterScroll: infiniteScrollResult.cardsAfterFirstScroll || infiniteScrollResult.cardsAfterSecondScroll,
        nextStep: 'review',
        message: `✓ Infinite scroll detected - content loads as you scroll (${infiniteScrollResult.initialCards} → ${infiniteScrollResult.cardsAfterFirstScroll || infiniteScrollResult.cardsAfterSecondScroll} cards)`
      };
    }

    // Single page (no pagination)
    this.selections.paginationPattern = { type: 'single-page' };
    this.currentStep = 'review';

    this.logger.info('No pagination detected - single page');

    return {
      success: true,
      type: 'single-page',
      totalPages: 1,
      nextStep: 'review',
      message: 'No pagination detected - this appears to be a single page.'
    };
  }

  /**
   * Detect if page uses infinite scroll
   * Uses robust multi-scroll testing with ScrollDetector
   * @returns {Promise<Object>} - Detection results
   */
  async detectInfiniteScroll() {
    if (!this.selections.cardSelector) {
      return { detected: false, confidence: 'none' };
    }

    this.logger.info('Testing for infinite scroll...');

    const containerSelector = this.selections.cardSelector;

    // Get initial state
    const initialCardCount = await this.page.$$eval(containerSelector, els => els.length)
      .catch(() => 0);
    const initialHeight = await this.page.evaluate(() => document.body.scrollHeight);

    this.logger.info(`Initial: ${initialCardCount} cards, ${initialHeight}px height`);

    // Perform 3-5 test scrolls to get reliable detection
    const scrollResults = [];
    let noNewContentCount = 0;
    const maxTestScrolls = 5;

    for (let i = 0; i < maxTestScrolls; i++) {
      const beforeCount = await this.page.$$eval(containerSelector, els => els.length)
        .catch(() => 0);
      const beforeHeight = await this.page.evaluate(() => document.body.scrollHeight);

      // Scroll to bottom
      await this.page.evaluate(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      });

      // Wait for content to load (simple delay-based approach)
      await this.sleep(2000);

      const afterCount = await this.page.$$eval(containerSelector, els => els.length)
        .catch(() => 0);
      const afterHeight = await this.page.evaluate(() => document.body.scrollHeight);

      const newCards = afterCount - beforeCount;
      const heightIncrease = afterHeight - beforeHeight;

      scrollResults.push({
        scrollNum: i + 1,
        beforeCount,
        afterCount,
        newCards,
        beforeHeight,
        afterHeight,
        heightIncrease
      });

      this.logger.info(
        `Scroll ${i + 1}: ${beforeCount} -> ${afterCount} cards (+${newCards}), ` +
        `height: ${beforeHeight} -> ${afterHeight}px (+${heightIncrease})`
      );

      // Check for new content
      if (newCards > 0 || heightIncrease > 100) {
        noNewContentCount = 0;
      } else {
        noNewContentCount++;
      }

      // If we've had 2 scrolls with no new content, we've reached the end
      if (noNewContentCount >= 2) {
        this.logger.info('Reached end of content, stopping detection');
        break;
      }
    }

    // Scroll back to top
    await this.page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await this.sleep(500);

    // Analyze results
    const scrollsWithNewContent = scrollResults.filter(r => r.newCards > 0).length;
    const totalNewCards = scrollResults.reduce((sum, r) => sum + r.newCards, 0);
    const finalCardCount = scrollResults.length > 0 ?
      scrollResults[scrollResults.length - 1].afterCount :
      initialCardCount;

    // Determine detection result
    const detected = scrollsWithNewContent > 0;
    const confidence = scrollsWithNewContent >= 2 ? 'high' :
                       scrollsWithNewContent === 1 ? 'medium' : 'low';

    this.logger.info(
      `Infinite scroll detection: ${detected ? 'YES' : 'NO'} ` +
      `(confidence: ${confidence}, ${scrollsWithNewContent}/${scrollResults.length} scrolls with new content)`
    );

    return {
      detected,
      confidence,
      scrollResults,
      totalNewCards,
      initialCards: initialCardCount,
      finalCards: finalCardCount,
      scrollsWithNewContent
    };
  }

  /**
   * Sleep helper
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Handle retry request
   */
  async handleRetryRequested() {
    this.logger.info('User requested retry');

    // Clear highlights
    await this.page.evaluate(() => {
      if (window.OverlayController) {
        window.OverlayController.clearHighlights();
      }
    });

    // Reset to card selection
    this.currentStep = 'card';
    this.selections = {
      cardSelector: null,
      nameMarker: null,
      emailMarker: null,
      phoneMarker: null,
      paginationPattern: null
    };

    return {
      success: true,
      nextStep: 'card',
      message: 'Selection cleared. Click on a contact card to start over.'
    };
  }

  /**
   * Handle user cancellation
   */
  async handleUserCancelled() {
    this.logger.info('User cancelled session');

    this.sessionComplete = true;
    this.sessionResult = { success: false, cancelled: true };

    if (this.resolveSession) {
      this.resolveSession(this.sessionResult);
    }

    return { success: true };
  }

  /**
   * Handle save request
   */
  async handleSaveRequested() {
    this.logger.info('User requested save');

    try {
      // Prepare metadata
      const metadata = {
        url: this.testUrl,
        domain: this.domain
      };

      // Build config using ConfigBuilder
      const config = this.configBuilder.buildConfig(this.selections, metadata);

      // Validate config
      const validation = this.configBuilder.validateConfig(config);

      if (!validation.valid) {
        this.logger.warn(`Config validation warnings: ${validation.warnings.join(', ')}`);
      }

      // Test config if enabled
      let testResults = null;
      if (this.options.testAfterGeneration !== false) {
        this.logger.info('Testing generated config...');
        testResults = await this.configValidator.validate(this.page, config);

        if (!testResults.valid && testResults.issues.length > 0) {
          this.logger.warn(`Config test warnings: ${testResults.issues.join(', ')}`);
        }

        if (testResults.extraction?.contactCount > 0) {
          this.logger.info(`Config test: ${testResults.extraction.contactCount} contacts extracted`);
        }
      }

      // Save config
      const configPath = this.configBuilder.saveConfig(config, this.options.outputDir);

      this.logger.info(`Config saved to: ${configPath}`);

      this.sessionComplete = true;
      this.sessionResult = {
        success: true,
        configPath: configPath,
        config: config,
        testResults: testResults
      };

      if (this.resolveSession) {
        this.resolveSession(this.sessionResult);
      }

      return {
        success: true,
        configPath: configPath,
        message: 'Config saved successfully!'
      };

    } catch (error) {
      this.logger.error(`Save failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send data to overlay UI
   * @param {string} command - Command name
   * @param {Object} data - Data to send
   */
  async sendToOverlay(command, data) {
    await this.page.evaluate((cmd, d) => {
      if (window.OverlayController) {
        window.OverlayController.handleBackendMessage(cmd, d);
      }
    }, command, data);
  }
}

module.exports = InteractiveSession;

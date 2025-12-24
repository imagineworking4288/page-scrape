/**
 * Interactive Session v2.3
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
 *
 * v2.3 Features:
 * - Multi-method extraction testing (OCR, coordinate-text, selector, etc.)
 * - Top 5 results display for user validation
 * - User-validated extraction methods stored in config
 * - Foolproof universal scraper approach
 */

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ConfigBuilder = require('./config-builder');
const ConfigValidator = require('./config-validator');
const CardMatcher = require('./card-matcher');
const SmartFieldExtractor = require('../../extraction/smart-field-extractor');
const EnhancedCapture = require('./enhanced-capture');
const ElementCapture = require('./element-capture');

// v2.3 modules
const ExtractionTester = require('./extraction-tester');

// Selenium for infinite scroll
const SeleniumManager = require('../../core/selenium-manager');

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
    this.configVersion = options.configVersion || '2.3';

    // v2.2 state
    this.manualSelections = null;

    // v2.3 state
    this.extractionTester = null;
    this.v23Selections = {};  // Stores user-validated extraction methods

    // Selenium manager for infinite scroll scraping
    this.seleniumManager = null;

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
    // Using 'domcontentloaded' instead of 'networkidle0' because:
    // 1. Modern sites with analytics, chat widgets, and tracking never reach network idle
    // 2. The config generator is interactive - the user confirms when the page is ready
    // 3. 'domcontentloaded' fires when HTML is parsed, which is sufficient for the UI
    this.logger.info(`Navigating to: ${url}`);
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: this.options.timeout || 30000
    });

    // Wait a bit for dynamic content to render
    await this.page.waitForTimeout(3000);

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

    // ===========================
    // v2.3 Functions - Multi-Method Extraction Testing
    // ===========================

    // Test extraction methods for a field rectangle (v2.3)
    await this.page.exposeFunction('__configGen_testFieldExtraction', async (data) => {
      this.logger.info(`[v2.3] Testing extraction methods for field: ${data.fieldName}`);
      return await this.handleTestFieldExtraction(data);
    });

    // Confirm user-validated extraction result (v2.3)
    await this.page.exposeFunction('__configGen_confirmFieldExtraction', async (data) => {
      this.logger.info(`[v2.3] User confirmed extraction for: ${data.fieldName}`);
      return await this.handleConfirmFieldExtraction(data);
    });

    // Generate v2.3 config with validated methods
    await this.page.exposeFunction('__configGen_generateV23Config', async (selections) => {
      this.logger.info('[v2.3] Generating config with validated extraction methods');
      return await this.handleGenerateV23Config(selections);
    });

    // Final save and close (v2.3 - from preview panel)
    await this.page.exposeFunction('__configGen_finalSaveAndClose', async () => {
      this.logger.info('[v2.3] User confirmed final save from preview panel');
      return await this.handleFinalSaveAndClose();
    });

    // ===========================
    // Validation Function
    // ===========================

    // Validate config by testing scrape + enrichment on N contacts
    await this.page.exposeFunction('__configGen_validateData', async () => {
      this.logger.info('[Validation] Running config validation...');
      return await this.handleValidateData();
    });

    // ===========================
    // Diagnosis & Scraping Functions
    // ===========================

    // Diagnose pagination type
    await this.page.exposeFunction('__configGen_diagnosePagination', async () => {
      this.logger.info('[Diagnosis] Starting pagination diagnosis...');
      return await this.handleDiagnosePagination();
    });

    // Start scraping with config
    await this.page.exposeFunction('__configGen_startScraping', async (scrapingConfig) => {
      this.logger.info('[Scraping] Starting scraping with config:', JSON.stringify(scrapingConfig));
      return await this.handleStartScraping(scrapingConfig);
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

      // Store session result but DON'T resolve session yet
      // Session should only end when user clicks "Save & Close"
      this.sessionResult = {
        success: true,
        configPath: configPath,
        config: config,
        validation: validation
      };

      // NOTE: Do NOT call resolveSession() here!
      // The browser should stay open until user explicitly clicks "Save & Close"
      // which triggers handleFinalSaveAndClose()

      this.logger.info(`[v${version}] Config generated and saved, waiting for user confirmation`);
      this.logger.info(`[v${version}] Browser will remain open until user clicks "Save & Close"`);

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

      // Build field details for preview panel
      const fieldsForPreview = {};
      for (const [fieldName, fieldData] of Object.entries(capturedData.fields || {})) {
        fieldsForPreview[fieldName] = {
          value: fieldData.value,
          found: !!fieldData.value,
          method: fieldData.method || fieldData.userValidatedMethod || 'manual',
          methodLabel: fieldData.methodLabel || this.formatMethodName(fieldData.method || fieldData.userValidatedMethod),
          confidence: fieldData.confidence || 85
        };
      }

      // Add missing fields as not found
      const allFields = ['name', 'email', 'phone', 'profileUrl', 'title', 'location'];
      allFields.forEach(fieldName => {
        if (!fieldsForPreview[fieldName]) {
          fieldsForPreview[fieldName] = {
            value: null,
            found: false
          };
        }
      });

      // Send result to overlay with additional data for preview
      const result = {
        success: true,
        configPath: configPath,
        configName: config.name,
        configVersion: config.version,
        validation: validation,
        selectionMethod: 'manual',
        config: config,  // Include actual config for preview
        fields: fieldsForPreview,  // Field details for preview panel
        score: validation.score || 80
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

      // Store session result but DO NOT resolve yet - wait for user confirmation in preview panel
      this.sessionResult = {
        success: true,
        configPath: configPath,
        config: config,
        validation: validation,
        selectionMethod: 'manual'
      };

      this.logger.info('[v2.3] Config generated and saved, waiting for user confirmation in preview panel');
      this.logger.info('[v2.3] Browser will remain open until user clicks "Save & Close"');

      this.logger.info('========================================');
      this.logger.info('[v2.2-BACKEND] CONFIG READY FOR PREVIEW');
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
   * Format method name for display (e.g., 'coordinate-text' -> 'Coordinate Text')
   * @param {string} method - Method name
   * @returns {string} - Formatted method name
   */
  formatMethodName(method) {
    if (!method) return 'Manual';
    return method
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
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

      // Store session result but DON'T resolve session yet
      // Session should only end when user clicks "Save & Close"
      this.sessionResult = {
        success: true,
        configPath: configPath,
        config: config,
        testResults: testResults
      };

      // NOTE: Do NOT call resolveSession() here!
      // The browser should stay open until user explicitly clicks "Save & Close"
      // which triggers handleFinalSaveAndClose()

      this.logger.info('[v2.3] Config saved. Browser will stay open until user clicks "Save & Close"');

      return {
        success: true,
        configPath: configPath,
        testResults: testResults,
        message: 'Config saved successfully! Click "Save & Close" when ready to finish.'
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

  // ===========================
  // v2.3 Extraction Testing Handlers
  // ===========================

  /**
   * Initialize the extraction tester (lazy loading)
   * @returns {ExtractionTester}
   */
  async getExtractionTester() {
    if (!this.extractionTester) {
      this.extractionTester = new ExtractionTester(this.page);
      await this.extractionTester.initialize();
      this.logger.info('[v2.3] Extraction tester initialized');
    }
    return this.extractionTester;
  }

  /**
   * Test multiple extraction methods for a field
   * @param {Object} data - { fieldName, box: { x, y, width, height } }
   * @returns {Promise<Object>} - Results with top 5 methods
   */
  async handleTestFieldExtraction(data) {
    const { fieldName, box } = data;
    this.logger.info('');
    this.logger.info('========================================');
    this.logger.info(`[v2.3] TESTING EXTRACTION METHODS: ${fieldName.toUpperCase()}`);
    this.logger.info('========================================');
    this.logger.info(`[v2.3] Field: ${fieldName}`);
    this.logger.info(`[v2.3] Box coordinates: ${JSON.stringify(box)}`);

    try {
      // Get card element from the reference box
      if (!this.matchResult || !this.matchResult.selector) {
        throw new Error('No card selector available');
      }

      // Get the first card element
      const cardElement = await this.page.$(this.matchResult.selector);
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      // Get card bounding box to calculate relative coordinates
      const cardBox = await cardElement.boundingBox();
      if (!cardBox) {
        throw new Error('Card has no bounding box');
      }

      // Calculate relative coordinates (field position relative to card)
      const relativeCoords = {
        x: box.x - cardBox.x,
        y: box.y - cardBox.y,
        width: box.width,
        height: box.height
      };

      this.logger.info(`[v2.3] Card at (${cardBox.x}, ${cardBox.y}), field relative coords: ${JSON.stringify(relativeCoords)}`);

      // Get extraction tester and run tests with auto-retry
      const tester = await this.getExtractionTester();
      const testResult = await tester.testFieldWithRetry(fieldName, cardElement, relativeCoords);

      // Format results for UI
      const formattedResults = tester.formatForUI(testResult, fieldName);

      // Prepare response for overlay
      const response = {
        success: true,
        fieldName: fieldName,
        coordinates: relativeCoords,
        results: formattedResults.results,
        failedMethods: formattedResults.failedMethods,
        totalMethodsTested: formattedResults.totalMethodsTested,
        hasGoodResult: formattedResults.hasGoodResult
      };

      this.logger.info(`[v2.3] Extraction test complete: ${testResult.results.length} results, ${testResult.failedMethods.length} failed`);

      // Log top results
      if (testResult.results.length > 0) {
        this.logger.info('[v2.3] Top extraction results:');
        testResult.results.slice(0, 3).forEach((r, i) => {
          this.logger.info(`  ${i+1}. ${r.method}: "${r.value}" (${r.confidence}%)`);
        });
      }
      this.logger.info('========================================');

      // Send results to overlay
      await this.page.evaluate((res) => {
        if (window.handleExtractionResults) {
          window.handleExtractionResults(res);
        }
      }, response);

      return response;

    } catch (error) {
      this.logger.error(`[v2.3] Extraction test failed: ${error.message}`);

      const errorResponse = {
        success: false,
        fieldName: fieldName,
        error: error.message
      };

      await this.page.evaluate((res) => {
        if (window.handleExtractionResults) {
          window.handleExtractionResults(res);
        }
      }, errorResponse);

      return errorResponse;
    }
  }

  /**
   * Handle user confirmation of an extraction result
   * @param {Object} data - { fieldName, selectedResult, coordinates }
   * @returns {Promise<Object>}
   */
  async handleConfirmFieldExtraction(data) {
    const { fieldName, selectedResult, coordinates } = data;

    this.logger.info(`[v2.3] User confirmed ${fieldName}: method=${selectedResult.method}, value="${selectedResult.value}"`);

    // Store the validated selection
    this.v23Selections[fieldName] = {
      userValidatedMethod: selectedResult.method,
      value: selectedResult.value,
      confidence: selectedResult.confidence,
      coordinates: coordinates,
      metadata: selectedResult.metadata
    };

    return {
      success: true,
      fieldName: fieldName,
      stored: true
    };
  }

  /**
   * Generate v2.3 config with user-validated extraction methods
   * @param {Object} selections - Field selections with validated methods
   * @returns {Promise<Object>}
   */
  async handleGenerateV23Config(selections) {
    this.logger.info('[v2.3] Generating config with validated extraction methods...');

    try {
      if (!this.matchResult) {
        throw new Error('No card selection available');
      }

      // Import config schema functions
      const { createConfigV23, validateConfigV23 } = require('./config-schemas');

      // Create base config
      const config = createConfigV23({
        testSite: this.testUrl,
        domain: this.domain,
        name: this.domain.replace(/\./g, '-'),
        cardSelector: this.matchResult.selector,
        sampleDimensions: {
          width: this.matchResult.referenceBox?.width || 0,
          height: this.matchResult.referenceBox?.height || 0
        },
        sampleCoordinates: {
          x: this.matchResult.referenceBox?.x || 0,
          y: this.matchResult.referenceBox?.y || 0
        }
      });

      // Populate field data from validated selections
      for (const [fieldName, fieldData] of Object.entries(selections)) {
        if (config.fields[fieldName]) {
          config.fields[fieldName] = {
            required: config.fields[fieldName].required,
            skipped: !fieldData.value,
            userValidatedMethod: fieldData.userValidatedMethod || fieldData.method,
            coordinates: fieldData.coordinates || { x: 0, y: 0, width: 0, height: 0 },
            selector: fieldData.selector || null,
            sampleValue: fieldData.value,
            confidence: fieldData.confidence || 0,
            extractionOptions: [],  // Could store all tested options here
            failedMethods: []
          };
        }
      }

      // Validate config
      const validation = validateConfigV23(config);

      if (!validation.valid) {
        this.logger.warn(`[v2.3] Config validation errors: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        this.logger.warn(`[v2.3] Config validation warnings: ${validation.warnings.join(', ')}`);
      }

      // Save config
      const configPath = this.configBuilder.saveConfig(config, this.options.outputDir);

      this.logger.info(`[v2.3] Config saved to: ${configPath}`);
      this.logger.info(`[v2.3] Config score: ${validation.score}/100`);

      // Build field details for preview panel
      const fieldsForPreview = {};
      for (const [fieldName, fieldData] of Object.entries(selections || {})) {
        fieldsForPreview[fieldName] = {
          value: fieldData.value,
          found: !!fieldData.value,
          method: fieldData.userValidatedMethod || fieldData.method || 'manual',
          methodLabel: fieldData.methodLabel || this.formatMethodName(fieldData.userValidatedMethod || fieldData.method),
          confidence: fieldData.confidence || 85
        };
      }

      // Add missing fields as not found
      const allFields = ['name', 'email', 'phone', 'profileUrl', 'title', 'location'];
      allFields.forEach(fieldName => {
        if (!fieldsForPreview[fieldName]) {
          fieldsForPreview[fieldName] = {
            value: null,
            found: false
          };
        }
      });

      // Send result to overlay with additional data for preview
      const result = {
        success: true,
        configPath: configPath,
        configName: config.name,
        configVersion: config.version,
        validation: validation,
        config: config,  // Include actual config for preview
        fields: fieldsForPreview,  // Field details for preview panel
        score: validation.score || 80
      };

      await this.page.evaluate((res) => {
        if (window.handleConfigComplete) {
          window.handleConfigComplete(res);
        }
      }, result);

      // Store session result but DO NOT resolve yet - wait for user confirmation in preview panel
      this.sessionResult = {
        success: true,
        configPath: configPath,
        config: config,
        validation: validation
      };

      this.logger.info('[v2.3] Config generated and saved, waiting for user confirmation in preview panel');
      this.logger.info('[v2.3] Browser will remain open until user clicks "Save & Close"');

      // NOTE: Do NOT cleanup extraction tester here - do it in handleFinalSaveAndClose

      return result;

    } catch (error) {
      this.logger.error(`[v2.3] Config generation failed: ${error.message}`);

      await this.page.evaluate((err) => {
        if (window.handleConfigComplete) {
          window.handleConfigComplete({ success: false, error: err });
        }
      }, error.message);

      return { success: false, error: error.message };
    }
  }

  /**
   * Handle final save and close from preview panel
   * This is called when user clicks "Save & Close" in the preview
   * @returns {Promise<Object>}
   */
  async handleFinalSaveAndClose() {
    this.logger.info('========================================');
    this.logger.info('[v2.3] FINALIZING SESSION AFTER USER CONFIRMATION');
    this.logger.info('========================================');

    try {
      // Config was already saved during generation
      // Just mark session as complete and close

      this.sessionComplete = true;

      this.logger.info('[v2.3] Session marked as complete');
      this.logger.info('[v2.3] Config path:', this.sessionResult?.configPath);
      this.logger.info('[v2.3] Scraping result:', this.sessionResult?.scrapingResult ? 'present' : 'none');

      // Cleanup extraction tester if present
      if (this.extractionTester) {
        this.logger.info('[v2.3] Cleaning up extraction tester...');
        await this.extractionTester.terminate();
        this.extractionTester = null;
      }

      // Cleanup Selenium manager if present
      if (this.seleniumManager) {
        this.logger.info('[v2.3] Cleaning up Selenium browser...');
        await this.seleniumManager.close();
        this.seleniumManager = null;
      }

      // Resolve session to close browser
      // This will return control to config-generator.js which calls browserManager.close()
      if (this.resolveSession) {
        this.logger.info('[v2.3] Resolving session promise - control returns to config-generator.js');
        this.resolveSession(this.sessionResult);
      } else {
        this.logger.warn('[v2.3] No resolveSession function available - session may not close properly');
      }

      this.logger.info('========================================');
      this.logger.info('[v2.3] SESSION FINALIZED SUCCESSFULLY');
      this.logger.info('========================================');

      return {
        success: true,
        message: 'Session completed successfully',
        configPath: this.sessionResult?.configPath
      };

    } catch (error) {
      this.logger.error(`[v2.3] Final save error: ${error.message}`);
      this.logger.error(`[v2.3] Error stack: ${error.stack}`);

      // Still try to resolve session even on error
      if (this.resolveSession) {
        this.logger.info('[v2.3] Resolving session despite error');
        this.resolveSession({ success: false, error: error.message });
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  // ===========================
  // Validation Handler
  // ===========================

  /**
   * Handle validation request from UI
   * Tests the generated config by scraping and enriching a few contacts
   * @returns {Promise<Object>} - Validation results
   */
  async handleValidateData() {
    this.logger.info('========================================');
    this.logger.info('[Validation] STARTING CONFIG VALIDATION');
    this.logger.info('========================================');

    const VALIDATION_LIMIT = 5;  // Test with 5 contacts

    try {
      // Check if we have a saved config
      if (!this.sessionResult?.config && !this.sessionResult?.configPath) {
        throw new Error('No config available. Please generate config first.');
      }

      // Load config from file or use session result
      let config = this.sessionResult?.config;
      if (!config && this.sessionResult?.configPath) {
        const configContent = fs.readFileSync(this.sessionResult.configPath, 'utf8');
        config = JSON.parse(configContent);
      }

      this.logger.info(`[Validation] Using config: ${config.name || this.domain}`);
      this.logger.info(`[Validation] Testing with ${VALIDATION_LIMIT} contacts`);

      // Determine scraper type based on config's pagination type (not config version)
      // This ensures validation uses the SAME scraper type that production will use
      const paginationType = config.pagination?.paginationType || 'single-page';
      const isInfiniteScroll = paginationType === 'infinite-scroll';
      const isPagination = paginationType === 'pagination' || paginationType === 'parameter';

      this.logger.info(`[Validation] Pagination type from config: ${paginationType}`);
      this.logger.info(`[Validation] Scraper type: ${isInfiniteScroll ? 'infinite-scroll (Selenium)' : isPagination ? 'pagination (Puppeteer)' : 'single-page (Puppeteer)'}`);

      // Step 1: Scrape contacts using the SAME scraper type that production will use
      let scrapedContacts = [];
      const RateLimiter = require('../../core/rate-limiter');
      const rateLimiter = new RateLimiter(this.logger, { minDelay: 1000, maxDelay: 2000 });

      if (isInfiniteScroll) {
        // Use Selenium for infinite scroll pages
        const seleniumManager = new SeleniumManager(this.logger);
        await seleniumManager.launch(true); // headless

        const { InfiniteScrollScraper } = require('../../scrapers/config-scrapers');
        const scraper = new InfiniteScrollScraper(seleniumManager, rateLimiter, this.logger, {
          scrollDelay: 400,
          maxRetries: 10,
          maxScrolls: 20
        });

        scraper.config = config;
        scraper.initializeCardSelector();

        this.logger.info('[Validation] Scraping with InfiniteScrollScraper...');
        const scrapeResult = await scraper.scrape(this.testUrl, VALIDATION_LIMIT);
        scrapedContacts = scrapeResult.contacts || scrapeResult || [];

        await seleniumManager.close();
      } else if (isPagination) {
        // Use PaginationScraper for paginated pages (matches production behavior)
        // IMPORTANT: Use skipNavigation=true to preserve overlay UI
        const { PaginationScraper } = require('../../scrapers/config-scrapers');
        const scraper = new PaginationScraper(this.browserManager, rateLimiter, this.logger, this.configLoader, {
          maxPages: 1,  // Only scrape first page for validation
          pageDelay: 2000
        });

        scraper.config = config;
        scraper.initializeCardSelector();

        this.logger.info('[Validation] Scraping with PaginationScraper (skipNavigation=true)...');
        const scrapeResult = await scraper.scrape(this.testUrl, VALIDATION_LIMIT, { skipNavigation: true });
        scrapedContacts = scrapeResult.contacts || scrapeResult || [];
      } else {
        // Use SinglePageScraper for single-page sites (v2.3)
        // IMPORTANT: Use skipNavigation=true to preserve overlay UI
        const { SinglePageScraper } = require('../../scrapers/config-scrapers');
        const scraper = new SinglePageScraper(this.browserManager, rateLimiter, this.logger, {});

        // Load config into scraper
        scraper.config = config;
        scraper.initializeCardSelector();

        this.logger.info('[Validation] Scraping with SinglePageScraper (skipNavigation=true)...');
        const result = await scraper.scrape(this.testUrl, VALIDATION_LIMIT, { skipNavigation: true });
        scrapedContacts = Array.isArray(result) ? result : (result.contacts || []);
      }

      // Ensure we have an array
      if (!Array.isArray(scrapedContacts)) {
        scrapedContacts = scrapedContacts?.contacts || [];
      }

      this.logger.info(`[Validation] Scraped ${scrapedContacts.length} contacts`);

      // Step 2: Enrich contacts with profile URLs
      const contactsWithProfiles = scrapedContacts.filter(c => c.profileUrl);
      this.logger.info(`[Validation] ${contactsWithProfiles.length} contacts have profile URLs`);

      let enrichedContacts = [];
      if (contactsWithProfiles.length > 0) {
        const BrowserManager = require('../../core/browser-manager');
        const RateLimiter = require('../../core/rate-limiter');
        const ProfileEnricher = require('../../features/enrichment/profile-enricher');

        const enrichBrowser = new BrowserManager(this.logger);
        await enrichBrowser.launch(true); // headless

        const enrichRateLimiter = new RateLimiter(this.logger, { minDelay: 2000, maxDelay: 3000 });
        const enricher = new ProfileEnricher(enrichBrowser, enrichRateLimiter, this.logger);

        this.logger.info('[Validation] Enriching contacts...');
        const enrichResult = await enricher.enrichContacts(contactsWithProfiles, {
          delay: 2000,
          headless: true,
          onlyCoreFields: true,
          skipErrors: true,
          limit: VALIDATION_LIMIT
        });

        enrichedContacts = enrichResult.contacts || enrichResult || [];
        await enrichBrowser.close();

        this.logger.info(`[Validation] Enriched ${enrichedContacts.length} contacts`);
      }

      // Step 3: Build validation results
      const results = {
        contactsTested: scrapedContacts.length,
        withEmail: scrapedContacts.filter(c => c.email).length,
        withPhone: scrapedContacts.filter(c => c.phone).length,
        withProfileUrl: contactsWithProfiles.length,
        enriched: enrichedContacts.length,
        contacts: [],
        passed: true,
        hasErrors: false,
        recommendation: ''
      };

      // Build contact comparison data
      for (let i = 0; i < Math.min(scrapedContacts.length, 5); i++) {
        const scraped = scrapedContacts[i];
        const enriched = enrichedContacts.find(e =>
          e.profileUrl === scraped.profileUrl ||
          (e.email && e.email === scraped.email) ||
          (e.phone && e.phone === scraped.phone)
        );

        const contactData = {
          name: scraped.name || enriched?.name || 'Unknown',
          fields: {}
        };

        // Compare each field
        const fields = ['name', 'email', 'phone', 'title', 'location', 'profileUrl'];
        for (const field of fields) {
          const scrapedValue = scraped[field] || null;
          const enrichedValue = enriched ? enriched[field] : null;
          let action = 'UNCHANGED';

          if (enriched?.enrichment?.actions?.[field]) {
            action = enriched.enrichment.actions[field];
          } else if (!scrapedValue && enrichedValue) {
            action = 'ENRICHED';
          } else if (scrapedValue && enrichedValue && scrapedValue !== enrichedValue) {
            action = 'UPDATED';
          }

          contactData.fields[field] = {
            scraped: scrapedValue,
            enriched: enrichedValue,
            action: action
          };
        }

        results.contacts.push(contactData);
      }

      // Generate recommendation
      const emailRate = results.contactsTested > 0
        ? Math.round((results.withEmail / results.contactsTested) * 100)
        : 0;
      const profileRate = results.contactsTested > 0
        ? Math.round((results.withProfileUrl / results.contactsTested) * 100)
        : 0;

      if (results.contactsTested === 0) {
        results.passed = false;
        results.hasErrors = true;
        results.recommendation = 'No contacts were scraped. Please check your config and try again.';
      } else if (results.withEmail === 0 && results.enriched > 0) {
        results.passed = true;
        results.recommendation = `Config is working. Emails not on listing page but ${results.enriched} contacts successfully enriched from profile pages. Ready for full scrape.`;
      } else if (emailRate >= 80) {
        results.passed = true;
        results.recommendation = `Excellent! ${emailRate}% of contacts have email addresses. Config is ready for full scrape.`;
      } else if (emailRate >= 50) {
        results.passed = true;
        results.recommendation = `Good. ${emailRate}% have emails, ${profileRate}% have profile URLs for enrichment. Ready for full scrape.`;
      } else if (profileRate >= 80) {
        results.passed = true;
        results.recommendation = `${profileRate}% of contacts have profile URLs. Enrichment should fill missing data. Ready for full scrape.`;
      } else {
        results.passed = false;
        results.recommendation = `Low extraction rates (${emailRate}% email, ${profileRate}% profile URLs). Consider adjusting config selectors.`;
      }

      this.logger.info(`[Validation] Result: ${results.passed ? 'PASSED' : 'ISSUES'}`);
      this.logger.info(`[Validation] ${results.recommendation}`);
      this.logger.info('========================================');

      return {
        success: true,
        data: results
      };

    } catch (error) {
      this.logger.error(`[Validation] Error: ${error.message}`);
      this.logger.error(`[Validation] Stack: ${error.stack}`);

      return {
        success: false,
        error: error.message
      };
    }
  }

  // ===========================
  // Diagnosis & Scraping Handlers
  // ===========================

  /**
   * Handle pagination diagnosis request
   * Analyzes the page to determine pagination type
   * @returns {Promise<Object>}
   */
  async handleDiagnosePagination() {
    this.logger.info('========================================');
    this.logger.info('[Diagnosis] STARTING PAGINATION ANALYSIS');
    this.logger.info('========================================');

    try {
      // Get card selector from session result (config)
      const cardSelector = this.sessionResult?.config?.cardPattern?.primarySelector ||
                          this.sessionResult?.config?.cardPattern?.selector ||
                          this.captureData?.selector;

      if (!cardSelector) {
        throw new Error('No card selector available for diagnosis');
      }

      this.logger.info(`[Diagnosis] Using card selector: ${cardSelector}`);

      // Count initial cards
      const initialCards = await this.page.$$(cardSelector);
      const initialCount = initialCards.length;
      this.logger.info(`[Diagnosis] Initial cards: ${initialCount}`);

      // Check for pagination controls
      const paginationControls = await this.page.evaluate(() => {
        const selectors = {
          numeric: ['.pagination', '[class*="pagination"]', '.pager', '[class*="pager"]'],
          nextButton: ['a[rel="next"]', '[class*="next"]', 'button[aria-label*="next" i]'],
          loadMore: ['[class*="load-more"]', 'button[class*="more"]', '[data-load-more]'],
          infiniteScroll: ['[data-infinite-scroll]', '[class*="infinite"]', '[class*="lazy-load"]']
        };

        const results = {};
        for (const [type, sels] of Object.entries(selectors)) {
          for (const sel of sels) {
            try {
              const el = document.querySelector(sel);
              if (el) {
                results[type] = { found: true, selector: sel };
                break;
              }
            } catch (e) {}
          }
          if (!results[type]) results[type] = { found: false };
        }
        return results;
      });

      this.logger.info(`[Diagnosis] Controls detected: ${JSON.stringify(paginationControls)}`);

      // Determine type
      let detectedType = 'single-page';
      let confidence = 'high';
      const details = { cardCounts: { initial: initialCount } };

      if (paginationControls.numeric?.found || paginationControls.nextButton?.found) {
        detectedType = 'pagination';
        details.controlsFound = paginationControls;
        this.logger.info('[Diagnosis] Detected traditional pagination controls');
      } else if (paginationControls.infiniteScroll?.found || paginationControls.loadMore?.found) {
        detectedType = 'infinite-scroll';
        details.controlsFound = paginationControls;
        this.logger.info('[Diagnosis] Detected infinite scroll indicators');
      } else {
        // Test scroll behavior
        this.logger.info('[Diagnosis] Testing scroll behavior...');
        const scrollY = await this.page.evaluate(() => window.scrollY);
        await this.page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
        await this.sleep(2000);

        const afterScrollCards = await this.page.$$(cardSelector);
        const afterScrollCount = afterScrollCards.length;

        details.cardCounts.afterScroll = afterScrollCount;
        details.scrollsPerformed = 1;

        if (afterScrollCount > initialCount) {
          detectedType = 'infinite-scroll';
          confidence = 'medium';
          details.note = 'Detected via scroll test';
          this.logger.info(`[Diagnosis] Scroll test: ${initialCount} -> ${afterScrollCount} cards (infinite scroll detected)`);
        }

        // Scroll back
        await this.page.evaluate((y) => window.scrollTo(0, y), scrollY);
      }

      const diagnosis = {
        success: true,
        type: detectedType,
        confidence: confidence,
        cardSelector: cardSelector,
        ...details
      };

      this.logger.info(`[Diagnosis] Result: ${detectedType} (${confidence})`);
      this.logger.info('========================================');

      // Send result to frontend
      await this.page.evaluate((res) => {
        if (window.handleDiagnosisComplete) {
          window.handleDiagnosisComplete(res);
        }
      }, diagnosis);

      return diagnosis;

    } catch (error) {
      this.logger.error(`[Diagnosis] Error: ${error.message}`);

      const errorResult = { success: false, error: error.message };

      await this.page.evaluate((res) => {
        if (window.handleDiagnosisComplete) {
          window.handleDiagnosisComplete(res);
        }
      }, errorResult);

      return errorResult;
    }
  }

  /**
   * Handle start scraping request
   * Creates appropriate scraper and starts extraction
   * @param {Object} scrapingConfig - Scraping configuration
   * @returns {Promise<Object>}
   */
  async handleStartScraping(scrapingConfig) {
    this.logger.info('');
    this.logger.info('========================================');
    this.logger.info('[Scraping] STARTING SCRAPING PROCESS');
    this.logger.info('========================================');
    this.logger.info(`[Scraping] Config received:`, JSON.stringify(scrapingConfig, null, 2));
    this.logger.info(`[Scraping] Pagination type: ${scrapingConfig.paginationType}`);
    this.logger.info(`[Scraping] Limit: ${scrapingConfig.limit || 'unlimited'}`);
    this.logger.info(`[Scraping] Config name: ${scrapingConfig.configName}`);
    this.logger.info(`[Scraping] Config path: ${scrapingConfig.configPath}`);

    try {
      // Step 1: Load the config from file or session
      let config = null;

      // First try to use session config (already in memory)
      if (this.sessionResult?.config) {
        config = this.sessionResult.config;
        this.logger.info('[Scraping] Using config from session memory');
      }
      // If config path provided, try loading from file
      else if (scrapingConfig.configPath) {
        this.logger.info(`[Scraping] Loading config from path: ${scrapingConfig.configPath}`);
        const fs = require('fs');
        if (fs.existsSync(scrapingConfig.configPath)) {
          const content = fs.readFileSync(scrapingConfig.configPath, 'utf8');
          config = JSON.parse(content);
          this.logger.info('[Scraping] Config loaded from file successfully');
        }
      }

      // Validate config was loaded
      if (!config) {
        throw new Error('No config available for scraping. Config name: ' + scrapingConfig.configName);
      }

      // Validate config has required fields
      // v2.3 configs have fields at top level, NOT nested under fieldExtraction
      if (!config.fields) {
        this.logger.error('[Scraping] Config structure:', JSON.stringify(Object.keys(config), null, 2));
        throw new Error('Config missing fields - config may be invalid format');
      }

      if (!config.cardPattern || !config.cardPattern.primarySelector) {
        throw new Error('Config missing cardPattern.primarySelector');
      }

      this.logger.info('[Scraping] Config validation passed');
      this.logger.info(`[Scraping] Config name: ${config.name}`);
      this.logger.info(`[Scraping] Config version: ${config.version}`);
      this.logger.info(`[Scraping] Config domain: ${config.domain}`);
      this.logger.info(`[Scraping] Available fields: ${Object.keys(config.fields).join(', ')}`);
      this.logger.info(`[Scraping] Card selector: ${config.cardPattern.primarySelector}`);

      // Step 2: Import config scrapers and create scraper with config
      const { createScraper } = require('../../scrapers/config-scrapers');

      // Step 2a: Initialize SeleniumManager for infinite-scroll pages
      const paginationType = scrapingConfig.paginationType;
      if (paginationType === 'infinite-scroll') {
        this.logger.info('[Scraping] Infinite scroll detected - initializing SeleniumManager');

        if (!this.seleniumManager) {
          this.seleniumManager = new SeleniumManager(this.logger);
          await this.seleniumManager.launch(false); // headless = false to match config generator
          this.logger.info('[Scraping] SeleniumManager initialized successfully');
        }
        // Note: Selenium navigation happens inside InfiniteScrollScraper.scrape()
      }

      // Create appropriate scraper - pass config directly
      this.logger.info('[Scraping] Creating scraper...');
      const scraper = createScraper(
        paginationType,
        this.browserManager,
        this.rateLimiter,
        this.logger,
        this.configLoader,
        {
          maxScrolls: 1000,
          maxPages: 200,
          scrollDelay: 400,
          maxRetries: 25,
          pageDelay: 2000
        },
        this.seleniumManager,  // Pass seleniumManager for infinite-scroll
        config
      );

      // Set config directly on scraper
      scraper.config = config;
      scraper.initializeCardSelector();
      this.logger.info('[Scraping] Scraper created and configured');

      // Set output path for scrape results - ALWAYS use 'output/' directory
      // (this.options.outputDir is for config files, not scrape results)
      scraper.setOutputPath('output');

      // Note: The real scraper.scrape() will:
      // 1. Navigate to the URL (page is already there, but this ensures proper state)
      // 2. Initialize extractors
      // 3. Handle scrolling/pagination with proper waits and retries
      // 4. Extract contacts with field statistics
      // 5. Generate terminal summary
      // 6. Write output file

      // Start scraping - delegate to real scraper which handles:
      // - Scroll logic with retries
      // - Dynamic content wait
      // - Progress reporting
      // - Field extraction with proper coordinates
      // - Output file generation
      const url = this.page.url();
      this.logger.info(`[Scraping] Delegating to ${scrapingConfig.paginationType} scraper...`);
      this.logger.info(`[Scraping] URL: ${url}`);
      this.logger.info(`[Scraping] Limit: ${scrapingConfig.limit || 'unlimited'}`);

      // The real scrapers (infinite-scroll-scraper, single-page-scraper, pagination-scraper)
      // already have comprehensive logic for scrolling, waiting, retry, and extraction
      const result = await scraper.scrape(url, scrapingConfig.limit || 0);

      this.logger.info(`[Scraping] Completed. Total contacts: ${result.totalContacts}`);
      this.logger.info(`[Scraping] Output: ${result.outputPath}`);

      // Check if overlay still exists, re-inject if missing
      const overlayExists = await this.page.evaluate(() => {
        return !!document.querySelector('#config-generator-overlay-root');
      });

      if (!overlayExists) {
        this.logger.info('[Scraping] Overlay UI was removed during scraping - re-injecting...');
        await this.injectOverlay();
        this.logger.info('[Scraping] Overlay UI re-injected. Click "Save & Close" to proceed to enrichment.');
      } else {
        this.logger.info('[Scraping] Overlay UI is still present.');
      }

      // Send result to frontend
      await this.page.evaluate((res) => {
        if (window.handleScrapingComplete) {
          window.handleScrapingComplete(res);
        }
      }, result);

      // Store scraping result but DON'T resolve session yet
      // Session should only end when user clicks "Save & Close"
      this.sessionResult = {
        ...this.sessionResult,
        scrapingResult: result
      };

      // NOTE: Do NOT call resolveSession() here!
      // The browser should stay open until user explicitly clicks "Save & Close"
      // which triggers handleFinalSaveAndClose()

      this.logger.info('[Scraping] Scraping complete. Browser will remain open until user clicks "Save & Close"');

      return result;

    } catch (error) {
      this.logger.error(`[Scraping] Error: ${error.message}`);
      this.logger.error(`[Scraping] Stack: ${error.stack}`);

      const errorResult = { success: false, error: error.message };

      await this.page.evaluate((res) => {
        if (window.handleScrapingComplete) {
          window.handleScrapingComplete(res);
        }
      }, errorResult);

      return errorResult;
    }
  }

  // NOTE: Stub methods scrapeSinglePage(), scrapeInfiniteScroll(), and scrapePagination()
  // have been removed. Scraping is now delegated to the real scrapers in
  // src/scrapers/config-scrapers/ which have comprehensive logic for:
  // - Infinite scroll: retry logic, dynamic content wait, proper card identification
  // - Single page: full card extraction with field tracking
  // - Pagination: multi-page navigation with URL generation
  // See handleStartScraping() which calls scraper.scrape(url, limit) directly.
}

module.exports = InteractiveSession;

// Graceful shutdown handlers for cleanup
let activeSession = null;

// Track active session for cleanup
InteractiveSession.setActiveSession = function(session) {
  activeSession = session;
};

InteractiveSession.clearActiveSession = function() {
  activeSession = null;
};

// Cleanup function
async function cleanupResources() {
  if (activeSession) {
    // Cleanup extraction tester
    if (activeSession.extractionTester) {
      try {
        console.log('[InteractiveSession] Cleaning up extraction tester...');
        await activeSession.extractionTester.terminate();
      } catch (error) {
        console.error('[InteractiveSession] Error cleaning up extraction tester:', error.message);
      }
    }

    // Cleanup Selenium manager
    if (activeSession.seleniumManager) {
      try {
        console.log('[InteractiveSession] Cleaning up Selenium browser...');
        await activeSession.seleniumManager.close();
      } catch (error) {
        console.error('[InteractiveSession] Error cleaning up Selenium:', error.message);
      }
    }
  }
}

// Handle process signals for graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[InteractiveSession] Received SIGINT, cleaning up...');
  await cleanupResources();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[InteractiveSession] Received SIGTERM, cleaning up...');
  await cleanupResources();
  process.exit(0);
});

process.on('uncaughtException', async (error) => {
  console.error('[InteractiveSession] Uncaught exception:', error.message);
  await cleanupResources();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('[InteractiveSession] Unhandled rejection:', reason);
  await cleanupResources();
  process.exit(1);
});

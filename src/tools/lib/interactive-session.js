/**
 * Interactive Session
 *
 * Core workflow orchestrator for the config generator.
 * Manages browser page lifecycle, injects overlay UI, and coordinates
 * the element selection workflow.
 */

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const SelectorGenerator = require('./selector-generator');
const ElementAnalyzer = require('./element-analyzer');
const ConfigBuilder = require('./config-builder');
const ConfigValidator = require('./config-validator');

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

    // Helper modules
    this.selectorGenerator = new SelectorGenerator(logger);
    this.elementAnalyzer = new ElementAnalyzer(logger);
    this.configBuilder = new ConfigBuilder(logger, { outputDir: options.outputDir || 'configs' });
    this.configValidator = new ConfigValidator(logger);

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

    // Handle click report from overlay
    await this.page.exposeFunction('__configGen_reportClick', async (clickData) => {
      this.logger.info(`Click reported: type=${clickData.type}, pos=(${clickData.x}, ${clickData.y})`);
      // Analyze element at click position
      const elementInfo = await this.elementAnalyzer.analyzeElement(this.page, clickData);
      if (elementInfo) {
        return await this.handleElementSelected(elementInfo);
      }
      return { success: false, error: 'No element found at click position' };
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
   * Handle element selection from overlay
   * @param {Object} elementData - Data about selected element
   */
  async handleElementSelected(elementData) {
    this.logger.info(`Element selected in step: ${this.currentStep}`);

    try {
      switch (this.currentStep) {
        case 'card':
          return await this.processCardSelection(elementData);

        case 'name':
          return await this.processFieldSelection('name', elementData);

        case 'email':
          return await this.processFieldSelection('email', elementData);

        case 'phone':
          return await this.processFieldSelection('phone', elementData);

        default:
          return { success: false, error: 'Invalid step' };
      }
    } catch (error) {
      this.logger.error(`Error processing selection: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process card container selection
   * @param {Object} elementData - Element data from browser
   */
  async processCardSelection(elementData) {
    this.logger.info('Processing card selection...');

    // Generate selector candidates
    const selectorResult = await this.selectorGenerator.generateSelectors(this.page, elementData);

    // Handle both object format {best, alternatives, all} and array format
    const candidates = selectorResult?.all || selectorResult || [];

    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
      return {
        success: false,
        error: 'Could not generate selectors for this element. Try a different element.'
      };
    }

    // Test each candidate to find best match
    let bestSelector = null;
    let bestCount = 0;

    for (const candidate of candidates) {
      if (!candidate || !candidate.selector) continue;

      const count = await this.page.evaluate((sel) => {
        try {
          return document.querySelectorAll(sel).length;
        } catch (e) {
          return 0;
        }
      }, candidate.selector);

      this.logger.debug(`Selector "${candidate.selector}" matches ${count} elements`);

      // Prefer selectors that match 10-100 elements
      if (count >= 10 && count <= 100) {
        bestSelector = candidate.selector;
        bestCount = count;
        break;
      }

      // Fallback: take highest count in reasonable range
      if (count > bestCount && count >= 5 && count <= 200) {
        bestSelector = candidate.selector;
        bestCount = count;
      }
    }

    if (!bestSelector && candidates.length > 0 && candidates[0]?.selector) {
      // Try first candidate anyway
      bestSelector = candidates[0].selector;
      bestCount = await this.page.evaluate((sel) => {
        try {
          return document.querySelectorAll(sel).length;
        } catch (e) {
          return 0;
        }
      }, bestSelector);
    }

    if (bestCount < 2) {
      return {
        success: false,
        error: `Only ${bestCount} card(s) found. Please click on a repeating card element.`
      };
    }

    // Get all cards and check structural similarity
    const cards = await this.page.evaluate((selector) => {
      return Array.from(document.querySelectorAll(selector)).map(el => ({
        tagName: el.tagName,
        childCount: el.children.length,
        hasLinks: el.querySelectorAll('a').length > 0,
        textLength: el.textContent.length
      }));
    }, bestSelector);

    const similarity = this.elementAnalyzer.calculateSimilarity(cards);

    if (similarity < 0.7) {
      this.logger.warn(`Low structural similarity: ${(similarity * 100).toFixed(1)}%`);
    }

    // Store selection
    this.selections.cardSelector = bestSelector;

    // Highlight all matching cards
    await this.page.evaluate((sel) => {
      if (window.OverlayController) {
        window.OverlayController.highlightElements(sel, 'card');
      }
    }, bestSelector);

    this.logger.info(`Card selector: "${bestSelector}" (${bestCount} cards, ${(similarity * 100).toFixed(1)}% similar)`);

    return {
      success: true,
      selector: bestSelector,
      cardCount: bestCount,
      similarity: similarity,
      nextStep: 'name',
      message: `Found ${bestCount} cards. Now click on a NAME field within any card.`
    };
  }

  /**
   * Process field selection (name, email, phone)
   * @param {string} fieldType - Type of field
   * @param {Object} elementData - Element data from browser
   */
  async processFieldSelection(fieldType, elementData) {
    this.logger.info(`Processing ${fieldType} field selection...`);

    if (!this.selections.cardSelector) {
      return { success: false, error: 'Card selector not set. Please select a card first.' };
    }

    // Generate scoped selector (relative to card)
    const scopedSelector = await this.selectorGenerator.generateScopedSelector(
      this.page,
      elementData,
      this.selections.cardSelector
    );

    if (!scopedSelector) {
      return {
        success: false,
        error: `Could not generate selector for ${fieldType}. Try a different element.`
      };
    }

    // Detect which attribute contains the data
    const attribute = this.elementAnalyzer.detectAttribute(elementData, fieldType);

    // Extract from all cards
    const extractedValues = await this.page.evaluate((cardSel, fieldSel, attr) => {
      const cards = Array.from(document.querySelectorAll(cardSel));
      return cards.map(card => {
        const field = card.querySelector(fieldSel);
        if (!field) return null;

        if (attr === 'textContent') return field.textContent.trim();
        if (attr === 'href') return field.getAttribute('href');
        return field.getAttribute(attr) || field.textContent.trim();
      });
    }, this.selections.cardSelector, scopedSelector, attribute);

    // Validate using existing contact-extractor
    const validation = this.validateField(fieldType, extractedValues);

    if (validation.coverage < 0.5 && fieldType !== 'phone') {
      this.logger.warn(`Low ${fieldType} coverage: ${(validation.coverage * 100).toFixed(1)}%`);
    }

    // Store selection
    this.selections[`${fieldType}Marker`] = {
      selector: scopedSelector,
      attribute: attribute,
      coverage: validation.coverage,
      validCount: validation.validCount,
      totalCount: validation.totalCount,
      samples: validation.samples
    };

    // Highlight fields
    await this.page.evaluate((cardSel, fieldSel) => {
      if (window.OverlayController) {
        window.OverlayController.highlightFieldsInCards(cardSel, fieldSel, 'field');
      }
    }, this.selections.cardSelector, scopedSelector);

    // Determine next step
    let nextStep = null;
    let message = '';

    if (fieldType === 'name') {
      nextStep = 'email';
      message = `Found ${validation.validCount} names. Now click on an EMAIL field.`;
    } else if (fieldType === 'email') {
      nextStep = 'phone';
      message = `Found ${validation.validCount} emails. Now click on a PHONE field (or skip).`;
    } else if (fieldType === 'phone') {
      nextStep = 'pagination';
      message = `Found ${validation.validCount} phones. Detecting pagination...`;
    }

    this.logger.info(`${fieldType} selector: "${scopedSelector}" (${validation.validCount}/${validation.totalCount} valid)`);

    return {
      success: true,
      fieldType: fieldType,
      selector: scopedSelector,
      attribute: attribute,
      coverage: validation.coverage,
      validCount: validation.validCount,
      totalCount: validation.totalCount,
      samples: validation.samples,
      nextStep: nextStep,
      message: message
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

    // Import ScrollDetector for robust content load detection
    const { ScrollDetector } = require('../../features/infinite-scroll');

    const containerSelector = this.selections.cardSelector;

    // Get initial state
    const initialCardCount = await this.page.$$eval(containerSelector, els => els.length)
      .catch(() => 0);
    const initialHeight = await this.page.evaluate(() => document.body.scrollHeight);

    this.logger.info(`Initial: ${initialCardCount} cards, ${initialHeight}px height`);

    // Initialize scroll detector with conservative settings
    const scrollDetector = new ScrollDetector(this.page, this.logger, {
      scrollDelay: 2000,
      networkIdleTimeout: 5000
    });

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

      // Wait for content to load using ScrollDetector
      await scrollDetector.waitForContentLoad({ previousHeight: beforeHeight });

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

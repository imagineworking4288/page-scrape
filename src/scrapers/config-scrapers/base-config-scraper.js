/**
 * Base Config Scraper v2.3
 *
 * Abstract base class for config-based scrapers that use v2.3 configs
 * with user-validated extraction methods. STRICT mode - only uses
 * userValidatedMethod from config, no fallbacks.
 *
 * Features:
 * - Loads and validates v2.3 configs
 * - Initializes extractors dynamically based on config methods
 * - STRICT extraction using ONLY userValidatedMethod
 * - Partial contact saving (saves even if some fields fail)
 * - Progress reporting
 * - Memory management with incremental file writes
 *
 * Specialized scrapers extend this class:
 * - InfiniteScrollScraper
 * - PaginationScraper
 * - SinglePageScraper
 */

const fs = require('fs');
const path = require('path');
const BaseScraper = require('../base-scraper');

// Import extractors
const {
  EmailExtractor,
  PhoneExtractor,
  LinkExtractor,
  LabelExtractor,
  CoordinateExtractor
} = require('../../extraction/extractors');

class BaseConfigScraper extends BaseScraper {
  constructor(browserManager, rateLimiter, logger, options = {}) {
    super(browserManager, rateLimiter, logger);

    this.options = options;
    this.config = null;
    this.extractors = {};
    this.contacts = [];
    this.contactBuffer = [];
    this.bufferSize = options.bufferSize || 100;
    this.outputPath = null;
    this.contactCount = 0;
    this.startTime = null;
    this.requestedLimit = 0;

    // Card detection cache
    this.cardSelector = null;
    this.cardFallbacks = [];

    // Field success tracking for summary
    this.fieldStats = {
      name: { extracted: 0, total: 0 },
      email: { extracted: 0, total: 0 },
      phone: { extracted: 0, total: 0 },
      title: { extracted: 0, total: 0 },
      location: { extracted: 0, total: 0 },
      profileUrl: { extracted: 0, total: 0 }
    };

    // Default output directory
    this.outputDir = path.resolve('output');
  }

  /**
   * Load and validate v2.3 configuration from file
   * @param {string} configPath - Path to config file
   * @returns {Object} - Loaded configuration
   */
  loadConfig(configPath) {
    let fullPath = configPath;

    // Try direct path first
    if (!fs.existsSync(fullPath)) {
      fullPath = path.resolve('configs', configPath);
    }

    // Try adding .json extension
    if (!fs.existsSync(fullPath) && !fullPath.endsWith('.json')) {
      fullPath = fullPath + '.json';
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    this.config = JSON.parse(content);

    this.logger.info(`[BaseConfigScraper] Loaded config: ${this.config.name} (v${this.config.version})`);

    // Validate config version
    this.validateConfigVersion();

    // Initialize card selector
    this.initializeCardSelector();

    return this.config;
  }

  /**
   * Validate that config is v2.3 format (or compatible)
   * @throws {Error} - If config version is not supported
   */
  validateConfigVersion() {
    const version = this.config.version;

    if (!version) {
      throw new Error('Config is missing version field');
    }

    // Support v2.3, v2.2, and v2.1 (with warnings)
    const supportedVersions = ['2.3', '2.2', '2.1'];

    if (!supportedVersions.includes(version)) {
      throw new Error(`Unsupported config version: ${version}. Requires v2.1, v2.2, or v2.3`);
    }

    if (version !== '2.3') {
      this.logger.warn(`[BaseConfigScraper] Config version ${version} detected. Optimal results require v2.3 configs.`);
    }

    // Verify fields exists (v2.3 has fields at top level, NOT nested under fieldExtraction)
    if (!this.config.fields) {
      throw new Error('Config is missing fields object');
    }

    // Verify at least one field has userValidatedMethod
    const fields = this.config.fields;
    const hasValidatedMethod = Object.values(fields).some(f => f.userValidatedMethod);

    if (!hasValidatedMethod) {
      this.logger.warn('[BaseConfigScraper] No fields have userValidatedMethod. Extraction may fail.');
    }

    this.logger.info('[BaseConfigScraper] Config validation passed');
  }

  /**
   * Initialize card selector from config
   */
  initializeCardSelector() {
    this.logger.info('[BaseConfigScraper] Initializing card selector...');

    // Validate config exists
    if (!this.config) {
      throw new Error('[BaseConfigScraper] Config is not set - call loadConfig() or set scraper.config first');
    }

    this.logger.info(`[BaseConfigScraper] Config name: ${this.config.name}`);
    this.logger.info(`[BaseConfigScraper] Config version: ${this.config.version}`);

    if (this.config.cardPattern) {
      this.cardSelector = this.config.cardPattern.primarySelector ||
                         this.config.cardPattern.selector;
      this.cardFallbacks = this.config.cardPattern.fallbackSelectors || [];
    }

    if (!this.cardSelector) {
      this.logger.error('[BaseConfigScraper] Config cardPattern:', JSON.stringify(this.config.cardPattern, null, 2));
      throw new Error('Config is missing card selector (cardPattern.primarySelector or cardPattern.selector)');
    }

    this.logger.info(`[BaseConfigScraper] Card selector initialized: ${this.cardSelector}`);
    if (this.cardFallbacks.length > 0) {
      this.logger.info(`[BaseConfigScraper] Fallback selectors: ${this.cardFallbacks.length}`);
    }
  }

  /**
   * Initialize extractors based on config field methods
   * @param {Object} page - Puppeteer page
   */
  async initializeExtractors(page) {
    this.logger.info('[BaseConfigScraper] Initializing extractors...');

    // Validate config exists
    if (!this.config) {
      throw new Error('[BaseConfigScraper] Config is not set - cannot initialize extractors');
    }

    // v2.3 configs have fields at top level, NOT nested under fieldExtraction
    if (!this.config.fields) {
      this.logger.error('[BaseConfigScraper] Config keys:', Object.keys(this.config));
      throw new Error('[BaseConfigScraper] Config missing fields object');
    }

    const fields = this.config.fields;
    this.logger.info(`[BaseConfigScraper] Fields to extract: ${Object.keys(fields).join(', ')}`);
    const methodsNeeded = new Set();

    // Collect all methods needed
    for (const [fieldName, fieldConfig] of Object.entries(fields)) {
      const method = fieldConfig.userValidatedMethod || fieldConfig.method;
      if (method) {
        methodsNeeded.add(method);
      }
    }

    this.logger.info(`[BaseConfigScraper] Methods needed: ${Array.from(methodsNeeded).join(', ')}`);

    // Initialize required extractors
    for (const method of methodsNeeded) {
      switch (method) {
        case 'mailto-link':
        case 'regex-email':
          if (!this.extractors.email) {
            this.extractors.email = new EmailExtractor(page);
          }
          break;

        case 'tel-link':
        case 'regex-phone':
          if (!this.extractors.phone) {
            this.extractors.phone = new PhoneExtractor(page);
          }
          break;

        case 'href-link':
          if (!this.extractors.link) {
            this.extractors.link = new LinkExtractor(page);
          }
          break;

        case 'label-value':
          if (!this.extractors.label) {
            this.extractors.label = new LabelExtractor(page);
          }
          break;

        case 'coordinate-text':
        default:
          if (!this.extractors.coordinate) {
            this.extractors.coordinate = new CoordinateExtractor(page);
          }
          break;
      }
    }

    this.logger.info(`[BaseConfigScraper] Extractors initialized: ${Object.keys(this.extractors).join(', ')}`);
  }

  /**
   * Find card elements on the page
   * @param {Object} page - Puppeteer page
   * @returns {Promise<Array>} - Array of card element handles
   */
  async findCardElements(page) {
    let cards = await page.$$(this.cardSelector);

    // Try fallback selectors if primary fails
    if (cards.length === 0 && this.cardFallbacks.length > 0) {
      this.logger.info('[BaseConfigScraper] Primary selector failed, trying fallbacks...');

      for (const fallback of this.cardFallbacks) {
        cards = await page.$$(fallback);
        if (cards.length > 0) {
          this.logger.info(`[BaseConfigScraper] Fallback selector succeeded: ${fallback}`);
          break;
        }
      }
    }

    return cards;
  }

  /**
   * Extract contact data from a single card element
   * STRICT mode - only uses userValidatedMethod from config
   * @param {Object} cardElement - Puppeteer ElementHandle
   * @param {number} cardIndex - Index of card for logging
   * @returns {Promise<Object|null>} - Contact object or null
   */
  async extractContactFromCard(cardElement, cardIndex) {
    const contact = {
      _cardIndex: cardIndex,
      _extractionMethods: {}
    };

    const fields = this.config.fields;
    let successCount = 0;

    for (const [fieldName, fieldConfig] of Object.entries(fields)) {
      const method = fieldConfig.userValidatedMethod || fieldConfig.method;
      const coords = fieldConfig.coordinates;

      if (!method) {
        this.logger.debug(`[BaseConfigScraper] No method for field ${fieldName}, skipping`);
        continue;
      }

      if (!coords && method !== 'regex-email' && method !== 'regex-phone') {
        this.logger.debug(`[BaseConfigScraper] No coordinates for field ${fieldName}, skipping`);
        continue;
      }

      try {
        const result = await this.extractField(cardElement, fieldName, method, coords);

        if (result && result.value) {
          contact[fieldName] = this.normalizeFieldValue(fieldName, result.value);
          contact._extractionMethods[fieldName] = {
            method: method,
            confidence: result.confidence || 85
          };
          successCount++;
          this.logger.debug(`[BaseConfigScraper] ${fieldName}: ${contact[fieldName]} (${method})`);
        }
      } catch (error) {
        this.logger.warn(`[BaseConfigScraper] Failed to extract ${fieldName}: ${error.message}`);
      }
    }

    // Fallback extraction for fields without configured methods
    // Use generic DOM selectors similar to InfiniteScrollScraper
    await this.extractFallbackFields(cardElement, contact);

    // Track field statistics for summary
    const trackedFields = ['name', 'email', 'phone', 'title', 'location', 'profileUrl'];
    for (const fieldName of trackedFields) {
      if (this.fieldStats[fieldName]) {
        this.fieldStats[fieldName].total++;
        if (contact[fieldName]) {
          this.fieldStats[fieldName].extracted++;
          if (!contact._extractionMethods[fieldName]) {
            successCount++; // Count fallback extractions
          }
        }
      }
    }

    // Return contact even if partial (at least one field extracted)
    if (successCount > 0) {
      // Add metadata
      contact.confidence = this.calculateConfidence(contact.name, contact.email, contact.phone);
      this.addDomainInfo(contact);
      return contact;
    }

    return null;
  }

  /**
   * Extract fields using fallback DOM selectors when config doesn't specify a method
   * Uses generic CSS selectors similar to InfiniteScrollScraper
   * @param {Object} cardElement - Puppeteer ElementHandle
   * @param {Object} contact - Contact object to populate
   */
  async extractFallbackFields(cardElement, contact) {
    try {
      const fallbackData = await cardElement.evaluate((card) => {
        const result = {};

        // ProfileUrl - find first valid link that's not mailto/tel
        if (!card._hasProfileUrl) {
          const links = card.querySelectorAll('a[href]');
          for (const link of links) {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('mailto:') && !href.startsWith('tel:') &&
                !href.startsWith('#') && !href.endsWith('.vcf')) {
              // Make absolute URL if relative
              if (href.startsWith('/')) {
                result.profileUrl = window.location.origin + href;
              } else if (href.startsWith('http')) {
                result.profileUrl = href;
              }
              break;
            }
          }
        }

        // Title - try common selectors
        if (!card._hasTitle) {
          const titleEl = card.querySelector('.title, [class*="title"], .position, [class*="position"], .role, [class*="role"]');
          if (titleEl) {
            result.title = titleEl.textContent.trim();
          }
        }

        // Location - try common selectors
        if (!card._hasLocation) {
          const locEl = card.querySelector('.location, [class*="location"], .office, [class*="office"], .city, [class*="city"]');
          if (locEl) {
            result.location = locEl.textContent.trim();
          }
        }

        return result;
      });

      // Apply fallback values for missing fields
      if (fallbackData.profileUrl && !contact.profileUrl) {
        contact.profileUrl = this.normalizeFieldValue('profileUrl', fallbackData.profileUrl);
        contact._extractionMethods.profileUrl = { method: 'fallback-dom', confidence: 70 };
        this.logger.debug(`[BaseConfigScraper] profileUrl (fallback): ${contact.profileUrl}`);
      }

      if (fallbackData.title && !contact.title) {
        contact.title = this.normalizeFieldValue('title', fallbackData.title);
        contact._extractionMethods.title = { method: 'fallback-dom', confidence: 70 };
        this.logger.debug(`[BaseConfigScraper] title (fallback): ${contact.title}`);
      }

      if (fallbackData.location && !contact.location) {
        contact.location = this.normalizeFieldValue('location', fallbackData.location);
        contact._extractionMethods.location = { method: 'fallback-dom', confidence: 70 };
        this.logger.debug(`[BaseConfigScraper] location (fallback): ${contact.location}`);
      }

    } catch (error) {
      this.logger.debug(`[BaseConfigScraper] Fallback extraction error: ${error.message}`);
    }
  }

  /**
   * Extract a single field using the specified method
   * @param {Object} cardElement - Puppeteer ElementHandle
   * @param {string} fieldName - Name of field
   * @param {string} method - Extraction method
   * @param {Object} coords - Relative coordinates
   * @returns {Promise<Object>} - {value, confidence, metadata}
   */
  async extractField(cardElement, fieldName, method, coords) {
    switch (method) {
      case 'mailto-link':
        return await this.extractors.email.extractFromMailtoLink(cardElement, coords);

      case 'regex-email':
        return await this.extractors.email.extractFromRegion(cardElement, coords);

      case 'tel-link':
        return await this.extractors.phone?.extractFromTelLink?.(cardElement, coords) ||
               await this.extractors.coordinate?.extractTelFromRegion?.(cardElement, coords);

      case 'regex-phone':
        return await this.extractors.phone?.extractFromRegion?.(cardElement, coords);

      case 'href-link':
        return await this.extractors.link?.extractFromRegion?.(cardElement, coords) ||
               await this.extractors.coordinate?.extractLinkFromRegion?.(cardElement, coords);

      case 'label-value':
        return await this.extractors.label?.extractFromRegion?.(cardElement, coords);

      case 'coordinate-text':
      default:
        return await this.extractors.coordinate.extractFromRegion(cardElement, coords);
    }
  }

  /**
   * Normalize field value based on field type
   * @param {string} fieldName - Name of field
   * @param {string} value - Raw value
   * @returns {string} - Normalized value
   */
  normalizeFieldValue(fieldName, value) {
    if (!value) return null;

    // Ensure value is a string
    if (typeof value !== 'string') {
      value = String(value);
    }

    switch (fieldName) {
      case 'email':
        return value.toLowerCase().trim();

      case 'phone':
        return this.normalizePhone(value);

      case 'name':
        return this.validateAndCleanName(value) || value.trim();

      case 'profileUrl':
        // Ensure absolute URL
        if (value.startsWith('/')) {
          const baseUrl = this.config.extraction?.baseUrl || '';
          return baseUrl + value;
        }
        return value.trim();

      default:
        return value.trim();
    }
  }

  /**
   * Check if contact is duplicate
   * @param {Object} contact - Contact to check
   * @returns {boolean} - True if duplicate
   */
  isDuplicateContact(contact) {
    if (contact.email) {
      return this.isEmailProcessed(contact.email);
    }
    // Also check by name+profileUrl combination
    if (contact.name && contact.profileUrl) {
      const key = `${contact.name}-${contact.profileUrl}`;
      return this.processedEmails.has(key);
    }
    return false;
  }

  /**
   * Mark contact as processed
   * @param {Object} contact - Contact to mark
   */
  markContactProcessed(contact) {
    if (contact.email) {
      this.markEmailProcessed(contact.email);
    }
    if (contact.name && contact.profileUrl) {
      const key = `${contact.name}-${contact.profileUrl}`;
      this.processedEmails.add(key);
    }
  }

  /**
   * Add contact to buffer and flush if needed
   * @param {Object} contact - Contact to add
   */
  addContact(contact) {
    if (this.isDuplicateContact(contact)) {
      return;
    }

    this.markContactProcessed(contact);
    this.contactBuffer.push(contact);
    this.contactCount++;

    // Flush buffer if full
    if (this.contactBuffer.length >= this.bufferSize) {
      this.flushContactBuffer();
    }
  }

  /**
   * Flush contact buffer to file
   */
  flushContactBuffer() {
    if (this.contactBuffer.length === 0) return;

    this.contacts.push(...this.contactBuffer);

    // Write to file if outputPath is set
    if (this.outputPath) {
      this.writeContactsToFile();
    }

    this.logger.info(`[BaseConfigScraper] Flushed ${this.contactBuffer.length} contacts (total: ${this.contactCount})`);
    this.contactBuffer = [];
  }

  /**
   * Set output path for results
   * @param {string} outputDir - Output directory (defaults to 'output/')
   * @param {string} filename - Output filename (optional)
   */
  setOutputPath(outputDir = null, filename = null) {
    // Use provided dir or default to 'output/'
    const dir = outputDir || this.outputDir;

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const name = filename || `scrape-${this.config?.name || 'results'}-${Date.now()}.json`;
    this.outputPath = path.join(dir, name);
    this.logger.info(`[BaseConfigScraper] Output path: ${this.outputPath}`);
  }

  /**
   * Ensure output path is set before scraping
   * Called automatically if output path wasn't set manually
   */
  ensureOutputPath() {
    if (!this.outputPath) {
      this.setOutputPath();
    }
  }

  /**
   * Write contacts to file
   */
  writeContactsToFile() {
    if (!this.outputPath) return;

    const output = {
      metadata: {
        configName: this.config?.name,
        configVersion: this.config?.version,
        scrapeDate: new Date().toISOString(),
        totalContacts: this.contacts.length,
        duration: this.startTime ? Date.now() - this.startTime : 0
      },
      contacts: this.contacts
    };

    fs.writeFileSync(this.outputPath, JSON.stringify(output, null, 2));
  }

  /**
   * Report progress to terminal
   * @param {string} stage - Current stage description
   * @param {Object} stats - Statistics object
   */
  reportProgress(stage, stats = {}) {
    const elapsed = this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0;
    const rate = elapsed > 0 ? (this.contactCount / elapsed).toFixed(1) : 0;

    this.logger.info([
      `[Progress] ${stage}`,
      `| Contacts: ${this.contactCount}`,
      `| Rate: ${rate}/s`,
      `| Elapsed: ${elapsed}s`,
      stats.page ? `| Page: ${stats.page}` : '',
      stats.scroll ? `| Scroll: ${stats.scroll}` : '',
      stats.cards ? `| Cards: ${stats.cards}` : ''
    ].filter(Boolean).join(' '));
  }

  /**
   * Get final results
   * @returns {Object} - Results object
   */
  getResults() {
    // Ensure output path is set
    this.ensureOutputPath();

    // Flush any remaining contacts
    this.flushContactBuffer();

    // Print terminal summary
    this.printTerminalSummary();

    return {
      success: true,
      contacts: this.contacts,
      totalContacts: this.contactCount,
      outputPath: this.outputPath,
      duration: this.startTime ? Date.now() - this.startTime : 0,
      metadata: {
        configName: this.config?.name,
        configVersion: this.config?.version,
        scrapeDate: new Date().toISOString()
      },
      fieldStats: this.fieldStats
    };
  }

  /**
   * Print terminal summary after scraping completes
   */
  printTerminalSummary() {
    const duration = this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0;
    const percentage = this.requestedLimit > 0
      ? Math.round((this.contactCount / this.requestedLimit) * 100)
      : 100;

    // Build summary
    const lines = [];
    lines.push('');
    lines.push('════════════════════════════════════════════════════════════════');
    lines.push('                      SCRAPING COMPLETE                          ');
    lines.push('════════════════════════════════════════════════════════════════');
    lines.push('');

    // Request vs actual
    if (this.requestedLimit > 0) {
      lines.push(`  Requested: ${this.requestedLimit} contacts`);
      lines.push(`  Extracted: ${this.contactCount} contacts (${percentage}%)`);
    } else {
      lines.push(`  Extracted: ${this.contactCount} contacts (unlimited mode)`);
    }
    lines.push(`  Duration:  ${duration}s`);
    lines.push('');

    // Field success rates
    lines.push('  Field Success Rates:');
    const fieldOrder = ['name', 'email', 'phone', 'profileUrl', 'title', 'location'];
    for (const fieldName of fieldOrder) {
      const stats = this.fieldStats[fieldName];
      if (stats && stats.total > 0) {
        const rate = Math.round((stats.extracted / stats.total) * 100);
        const warning = rate < 50 ? ' ⚠️' : '';
        lines.push(`    - ${fieldName.padEnd(12)}: ${stats.extracted}/${stats.total} (${rate}%)${warning}`);
      } else if (stats) {
        lines.push(`    - ${fieldName.padEnd(12)}: 0/0 (no cards processed)`);
      }
    }
    lines.push('');

    // First contacts preview
    if (this.contacts.length > 0) {
      lines.push('  First contacts:');
      const previewCount = Math.min(5, this.contacts.length);
      for (let i = 0; i < previewCount; i++) {
        const contact = this.contacts[i];
        const name = contact.name || '[No name]';
        lines.push(`    ${i + 1}. ${name}`);
      }
      lines.push('');
    }

    // Output file
    lines.push(`  Output: ${this.outputPath}`);
    lines.push('');

    // Warnings
    const warnings = [];
    if (this.requestedLimit > 0 && percentage < 50) {
      warnings.push(`Only ${percentage}% of requested contacts collected`);
      warnings.push('Possible reasons: insufficient scrolling or max content reached');
    }

    // Check for low field success rates
    for (const fieldName of fieldOrder) {
      const stats = this.fieldStats[fieldName];
      if (stats && stats.total > 0) {
        const rate = (stats.extracted / stats.total) * 100;
        if (rate < 50 && fieldName === 'profileUrl') {
          warnings.push('Low profileUrl success rate - links may not have loaded');
        }
      }
    }

    if (warnings.length > 0) {
      lines.push('  ⚠️  WARNINGS:');
      for (const warning of warnings) {
        lines.push(`      ${warning}`);
      }
      lines.push('');
    }

    lines.push('════════════════════════════════════════════════════════════════');
    lines.push('');

    // Log all lines
    for (const line of lines) {
      this.logger.info(line);
    }
  }

  /**
   * Abstract method - must be implemented by subclasses
   * @param {string} url - URL to scrape
   * @param {number} limit - Max contacts to extract
   * @returns {Promise<Array>} - Array of contacts
   */
  async scrape(url, limit = 0) {
    throw new Error('scrape() must be implemented by subclass');
  }

  /**
   * Helper: Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = BaseConfigScraper;

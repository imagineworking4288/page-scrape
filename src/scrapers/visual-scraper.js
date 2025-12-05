/**
 * Visual Scraper v2.3
 *
 * Runtime scraper that uses v2.3 configs with user-validated extraction methods.
 * Extracts contact data from pages using the stored extraction methods and coordinates.
 *
 * Features:
 * - Uses user-validated extraction methods from config
 * - Coordinate-based field extraction
 * - Screenshot OCR extraction with Tesseract.js
 * - CSS selector fallback
 * - Multi-card extraction with scrolling support
 */

const path = require('path');

// Lazy-load extraction modules to avoid startup cost
let ScreenshotExtractor = null;
let CoordinateExtractor = null;

class VisualScraper {
  constructor(browserManager, logger, options = {}) {
    this.browserManager = browserManager;
    this.logger = logger;
    this.options = options;

    this.page = null;
    this.config = null;
    this.screenshotExtractor = null;
    this.coordinateExtractor = null;
  }

  /**
   * Initialize the scraper with a v2.3 config
   * @param {Object} config - v2.3 configuration
   */
  async initialize(config) {
    if (config.version !== '2.3' && config.selectionMethod !== 'manual-validated') {
      this.logger.warn('[VisualScraper] Config is not v2.3, may not work correctly');
    }

    this.config = config;
    this.page = await this.browserManager.getPage();

    // Lazy load extractors
    if (!ScreenshotExtractor) {
      ScreenshotExtractor = require('../tools/lib/screenshot-extractor');
    }
    if (!CoordinateExtractor) {
      CoordinateExtractor = require('../tools/lib/coordinate-extractor');
    }

    // Initialize extractors
    this.screenshotExtractor = new ScreenshotExtractor(this.page);
    this.coordinateExtractor = new CoordinateExtractor(this.page);

    // Initialize OCR if any field uses screenshot-ocr method
    const usesOCR = Object.values(config.fields || {}).some(
      f => f.userValidatedMethod === 'screenshot-ocr'
    );
    if (usesOCR) {
      await this.screenshotExtractor.initialize();
      this.logger.info('[VisualScraper] OCR initialized');
    }

    this.logger.info('[VisualScraper] Initialized with v2.3 config');
  }

  /**
   * Scrape contacts from a URL using the v2.3 config
   * @param {string} url - URL to scrape
   * @param {Object} options - Scraping options
   * @returns {Promise<Object>} - { success, contacts, stats }
   */
  async scrape(url, options = {}) {
    const startTime = Date.now();
    const results = {
      success: false,
      contacts: [],
      stats: {
        url: url,
        cardsFound: 0,
        contactsExtracted: 0,
        errors: [],
        duration: 0
      }
    };

    try {
      // Navigate to page
      this.logger.info(`[VisualScraper] Navigating to: ${url}`);
      await this.page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: this.options.timeout || 30000
      });

      // Wait for content to load
      await this.page.waitForTimeout(2000);

      // Wait for card selector if specified
      if (this.config.cardPattern?.primarySelector) {
        try {
          await this.page.waitForSelector(this.config.cardPattern.primarySelector, {
            timeout: 10000
          });
        } catch (e) {
          this.logger.warn('[VisualScraper] Card selector not found, continuing...');
        }
      }

      // Find all cards
      const cardSelector = this.config.cardPattern?.primarySelector;
      if (!cardSelector) {
        throw new Error('No card selector in config');
      }

      const cardElements = await this.page.$$(cardSelector);
      results.stats.cardsFound = cardElements.length;

      this.logger.info(`[VisualScraper] Found ${cardElements.length} cards`);

      // Extract contacts from each card
      const limit = options.limit || 100;
      const cardsToProcess = cardElements.slice(0, limit);

      for (let i = 0; i < cardsToProcess.length; i++) {
        const card = cardsToProcess[i];

        try {
          const contact = await this.extractContactFromCard(card, i);

          if (contact && this.isValidContact(contact)) {
            results.contacts.push(contact);
          }
        } catch (error) {
          this.logger.warn(`[VisualScraper] Error extracting card ${i}: ${error.message}`);
          results.stats.errors.push({
            cardIndex: i,
            error: error.message
          });
        }
      }

      results.success = true;
      results.stats.contactsExtracted = results.contacts.length;
      results.stats.duration = Date.now() - startTime;

      this.logger.info(
        `[VisualScraper] Extracted ${results.contacts.length} contacts from ${results.stats.cardsFound} cards`
      );

      return results;

    } catch (error) {
      this.logger.error(`[VisualScraper] Scraping failed: ${error.message}`);
      results.stats.errors.push({ error: error.message });
      results.stats.duration = Date.now() - startTime;
      return results;
    }
  }

  /**
   * Extract contact data from a single card element
   * @param {Object} cardElement - Puppeteer element handle
   * @param {number} index - Card index for logging
   * @returns {Promise<Object|null>} - Contact object or null
   */
  async extractContactFromCard(cardElement, index) {
    const contact = {};
    const fields = this.config.fields || {};

    // Extract each field using its validated method
    for (const [fieldName, fieldConfig] of Object.entries(fields)) {
      if (fieldConfig.skipped || !fieldConfig.userValidatedMethod) {
        continue;
      }

      try {
        const value = await this.extractField(
          cardElement,
          fieldName,
          fieldConfig
        );

        if (value) {
          contact[fieldName] = value;
        }
      } catch (error) {
        this.logger.debug(
          `[VisualScraper] Card ${index}, field ${fieldName} extraction error: ${error.message}`
        );
      }
    }

    return Object.keys(contact).length > 0 ? contact : null;
  }

  /**
   * Extract a single field from a card using the validated method
   * @param {Object} cardElement - Card element handle
   * @param {string} fieldName - Field name
   * @param {Object} fieldConfig - Field configuration with method and coordinates
   * @returns {Promise<string|null>} - Extracted value or null
   */
  async extractField(cardElement, fieldName, fieldConfig) {
    const method = fieldConfig.userValidatedMethod;
    const coords = fieldConfig.coordinates;

    switch (method) {
      case 'screenshot-ocr':
        return await this.extractWithOCR(cardElement, coords);

      case 'coordinate-text':
        return await this.extractWithCoordinates(cardElement, coords);

      case 'selector':
        return await this.extractWithSelector(cardElement, fieldConfig.selector, fieldName);

      case 'mailto-link':
        return await this.extractMailtoLink(cardElement, coords);

      case 'tel-link':
        return await this.extractTelLink(cardElement, coords);

      case 'href-link':
        return await this.extractHrefLink(cardElement, coords);

      case 'data-attribute':
        return await this.extractDataAttribute(cardElement, coords, fieldName);

      case 'text-regex':
        return await this.extractWithRegex(cardElement, coords, fieldName);

      default:
        // Fallback to coordinate-text
        return await this.extractWithCoordinates(cardElement, coords);
    }
  }

  /**
   * Extract text using OCR
   */
  async extractWithOCR(cardElement, coords) {
    if (!this.screenshotExtractor) return null;

    const result = await this.screenshotExtractor.extractFromRegion(cardElement, coords);
    return result.value;
  }

  /**
   * Extract text using coordinate-based DOM lookup
   */
  async extractWithCoordinates(cardElement, coords) {
    if (!this.coordinateExtractor) return null;

    const result = await this.coordinateExtractor.extractFromRegion(cardElement, coords);
    return result.value;
  }

  /**
   * Extract using CSS selector
   */
  async extractWithSelector(cardElement, selector, fieldName) {
    if (!selector) return null;

    try {
      const element = await cardElement.$(selector);
      if (!element) return null;

      // For links, get href; otherwise get text
      if (fieldName === 'email' || fieldName === 'profileUrl') {
        const href = await element.evaluate(el => el.href || el.textContent);
        if (fieldName === 'email' && href?.startsWith('mailto:')) {
          return href.replace('mailto:', '').split('?')[0];
        }
        return href;
      }

      const text = await element.evaluate(el => el.textContent?.trim());
      return text;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract email from mailto link
   */
  async extractMailtoLink(cardElement, coords) {
    const result = await this.coordinateExtractor.extractMailtoFromRegion(cardElement, coords);
    return result.value;
  }

  /**
   * Extract phone from tel link
   */
  async extractTelLink(cardElement, coords) {
    const result = await this.coordinateExtractor.extractTelFromRegion(cardElement, coords);
    return result.value;
  }

  /**
   * Extract URL from href
   */
  async extractHrefLink(cardElement, coords) {
    const result = await this.coordinateExtractor.extractLinkFromRegion(cardElement, coords);
    return result.value;
  }

  /**
   * Extract from data attribute
   */
  async extractDataAttribute(cardElement, coords, fieldName) {
    try {
      const cardBox = await cardElement.boundingBox();
      if (!cardBox) return null;

      const absoluteCoords = {
        x: cardBox.x + coords.x + coords.width / 2,
        y: cardBox.y + coords.y + coords.height / 2
      };

      const result = await this.page.evaluate((absCoords, field) => {
        const element = document.elementFromPoint(absCoords.x, absCoords.y);
        if (!element) return null;

        const dataAttrs = [
          `data-${field}`,
          'data-value',
          'data-email',
          'data-phone',
          'data-name'
        ];

        let current = element;
        while (current && current !== document.body) {
          for (const attr of dataAttrs) {
            const value = current.getAttribute(attr);
            if (value) return value;
          }
          current = current.parentElement;
        }

        return null;
      }, absoluteCoords, fieldName);

      return result;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract using regex pattern
   */
  async extractWithRegex(cardElement, coords, fieldName) {
    // First get text from coordinates
    const text = await this.extractWithCoordinates(cardElement, coords);
    if (!text) return null;

    // Apply field-specific regex
    let match = null;
    switch (fieldName) {
      case 'email':
        match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        break;
      case 'phone':
        match = text.match(/(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/);
        break;
    }

    return match ? match[0] : null;
  }

  /**
   * Check if extracted contact is valid
   * @param {Object} contact - Extracted contact
   * @returns {boolean}
   */
  isValidContact(contact) {
    // Must have at least name or email
    if (!contact.name && !contact.email) {
      return false;
    }

    // Basic email validation if present
    if (contact.email && !contact.email.includes('@')) {
      return false;
    }

    return true;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.screenshotExtractor) {
      await this.screenshotExtractor.terminate();
      this.screenshotExtractor = null;
    }
    this.coordinateExtractor = null;
    this.logger.info('[VisualScraper] Cleanup complete');
  }
}

module.exports = VisualScraper;

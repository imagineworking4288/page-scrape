/**
 * Extraction Tester v2.3
 *
 * Orchestrates multiple extraction methods and returns ranked results.
 * Tests all applicable methods for a field and returns top 5 for user validation.
 */

const ScreenshotExtractor = require('./screenshot-extractor');
const CoordinateExtractor = require('./coordinate-extractor');
const { EXTRACTION_METHODS, FIELD_METADATA } = require('./config-schemas');

class ExtractionTester {
  constructor(page) {
    this.page = page;
    this.screenshotExtractor = new ScreenshotExtractor(page);
    this.coordinateExtractor = new CoordinateExtractor(page);
    this.initialized = false;
  }

  /**
   * Initialize extractors
   */
  async initialize() {
    if (this.initialized) return;

    await this.screenshotExtractor.initialize();
    this.initialized = true;
    console.log('[ExtractionTester] Initialized');
  }

  /**
   * Cleanup resources
   */
  async terminate() {
    await this.screenshotExtractor.terminate();
    this.initialized = false;
  }

  /**
   * Test all extraction methods for a field and return ranked results
   * @param {string} fieldName - Field to test (e.g., 'name', 'email')
   * @param {Object} cardElement - Puppeteer element handle for the card
   * @param {Object} fieldCoords - Relative coordinates { x, y, width, height }
   * @returns {Object} - { results: [...top 5], failedMethods: [...] }
   */
  async testField(fieldName, cardElement, fieldCoords) {
    if (!this.initialized) {
      await this.initialize();
    }

    const results = [];
    const failedMethods = [];

    // Get applicable methods for this field
    const applicableMethods = this.getMethodsForField(fieldName);

    console.log(`[ExtractionTester] Testing ${applicableMethods.length} methods for field: ${fieldName}`);

    // Test each method
    for (const methodId of applicableMethods) {
      try {
        const result = await this.runMethod(methodId, cardElement, fieldCoords, fieldName);

        if (result.value && result.confidence > 0) {
          results.push({
            method: methodId,
            methodLabel: EXTRACTION_METHODS[methodId]?.label || methodId,
            value: result.value,
            confidence: result.confidence,
            metadata: result.metadata
          });
        } else {
          failedMethods.push({
            method: methodId,
            reason: result.metadata?.error || 'No value extracted'
          });
        }
      } catch (error) {
        console.error(`[ExtractionTester] Method ${methodId} failed:`, error.message);
        failedMethods.push({
          method: methodId,
          reason: error.message
        });
      }
    }

    // Sort by confidence (highest first)
    results.sort((a, b) => b.confidence - a.confidence);

    // Apply field-specific validation
    const validatedResults = this.applyFieldValidation(fieldName, results);

    // Return top 5 results
    return {
      results: validatedResults.slice(0, 5),
      failedMethods: failedMethods,
      totalMethodsTested: applicableMethods.length
    };
  }

  /**
   * Get applicable extraction methods for a field
   * @param {string} fieldName - Field name
   * @returns {Array} - Method IDs sorted by priority
   */
  getMethodsForField(fieldName) {
    const methods = [];

    for (const [methodId, methodDef] of Object.entries(EXTRACTION_METHODS)) {
      if (methodDef.fields.includes(fieldName)) {
        methods.push({
          id: methodId,
          priority: methodDef.priority
        });
      }
    }

    // Sort by priority (lower number = higher priority)
    methods.sort((a, b) => a.priority - b.priority);

    return methods.map(m => m.id);
  }

  /**
   * Run a specific extraction method
   * @param {string} methodId - Method identifier
   * @param {Object} cardElement - Card element handle
   * @param {Object} fieldCoords - Field coordinates
   * @param {string} fieldName - Field name for context
   * @returns {Object} - { value, confidence, metadata }
   */
  async runMethod(methodId, cardElement, fieldCoords, fieldName) {
    switch (methodId) {
      case 'screenshot-ocr':
        return await this.screenshotExtractor.extractFromRegion(cardElement, fieldCoords);

      case 'coordinate-text':
        return await this.coordinateExtractor.extractFromRegion(cardElement, fieldCoords);

      case 'selector':
        return await this.extractWithSelector(cardElement, fieldCoords);

      case 'data-attribute':
        return await this.extractDataAttribute(cardElement, fieldCoords, fieldName);

      case 'text-regex':
        return await this.extractWithRegex(cardElement, fieldCoords, fieldName);

      case 'mailto-link':
        return await this.coordinateExtractor.extractMailtoFromRegion(cardElement, fieldCoords);

      case 'tel-link':
        return await this.coordinateExtractor.extractTelFromRegion(cardElement, fieldCoords);

      case 'href-link':
        return await this.coordinateExtractor.extractLinkFromRegion(cardElement, fieldCoords);

      default:
        return {
          value: null,
          confidence: 0,
          metadata: { method: methodId, error: 'Unknown method' }
        };
    }
  }

  /**
   * Extract using CSS selector derived from element at coordinates
   * @param {Object} cardElement - Card element handle
   * @param {Object} fieldCoords - Field coordinates
   * @returns {Object} - Extraction result
   */
  async extractWithSelector(cardElement, fieldCoords) {
    try {
      const cardBox = await cardElement.boundingBox();
      if (!cardBox) throw new Error('Card has no bounding box');

      const absoluteCoords = {
        x: cardBox.x + fieldCoords.x + fieldCoords.width / 2,
        y: cardBox.y + fieldCoords.y + fieldCoords.height / 2
      };

      const result = await this.page.evaluate((coords) => {
        const element = document.elementFromPoint(coords.x, coords.y);
        if (!element) return { text: null, selector: null };

        // Build a selector for this element
        const buildSelector = (el) => {
          if (el.id) return `#${el.id}`;

          let selector = el.tagName.toLowerCase();

          if (el.className && typeof el.className === 'string') {
            const classes = el.className.trim().split(/\s+/).filter(c => c && !c.includes(':'));
            if (classes.length > 0) {
              selector += '.' + classes.slice(0, 2).join('.');
            }
          }

          return selector;
        };

        // Try to find a more specific parent
        let targetEl = element;
        if (element.tagName === 'SPAN' || element.tagName === 'DIV') {
          // If it's a generic container, use the element itself
          targetEl = element;
        }

        const selector = buildSelector(targetEl);
        const text = targetEl.textContent?.trim() || '';

        return {
          text: text,
          selector: selector,
          tagName: targetEl.tagName
        };
      }, absoluteCoords);

      if (result.text) {
        return {
          value: result.text,
          confidence: 70,
          metadata: {
            method: 'selector',
            selector: result.selector,
            tagName: result.tagName
          }
        };
      }

      return {
        value: null,
        confidence: 0,
        metadata: { method: 'selector', error: 'No text found' }
      };
    } catch (error) {
      return {
        value: null,
        confidence: 0,
        metadata: { method: 'selector', error: error.message }
      };
    }
  }

  /**
   * Extract from data-* attributes
   * @param {Object} cardElement - Card element handle
   * @param {Object} fieldCoords - Field coordinates
   * @param {string} fieldName - Field name for context
   * @returns {Object} - Extraction result
   */
  async extractDataAttribute(cardElement, fieldCoords, fieldName) {
    try {
      const cardBox = await cardElement.boundingBox();
      if (!cardBox) throw new Error('Card has no bounding box');

      const absoluteCoords = {
        x: cardBox.x + fieldCoords.x + fieldCoords.width / 2,
        y: cardBox.y + fieldCoords.y + fieldCoords.height / 2
      };

      const result = await this.page.evaluate((coords, field) => {
        const element = document.elementFromPoint(coords.x, coords.y);
        if (!element) return { value: null };

        // Check common data attributes
        const dataAttrs = [
          'data-' + field,
          'data-' + field + '-value',
          'data-value',
          'data-email',
          'data-phone',
          'data-name',
          'data-title'
        ];

        // Check element and its parents
        let current = element;
        while (current && current !== document.body) {
          for (const attr of dataAttrs) {
            const value = current.getAttribute(attr);
            if (value) {
              return { value: value, attribute: attr };
            }
          }
          current = current.parentElement;
        }

        return { value: null };
      }, absoluteCoords, fieldName);

      if (result.value) {
        return {
          value: result.value,
          confidence: 85,
          metadata: {
            method: 'data-attribute',
            attribute: result.attribute
          }
        };
      }

      return {
        value: null,
        confidence: 0,
        metadata: { method: 'data-attribute', error: 'No data attribute found' }
      };
    } catch (error) {
      return {
        value: null,
        confidence: 0,
        metadata: { method: 'data-attribute', error: error.message }
      };
    }
  }

  /**
   * Extract using regex pattern matching
   * @param {Object} cardElement - Card element handle
   * @param {Object} fieldCoords - Field coordinates
   * @param {string} fieldName - Field name for pattern selection
   * @returns {Object} - Extraction result
   */
  async extractWithRegex(cardElement, fieldCoords, fieldName) {
    try {
      // First get the text from the region
      const textResult = await this.coordinateExtractor.extractFromRegion(cardElement, fieldCoords);

      if (!textResult.value) {
        return {
          value: null,
          confidence: 0,
          metadata: { method: 'text-regex', error: 'No text to match against' }
        };
      }

      const text = textResult.value;
      let match = null;
      let pattern = null;

      // Apply field-specific patterns
      switch (fieldName) {
        case 'email':
          pattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
          match = text.match(pattern);
          break;

        case 'phone':
          pattern = /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/;
          match = text.match(pattern);
          break;

        default:
          return {
            value: null,
            confidence: 0,
            metadata: { method: 'text-regex', error: 'No pattern for field: ' + fieldName }
          };
      }

      if (match) {
        return {
          value: match[0],
          confidence: 90,
          metadata: {
            method: 'text-regex',
            pattern: pattern.toString(),
            originalText: text
          }
        };
      }

      return {
        value: null,
        confidence: 0,
        metadata: { method: 'text-regex', error: 'Pattern did not match' }
      };
    } catch (error) {
      return {
        value: null,
        confidence: 0,
        metadata: { method: 'text-regex', error: error.message }
      };
    }
  }

  /**
   * Apply field-specific validation to adjust confidence scores
   * @param {string} fieldName - Field name
   * @param {Array} results - Extraction results
   * @returns {Array} - Validated results with adjusted confidence
   */
  applyFieldValidation(fieldName, results) {
    return results.map(result => {
      let adjustedConfidence = result.confidence;

      switch (fieldName) {
        case 'name':
          adjustedConfidence = this.validateName(result.value, result.confidence);
          break;

        case 'email':
          adjustedConfidence = this.validateEmail(result.value, result.confidence);
          break;

        case 'phone':
          adjustedConfidence = this.validatePhone(result.value, result.confidence);
          break;

        case 'profileUrl':
          adjustedConfidence = this.validateUrl(result.value, result.confidence);
          break;
      }

      return {
        ...result,
        confidence: adjustedConfidence
      };
    }).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Validate name format
   */
  validateName(value, baseConfidence) {
    if (!value) return 0;

    const words = value.trim().split(/\s+/);

    // Good: 2-4 words
    if (words.length >= 2 && words.length <= 4) {
      // Check if words are capitalized
      const allCapitalized = words.every(w => /^[A-Z]/.test(w));
      if (allCapitalized) {
        return Math.min(100, baseConfidence + 10);
      }
    }

    // Bad: Contains email pattern
    if (value.includes('@')) {
      return Math.max(0, baseConfidence - 30);
    }

    // Bad: Contains phone pattern
    if (/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(value)) {
      return Math.max(0, baseConfidence - 30);
    }

    // Bad: Too short or too long
    if (words.length < 2) {
      return Math.max(0, baseConfidence - 20);
    }
    if (words.length > 5) {
      return Math.max(0, baseConfidence - 15);
    }

    return baseConfidence;
  }

  /**
   * Validate email format
   */
  validateEmail(value, baseConfidence) {
    if (!value) return 0;

    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (emailPattern.test(value.trim())) {
      return Math.min(100, baseConfidence + 10);
    }

    return Math.max(0, baseConfidence - 20);
  }

  /**
   * Validate phone format
   */
  validatePhone(value, baseConfidence) {
    if (!value) return 0;

    // Remove all non-digit characters for validation
    const digits = value.replace(/\D/g, '');

    // Valid phone: 10-11 digits (with or without country code)
    if (digits.length >= 10 && digits.length <= 11) {
      return Math.min(100, baseConfidence + 10);
    }

    return Math.max(0, baseConfidence - 20);
  }

  /**
   * Validate URL format
   */
  validateUrl(value, baseConfidence) {
    if (!value) return 0;

    // Relative or absolute URL
    if (value.startsWith('/') || value.startsWith('http')) {
      return Math.min(100, baseConfidence + 10);
    }

    return Math.max(0, baseConfidence - 10);
  }

  /**
   * Get confidence level label
   * @param {number} confidence - Confidence score 0-100
   * @returns {string} - 'high', 'medium', or 'low'
   */
  getConfidenceLevel(confidence) {
    if (confidence >= 90) return 'high';
    if (confidence >= 70) return 'medium';
    return 'low';
  }

  /**
   * Format results for display in UI
   * @param {Object} testResults - Results from testField()
   * @param {string} fieldName - Field name
   * @returns {Object} - Formatted results for UI
   */
  formatForUI(testResults, fieldName) {
    const fieldMeta = FIELD_METADATA[fieldName] || {};

    return {
      fieldName: fieldName,
      fieldLabel: fieldMeta.label || fieldName,
      prompt: fieldMeta.prompt || `Select the ${fieldName} field`,
      validationHint: fieldMeta.validationHint || '',
      example: fieldMeta.example || '',
      results: testResults.results.map((r, index) => ({
        index: index + 1,
        method: r.method,
        methodLabel: r.methodLabel,
        value: r.value,
        confidence: r.confidence,
        confidenceLevel: this.getConfidenceLevel(r.confidence),
        isRecommended: index === 0 && r.confidence >= 70
      })),
      failedMethods: testResults.failedMethods,
      hasGoodResult: testResults.results.length > 0 && testResults.results[0].confidence >= 70,
      totalMethodsTested: testResults.totalMethodsTested
    };
  }
}

module.exports = ExtractionTester;

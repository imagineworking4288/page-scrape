/**
 * Element Capture Module v2.2
 *
 * Handles backend element capture from manual field selections.
 * Generates multiple selector strategies for each element.
 */

const {
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS,
  FIELD_ORDER,
  FIELD_METADATA,
  VALIDATION_RULES,
  CONFIDENCE_SCORES
} = require('./constants/field-requirements');

class ElementCapture {
  constructor(logger) {
    this.logger = logger || console;
  }

  /**
   * Process manual selections from the browser and generate extraction rules
   * @param {Object} page - Puppeteer page instance
   * @param {Object} selections - Manual selections from overlay { fieldName: { selector, value, coordinates, element } }
   * @param {Object} cardBox - The selected card bounding box
   * @returns {Object} Processed extraction data
   */
  async processManualSelections(page, selections, cardBox) {
    this.logger.info('[ElementCapture] Processing manual selections...');

    const result = {
      fields: {},
      capturedElements: {},
      relationships: {},
      extractionMethods: {}
    };

    // Process each field selection
    for (const [fieldName, selection] of Object.entries(selections)) {
      try {
        const fieldData = await this.captureFieldElement(page, fieldName, selection, cardBox);
        if (fieldData) {
          result.fields[fieldName] = fieldData;
          result.capturedElements[fieldName] = fieldData.element;
          result.extractionMethods[fieldName] = fieldData.methods;
        }
      } catch (error) {
        this.logger.warn(`[ElementCapture] Failed to capture ${fieldName}: ${error.message}`);
      }
    }

    // Calculate spatial relationships
    result.relationships = this.calculateRelationships(result.fields);

    // Validate required fields
    const validation = this.validateCapture(result.fields);
    result.validation = validation;

    this.logger.info(`[ElementCapture] Captured ${Object.keys(result.fields).length} fields`);
    return result;
  }

  /**
   * Capture and analyze a single field element
   */
  async captureFieldElement(page, fieldName, selection, cardBox) {
    const meta = FIELD_METADATA[fieldName];
    if (!meta) {
      this.logger.warn(`[ElementCapture] Unknown field: ${fieldName}`);
      return null;
    }

    // Get value from selection
    const value = selection.value;
    if (!value) return null;

    // Generate multiple selector strategies
    const methods = await this.generateExtractionMethods(page, fieldName, selection, cardBox);

    // Build element snapshot
    const element = {
      tagName: selection.element?.tagName || 'unknown',
      className: selection.element?.className || '',
      textContent: selection.element?.textContent?.substring(0, 200) || '',
      attributes: {},
      coordinates: selection.coordinates || null
    };

    // Add field-specific attributes
    if (fieldName === 'email' && selection.element?.href) {
      element.attributes.href = selection.element.href;
    }
    if (fieldName === 'phone' && selection.element?.href) {
      element.attributes.href = selection.element.href;
    }
    if (fieldName === 'profileUrl') {
      element.attributes.href = selection.element?.href || value;
      element.linkClassification = selection.linkClassification;
    }

    return {
      value,
      element,
      methods,
      source: selection.source || 'manual',
      confidence: selection.confidence || CONFIDENCE_SCORES.userSelected
    };
  }

  /**
   * Generate multiple extraction methods for a field
   */
  async generateExtractionMethods(page, fieldName, selection, cardBox) {
    const methods = [];
    let priority = 1;

    // Method 1: User-selected selector (highest priority)
    if (selection.selector) {
      methods.push({
        priority: priority++,
        type: 'userSelected',
        selector: selection.selector,
        confidence: CONFIDENCE_SCORES.userSelected,
        source: 'manual'
      });
    }

    // Method 2: Coordinates-based (fallback)
    if (selection.coordinates) {
      methods.push({
        priority: priority++,
        type: 'coordinates',
        coordinates: {
          relativeX: selection.coordinates.centerX - (cardBox?.x || 0),
          relativeY: selection.coordinates.centerY - (cardBox?.y || 0),
          absoluteX: selection.coordinates.centerX,
          absoluteY: selection.coordinates.centerY
        },
        confidence: CONFIDENCE_SCORES.coordinateFallback,
        source: 'manual'
      });
    }

    // Field-specific methods
    switch (fieldName) {
      case 'email':
        methods.push({
          priority: priority++,
          type: 'mailto',
          selector: 'a[href^="mailto:"]',
          attribute: 'href',
          confidence: CONFIDENCE_SCORES.mailtoLink
        });
        methods.push({
          priority: priority++,
          type: 'textPattern',
          pattern: '[^\\s@]+@[^\\s@]+\\.[^\\s@]+',
          confidence: CONFIDENCE_SCORES.textPattern
        });
        break;

      case 'phone':
        methods.push({
          priority: priority++,
          type: 'tel',
          selector: 'a[href^="tel:"]',
          attribute: 'href',
          confidence: CONFIDENCE_SCORES.telLink
        });
        methods.push({
          priority: priority++,
          type: 'textPattern',
          pattern: '\\+?\\d[\\d\\s\\-()]{6,}',
          confidence: CONFIDENCE_SCORES.textPattern
        });
        break;

      case 'profileUrl':
        // Add URL pattern matching
        if (selection.element?.href) {
          const urlPattern = this.extractUrlPattern(selection.element.href);
          if (urlPattern) {
            methods.push({
              priority: priority++,
              type: 'urlPattern',
              pattern: urlPattern,
              confidence: CONFIDENCE_SCORES.urlPattern
            });
          }
        }
        // Add selector-based method
        methods.push({
          priority: priority++,
          type: 'selector',
          selector: 'a[href*="/"]',
          attribute: 'href',
          confidence: 0.6
        });
        break;

      case 'name':
        // Add heading-based fallback
        methods.push({
          priority: priority++,
          type: 'selector',
          selector: 'h1, h2, h3, h4, [class*="name"], [class*="title"]',
          attribute: 'textContent',
          confidence: 0.7
        });
        // Add proximity-based method
        methods.push({
          priority: priority++,
          type: 'proximity',
          anchorField: 'email',
          direction: 'above',
          maxDistance: 200,
          confidence: CONFIDENCE_SCORES.proximity
        });
        break;

      case 'title':
        methods.push({
          priority: priority++,
          type: 'selector',
          selector: '[class*="title"], [class*="position"], [class*="role"]',
          attribute: 'textContent',
          confidence: 0.7
        });
        break;

      case 'location':
        methods.push({
          priority: priority++,
          type: 'selector',
          selector: '[class*="location"], [class*="office"], [class*="city"]',
          attribute: 'textContent',
          confidence: 0.7
        });
        break;
    }

    return methods;
  }

  /**
   * Extract URL pattern from profile URL
   */
  extractUrlPattern(url) {
    try {
      const parsed = new URL(url);
      const pathParts = parsed.pathname.split('/').filter(Boolean);

      // Find profile path patterns
      const patterns = [];
      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i].toLowerCase();
        // Check for profile-like segments
        if (['people', 'person', 'lawyers', 'attorney', 'attorneys', 'staff', 'team', 'bio', 'profile', 'professionals', 'members'].includes(part)) {
          // Return pattern up to and including this segment
          patterns.push('/' + pathParts.slice(0, i + 1).join('/') + '/');
        }
      }

      return patterns[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * Calculate spatial relationships between captured fields
   */
  calculateRelationships(fields) {
    const relationships = {};

    // Check name relative to email
    if (fields.name?.element?.coordinates && fields.email?.element?.coordinates) {
      const nameCoords = fields.name.element.coordinates;
      const emailCoords = fields.email.element.coordinates;

      const verticalDiff = emailCoords.centerY - nameCoords.centerY;
      const horizontalDiff = emailCoords.centerX - nameCoords.centerX;

      relationships.nameAboveEmail = verticalDiff > 0;
      relationships.nameToEmail = {
        above: verticalDiff > 0,
        left: horizontalDiff > 0,
        distance: Math.sqrt(verticalDiff ** 2 + horizontalDiff ** 2)
      };
    }

    // Check title relative to name
    if (fields.title?.element?.coordinates && fields.name?.element?.coordinates) {
      const titleCoords = fields.title.element.coordinates;
      const nameCoords = fields.name.element.coordinates;

      relationships.titleBelowName = titleCoords.centerY > nameCoords.centerY;
    }

    // Check phone relative to email
    if (fields.phone?.element?.coordinates && fields.email?.element?.coordinates) {
      const phoneCoords = fields.phone.element.coordinates;
      const emailCoords = fields.email.element.coordinates;

      relationships.phoneNearEmail =
        Math.abs(phoneCoords.centerY - emailCoords.centerY) < 100;
    }

    return relationships;
  }

  /**
   * Validate captured fields
   */
  validateCapture(fields) {
    const validation = {
      valid: true,
      missingRequired: [],
      warnings: []
    };

    // Check required fields
    for (const fieldName of REQUIRED_FIELDS) {
      if (!fields[fieldName]) {
        validation.missingRequired.push(fieldName);
        validation.valid = false;
      }
    }

    // Validate field values
    for (const [fieldName, field] of Object.entries(fields)) {
      const rules = VALIDATION_RULES[fieldName];
      if (rules && field.value) {
        if (rules.pattern && !rules.pattern.test(field.value)) {
          validation.warnings.push(`${fieldName}: Value may not match expected pattern`);
        }
        if (rules.minLength && field.value.length < rules.minLength) {
          validation.warnings.push(`${fieldName}: Value seems too short`);
        }
        if (rules.maxLength && field.value.length > rules.maxLength) {
          validation.warnings.push(`${fieldName}: Value seems too long`);
        }
      }
    }

    return validation;
  }

  /**
   * Generate alternative selectors for an element
   * Called from browser context
   */
  generateAlternativeSelectors(elementData) {
    const selectors = [];

    // Strategy 1: ID
    if (elementData.id) {
      selectors.push({
        type: 'id',
        selector: `#${CSS.escape(elementData.id)}`,
        specificity: 'high'
      });
    }

    // Strategy 2: Unique class combination
    if (elementData.classes && elementData.classes.length > 0) {
      const filteredClasses = elementData.classes
        .filter(c => !c.includes('hover') && !c.includes('active') && !c.includes('focus'));

      if (filteredClasses.length > 0) {
        selectors.push({
          type: 'class',
          selector: `${elementData.tagName}${filteredClasses.map(c => `.${CSS.escape(c)}`).join('')}`,
          specificity: 'medium'
        });
      }
    }

    // Strategy 3: Data attributes
    if (elementData.dataAttributes && elementData.dataAttributes.length > 0) {
      const attrSelector = elementData.dataAttributes
        .slice(0, 2)
        .map(a => `[${a.name}="${CSS.escape(a.value)}"]`)
        .join('');

      selectors.push({
        type: 'data-attribute',
        selector: `${elementData.tagName}${attrSelector}`,
        specificity: 'medium'
      });
    }

    // Strategy 4: Structural path
    if (elementData.path && elementData.path.length > 0) {
      selectors.push({
        type: 'structural',
        selector: elementData.path.join(' > '),
        specificity: 'low'
      });
    }

    // Strategy 5: nth-child
    if (elementData.nthChild) {
      selectors.push({
        type: 'nth-child',
        selector: `${elementData.parentSelector} > ${elementData.tagName}:nth-child(${elementData.nthChild})`,
        specificity: 'low'
      });
    }

    return selectors;
  }

  /**
   * Build extraction rules from captured fields for config
   */
  buildExtractionRules(capturedData) {
    const rules = {
      version: '2.2',
      strategy: 'multi-method',
      fields: {}
    };

    for (const [fieldName, fieldData] of Object.entries(capturedData.fields || {})) {
      const meta = FIELD_METADATA[fieldName];

      rules.fields[fieldName] = {
        required: meta?.required || false,
        capturedValue: fieldData.value,
        methods: fieldData.methods || [],
        validation: fieldName,
        source: fieldData.source || 'manual'
      };
    }

    return rules;
  }
}

module.exports = ElementCapture;

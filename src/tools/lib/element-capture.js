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
    this.logger.info('[v2.2-CAPTURE] ========================================');
    this.logger.info('[v2.2-CAPTURE] PROCESSING MANUAL SELECTIONS');
    this.logger.info('[v2.2-CAPTURE] Selections type:', typeof selections);
    this.logger.info('[v2.2-CAPTURE] Selections keys:', Object.keys(selections || {}));
    this.logger.info('[v2.2-CAPTURE] CardBox:', JSON.stringify(cardBox));

    // Log each incoming selection
    if (selections) {
      Object.entries(selections).forEach(([fieldName, sel]) => {
        this.logger.info(`[v2.2-CAPTURE] Input field "${fieldName}":`, JSON.stringify({
          value: sel?.value,
          selector: sel?.selector,
          hasCoordinates: !!sel?.coordinates,
          source: sel?.source
        }));
      });
    }

    const result = {
      fields: {},
      capturedElements: {},
      relationships: {},
      extractionMethods: {}
    };

    // Process each field selection
    for (const [fieldName, selection] of Object.entries(selections || {})) {
      try {
        this.logger.info(`[v2.2-CAPTURE] Processing field: ${fieldName}`);
        const fieldData = await this.captureFieldElement(page, fieldName, selection, cardBox);
        if (fieldData) {
          result.fields[fieldName] = fieldData;
          result.capturedElements[fieldName] = fieldData.element;
          result.extractionMethods[fieldName] = fieldData.methods;
          this.logger.info(`[v2.2-CAPTURE] Field "${fieldName}" captured successfully:`, JSON.stringify({
            value: fieldData.value,
            methodCount: fieldData.methods?.length || 0,
            source: fieldData.source
          }));
        } else {
          this.logger.warn(`[v2.2-CAPTURE] Field "${fieldName}" returned null/empty`);
        }
      } catch (error) {
        this.logger.error(`[v2.2-CAPTURE] Failed to capture ${fieldName}: ${error.message}`);
        this.logger.error(`[v2.2-CAPTURE] Error stack: ${error.stack}`);
      }
    }

    // Calculate spatial relationships
    result.relationships = this.calculateRelationships(result.fields);

    // Validate required fields
    const validation = this.validateCapture(result.fields);
    result.validation = validation;

    this.logger.info('[v2.2-CAPTURE] ========================================');
    this.logger.info(`[v2.2-CAPTURE] CAPTURE COMPLETE`);
    this.logger.info(`[v2.2-CAPTURE] Captured ${Object.keys(result.fields).length} fields`);
    this.logger.info('[v2.2-CAPTURE] Validation:', JSON.stringify(validation));
    this.logger.info('[v2.2-CAPTURE] ========================================');

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

  /**
   * Extract field value from elements within a rectangle selection (v2.2)
   * @param {Object} page - Puppeteer page instance
   * @param {string} fieldName - Field being captured (name, email, phone, profileUrl, title, location)
   * @param {Object} box - Rectangle { x, y, width, height }
   * @param {Object} cardBox - Reference card box for relative coordinates
   * @returns {Promise<Object>} - { success, fieldName, value, selector, coordinates, element, links? }
   */
  async extractFieldFromRectangle(page, fieldName, box, cardBox) {
    this.logger.info(`[ElementCapture] Extracting ${fieldName} from rectangle: ${JSON.stringify(box)}`);

    try {
      // Execute extraction in browser context
      const extractionResult = await page.evaluate((fieldName, box) => {
        // Find all elements that intersect with the rectangle
        const elementsInBox = [];
        const allElements = document.querySelectorAll('*');

        for (const el of allElements) {
          // Skip non-visible elements
          if (el.offsetWidth === 0 || el.offsetHeight === 0) continue;

          const rect = el.getBoundingClientRect();

          // Check if element intersects with selection box
          const intersects = !(
            rect.right < box.x ||
            rect.left > box.x + box.width ||
            rect.bottom < box.y ||
            rect.top > box.y + box.height
          );

          if (intersects) {
            // Calculate how much of the element is inside the box
            const overlapX = Math.min(rect.right, box.x + box.width) - Math.max(rect.left, box.x);
            const overlapY = Math.min(rect.bottom, box.y + box.height) - Math.max(rect.top, box.y);
            const overlapArea = Math.max(0, overlapX) * Math.max(0, overlapY);
            const elementArea = rect.width * rect.height;
            const coverageRatio = elementArea > 0 ? overlapArea / elementArea : 0;

            // Only include elements with significant overlap
            if (coverageRatio > 0.3) {
              elementsInBox.push({
                element: el,
                tagName: el.tagName.toLowerCase(),
                text: el.textContent?.trim() || '',
                rect: {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                  centerX: rect.x + rect.width / 2,
                  centerY: rect.y + rect.height / 2
                },
                coverageRatio,
                href: el.href || el.getAttribute('href'),
                className: el.className
              });
            }
          }
        }

        // Sort by coverage and prefer leaf nodes
        elementsInBox.sort((a, b) => {
          // Prefer higher coverage
          if (Math.abs(a.coverageRatio - b.coverageRatio) > 0.2) {
            return b.coverageRatio - a.coverageRatio;
          }
          // Prefer smaller (more specific) elements
          const areaA = a.rect.width * a.rect.height;
          const areaB = b.rect.width * b.rect.height;
          return areaA - areaB;
        });

        // Field-specific extraction logic
        let value = null;
        let bestElement = null;
        let links = [];

        switch (fieldName) {
          case 'email':
            // Look for mailto links first
            const mailtoLink = elementsInBox.find(el =>
              el.href?.startsWith('mailto:')
            );
            if (mailtoLink) {
              value = mailtoLink.href.replace('mailto:', '').split('?')[0];
              bestElement = mailtoLink;
            } else {
              // Look for email pattern in text
              for (const el of elementsInBox) {
                const emailMatch = el.text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
                if (emailMatch) {
                  value = emailMatch[0];
                  bestElement = el;
                  break;
                }
              }
            }
            break;

          case 'phone':
            // Look for tel links first
            const telLink = elementsInBox.find(el =>
              el.href?.startsWith('tel:')
            );
            if (telLink) {
              value = telLink.href.replace('tel:', '');
              bestElement = telLink;
            } else {
              // Look for phone pattern in text
              for (const el of elementsInBox) {
                const phoneMatch = el.text.match(/\+?[\d\s\-()]{7,}/);
                if (phoneMatch) {
                  value = phoneMatch[0].trim();
                  bestElement = el;
                  break;
                }
              }
            }
            break;

          case 'profileUrl':
            // Collect all links in the selection
            const linkElements = elementsInBox.filter(el =>
              el.tagName === 'a' && el.href && !el.href.startsWith('mailto:') && !el.href.startsWith('tel:')
            );

            if (linkElements.length === 1) {
              // Single link - use it
              value = linkElements[0].href;
              bestElement = linkElements[0];
            } else if (linkElements.length > 1) {
              // Multiple links - return them for disambiguation
              links = linkElements.map(el => ({
                href: el.href,
                text: el.text,
                rect: el.rect,
                className: el.className
              }));
              // For now, prefer the first profile-like link
              const profileLink = linkElements.find(el =>
                /\/(people|person|lawyers|attorney|staff|team|bio|profile|professionals)\//.test(el.href)
              );
              if (profileLink) {
                value = profileLink.href;
                bestElement = profileLink;
              } else {
                value = linkElements[0].href;
                bestElement = linkElements[0];
              }
            } else {
              // No links - check if any element contains a link
              for (const el of elementsInBox) {
                const linkChild = el.element.querySelector('a[href]');
                if (linkChild && !linkChild.href.startsWith('mailto:') && !linkChild.href.startsWith('tel:')) {
                  value = linkChild.href;
                  bestElement = {
                    ...el,
                    href: linkChild.href,
                    tagName: 'a'
                  };
                  break;
                }
              }
            }
            break;

          case 'name':
          case 'title':
          case 'location':
          default:
            // Get text from most specific element
            for (const el of elementsInBox) {
              if (el.text && el.text.length > 0 && el.text.length < 200) {
                // Skip if it looks like an email or phone
                if (/@/.test(el.text) || /^\+?[\d\s\-()]{7,}$/.test(el.text)) continue;
                value = el.text;
                bestElement = el;
                break;
              }
            }
            break;
        }

        // Generate selector for best element
        let selector = null;
        if (bestElement?.element) {
          const el = bestElement.element;

          // Try ID
          if (el.id) {
            selector = `#${el.id}`;
          }
          // Try unique class
          else if (el.className && typeof el.className === 'string') {
            const classes = el.className.split(' ').filter(c => c && !c.includes('hover') && !c.includes('active'));
            if (classes.length > 0) {
              selector = `${el.tagName.toLowerCase()}.${classes.join('.')}`;
            }
          }
          // Fallback to tag + nth-child
          if (!selector && el.parentElement) {
            const siblings = Array.from(el.parentElement.children);
            const index = siblings.indexOf(el) + 1;
            selector = `${el.tagName.toLowerCase()}:nth-child(${index})`;
          }
        }

        return {
          value,
          selector,
          element: bestElement ? {
            tagName: bestElement.tagName,
            className: bestElement.className || '',
            textContent: bestElement.text,
            href: bestElement.href
          } : null,
          coordinates: bestElement?.rect ? {
            x: bestElement.rect.x,
            y: bestElement.rect.y,
            width: bestElement.rect.width,
            height: bestElement.rect.height,
            centerX: bestElement.rect.centerX,
            centerY: bestElement.rect.centerY
          } : null,
          links: links.length > 1 ? links : undefined,
          elementsFound: elementsInBox.length
        };
      }, fieldName, box);

      // Validate the result
      if (!extractionResult.value) {
        return {
          success: false,
          fieldName,
          error: 'No valid value found in selection. Try selecting a different area.'
        };
      }

      // Validate field-specific rules
      const validation = this.validateFieldValue(fieldName, extractionResult.value);
      if (!validation.valid) {
        return {
          success: false,
          fieldName,
          error: validation.message
        };
      }

      // Calculate relative coordinates if cardBox is provided
      if (extractionResult.coordinates && cardBox) {
        extractionResult.coordinates.relativeX = extractionResult.coordinates.centerX - cardBox.x;
        extractionResult.coordinates.relativeY = extractionResult.coordinates.centerY - cardBox.y;
      }

      this.logger.info(`[ElementCapture] Extracted ${fieldName}: ${extractionResult.value?.substring(0, 50)}`);

      return {
        success: true,
        fieldName,
        value: extractionResult.value,
        selector: extractionResult.selector,
        coordinates: extractionResult.coordinates,
        element: extractionResult.element,
        links: extractionResult.links
      };

    } catch (error) {
      this.logger.error(`[ElementCapture] Field extraction error: ${error.message}`);
      return {
        success: false,
        fieldName,
        error: error.message
      };
    }
  }

  /**
   * Validate field value based on field type
   */
  validateFieldValue(fieldName, value) {
    if (!value || !value.trim()) {
      return { valid: false, message: 'No value extracted. Try selecting a different area.' };
    }

    value = value.trim();
    const rules = VALIDATION_RULES[fieldName];

    switch (fieldName) {
      case 'name':
        // Should not be an email or phone
        if (/@/.test(value)) {
          return { valid: false, message: 'This looks like an email address, not a name.' };
        }
        if (/^\+?[\d\s\-()]{7,}$/.test(value)) {
          return { valid: false, message: 'This looks like a phone number, not a name.' };
        }
        const words = value.split(/\s+/).filter(w => w.length > 0);
        if (words.length < 1 || words.length > 6) {
          return { valid: false, message: 'Name should be 1-6 words.' };
        }
        break;

      case 'email':
        if (rules?.pattern && !rules.pattern.test(value)) {
          return { valid: false, message: 'Not a valid email format.' };
        }
        break;

      case 'phone':
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
}

module.exports = ElementCapture;

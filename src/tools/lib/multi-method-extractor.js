/**
 * Multi-Method Extractor v2.2
 *
 * Runtime extraction engine for v2.1 and v2.2 configs.
 * Executes extraction methods in priority order with automatic fallbacks.
 *
 * Features:
 * - Priority-ordered method execution
 * - Automatic fallback on failure
 * - Field validation
 * - Extraction statistics tracking
 * - v2.2: User-selected method support (highest priority)
 * - v2.2: Coordinate-based fallback extraction
 */

class MultiMethodExtractor {
  constructor(logger) {
    this.logger = logger || console;
    this.extractionStats = {
      fieldsExtracted: 0,
      methodsAttempted: 0,
      fallbacksUsed: 0,
      failures: 0
    };
  }

  /**
   * Reset extraction statistics
   */
  resetStats() {
    this.extractionStats = {
      fieldsExtracted: 0,
      methodsAttempted: 0,
      fallbacksUsed: 0,
      failures: 0
    };
  }

  /**
   * Get browser-side extraction code for v2.1 configs
   * @returns {string} - JavaScript code to inject
   */
  getExtractorCode() {
    return `
    (function() {
      'use strict';

      // ===========================
      // VALIDATION PATTERNS
      // ===========================

      const VALIDATION = {
        email: (val) => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/.test(val),

        phone: (val) => {
          const digits = (val || '').replace(/\\D/g, '');
          return digits.length >= 7 && digits.length <= 15;
        },

        name: (val) => {
          if (!val || val.length < 2 || val.length > 100) return false;
          if (!/[a-zA-Z]/.test(val)) return false;
          if (/@/.test(val)) return false;
          const words = val.split(/\\s+/);
          return words.length <= 6;
        },

        title: (val) => {
          if (!val || val.length < 2 || val.length > 200) return false;
          return true;
        },

        url: (val) => {
          try {
            new URL(val);
            return true;
          } catch (e) {
            return val && val.startsWith('/');
          }
        }
      };

      // ===========================
      // EXTRACTION METHODS
      // ===========================

      /**
       * Extract using mailto link
       */
      function extractMailto(element, method) {
        const selector = method.selector || 'a[href^="mailto:"]';
        const link = element.querySelector(selector);
        if (!link) return null;

        const href = link.getAttribute('href');
        if (!href || !href.startsWith('mailto:')) return null;

        return href.replace('mailto:', '').split('?')[0].toLowerCase().trim();
      }

      /**
       * Extract using tel link
       */
      function extractTel(element, method) {
        const selector = method.selector || 'a[href^="tel:"]';
        const link = element.querySelector(selector);
        if (!link) return null;

        const href = link.getAttribute('href');
        if (!href || !href.startsWith('tel:')) return null;

        return href.replace('tel:', '').trim();
      }

      /**
       * Extract using CSS selector
       */
      function extractSelector(element, method) {
        const selector = method.selector;
        if (!selector) return null;

        const target = element.querySelector(selector);
        if (!target) return null;

        const attribute = method.attribute || 'textContent';

        if (attribute === 'textContent') {
          return target.textContent.trim();
        } else if (attribute === 'href') {
          return target.getAttribute('href');
        } else {
          return target.getAttribute(attribute);
        }
      }

      /**
       * Extract using link text pattern
       */
      function extractLinkText(element, method) {
        const pattern = method.pattern ? new RegExp(method.pattern, 'i') : /@/;
        const keywords = method.keywords || [];

        const links = element.querySelectorAll('a');
        for (const link of links) {
          const text = link.textContent.trim().toLowerCase();

          // Check for keywords
          if (keywords.length > 0) {
            const hasKeyword = keywords.some(k => text.includes(k.toLowerCase()));
            if (hasKeyword) {
              const href = link.getAttribute('href');
              if (href && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                return href;
              }
              return text;
            }
          }

          // Check for pattern match
          if (pattern.test(link.textContent)) {
            return link.textContent.trim();
          }
        }

        return null;
      }

      /**
       * Extract using text pattern (regex)
       */
      function extractTextPattern(element, method) {
        const text = element.textContent;
        const patterns = {
          email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/gi,
          phone: /(?:\\+?1[-.]?)?\\(?\\d{3}\\)?[-.]?\\d{3}[-.]?\\d{4}/g
        };

        const pattern = method.pattern ? new RegExp(method.pattern, 'gi') : patterns.email;
        const matches = text.match(pattern);

        return matches && matches.length > 0 ? matches[0] : null;
      }

      /**
       * Extract using URL pattern matching
       */
      function extractUrlPattern(element, method) {
        const patterns = method.patterns || ['/profile/', '/people/', '/attorney/'];
        const links = element.querySelectorAll('a[href]');

        for (const link of links) {
          const href = link.getAttribute('href');
          if (!href) continue;
          if (href.startsWith('mailto:') || href.startsWith('tel:')) continue;

          for (const pattern of patterns) {
            if (href.toLowerCase().includes(pattern.toLowerCase())) {
              // Resolve relative URLs
              if (!href.startsWith('http')) {
                try {
                  return new URL(href, window.location.href).href;
                } catch (e) {
                  return href;
                }
              }
              return href;
            }
          }
        }

        return null;
      }

      /**
       * Extract using proximity to anchor field
       */
      function extractProximity(element, method, extractedFields) {
        const anchorField = method.anchorField || 'email';
        const anchorValue = extractedFields[anchorField];
        const direction = method.direction || 'above';
        const maxDistance = method.maxDistance || 300;

        if (!anchorValue) return null;

        // Find anchor element
        let anchorElement = null;
        const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );

        while (walker.nextNode()) {
          if (walker.currentNode.textContent.includes(anchorValue)) {
            anchorElement = walker.currentNode.parentElement;
            break;
          }
        }

        if (!anchorElement) return null;

        const anchorRect = anchorElement.getBoundingClientRect();
        const candidates = [];

        // Check text elements for names
        const textWalker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_ELEMENT,
          null,
          false
        );

        while (textWalker.nextNode()) {
          const node = textWalker.currentNode;
          const text = node.textContent.trim();

          // Basic name validation
          if (!text || text.length < 2 || text.length > 100) continue;
          if (/@/.test(text)) continue;
          if (node.contains(anchorElement)) continue;

          const rect = node.getBoundingClientRect();
          const distance = Math.sqrt(
            Math.pow(rect.x - anchorRect.x, 2) +
            Math.pow(rect.y - anchorRect.y, 2)
          );

          if (distance > maxDistance) continue;

          const isAbove = rect.bottom <= anchorRect.top;
          const isBelow = rect.top >= anchorRect.bottom;

          if (direction === 'above' && !isAbove) continue;
          if (direction === 'below' && !isBelow) continue;

          candidates.push({ text, distance, isAbove });
        }

        // Sort by direction preference then distance
        candidates.sort((a, b) => {
          if (direction === 'above') {
            if (a.isAbove && !b.isAbove) return -1;
            if (!a.isAbove && b.isAbove) return 1;
          }
          return a.distance - b.distance;
        });

        return candidates.length > 0 ? candidates[0].text : null;
      }

      /**
       * Extract first internal link
       */
      function extractFirstInternalLink(element, method) {
        const links = element.querySelectorAll('a[href]');

        for (const link of links) {
          const href = link.getAttribute('href');
          if (!href) continue;
          if (href.startsWith('mailto:') || href.startsWith('tel:')) continue;
          if (href.startsWith('#') || href.startsWith('javascript:')) continue;

          try {
            const linkUrl = new URL(href, window.location.href);
            if (linkUrl.hostname === window.location.hostname) {
              return linkUrl.href;
            }
          } catch (e) {
            continue;
          }
        }

        return null;
      }

      /**
       * Extract first reasonable text (for name fallback)
       */
      function extractFirstText(element, method) {
        const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );

        while (walker.nextNode()) {
          const text = walker.currentNode.textContent.trim();
          if (!text || text.length < 2 || text.length > 100) continue;
          if (/@/.test(text)) continue;

          const words = text.split(/\\s+/);
          if (words.length >= 2 && words.length <= 4) {
            return text;
          }
        }

        return null;
      }

      /**
       * Extract using keyword matching
       */
      function extractKeyword(element, method) {
        const keywords = method.keywords || [];
        const elements = element.querySelectorAll('*');

        for (const el of elements) {
          const text = el.textContent.trim();
          if (text.length < 3 || text.length > 200) continue;

          const hasKeyword = keywords.some(k =>
            text.toLowerCase().includes(k.toLowerCase())
          );

          if (hasKeyword) {
            return text;
          }
        }

        return null;
      }

      // ===========================
      // v2.2 EXTRACTION METHODS
      // ===========================

      /**
       * Extract using user-selected selector (v2.2)
       * Highest priority method from manual selection
       */
      function extractUserSelected(element, method) {
        const selector = method.selector;
        if (!selector) return null;

        try {
          const target = element.querySelector(selector);
          if (!target) return null;

          const attribute = method.attribute || 'textContent';

          if (attribute === 'textContent') {
            return target.textContent.trim();
          } else if (attribute === 'href') {
            const href = target.getAttribute('href');
            // Handle mailto: and tel: prefixes
            if (href) {
              if (href.startsWith('mailto:')) {
                return href.replace('mailto:', '').split('?')[0].toLowerCase().trim();
              }
              if (href.startsWith('tel:')) {
                return href.replace('tel:', '').trim();
              }
              // Resolve relative URLs
              if (!href.startsWith('http') && !href.startsWith('javascript:')) {
                try {
                  return new URL(href, window.location.href).href;
                } catch (e) {
                  return href;
                }
              }
              return href;
            }
            return null;
          } else {
            return target.getAttribute(attribute);
          }
        } catch (e) {
          console.warn('[UserSelected] Selector error:', e.message);
          return null;
        }
      }

      /**
       * Extract using coordinates (v2.2)
       * Fallback when selector fails - uses element at specific position
       */
      function extractCoordinates(element, method) {
        const coords = method.coordinates;
        if (!coords) return null;

        // Get card bounding rect
        const cardRect = element.getBoundingClientRect();

        // Calculate absolute position from relative coordinates
        let targetX, targetY;

        if (coords.relativeX !== undefined && coords.relativeY !== undefined) {
          // Use relative coordinates (relative to card)
          targetX = cardRect.left + coords.relativeX;
          targetY = cardRect.top + coords.relativeY;
        } else if (coords.absoluteX !== undefined && coords.absoluteY !== undefined) {
          // Use absolute coordinates
          targetX = coords.absoluteX;
          targetY = coords.absoluteY;
        } else if (coords.centerX !== undefined && coords.centerY !== undefined) {
          // Use center coordinates (legacy format)
          targetX = coords.centerX;
          targetY = coords.centerY;
        } else {
          return null;
        }

        // Find element at position
        const targetElement = document.elementFromPoint(targetX, targetY);
        if (!targetElement) return null;

        // Check if target is within our card element
        if (!element.contains(targetElement)) {
          // Try nearby positions
          const offsets = [[0, 0], [-5, 0], [5, 0], [0, -5], [0, 5]];
          for (const [dx, dy] of offsets) {
            const el = document.elementFromPoint(targetX + dx, targetY + dy);
            if (el && element.contains(el)) {
              return extractValueFromElement(el, method);
            }
          }
          return null;
        }

        return extractValueFromElement(targetElement, method);
      }

      /**
       * Helper: Extract value from element based on attribute
       */
      function extractValueFromElement(el, method) {
        const attribute = method.attribute || 'textContent';

        if (attribute === 'textContent') {
          return el.textContent.trim();
        } else if (attribute === 'href') {
          // Check for links
          if (el.tagName === 'A' && el.href) {
            const href = el.getAttribute('href');
            if (href.startsWith('mailto:')) {
              return href.replace('mailto:', '').split('?')[0].toLowerCase().trim();
            }
            if (href.startsWith('tel:')) {
              return href.replace('tel:', '').trim();
            }
            return el.href;
          }
          // Check parent for link
          const parentLink = el.closest('a');
          if (parentLink) {
            const href = parentLink.getAttribute('href');
            if (href.startsWith('mailto:')) {
              return href.replace('mailto:', '').split('?')[0].toLowerCase().trim();
            }
            if (href.startsWith('tel:')) {
              return href.replace('tel:', '').trim();
            }
            return parentLink.href;
          }
          return null;
        } else {
          return el.getAttribute(attribute);
        }
      }

      // ===========================
      // MAIN EXTRACTION ENGINE
      // ===========================

      /**
       * Extract single field using multi-method approach
       */
      function extractField(element, fieldName, fieldConfig, extractedFields) {
        const methods = fieldConfig.methods || [];
        const validation = fieldConfig.validation;

        // Sort methods by priority
        const sortedMethods = [...methods].sort((a, b) =>
          (a.priority || 99) - (b.priority || 99)
        );

        for (const method of sortedMethods) {
          let value = null;

          try {
            switch (method.type) {
              // v2.2: User-selected methods (highest priority)
              case 'userSelected':
                value = extractUserSelected(element, method);
                break;
              case 'coordinates':
                value = extractCoordinates(element, method);
                break;

              // Standard extraction methods
              case 'mailto':
                value = extractMailto(element, method);
                break;
              case 'tel':
                value = extractTel(element, method);
                break;
              case 'selector':
                value = extractSelector(element, method);
                break;
              case 'linkText':
                value = extractLinkText(element, method);
                break;
              case 'textPattern':
                value = extractTextPattern(element, method);
                break;
              case 'urlPattern':
                value = extractUrlPattern(element, method);
                break;
              case 'proximity':
                value = extractProximity(element, method, extractedFields);
                break;
              case 'firstInternalLink':
                value = extractFirstInternalLink(element, method);
                break;
              case 'firstText':
                value = extractFirstText(element, method);
                break;
              case 'keyword':
                value = extractKeyword(element, method);
                break;
              default:
                continue;
            }
          } catch (e) {
            continue;
          }

          // Validate value
          if (value) {
            const validator = VALIDATION[validation];
            if (!validator || validator(value)) {
              return {
                value: value,
                method: method.type,
                priority: method.priority,
                confidence: method.confidence || 0.5
              };
            }
          }
        }

        return null;
      }

      /**
       * Extract all fields from card element
       */
      function extractAllFields(element, fieldConfigs) {
        const extracted = {};
        const results = {};

        // Define extraction order (email first for proximity-based name)
        const order = ['email', 'phone', 'name', 'title', 'profileUrl', 'location'];

        for (const fieldName of order) {
          const config = fieldConfigs[fieldName];
          if (!config) continue;

          const result = extractField(element, fieldName, config, extracted);

          if (result) {
            extracted[fieldName] = result.value;
            results[fieldName] = result;
          }
        }

        return { values: extracted, results: results };
      }

      /**
       * Find card element from box
       */
      function findCardElement(box) {
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;

        const element = document.elementFromPoint(
          centerX - window.scrollX,
          centerY - window.scrollY
        );

        if (!element) return null;

        // Walk up to find best container
        let current = element;
        let bestMatch = element;
        let bestOverlap = 0;

        for (let i = 0; i < 10 && current && current !== document.body; i++) {
          const rect = current.getBoundingClientRect();

          // Calculate overlap
          const x1 = Math.max(rect.left, box.x);
          const y1 = Math.max(rect.top, box.y);
          const x2 = Math.min(rect.right, box.x + box.width);
          const y2 = Math.min(rect.bottom, box.y + box.height);

          if (x2 > x1 && y2 > y1) {
            const intersection = (x2 - x1) * (y2 - y1);
            const boxArea = box.width * box.height;
            const overlap = intersection / boxArea;

            if (overlap > bestOverlap) {
              bestOverlap = overlap;
              bestMatch = current;
            }
          }

          current = current.parentElement;
        }

        return bestMatch;
      }

      // Expose functions
      window.__multiExtractor_extractAllFields = extractAllFields;
      window.__multiExtractor_findCardElement = findCardElement;

      return { ready: true };
    })();
    `;
  }

  /**
   * Extract from multiple cards using v2.1 config
   * @param {Object} page - Puppeteer page
   * @param {Array} cardBoxes - Array of bounding boxes
   * @param {Object} fieldConfigs - Field extraction configurations
   * @param {number} limit - Maximum cards to process
   * @returns {Promise<Array>} - Extracted contacts
   */
  async extractFromCards(page, cardBoxes, fieldConfigs, limit = 100) {
    this.resetStats();
    this.logger.info(`[MultiMethodExtractor] Processing ${Math.min(cardBoxes.length, limit)} cards`);

    try {
      // Inject extractor code
      await page.evaluate(this.getExtractorCode());

      // Extract from each card
      const contacts = await page.evaluate((boxes, configs, maxCards) => {
        const results = [];

        for (let i = 0; i < Math.min(boxes.length, maxCards); i++) {
          const box = boxes[i];
          const element = window.__multiExtractor_findCardElement(box);

          if (!element) continue;

          const extraction = window.__multiExtractor_extractAllFields(element, configs);

          if (extraction.values.email || extraction.values.name) {
            results.push({
              ...extraction.values,
              _extractionMethods: extraction.results,
              _cardIndex: i
            });
          }
        }

        return results;
      }, cardBoxes, fieldConfigs, limit);

      // Update stats
      this.extractionStats.fieldsExtracted = contacts.length;

      // Log extraction methods used
      const methodCounts = {};
      contacts.forEach(c => {
        Object.values(c._extractionMethods || {}).forEach(r => {
          methodCounts[r.method] = (methodCounts[r.method] || 0) + 1;
        });
      });
      this.logger.info(`[MultiMethodExtractor] Methods used: ${JSON.stringify(methodCounts)}`);

      return contacts;

    } catch (error) {
      this.logger.error(`[MultiMethodExtractor] Error: ${error.message}`);
      return [];
    }
  }

  /**
   * Get extraction statistics
   * @returns {Object} - Extraction stats
   */
  getStats() {
    return { ...this.extractionStats };
  }
}

module.exports = MultiMethodExtractor;

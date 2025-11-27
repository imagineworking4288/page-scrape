/**
 * Selector Generator
 *
 * Generates optimal CSS selectors for elements.
 * Creates specific yet robust selectors that work across pages.
 */

class SelectorGenerator {
  constructor(logger) {
    this.logger = logger;

    // Semantic class name patterns (likely stable across pages)
    this.semanticPatterns = [
      /name/i, /title/i, /heading/i,
      /email/i, /mail/i, /contact/i,
      /phone/i, /tel/i, /mobile/i,
      /card/i, /item/i, /entry/i, /result/i,
      /person/i, /profile/i, /member/i, /attorney/i, /lawyer/i,
      /bio/i, /staff/i, /team/i, /employee/i,
      /list/i, /grid/i, /container/i
    ];

    // Generic class names to avoid (likely auto-generated)
    this.genericPatterns = [
      /^[a-z]{1,2}\d+$/i,           // a1, b23, etc.
      /^_/,                          // _abc123
      /^css-/i,                      // css-1abc2
      /^sc-/i,                       // styled-components
      /^emotion-/i,                  // emotion.js
      /^chakra-/i,                   // chakra-ui
      /^\d+$/,                       // pure numbers
      /^[a-f0-9]{6,}$/i,            // hash-like
      /^jsx-/i,                      // jsx styling
      /^svelte-/i                    // svelte components
    ];
  }

  /**
   * Generate optimal selector for an element
   * @param {Object} page - Puppeteer page
   * @param {Object} elementData - Element information from browser
   * @returns {Promise<Object>} - Generated selector info
   */
  async generateSelectors(page, elementData) {
    const candidates = [];

    // 1. Try ID-based selector (most specific)
    if (elementData.id) {
      const idSelector = `#${CSS.escape(elementData.id)}`;
      const count = await this.testSelector(page, idSelector);
      if (count === 1) {
        candidates.push({
          selector: idSelector,
          type: 'id',
          score: 100,
          matchCount: count
        });
      }
    }

    // 2. Try semantic class-based selectors
    if (elementData.classes && elementData.classes.length > 0) {
      const semanticClasses = elementData.classes.filter(c => this.isSemanticClassName(c));

      for (const cls of semanticClasses) {
        const classSelector = `.${CSS.escape(cls)}`;
        const count = await this.testSelector(page, classSelector);

        candidates.push({
          selector: classSelector,
          type: 'class',
          score: this.scoreSelector(classSelector, count, true),
          matchCount: count
        });
      }
    }

    // 3. Try tag + class combinations
    if (elementData.tagName && elementData.classes) {
      const tag = elementData.tagName.toLowerCase();
      const semanticClasses = elementData.classes.filter(c => this.isSemanticClassName(c));

      for (const cls of semanticClasses.slice(0, 3)) { // Limit to first 3
        const tagClassSelector = `${tag}.${CSS.escape(cls)}`;
        const count = await this.testSelector(page, tagClassSelector);

        candidates.push({
          selector: tagClassSelector,
          type: 'tag+class',
          score: this.scoreSelector(tagClassSelector, count, true),
          matchCount: count
        });
      }
    }

    // 4. Try data attribute selectors
    if (elementData.dataAttributes) {
      for (const [attr, value] of Object.entries(elementData.dataAttributes)) {
        if (value && value.length < 50) {
          const dataSelector = `[data-${attr}="${CSS.escape(value)}"]`;
          const count = await this.testSelector(page, dataSelector);

          candidates.push({
            selector: dataSelector,
            type: 'data-attr',
            score: this.scoreSelector(dataSelector, count, false),
            matchCount: count
          });
        }
      }
    }

    // 5. Try role attribute selector
    if (elementData.role) {
      const roleSelector = `[role="${elementData.role}"]`;
      const count = await this.testSelector(page, roleSelector);

      candidates.push({
        selector: roleSelector,
        type: 'role',
        score: this.scoreSelector(roleSelector, count, false),
        matchCount: count
      });
    }

    // 6. Generate path-based selector as fallback
    if (elementData.path) {
      const pathSelector = this.generatePathSelector(elementData.path);
      if (pathSelector) {
        const count = await this.testSelector(page, pathSelector);

        candidates.push({
          selector: pathSelector,
          type: 'path',
          score: this.scoreSelector(pathSelector, count, false) * 0.8, // Lower score for path
          matchCount: count
        });
      }
    }

    // Sort by score and return best options
    candidates.sort((a, b) => b.score - a.score);

    return {
      best: candidates[0] || null,
      alternatives: candidates.slice(1, 5),
      all: candidates
    };
  }

  /**
   * Generate scoped selector (within parent context)
   * @param {Object} page - Puppeteer page
   * @param {Object} elementData - Element information
   * @param {string} parentSelector - Parent element selector
   * @returns {Promise<Object>} - Scoped selector info
   */
  async generateScopedSelector(page, elementData, parentSelector) {
    const candidates = [];

    // Generate relative selectors within parent context
    const relativeSelectors = await page.evaluate(
      (elemData, parent) => {
        const parentEl = document.querySelector(parent);
        if (!parentEl) return [];

        const results = [];

        // Find matching elements within parent
        const tagName = elemData.tagName?.toLowerCase();
        if (!tagName) return [];

        // Try class-based relative selector
        if (elemData.classes && elemData.classes.length > 0) {
          for (const cls of elemData.classes) {
            const selector = `.${cls}`;
            const matches = parentEl.querySelectorAll(selector);
            if (matches.length > 0) {
              results.push({
                selector: selector,
                count: matches.length,
                type: 'class'
              });
            }
          }
        }

        // Try tag-based selector
        const tagMatches = parentEl.querySelectorAll(tagName);
        if (tagMatches.length > 0) {
          results.push({
            selector: tagName,
            count: tagMatches.length,
            type: 'tag'
          });
        }

        // Try tag + class
        if (elemData.classes) {
          for (const cls of elemData.classes.slice(0, 3)) {
            const selector = `${tagName}.${cls}`;
            const matches = parentEl.querySelectorAll(selector);
            if (matches.length > 0) {
              results.push({
                selector: selector,
                count: matches.length,
                type: 'tag+class'
              });
            }
          }
        }

        return results;
      },
      elementData,
      parentSelector
    );

    // Score and rank candidates
    for (const rel of relativeSelectors) {
      const fullSelector = `${parentSelector} ${rel.selector}`;
      const globalCount = await this.testSelector(page, fullSelector);

      // Prefer selectors that match exactly once per parent
      const isSemantic = rel.type === 'class' && this.isSemanticClassName(rel.selector.replace('.', ''));

      candidates.push({
        selector: rel.selector,
        fullSelector: fullSelector,
        type: rel.type,
        localCount: rel.count,
        globalCount: globalCount,
        score: this.scoreScopedSelector(rel.count, globalCount, isSemantic)
      });
    }

    candidates.sort((a, b) => b.score - a.score);

    return {
      best: candidates[0] || null,
      alternatives: candidates.slice(1, 3),
      all: candidates
    };
  }

  /**
   * Score a selector based on specificity and match count
   * @param {string} selector - CSS selector
   * @param {number} matchCount - Number of elements matched
   * @param {boolean} isSemantic - Whether selector uses semantic class names
   * @returns {number} - Score (higher is better)
   */
  scoreSelector(selector, matchCount, isSemantic) {
    let score = 0;

    // Prefer selectors that match reasonable number of elements
    if (matchCount === 0) {
      return 0; // Invalid selector
    } else if (matchCount === 1) {
      score += 50; // Unique match is good for single elements
    } else if (matchCount >= 5 && matchCount <= 100) {
      score += 80; // Good range for card lists
    } else if (matchCount > 100) {
      score += 60; // Too many matches might be generic
    } else {
      score += 40; // Low count might miss elements
    }

    // Bonus for semantic selectors
    if (isSemantic) {
      score += 30;
    }

    // Prefer shorter selectors (more maintainable)
    if (selector.length < 30) {
      score += 20;
    } else if (selector.length < 50) {
      score += 10;
    }

    // Penalty for overly complex selectors
    const depth = (selector.match(/\s/g) || []).length;
    score -= depth * 5;

    // Penalty for nth-child and similar brittle selectors
    if (selector.includes(':nth')) {
      score -= 20;
    }

    return Math.max(0, score);
  }

  /**
   * Score a scoped selector
   * @param {number} localCount - Matches within parent
   * @param {number} globalCount - Total matches in document
   * @param {boolean} isSemantic - Whether selector is semantic
   * @returns {number} - Score
   */
  scoreScopedSelector(localCount, globalCount, isSemantic) {
    let score = 0;

    // Best: exactly 1 match per parent
    if (localCount === 1) {
      score += 100;
    } else if (localCount <= 3) {
      score += 70;
    } else {
      score += 30;
    }

    // Bonus for semantic
    if (isSemantic) {
      score += 30;
    }

    // Reasonable global count suggests consistent structure
    if (globalCount > 0 && globalCount === Math.round(globalCount)) {
      score += 10;
    }

    return score;
  }

  /**
   * Check if a class name is semantic (likely stable)
   * @param {string} className - Class name to check
   * @returns {boolean} - True if semantic
   */
  isSemanticClassName(className) {
    // Check against generic patterns (likely auto-generated)
    for (const pattern of this.genericPatterns) {
      if (pattern.test(className)) {
        return false;
      }
    }

    // Check against semantic patterns (likely stable)
    for (const pattern of this.semanticPatterns) {
      if (pattern.test(className)) {
        return true;
      }
    }

    // Check for reasonable length and format
    if (className.length >= 4 && className.length <= 30) {
      // Contains words separated by hyphens or underscores
      if (/^[a-z][a-z0-9_-]*$/i.test(className)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Test a selector and return match count
   * @param {Object} page - Puppeteer page
   * @param {string} selector - CSS selector to test
   * @returns {Promise<number>} - Number of matching elements
   */
  async testSelector(page, selector) {
    try {
      return await page.evaluate((sel) => {
        try {
          return document.querySelectorAll(sel).length;
        } catch (e) {
          return 0;
        }
      }, selector);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Generate a path-based selector from element path
   * @param {Array} path - Array of path segments
   * @returns {string|null} - CSS selector or null
   */
  generatePathSelector(path) {
    if (!path || path.length === 0) {
      return null;
    }

    // Build selector from significant path segments
    const segments = [];

    for (const segment of path.slice(-4)) { // Last 4 levels
      if (segment.id) {
        segments.push(`#${segment.id}`);
        break; // ID is unique, stop here
      } else if (segment.classes && segment.classes.length > 0) {
        const semantic = segment.classes.find(c => this.isSemanticClassName(c));
        if (semantic) {
          segments.push(`${segment.tag}.${semantic}`);
        } else {
          segments.push(segment.tag);
        }
      } else {
        segments.push(segment.tag);
      }
    }

    return segments.join(' > ');
  }

  /**
   * Validate that a selector works correctly
   * @param {Object} page - Puppeteer page
   * @param {string} selector - Selector to validate
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} - Validation result
   */
  async validateSelector(page, selector, options = {}) {
    const { expectedCount, minCount = 1, maxCount = Infinity } = options;

    const count = await this.testSelector(page, selector);

    const result = {
      valid: count >= minCount && count <= maxCount,
      matchCount: count,
      selector: selector
    };

    if (expectedCount !== undefined) {
      result.matchesExpected = count === expectedCount;
    }

    return result;
  }

  /**
   * Find common ancestor selector for multiple elements
   * @param {Object} page - Puppeteer page
   * @param {Array} selectors - Array of element selectors
   * @returns {Promise<string|null>} - Common ancestor selector
   */
  async findCommonAncestor(page, selectors) {
    if (!selectors || selectors.length < 2) {
      return null;
    }

    return await page.evaluate((sels) => {
      const elements = sels.map(s => document.querySelector(s)).filter(Boolean);
      if (elements.length < 2) return null;

      // Find common ancestor
      let ancestor = elements[0].parentElement;

      while (ancestor && ancestor !== document.body) {
        const containsAll = elements.every(el => ancestor.contains(el));
        if (containsAll) {
          // Build selector for ancestor
          if (ancestor.id) {
            return `#${ancestor.id}`;
          }

          const classes = Array.from(ancestor.classList);
          if (classes.length > 0) {
            return `${ancestor.tagName.toLowerCase()}.${classes[0]}`;
          }

          return ancestor.tagName.toLowerCase();
        }
        ancestor = ancestor.parentElement;
      }

      return null;
    }, selectors);
  }
}

// CSS.escape polyfill for Node.js context
if (typeof CSS === 'undefined' || !CSS.escape) {
  global.CSS = {
    escape: function(value) {
      if (arguments.length === 0) {
        throw new TypeError('`CSS.escape` requires an argument.');
      }
      const string = String(value);
      const length = string.length;
      let index = -1;
      let result = '';
      const firstCodeUnit = string.charCodeAt(0);

      while (++index < length) {
        const codeUnit = string.charCodeAt(index);

        if (codeUnit === 0x0000) {
          result += '\uFFFD';
          continue;
        }

        if (
          (codeUnit >= 0x0001 && codeUnit <= 0x001F) ||
          codeUnit === 0x007F ||
          (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
          (index === 1 && codeUnit >= 0x0030 && codeUnit <= 0x0039 && firstCodeUnit === 0x002D)
        ) {
          result += '\\' + codeUnit.toString(16) + ' ';
          continue;
        }

        if (index === 0 && length === 1 && codeUnit === 0x002D) {
          result += '\\' + string.charAt(index);
          continue;
        }

        if (
          codeUnit >= 0x0080 ||
          codeUnit === 0x002D ||
          codeUnit === 0x005F ||
          (codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
          (codeUnit >= 0x0041 && codeUnit <= 0x005A) ||
          (codeUnit >= 0x0061 && codeUnit <= 0x007A)
        ) {
          result += string.charAt(index);
          continue;
        }

        result += '\\' + string.charAt(index);
      }

      return result;
    }
  };
}

module.exports = SelectorGenerator;

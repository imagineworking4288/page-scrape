/**
 * Card Matcher - Hybrid Pattern Matching Engine
 *
 * Finds all elements on the page that match a selected card's pattern
 * using hybrid matching: 60% structural + 40% visual similarity.
 *
 * Structural Signature Components:
 * - Tag hierarchy (parent chain)
 * - Child element count and types
 * - CSS class patterns
 * - Link structure (presence of anchors, hrefs)
 *
 * Visual Properties:
 * - Bounding box dimensions
 * - Grid position (if in grid layout)
 * - Spacing from siblings
 * - Alignment within container
 */

class CardMatcher {
  constructor(logger) {
    this.logger = logger || console;
    this.STRUCTURAL_WEIGHT = 0.6;
    this.VISUAL_WEIGHT = 0.4;
    this.DEFAULT_THRESHOLD = 65;
  }

  /**
   * Generate browser-side code for card matching
   * This code runs in the browser context via page.evaluate()
   * @returns {string} - JavaScript code to inject
   */
  getMatcherCode() {
    return `
    (function() {
      'use strict';

      const STRUCTURAL_WEIGHT = 0.6;
      const VISUAL_WEIGHT = 0.4;

      /**
       * Get element at center of selection box
       */
      function getElementAtSelection(box) {
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        return document.elementFromPoint(centerX, centerY);
      }

      /**
       * Find the best card element from selection
       * Walks up the DOM to find a suitable container
       */
      function findCardElement(element, box) {
        if (!element) return null;

        let current = element;
        let bestMatch = null;
        let bestScore = 0;

        // Walk up the DOM tree (max 10 levels)
        for (let i = 0; i < 10 && current && current !== document.body; i++) {
          const rect = current.getBoundingClientRect();

          // Calculate how well this element matches the selection box
          const overlapScore = calculateOverlapScore(rect, box);
          const sizeScore = calculateSizeScore(rect, box);
          const score = (overlapScore + sizeScore) / 2;

          // Element should be at least 50% overlapping and similar size
          if (score > bestScore && overlapScore > 0.5) {
            bestScore = score;
            bestMatch = current;
          }

          current = current.parentElement;
        }

        return bestMatch;
      }

      /**
       * Calculate overlap between two rectangles
       */
      function calculateOverlapScore(rect1, rect2) {
        const x1 = Math.max(rect1.x || rect1.left, rect2.x);
        const y1 = Math.max(rect1.y || rect1.top, rect2.y);
        const x2 = Math.min((rect1.x || rect1.left) + rect1.width, rect2.x + rect2.width);
        const y2 = Math.min((rect1.y || rect1.top) + rect1.height, rect2.y + rect2.height);

        if (x2 <= x1 || y2 <= y1) return 0;

        const intersection = (x2 - x1) * (y2 - y1);
        const area1 = rect1.width * rect1.height;
        const area2 = rect2.width * rect2.height;
        const union = area1 + area2 - intersection;

        return intersection / union;
      }

      /**
       * Calculate size similarity score
       */
      function calculateSizeScore(rect1, rect2) {
        const widthRatio = Math.min(rect1.width, rect2.width) / Math.max(rect1.width, rect2.width);
        const heightRatio = Math.min(rect1.height, rect2.height) / Math.max(rect1.height, rect2.height);
        return (widthRatio + heightRatio) / 2;
      }

      /**
       * Extract structural signature from an element
       */
      function extractStructuralSignature(element) {
        if (!element) return null;

        return {
          // Tag information
          tagName: element.tagName.toLowerCase(),

          // Parent chain (up to 3 levels)
          parentChain: getParentChain(element, 3),

          // Child structure
          childCount: element.children.length,
          childTags: getChildTags(element),
          childDepth: getMaxChildDepth(element, 3),

          // Class patterns (normalized)
          classPatterns: extractClassPatterns(element),

          // Link structure
          hasLinks: element.querySelectorAll('a').length > 0,
          linkCount: element.querySelectorAll('a').length,
          hasImages: element.querySelectorAll('img').length > 0,
          imageCount: element.querySelectorAll('img').length,

          // Text structure
          hasText: element.textContent.trim().length > 0,
          textNodeCount: countTextNodes(element),

          // Semantic hints
          hasEmail: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/.test(element.textContent),
          hasPhone: /[\\d\\s\\-().+]{7,}/.test(element.textContent)
        };
      }

      /**
       * Get parent tag chain
       */
      function getParentChain(element, depth) {
        const chain = [];
        let current = element.parentElement;

        for (let i = 0; i < depth && current && current !== document.body; i++) {
          chain.push({
            tag: current.tagName.toLowerCase(),
            classes: getNormalizedClasses(current)
          });
          current = current.parentElement;
        }

        return chain;
      }

      /**
       * Get child tag distribution
       */
      function getChildTags(element) {
        const tags = {};
        Array.from(element.children).forEach(child => {
          const tag = child.tagName.toLowerCase();
          tags[tag] = (tags[tag] || 0) + 1;
        });
        return tags;
      }

      /**
       * Get maximum child depth
       */
      function getMaxChildDepth(element, maxDepth) {
        if (maxDepth <= 0 || element.children.length === 0) return 0;

        let max = 0;
        for (const child of element.children) {
          max = Math.max(max, 1 + getMaxChildDepth(child, maxDepth - 1));
        }
        return max;
      }

      /**
       * Extract normalized class patterns
       */
      function extractClassPatterns(element) {
        const classes = Array.from(element.classList);
        return classes.map(cls => {
          // Remove dynamic parts (numbers, hashes, etc.)
          return cls
            .replace(/[0-9]+/g, '*')
            .replace(/[a-f0-9]{8,}/gi, '*')
            .toLowerCase();
        }).filter(cls => cls.length > 0);
      }

      /**
       * Get normalized classes
       */
      function getNormalizedClasses(element) {
        return Array.from(element.classList)
          .map(cls => cls.replace(/[0-9]+/g, '*').toLowerCase())
          .slice(0, 5);
      }

      /**
       * Count text nodes
       */
      function countTextNodes(element) {
        let count = 0;
        const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );
        while (walker.nextNode()) {
          if (walker.currentNode.textContent.trim()) count++;
        }
        return count;
      }

      /**
       * Extract visual properties from an element
       */
      function extractVisualProperties(element) {
        if (!element) return null;

        const rect = element.getBoundingClientRect();
        const styles = window.getComputedStyle(element);
        const parent = element.parentElement;

        return {
          // Bounding box
          box: {
            x: rect.x + window.scrollX,
            y: rect.y + window.scrollY,
            width: rect.width,
            height: rect.height
          },

          // Dimensions
          aspectRatio: rect.width / rect.height,
          area: rect.width * rect.height,

          // Position in parent
          indexInParent: parent ? Array.from(parent.children).indexOf(element) : 0,
          siblingCount: parent ? parent.children.length : 0,

          // Spacing
          marginTop: parseFloat(styles.marginTop) || 0,
          marginBottom: parseFloat(styles.marginBottom) || 0,
          marginLeft: parseFloat(styles.marginLeft) || 0,
          marginRight: parseFloat(styles.marginRight) || 0,
          padding: parseFloat(styles.padding) || 0,

          // Display properties
          display: styles.display,
          position: styles.position,

          // Visual styling
          backgroundColor: styles.backgroundColor,
          borderRadius: styles.borderRadius,
          boxShadow: styles.boxShadow !== 'none'
        };
      }

      /**
       * Calculate structural similarity between two signatures
       */
      function calculateStructuralSimilarity(sig1, sig2) {
        if (!sig1 || !sig2) return 0;

        let score = 0;
        let weights = 0;

        // Tag match (weight: 20)
        if (sig1.tagName === sig2.tagName) {
          score += 20;
        }
        weights += 20;

        // Parent chain similarity (weight: 15)
        const parentScore = compareParentChains(sig1.parentChain, sig2.parentChain);
        score += parentScore * 15;
        weights += 15;

        // Child count similarity (weight: 15)
        const childCountDiff = Math.abs(sig1.childCount - sig2.childCount);
        const childCountScore = Math.max(0, 1 - childCountDiff / 10);
        score += childCountScore * 15;
        weights += 15;

        // Child tag similarity (weight: 15)
        const childTagScore = compareChildTags(sig1.childTags, sig2.childTags);
        score += childTagScore * 15;
        weights += 15;

        // Class pattern overlap (weight: 15)
        const classScore = compareClassPatterns(sig1.classPatterns, sig2.classPatterns);
        score += classScore * 15;
        weights += 15;

        // Link structure (weight: 10)
        if (sig1.hasLinks === sig2.hasLinks) {
          score += 5;
          const linkDiff = Math.abs(sig1.linkCount - sig2.linkCount);
          score += Math.max(0, 5 - linkDiff);
        }
        weights += 10;

        // Content indicators (weight: 10)
        if (sig1.hasEmail === sig2.hasEmail) score += 5;
        if (sig1.hasPhone === sig2.hasPhone) score += 5;
        weights += 10;

        return (score / weights) * 100;
      }

      /**
       * Compare parent chains
       */
      function compareParentChains(chain1, chain2) {
        if (!chain1.length || !chain2.length) return 0;

        let matches = 0;
        const len = Math.min(chain1.length, chain2.length);

        for (let i = 0; i < len; i++) {
          if (chain1[i].tag === chain2[i].tag) {
            matches += 1;
            // Bonus for matching classes
            const classOverlap = chain1[i].classes.filter(c =>
              chain2[i].classes.includes(c)
            ).length;
            if (classOverlap > 0) matches += 0.5;
          }
        }

        return matches / len;
      }

      /**
       * Compare child tag distributions
       */
      function compareChildTags(tags1, tags2) {
        const allTags = new Set([...Object.keys(tags1), ...Object.keys(tags2)]);
        if (allTags.size === 0) return 1;

        let similarity = 0;
        allTags.forEach(tag => {
          const count1 = tags1[tag] || 0;
          const count2 = tags2[tag] || 0;
          const max = Math.max(count1, count2);
          if (max > 0) {
            similarity += Math.min(count1, count2) / max;
          }
        });

        return similarity / allTags.size;
      }

      /**
       * Compare class patterns
       */
      function compareClassPatterns(patterns1, patterns2) {
        if (!patterns1.length && !patterns2.length) return 1;
        if (!patterns1.length || !patterns2.length) return 0;

        const set1 = new Set(patterns1);
        const set2 = new Set(patterns2);

        let overlap = 0;
        set1.forEach(p => {
          if (set2.has(p)) overlap++;
        });

        return (2 * overlap) / (set1.size + set2.size);
      }

      /**
       * Calculate visual similarity between two property sets
       */
      function calculateVisualSimilarity(props1, props2) {
        if (!props1 || !props2) return 0;

        let score = 0;
        let weights = 0;

        // Size similarity (weight: 30)
        const widthRatio = Math.min(props1.box.width, props2.box.width) /
                          Math.max(props1.box.width, props2.box.width);
        const heightRatio = Math.min(props1.box.height, props2.box.height) /
                           Math.max(props1.box.height, props2.box.height);
        score += (widthRatio + heightRatio) / 2 * 30;
        weights += 30;

        // Aspect ratio similarity (weight: 20)
        const aspectDiff = Math.abs(props1.aspectRatio - props2.aspectRatio);
        const aspectScore = Math.max(0, 1 - aspectDiff / 2);
        score += aspectScore * 20;
        weights += 20;

        // Display type match (weight: 15)
        if (props1.display === props2.display) {
          score += 15;
        }
        weights += 15;

        // Margin/spacing similarity (weight: 15)
        const marginScore = compareMargins(props1, props2);
        score += marginScore * 15;
        weights += 15;

        // Visual styling similarity (weight: 20)
        if (props1.boxShadow === props2.boxShadow) score += 10;
        if (props1.borderRadius === props2.borderRadius) score += 10;
        weights += 20;

        return (score / weights) * 100;
      }

      /**
       * Compare margin values
       */
      function compareMargins(props1, props2) {
        const margins1 = [props1.marginTop, props1.marginRight, props1.marginBottom, props1.marginLeft];
        const margins2 = [props2.marginTop, props2.marginRight, props2.marginBottom, props2.marginLeft];

        let similarity = 0;
        for (let i = 0; i < 4; i++) {
          const max = Math.max(Math.abs(margins1[i]), Math.abs(margins2[i]), 1);
          const diff = Math.abs(margins1[i] - margins2[i]);
          similarity += Math.max(0, 1 - diff / max);
        }

        return similarity / 4;
      }

      /**
       * Find all candidate elements on the page
       */
      function findCandidateElements(referenceElement) {
        const candidates = [];
        const refRect = referenceElement.getBoundingClientRect();

        // Get all elements with similar size
        const minWidth = refRect.width * 0.5;
        const maxWidth = refRect.width * 2;
        const minHeight = refRect.height * 0.5;
        const maxHeight = refRect.height * 2;

        // Strategy 1: Find siblings
        const parent = referenceElement.parentElement;
        if (parent) {
          Array.from(parent.children).forEach(sibling => {
            if (sibling !== referenceElement) {
              candidates.push(sibling);
            }
          });
        }

        // Strategy 2: Find elements with same tag and similar structure
        const sameTagElements = document.querySelectorAll(referenceElement.tagName);
        sameTagElements.forEach(el => {
          if (el !== referenceElement && !candidates.includes(el)) {
            const rect = el.getBoundingClientRect();
            if (rect.width >= minWidth && rect.width <= maxWidth &&
                rect.height >= minHeight && rect.height <= maxHeight) {
              candidates.push(el);
            }
          }
        });

        // Strategy 3: Find by class patterns
        const classes = Array.from(referenceElement.classList);
        if (classes.length > 0) {
          // Use the most specific-looking class
          const sortedClasses = classes.sort((a, b) => b.length - a.length);
          for (const cls of sortedClasses.slice(0, 3)) {
            const sameClassElements = document.querySelectorAll('.' + CSS.escape(cls));
            sameClassElements.forEach(el => {
              if (el !== referenceElement && !candidates.includes(el)) {
                const rect = el.getBoundingClientRect();
                if (rect.width >= minWidth && rect.width <= maxWidth &&
                    rect.height >= minHeight && rect.height <= maxHeight) {
                  candidates.push(el);
                }
              }
            });
          }
        }

        return candidates;
      }

      /**
       * Main function: Find similar cards
       */
      function findSimilarCards(selectionBox, threshold = 65) {
        // Step 1: Find the reference element
        const clickedElement = getElementAtSelection(selectionBox);
        if (!clickedElement) {
          return { success: false, error: 'No element found at selection' };
        }

        const referenceElement = findCardElement(clickedElement, selectionBox);
        if (!referenceElement) {
          return { success: false, error: 'Could not identify card element' };
        }

        // Step 2: Extract reference signatures
        const refStructural = extractStructuralSignature(referenceElement);
        const refVisual = extractVisualProperties(referenceElement);

        // Step 3: Find candidates
        const candidates = findCandidateElements(referenceElement);

        // Step 4: Score each candidate
        const matches = [];

        // Include reference element as first match
        matches.push({
          element: referenceElement,
          box: refVisual.box,
          confidence: 100,
          isReference: true
        });

        candidates.forEach(candidate => {
          const candStructural = extractStructuralSignature(candidate);
          const candVisual = extractVisualProperties(candidate);

          const structuralScore = calculateStructuralSimilarity(refStructural, candStructural);
          const visualScore = calculateVisualSimilarity(refVisual, candVisual);

          const hybridScore = (structuralScore * ${this.STRUCTURAL_WEIGHT}) +
                             (visualScore * ${this.VISUAL_WEIGHT});

          if (hybridScore >= threshold) {
            matches.push({
              element: candidate,
              box: candVisual.box,
              confidence: Math.round(hybridScore),
              structuralScore: Math.round(structuralScore),
              visualScore: Math.round(visualScore)
            });
          }
        });

        // Sort by confidence (excluding reference which should stay first)
        const reference = matches.shift();
        matches.sort((a, b) => b.confidence - a.confidence);
        matches.unshift(reference);

        // Generate selector for the reference element
        const selector = generateSelector(referenceElement);

        return {
          success: true,
          referenceElement: {
            selector: selector,
            structural: refStructural,
            visual: refVisual
          },
          matches: matches.map(m => ({
            box: m.box,
            confidence: m.confidence,
            isReference: m.isReference || false,
            structuralScore: m.structuralScore,
            visualScore: m.visualScore
          })),
          totalFound: matches.length,
          selector: selector
        };
      }

      /**
       * Generate a CSS selector for an element
       */
      function generateSelector(element) {
        // Try ID first
        if (element.id) {
          return '#' + CSS.escape(element.id);
        }

        // Try unique class combination
        const classes = Array.from(element.classList);
        if (classes.length > 0) {
          const selector = element.tagName.toLowerCase() + '.' +
                          classes.map(c => CSS.escape(c)).join('.');
          const matches = document.querySelectorAll(selector);
          if (matches.length <= 50) {
            return selector;
          }
        }

        // Fallback: Generate path-based selector
        const path = [];
        let current = element;

        while (current && current !== document.body) {
          let selector = current.tagName.toLowerCase();

          if (current.classList.length > 0) {
            // Use first 2 classes
            const classSelector = Array.from(current.classList)
              .slice(0, 2)
              .map(c => '.' + CSS.escape(c))
              .join('');
            selector += classSelector;
          }

          path.unshift(selector);
          current = current.parentElement;

          // Stop after 4 levels
          if (path.length >= 4) break;
        }

        return path.join(' > ');
      }

      // Expose the main function
      window.__cardMatcher_findSimilarCards = findSimilarCards;

      return { ready: true };
    })();
    `;
  }

  /**
   * Find similar cards in the page
   * @param {Object} page - Puppeteer page instance
   * @param {Object} selectionBox - {x, y, width, height} of user selection
   * @param {number} threshold - Minimum confidence threshold (0-100)
   * @returns {Promise<Object>} - Match results
   */
  async findSimilarCards(page, selectionBox, threshold = null) {
    const effectiveThreshold = threshold || this.DEFAULT_THRESHOLD;

    this.logger.log(`[CardMatcher] Finding cards with threshold ${effectiveThreshold}%`);
    this.logger.log(`[CardMatcher] Selection box: ${JSON.stringify(selectionBox)}`);

    try {
      // Inject matcher code
      await page.evaluate(this.getMatcherCode());

      // Run the matching
      const result = await page.evaluate((box, thresh) => {
        return window.__cardMatcher_findSimilarCards(box, thresh);
      }, selectionBox, effectiveThreshold);

      if (!result.success) {
        this.logger.error(`[CardMatcher] Failed: ${result.error}`);
        return result;
      }

      this.logger.log(`[CardMatcher] Found ${result.totalFound} matching cards`);

      return result;

    } catch (error) {
      this.logger.error(`[CardMatcher] Error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get card elements by their boxes (for extraction)
   * @param {Object} page - Puppeteer page instance
   * @param {Array} boxes - Array of bounding boxes
   * @returns {Promise<Array>} - Array of element handles
   */
  async getCardElements(page, boxes) {
    return await page.evaluate((boxes) => {
      return boxes.map(box => {
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        const element = document.elementFromPoint(
          centerX - window.scrollX,
          centerY - window.scrollY
        );
        return element ? element.outerHTML.substring(0, 500) : null;
      });
    }, boxes);
  }
}

module.exports = CardMatcher;

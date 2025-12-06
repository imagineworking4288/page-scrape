/**
 * Coordinate Text Extractor v2.3
 *
 * Extracts text from DOM elements at specified coordinates.
 * Uses Puppeteer's page.evaluate with TreeWalker to find text nodes
 * that fall within the target region.
 */

class CoordinateExtractor {
  constructor(page) {
    this.page = page;
  }

  /**
   * Extract text from elements at specified coordinates within a card
   * @param {Object} cardElement - The card element handle from Puppeteer
   * @param {Object} fieldCoords - Relative coordinates within the card { x, y, width, height }
   * @returns {Object} - { value, confidence, metadata }
   */
  async extractFromRegion(cardElement, fieldCoords) {
    try {
      // Get card's absolute position
      const cardBox = await cardElement.boundingBox();
      if (!cardBox) {
        throw new Error('Card element has no bounding box');
      }

      // Calculate absolute position of the field
      const absoluteCoords = {
        x: cardBox.x + fieldCoords.x,
        y: cardBox.y + fieldCoords.y,
        width: fieldCoords.width,
        height: fieldCoords.height
      };

      // Extract text from DOM elements in the region
      const result = await this.page.evaluate((coords) => {
        const results = {
          texts: [],
          elements: [],
          links: []
        };

        // Helper: Check if a point is within a rect
        function isPointInRect(px, py, rect) {
          return px >= rect.x && px <= rect.x + rect.width &&
                 py >= rect.y && py <= rect.y + rect.height;
        }

        // Helper: Check if two rects overlap
        function rectsOverlap(rect1, rect2) {
          return !(rect1.x + rect1.width < rect2.x ||
                   rect2.x + rect2.width < rect1.x ||
                   rect1.y + rect1.height < rect2.y ||
                   rect2.y + rect2.height < rect1.y);
        }

        // Helper: Calculate overlap percentage
        function overlapPercentage(rect1, rect2) {
          const xOverlap = Math.max(0, Math.min(rect1.x + rect1.width, rect2.x + rect2.width) -
                                    Math.max(rect1.x, rect2.x));
          const yOverlap = Math.max(0, Math.min(rect1.y + rect1.height, rect2.y + rect2.height) -
                                    Math.max(rect1.y, rect2.y));
          const overlapArea = xOverlap * yOverlap;
          const rect2Area = rect2.width * rect2.height;
          return rect2Area > 0 ? (overlapArea / rect2Area) * 100 : 0;
        }

        // Get all elements and check which ones are in the target region
        const targetRect = {
          x: coords.x,
          y: coords.y,
          width: coords.width,
          height: coords.height
        };

        // Use TreeWalker to find all text nodes
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: function(node) {
              // Skip empty text nodes
              if (!node.textContent.trim()) {
                return NodeFilter.FILTER_REJECT;
              }
              // Skip script and style content
              const parent = node.parentElement;
              if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );

        let node;
        while ((node = walker.nextNode())) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const rects = range.getClientRects();

          for (const rect of rects) {
            if (rect.width === 0 || rect.height === 0) continue;

            const elemRect = {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            };

            if (rectsOverlap(targetRect, elemRect)) {
              const overlap = overlapPercentage(targetRect, elemRect);
              const text = node.textContent.trim();

              if (text && overlap > 10) {
                results.texts.push({
                  text: text,
                  overlap: overlap,
                  rect: elemRect
                });

                // Check if parent is a link
                const parent = node.parentElement;
                if (parent) {
                  const link = parent.closest('a');
                  if (link && link.href) {
                    results.links.push({
                      text: text,
                      href: link.href,
                      overlap: overlap
                    });
                  }

                  results.elements.push({
                    tag: parent.tagName.toLowerCase(),
                    classes: parent.className,
                    overlap: overlap
                  });
                }
              }
            }
          }
        }

        // Sort by overlap percentage (highest first)
        results.texts.sort((a, b) => b.overlap - a.overlap);
        results.links.sort((a, b) => b.overlap - a.overlap);

        return results;
      }, absoluteCoords);

      // Process results
      const combinedText = this.combineTexts(result.texts);
      const confidence = this.calculateConfidence(result);

      return {
        value: combinedText,
        confidence: confidence,
        metadata: {
          method: 'coordinate-text',
          textsFound: result.texts.length,
          linksFound: result.links.length,
          allTexts: result.texts,
          allLinks: result.links,
          absoluteCoords: absoluteCoords
        }
      };
    } catch (error) {
      console.error('[CoordinateExtractor] Extraction failed:', error.message);
      return {
        value: null,
        confidence: 0,
        metadata: {
          method: 'coordinate-text',
          error: error.message
        }
      };
    }
  }

  /**
   * Combine text fragments into a single string
   * @param {Array} texts - Array of { text, overlap } objects
   * @returns {string} - Combined text
   */
  combineTexts(texts) {
    if (!texts || texts.length === 0) return '';

    // If there's one dominant text (high overlap), use it
    if (texts.length === 1 || (texts[0] && texts[0].overlap > 70)) {
      return texts[0].text.trim();
    }

    // Otherwise, combine texts with good overlap
    const significantTexts = texts.filter(t => t.overlap > 30);
    if (significantTexts.length === 0) {
      return texts[0]?.text?.trim() || '';
    }

    // Join texts, removing duplicates
    const seen = new Set();
    const unique = significantTexts.filter(t => {
      if (seen.has(t.text)) return false;
      seen.add(t.text);
      return true;
    });

    return unique.map(t => t.text).join(' ').trim();
  }

  /**
   * Calculate confidence score
   * @param {Object} result - Extraction result
   * @returns {number} - Confidence 0-100
   */
  calculateConfidence(result) {
    if (!result.texts || result.texts.length === 0) {
      return 0;
    }

    let confidence = 50; // Base confidence

    // Boost for high overlap
    const topOverlap = result.texts[0]?.overlap || 0;
    if (topOverlap > 80) confidence += 30;
    else if (topOverlap > 50) confidence += 20;
    else if (topOverlap > 30) confidence += 10;

    // Boost for single clear result
    if (result.texts.length === 1 && topOverlap > 50) {
      confidence += 15;
    }

    // Penalize for too many fragmented results
    if (result.texts.length > 5) {
      confidence -= 10;
    }

    // Boost for finding links (good for profileUrl)
    if (result.links.length > 0) {
      confidence += 5;
    }

    return Math.round(Math.max(0, Math.min(100, confidence)));
  }

  /**
   * Extract link from region (specific method for profileUrl)
   * @param {Object} cardElement - Card element handle
   * @param {Object} fieldCoords - Relative coordinates
   * @returns {Object} - { value, confidence, metadata }
   */
  async extractLinkFromRegion(cardElement, fieldCoords) {
    try {
      const cardBox = await cardElement.boundingBox();
      if (!cardBox) {
        throw new Error('Card element has no bounding box');
      }

      const absoluteCoords = {
        x: cardBox.x + fieldCoords.x,
        y: cardBox.y + fieldCoords.y,
        width: fieldCoords.width,
        height: fieldCoords.height
      };

      const result = await this.page.evaluate((coords) => {
        // Find the element at the center of the region
        const centerX = coords.x + coords.width / 2;
        const centerY = coords.y + coords.height / 2;
        const element = document.elementFromPoint(centerX, centerY);

        if (!element) return { href: null, text: null };

        // Look for the closest anchor element
        const link = element.tagName === 'A' ? element : element.closest('a');
        if (link && link.href) {
          return {
            href: link.href,
            text: link.textContent.trim(),
            isMailto: link.href.startsWith('mailto:'),
            isTel: link.href.startsWith('tel:')
          };
        }

        return { href: null, text: null };
      }, absoluteCoords);

      if (result.href) {
        return {
          value: result.href,
          confidence: 90,
          metadata: {
            method: 'href-link',
            linkText: result.text,
            isMailto: result.isMailto,
            isTel: result.isTel,
            absoluteCoords: absoluteCoords
          }
        };
      }

      return {
        value: null,
        confidence: 0,
        metadata: {
          method: 'href-link',
          error: 'No link found at coordinates'
        }
      };
    } catch (error) {
      return {
        value: null,
        confidence: 0,
        metadata: {
          method: 'href-link',
          error: error.message
        }
      };
    }
  }

  /**
   * Extract email from mailto link
   * @param {Object} cardElement - Card element handle
   * @param {Object} fieldCoords - Relative coordinates
   * @returns {Object} - { value, confidence, metadata }
   */
  async extractMailtoFromRegion(cardElement, fieldCoords) {
    const result = await this.extractLinkFromRegion(cardElement, fieldCoords);

    if (result.metadata.isMailto && result.value) {
      const email = result.value.replace('mailto:', '').split('?')[0];
      return {
        value: email,
        confidence: 95,
        metadata: {
          ...result.metadata,
          method: 'mailto-link',
          fullHref: result.value
        }
      };
    }

    return {
      value: null,
      confidence: 0,
      metadata: {
        method: 'mailto-link',
        error: 'No mailto link found'
      }
    };
  }

  /**
   * Extract phone from tel link
   * @param {Object} cardElement - Card element handle
   * @param {Object} fieldCoords - Relative coordinates
   * @returns {Object} - { value, confidence, metadata }
   */
  async extractTelFromRegion(cardElement, fieldCoords) {
    const result = await this.extractLinkFromRegion(cardElement, fieldCoords);

    if (result.metadata.isTel && result.value) {
      const phone = result.value.replace('tel:', '');
      return {
        value: phone,
        confidence: 95,
        metadata: {
          ...result.metadata,
          method: 'tel-link',
          fullHref: result.value
        }
      };
    }

    return {
      value: null,
      confidence: 0,
      metadata: {
        method: 'tel-link',
        error: 'No tel link found'
      }
    };
  }
}

module.exports = CoordinateExtractor;

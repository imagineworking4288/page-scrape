/**
 * Phone RegEx Extractor v2.3
 *
 * Finds phone number patterns (US and international formats) in DOM text.
 * Normalizes phone numbers to consistent format.
 */

// Phone patterns (US focus with international support)
const PHONE_PATTERNS = [
  // +1-212-558-3960 or +1 212 558 3960
  /\+\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  // (212) 558-3960
  /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  // 212.558.3960 or 212-558-3960
  /\d{3}[-.]\d{3}[-.]\d{4}/g,
  // 2125583960 (10 consecutive digits)
  /\b\d{10}\b/g
];

class PhoneExtractor {
  constructor(page) {
    this.page = page;
  }

  /**
   * Extract phone from rectangle coordinates
   * @param {Object} cardElement - Card element handle
   * @param {Object} fieldCoords - Relative coordinates within card { x, y, width, height }
   * @returns {Object} {value, confidence, metadata}
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

      // Expand search area
      const searchArea = {
        x: absoluteCoords.x - 30,
        y: absoluteCoords.y - 20,
        width: absoluteCoords.width + 60,
        height: absoluteCoords.height + 40
      };

      // Get text content from the search area
      const textContent = await this.page.evaluate((area) => {
        let text = '';

        // Get elements at center point
        const centerX = area.x + area.width / 2;
        const centerY = area.y + area.height / 2;
        const elements = document.elementsFromPoint(centerX, centerY);

        for (const el of elements) {
          if (el.textContent) {
            text += el.textContent + ' ';
          }
        }

        // Also scan nearby text nodes
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );

        let node;
        while (node = walker.nextNode()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();

          if (rect.right >= area.x && rect.left <= area.x + area.width &&
              rect.bottom >= area.y && rect.top <= area.y + area.height) {
            text += node.textContent + ' ';
          }
        }

        return text;
      }, searchArea);

      // Try each phone pattern
      let bestMatch = null;
      let bestPattern = null;

      for (const pattern of PHONE_PATTERNS) {
        const matches = textContent.match(pattern);
        if (matches && matches.length > 0) {
          bestMatch = matches[0];
          bestPattern = pattern.source;
          break;
        }
      }

      if (!bestMatch) {
        return {
          value: null,
          confidence: 0,
          metadata: {
            method: 'regex-phone',
            error: 'No phone pattern found'
          }
        };
      }

      // Normalize phone format
      const normalized = this.normalizePhone(bestMatch);

      // Calculate confidence
      let confidence = 85;

      // Boost for formatted numbers (likely intentional display)
      if (bestMatch.includes('-') || bestMatch.includes('.') || bestMatch.includes('(')) {
        confidence += 5;
      }

      // Boost for complete US format with country code
      if (bestMatch.startsWith('+1') || bestMatch.startsWith('1-')) {
        confidence += 5;
      }

      return {
        value: normalized,
        confidence: Math.min(100, confidence),
        metadata: {
          method: 'regex-phone',
          pattern: bestPattern,
          original: bestMatch,
          normalized: normalized,
          searchArea: searchArea
        }
      };

    } catch (error) {
      console.error('[PhoneExtractor] Extraction failed:', error.message);
      return {
        value: null,
        confidence: 0,
        metadata: {
          method: 'regex-phone',
          error: error.message
        }
      };
    }
  }

  /**
   * Extract phone from tel: links in the region
   * @param {Object} cardElement - Card element handle
   * @param {Object} fieldCoords - Relative coordinates within card
   * @returns {Object} {value, confidence, metadata}
   */
  async extractFromTelLink(cardElement, fieldCoords) {
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
        const centerX = coords.x + coords.width / 2;
        const centerY = coords.y + coords.height / 2;

        const elements = document.elementsFromPoint(centerX, centerY);

        for (const el of elements) {
          // Check if element is a tel link
          if (el.tagName === 'A' && el.href && el.href.startsWith('tel:')) {
            const phone = el.href.replace('tel:', '').replace(/\s/g, '');
            return {
              found: true,
              phone: phone,
              linkText: el.textContent.trim()
            };
          }

          // Check children for tel links
          const links = el.querySelectorAll('a[href^="tel:"]');
          for (const link of links) {
            const rect = link.getBoundingClientRect();
            if (rect.right >= coords.x && rect.left <= coords.x + coords.width &&
                rect.bottom >= coords.y && rect.top <= coords.y + coords.height) {
              const phone = link.href.replace('tel:', '').replace(/\s/g, '');
              return {
                found: true,
                phone: phone,
                linkText: link.textContent.trim()
              };
            }
          }
        }

        return { found: false };
      }, absoluteCoords);

      if (!result.found) {
        return {
          value: null,
          confidence: 0,
          metadata: {
            method: 'tel-link',
            error: 'No tel link found'
          }
        };
      }

      const normalized = this.normalizePhone(result.phone);

      return {
        value: normalized,
        confidence: 95, // High confidence for tel links
        metadata: {
          method: 'tel-link',
          linkText: result.linkText,
          original: result.phone
        }
      };

    } catch (error) {
      console.error('[PhoneExtractor] Tel extraction failed:', error.message);
      return {
        value: null,
        confidence: 0,
        metadata: {
          method: 'tel-link',
          error: error.message
        }
      };
    }
  }

  /**
   * Normalize phone number to consistent format
   * @param {string} phone - Raw phone string
   * @returns {string} - Normalized phone
   */
  normalizePhone(phone) {
    // Remove all non-digit characters except +
    let digits = phone.replace(/[^\d+]/g, '');

    // Remove leading + if present, track it
    const hasPlus = digits.startsWith('+');
    if (hasPlus) {
      digits = digits.substring(1);
    }

    // Format as +1-XXX-XXX-XXXX for US numbers
    if (digits.length === 10) {
      return `+1-${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
    } else if (digits.length > 10) {
      // International number - keep as is but format with +
      return '+' + digits;
    }

    // Return original if can't normalize
    return phone;
  }
}

module.exports = PhoneExtractor;

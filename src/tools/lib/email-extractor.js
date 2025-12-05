/**
 * Email RegEx Extractor v2.3
 *
 * Finds email patterns in DOM text content near coordinates.
 * Uses regex patterns to extract valid email addresses.
 */

// Email regex pattern (RFC 5322 simplified)
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi;

class EmailExtractor {
  constructor(page) {
    this.page = page;
  }

  /**
   * Extract email from rectangle coordinates
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

      // Expand search area to catch nearby email text
      const searchArea = {
        x: absoluteCoords.x - 50,
        y: absoluteCoords.y - 30,
        width: absoluteCoords.width + 100,
        height: absoluteCoords.height + 60
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

        // Also scan nearby text nodes using TreeWalker
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

          // If text node intersects search area
          if (rect.right >= area.x && rect.left <= area.x + area.width &&
              rect.bottom >= area.y && rect.top <= area.y + area.height) {
            text += node.textContent + ' ';
          }
        }

        return text;
      }, searchArea);

      // Find email patterns
      const emails = textContent.match(EMAIL_PATTERN);

      if (!emails || emails.length === 0) {
        return {
          value: null,
          confidence: 0,
          metadata: {
            method: 'regex-email',
            error: 'No email pattern found in text content'
          }
        };
      }

      // Get first (most likely correct) email and normalize
      const email = emails[0].toLowerCase().trim();

      // Calculate confidence based on email characteristics
      let confidence = 80;

      // Boost confidence for common/known domains
      if (email.endsWith('.edu') || email.endsWith('.gov') ||
          email.endsWith('.org') || email.includes('@gmail.com') ||
          email.includes('@outlook.com') || email.includes('@yahoo.com')) {
        confidence += 10;
      }

      // Boost for professional domains (law firms, etc.)
      if (email.includes('.com') && !email.includes('gmail') &&
          !email.includes('yahoo') && !email.includes('outlook')) {
        confidence += 5;
      }

      // Penalize if multiple @ symbols (malformed)
      if ((email.match(/@/g) || []).length > 1) {
        confidence -= 30;
      }

      // Penalize very short local part
      const localPart = email.split('@')[0];
      if (localPart.length < 2) {
        confidence -= 20;
      }

      return {
        value: email,
        confidence: Math.min(100, Math.max(0, confidence)),
        metadata: {
          method: 'regex-email',
          totalFound: emails.length,
          allEmails: emails.slice(0, 5),
          searchArea: searchArea
        }
      };

    } catch (error) {
      console.error('[EmailExtractor] Extraction failed:', error.message);
      return {
        value: null,
        confidence: 0,
        metadata: {
          method: 'regex-email',
          error: error.message
        }
      };
    }
  }

  /**
   * Extract email from mailto: links in the region
   * @param {Object} cardElement - Card element handle
   * @param {Object} fieldCoords - Relative coordinates within card
   * @returns {Object} {value, confidence, metadata}
   */
  async extractFromMailtoLink(cardElement, fieldCoords) {
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

        // Get elements at center point
        const elements = document.elementsFromPoint(centerX, centerY);

        // Find mailto links
        for (const el of elements) {
          // Check if element is a mailto link
          if (el.tagName === 'A' && el.href && el.href.startsWith('mailto:')) {
            const email = el.href.replace('mailto:', '').split('?')[0];
            return {
              found: true,
              email: email,
              linkText: el.textContent.trim()
            };
          }

          // Check children for mailto links
          const links = el.querySelectorAll('a[href^="mailto:"]');
          for (const link of links) {
            const rect = link.getBoundingClientRect();
            // Check if link is within the search area
            if (rect.right >= coords.x && rect.left <= coords.x + coords.width &&
                rect.bottom >= coords.y && rect.top <= coords.y + coords.height) {
              const email = link.href.replace('mailto:', '').split('?')[0];
              return {
                found: true,
                email: email,
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
            method: 'mailto-link',
            error: 'No mailto link found'
          }
        };
      }

      return {
        value: result.email.toLowerCase(),
        confidence: 95, // High confidence for mailto links
        metadata: {
          method: 'mailto-link',
          linkText: result.linkText
        }
      };

    } catch (error) {
      console.error('[EmailExtractor] Mailto extraction failed:', error.message);
      return {
        value: null,
        confidence: 0,
        metadata: {
          method: 'mailto-link',
          error: error.message
        }
      };
    }
  }
}

module.exports = EmailExtractor;

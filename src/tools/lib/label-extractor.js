/**
 * Label Extractor v2.3
 *
 * Finds labels like "Email:", "Phone:", "Location:" and extracts adjacent values.
 * Uses label patterns to identify and extract field values.
 */

class LabelExtractor {
  constructor(page) {
    this.page = page;

    // Field-specific label patterns
    this.labelPatterns = {
      email: /\b(email|e-mail|contact|mail)\s*:?/i,
      phone: /\b(phone|tel|telephone|call|fax|mobile|cell)\s*:?/i,
      location: /\b(location|office|address|city|region)\s*:?/i,
      title: /\b(title|position|role|designation)\s*:?/i,
      name: /\b(name|attorney|lawyer|counsel)\s*:?/i
    };
  }

  /**
   * Extract value by finding label and extracting adjacent text
   * @param {Object} cardElement - Card element handle
   * @param {Object} fieldCoords - Relative coordinates within card { x, y, width, height }
   * @param {string} fieldName - Field to extract (e.g., 'email', 'phone')
   * @returns {Object} {value, confidence, metadata}
   */
  async extractFromRegion(cardElement, fieldCoords, fieldName) {
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

      // Expand search area to find nearby labels
      const searchArea = {
        x: absoluteCoords.x - 100,
        y: absoluteCoords.y - 50,
        width: absoluteCoords.width + 200,
        height: absoluteCoords.height + 100
      };

      const pattern = this.labelPatterns[fieldName.toLowerCase()];
      if (!pattern) {
        return {
          value: null,
          confidence: 0,
          metadata: {
            method: 'label-detection',
            error: `No label pattern for field: ${fieldName}`
          }
        };
      }

      const result = await this.page.evaluate((area, patternSource, fieldName) => {
        // Find all text nodes in search area
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );

        const textNodes = [];
        let node;

        while (node = walker.nextNode()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();

          // If text node is in or near search area
          if (rect.right >= area.x - 50 && rect.left <= area.x + area.width + 50 &&
              rect.bottom >= area.y - 50 && rect.top <= area.y + area.height + 50) {
            textNodes.push({
              text: node.textContent.trim(),
              rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              },
              parent: node.parentElement ? node.parentElement.tagName : null
            });
          }
        }

        // Find label node using pattern
        const patternRegex = new RegExp(patternSource, 'i');
        let labelNode = null;
        let labelIndex = -1;

        for (let i = 0; i < textNodes.length; i++) {
          if (patternRegex.test(textNodes[i].text)) {
            labelNode = textNodes[i];
            labelIndex = i;
            break;
          }
        }

        if (!labelNode) {
          return { found: false, error: 'Label not found' };
        }

        // Try to find value:
        // 1. Text after colon in same node
        // 2. Next sibling text node
        // 3. Text node to the right or below

        let valueText = '';

        // Method 1: Text after colon in same node
        const colonMatch = labelNode.text.match(/:\s*(.+)/);
        if (colonMatch && colonMatch[1].trim().length > 2) {
          valueText = colonMatch[1].trim();
        }

        // Method 2: Next text nodes (if value not found)
        if (!valueText && labelIndex < textNodes.length - 1) {
          for (let i = labelIndex + 1; i < Math.min(labelIndex + 5, textNodes.length); i++) {
            const candidate = textNodes[i].text.trim();
            // Skip if it's another label
            if (candidate.length > 2 && !patternRegex.test(candidate)) {
              // Check if it's a reasonable value (not too long, not another field label)
              if (candidate.length < 100) {
                valueText = candidate;
                break;
              }
            }
          }
        }

        // Method 3: Look for text to the right of label
        if (!valueText) {
          const labelRight = labelNode.rect.x + labelNode.rect.width;
          const labelY = labelNode.rect.y;

          for (const tn of textNodes) {
            // Text is to the right and roughly same vertical position
            if (tn.rect.x > labelRight &&
                Math.abs(tn.rect.y - labelY) < 20 &&
                tn.text.trim().length > 2) {
              valueText = tn.text.trim();
              break;
            }
          }
        }

        if (!valueText) {
          return { found: false, error: 'Could not extract value from label' };
        }

        return {
          found: true,
          value: valueText,
          label: labelNode.text,
          labelRect: labelNode.rect
        };

      }, searchArea, pattern.source, fieldName);

      if (!result.found || !result.value) {
        return {
          value: null,
          confidence: 0,
          metadata: {
            method: 'label-detection',
            error: result.error || 'No value found'
          }
        };
      }

      // Clean the value based on field type
      let cleanedValue = this.cleanValue(result.value, fieldName);

      return {
        value: cleanedValue,
        confidence: 75,
        metadata: {
          method: 'label-detection',
          label: result.label,
          labelRect: result.labelRect
        }
      };

    } catch (error) {
      console.error('[LabelExtractor] Extraction failed:', error.message);
      return {
        value: null,
        confidence: 0,
        metadata: {
          method: 'label-detection',
          error: error.message
        }
      };
    }
  }

  /**
   * Clean extracted value based on field type
   * @param {string} value - Raw value
   * @param {string} fieldName - Field type
   * @returns {string} - Cleaned value
   */
  cleanValue(value, fieldName) {
    if (!value) return value;

    // Remove common suffixes/prefixes
    value = value.trim();

    // Remove trailing punctuation
    value = value.replace(/[,;:]+$/, '').trim();

    // Field-specific cleaning
    switch (fieldName.toLowerCase()) {
      case 'email':
        // Extract just the email if surrounded by text
        const emailMatch = value.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/i);
        if (emailMatch) {
          return emailMatch[0].toLowerCase();
        }
        break;

      case 'phone':
        // Extract phone digits
        const phoneMatch = value.match(/[\d\s\-().+]+/);
        if (phoneMatch && phoneMatch[0].replace(/\D/g, '').length >= 10) {
          return phoneMatch[0].trim();
        }
        break;

      case 'location':
        // Remove "Office:" or similar prefixes
        value = value.replace(/^(office|location|city|address)\s*:?\s*/i, '');
        break;

      case 'title':
        // Remove "Title:" or similar prefixes
        value = value.replace(/^(title|position|role)\s*:?\s*/i, '');
        break;
    }

    return value;
  }
}

module.exports = LabelExtractor;

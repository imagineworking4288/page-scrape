/**
 * Email Extractor
 *
 * Extracts valid email patterns from string values.
 * Returns lowercase normalized email or null if invalid.
 */

const { EMAIL } = require('../patterns');

class EmailExtractor {
  /**
   * Extract email from a string value
   * @param {string} value - Input string that may contain an email
   * @returns {Object} - { value, original, modified, valid }
   */
  extract(value) {
    // Handle null/undefined/empty input
    if (value === null || value === undefined || value === '') {
      return {
        value: null,
        original: value,
        modified: false,
        valid: false
      };
    }

    // Ensure string type
    const strValue = String(value);

    // Try to match email pattern
    const match = strValue.match(EMAIL);

    if (match) {
      const extracted = match[0].toLowerCase();
      return {
        value: extracted,
        original: strValue,
        modified: strValue !== extracted,
        valid: true
      };
    }

    // No match found
    return {
      value: null,
      original: strValue,
      modified: false,
      valid: false
    };
  }
}

module.exports = { EmailExtractor };

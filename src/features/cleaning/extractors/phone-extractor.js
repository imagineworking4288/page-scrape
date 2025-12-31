/**
 * Phone Extractor
 *
 * Extracts and normalizes phone numbers from string values.
 * Returns normalized +1-XXX-XXX-XXXX format or null if invalid.
 */

const { PHONE } = require('../patterns');

class PhoneExtractor {
  /**
   * Extract and normalize phone from a string value
   * @param {string} value - Input string that may contain a phone number
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

    // Try to match phone pattern
    const match = strValue.match(PHONE);

    if (match) {
      const extracted = match[0];
      const normalized = this.normalize(extracted);

      if (normalized) {
        return {
          value: normalized,
          original: strValue,
          modified: strValue !== normalized,
          valid: true
        };
      }
    }

    // No valid match found
    return {
      value: null,
      original: strValue,
      modified: false,
      valid: false
    };
  }

  /**
   * Normalize phone number to +1-XXX-XXX-XXXX format
   * @param {string} phone - Raw phone string
   * @returns {string|null} - Normalized phone or null if invalid
   */
  normalize(phone) {
    if (!phone) return null;

    // Strip all non-digits
    const digits = phone.replace(/\D/g, '');

    // Format based on length
    if (digits.length === 10) {
      // Standard 10-digit US number
      return `+1-${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      // 11 digits starting with 1
      return `+1-${digits.substring(1, 4)}-${digits.substring(4, 7)}-${digits.substring(7)}`;
    }

    // Invalid length
    return null;
  }
}

module.exports = { PhoneExtractor };

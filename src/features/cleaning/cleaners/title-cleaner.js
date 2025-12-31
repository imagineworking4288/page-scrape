/**
 * Title Cleaner
 *
 * Removes phone numbers and email addresses from title/job title strings.
 * Returns cleaned title or null if empty after cleaning.
 */

const { PHONE_PERMISSIVE_GLOBAL, EMAIL_GLOBAL } = require('../patterns');

class TitleCleaner {
  /**
   * Clean a title string by removing phone numbers and emails
   * @param {string} value - Input title string
   * @returns {Object} - { value, original, modified, removed, valid }
   */
  clean(value) {
    // Handle null/undefined/empty input
    if (value === null || value === undefined || value === '') {
      return {
        value: null,
        original: value,
        modified: false,
        removed: [],
        valid: false
      };
    }

    // Ensure string type
    const strValue = String(value);
    let cleaned = strValue;
    const removed = [];

    // Remove phone numbers (reset lastIndex due to global flag)
    // Uses permissive pattern to catch any phone-like sequence
    PHONE_PERMISSIVE_GLOBAL.lastIndex = 0;
    const phoneMatches = cleaned.match(PHONE_PERMISSIVE_GLOBAL);
    if (phoneMatches) {
      for (const match of phoneMatches) {
        removed.push({ type: 'phone', value: match });
      }
      cleaned = cleaned.replace(PHONE_PERMISSIVE_GLOBAL, '');
    }

    // Remove email addresses (reset lastIndex due to global flag)
    EMAIL_GLOBAL.lastIndex = 0;
    const emailMatches = cleaned.match(EMAIL_GLOBAL);
    if (emailMatches) {
      for (const match of emailMatches) {
        removed.push({ type: 'email', value: match });
      }
      cleaned = cleaned.replace(EMAIL_GLOBAL, '');
    }

    // Trim whitespace and collapse multiple spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // If empty after cleaning, return null
    if (cleaned === '') {
      return {
        value: null,
        original: strValue,
        modified: true,
        removed,
        valid: false
      };
    }

    return {
      value: cleaned,
      original: strValue,
      modified: strValue !== cleaned,
      removed,
      valid: true
    };
  }
}

module.exports = { TitleCleaner };

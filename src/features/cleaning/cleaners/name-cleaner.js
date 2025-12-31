/**
 * Name Cleaner
 *
 * Removes phone numbers, emails, title suffixes, and credential suffixes from names.
 * Also detects and rejects spam/invalid name patterns.
 * Returns cleaned name or null if invalid.
 */

const { PHONE_PERMISSIVE_GLOBAL, EMAIL_GLOBAL, TITLE_SUFFIX, CREDENTIAL_SUFFIX, NAME_SPAM } = require('../patterns');

class NameCleaner {
  /**
   * Clean a name string by removing foreign patterns
   * @param {string} value - Input name string
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

    // Remove title suffixes (may need multiple passes)
    let titleMatch = cleaned.match(TITLE_SUFFIX);
    while (titleMatch) {
      removed.push({ type: 'titleSuffix', value: titleMatch[1] });
      cleaned = cleaned.replace(TITLE_SUFFIX, '');
      titleMatch = cleaned.match(TITLE_SUFFIX);
    }

    // Remove credential suffixes (may need multiple passes for "John Smith, MD, PhD")
    let credentialMatch = cleaned.match(CREDENTIAL_SUFFIX);
    while (credentialMatch) {
      removed.push({ type: 'credentialSuffix', value: credentialMatch[1] });
      cleaned = cleaned.replace(CREDENTIAL_SUFFIX, '');
      credentialMatch = cleaned.match(CREDENTIAL_SUFFIX);
    }

    // Trim whitespace and collapse multiple spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // Check for spam patterns
    if (NAME_SPAM.test(cleaned)) {
      removed.push({ type: 'spam', value: cleaned });
      return {
        value: null,
        original: strValue,
        modified: true,
        removed,
        valid: false
      };
    }

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

module.exports = { NameCleaner };

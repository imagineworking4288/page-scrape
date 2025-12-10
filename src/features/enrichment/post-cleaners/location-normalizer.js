/**
 * Location Normalizer
 *
 * Normalizes location strings while preserving important patterns
 * like "Washington, D.C." and "St. Louis".
 */

class LocationNormalizer {
  constructor(logger) {
    this.logger = logger;

    // Patterns to preserve exactly as-is
    this.preservePatterns = [
      /Washington,?\s*D\.?C\.?/i,  // Washington, D.C. variations
      /St\.\s+\w+/i,               // St. Louis, St. Paul
      /\w+,\s*[A-Z]{2}\b/,         // New York, NY
      /\w+,\s*[A-Z][a-z]+/,        // London, UK
    ];
  }

  /**
   * Safe logger helper
   * @param {string} level - Log level
   * @param {string} message - Message to log
   */
  _log(level, message) {
    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](message);
    }
  }

  /**
   * Normalize a location string
   * @param {string} location - Raw location string
   * @returns {Object} - { normalized, wasChanged, phonesRemoved }
   */
  normalize(location) {
    if (!location) {
      return { normalized: null, wasChanged: false, phonesRemoved: [] };
    }

    const original = location;
    let normalized = location;
    const phonesRemoved = [];

    try {
      // STEP 1: Remove embedded phone numbers FIRST (critical fix)
      // Match patterns like: +1-212-558-1623, +49-69-4272-5200, (212) 555-1234
      const phonePattern = /\+?\d[\d\s\-\(\)\.]{7,}/g;

      // Extract phones before removing them (for metadata)
      const phoneMatches = normalized.match(phonePattern);
      if (phoneMatches) {
        for (const phone of phoneMatches) {
          // Only count it as a phone if it has enough digits
          const digitCount = (phone.match(/\d/g) || []).length;
          if (digitCount >= 7) {
            phonesRemoved.push(phone.trim());
          }
        }
      }

      // Remove phone numbers
      if (phonesRemoved.length > 0) {
        normalized = normalized.replace(phonePattern, '');
        this._log('debug', `[LocationNormalizer] Removed ${phonesRemoved.length} phone(s): ${phonesRemoved.join(', ')}`);
      }

      // STEP 2: Check if location has special patterns to preserve
      const hasPreservePattern = this.preservePatterns.some(p => p.test(normalized));

      if (!hasPreservePattern) {
        // Aggressive cleaning for normal locations
        normalized = normalized
          .replace(/\s+/g, ' ')       // Collapse whitespace
          .replace(/\n+/g, ' ')       // Remove newlines
          .trim();
      } else {
        // Gentle cleaning for preserved patterns
        normalized = normalized
          .replace(/\n+/g, ', ')      // Convert newlines to commas
          .replace(/\s+/g, ' ')       // Collapse whitespace
          .trim();

        // Fix spacing around commas: "Washington , D.C." → "Washington, D.C."
        normalized = normalized.replace(/\s+,\s+/g, ', ');
        normalized = normalized.replace(/\s+,/g, ',');
      }

      // STEP 3: Normalize all Washington D.C. variations to standard format
      normalized = normalized.replace(
        /Washington(?:\s*,?\s*D\.?\s*C\.?)?/gi,
        (match) => {
          // Only normalize if it looks like D.C.
          if (/D\.?\s*C\.?/i.test(match)) {
            return 'Washington, D.C.';
          }
          return match;
        }
      );

      // STEP 4: Clean up artifacts from phone removal
      // Remove trailing/leading commas
      normalized = normalized.replace(/^,\s*|,\s*$/g, '');

      // Remove duplicate commas
      normalized = normalized.replace(/,\s*,+/g, ',');

      // Remove excessive spaces that might remain after phone removal
      normalized = normalized.replace(/\s{2,}/g, ' ').trim();

      // Remove trailing newlines or spaces
      normalized = normalized.trim();

      const wasChanged = normalized !== original;

      if (wasChanged) {
        this._log('debug', `[LocationNormalizer] Normalized: "${original}" → "${normalized}"`);
      }

      return {
        normalized,
        wasChanged,
        phonesRemoved
      };
    } catch (error) {
      this._log('error', `[LocationNormalizer] Error normalizing location: ${error.message}`);
      return { normalized: original, wasChanged: false, phonesRemoved: [] };
    }
  }
}

module.exports = LocationNormalizer;

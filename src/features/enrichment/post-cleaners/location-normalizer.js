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
   * @returns {Object} - { normalized, wasChanged }
   */
  normalize(location) {
    if (!location) {
      return { normalized: null, wasChanged: false };
    }

    const original = location;
    let normalized = location;

    try {
      // Check if location has special patterns to preserve
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

      // Normalize all Washington D.C. variations to standard format
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

      // Remove trailing/leading commas
      normalized = normalized.replace(/^,\s*|,\s*$/g, '');

      // Remove duplicate commas
      normalized = normalized.replace(/,\s*,+/g, ',');

      const wasChanged = normalized !== original;

      if (wasChanged) {
        this._log('debug', `[LocationNormalizer] Normalized: "${original}" → "${normalized}"`);
      }

      return {
        normalized,
        wasChanged
      };
    } catch (error) {
      this._log('error', `[LocationNormalizer] Error normalizing location: ${error.message}`);
      return { normalized: original, wasChanged: false };
    }
  }
}

module.exports = LocationNormalizer;
